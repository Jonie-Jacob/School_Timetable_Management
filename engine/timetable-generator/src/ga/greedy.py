"""
Constraint propagation scheduling engine — replaces the old greedy+GA pipeline.

5-step pipeline:
  Step 1: Pre-computation (flexibility, slot demand, teacher contention)
  Step 2: Teacher time partitioning (handled by whole_school_loader)
  Step 3: Demand-driven placement (most constrained first, least constraining value)
  Step 4: Backtracking on failure (undo last N placements to resolve deadlocks)
  Step 5: Local optimization (deterministic swaps to improve soft constraints)
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, Callable

import numpy as np

from ..data_loader import SchoolData, LogicalAssignment
from ..whole_school_loader import WholeSchoolData

logger = logging.getLogger("timetable-engine")

# Progress callback type
# (placed, total, placed_ok, backtracked, fallback, current_desc, demand)
ProgressCallback = Optional[Callable[[int, int, int, int, int, str, int], None]]


class TeacherBusyTracker:
    """Tracks teacher time-slot occupancy with time-range overlap detection.

    Different period structures may have overlapping but non-identical times
    (e.g., Default P1=09:20-10:00 vs Senior P1=09:00-09:45). A teacher busy
    at 09:00-09:45 cannot also teach at 09:20-10:00 even though the start
    times differ. This tracker detects such overlaps.
    """
    def __init__(self):
        # (teacher_id, day_of_week) → list of (start_time, end_time)
        self._slots: dict[tuple[str, int], list[tuple[str, str]]] = defaultdict(list)
        # Also keep the old-style set for the unavailability check (exact match)
        self._exact: set[tuple[str, int, str]] = set()

    def add(self, teacher_id: str, day_of_week: int, start_time: str, end_time: str):
        self._slots[(teacher_id, day_of_week)].append((start_time, end_time))
        self._exact.add((teacher_id, day_of_week, start_time))

    def remove(self, teacher_id: str, day_of_week: int, start_time: str, end_time: str):
        key = (teacher_id, day_of_week)
        slots = self._slots.get(key)
        if slots:
            try:
                slots.remove((start_time, end_time))
            except ValueError:
                pass
        self._exact.discard((teacher_id, day_of_week, start_time))

    def is_busy(self, teacher_id: str, day_of_week: int, start_time: str, end_time: str) -> bool:
        """Check if teacher has ANY overlapping slot on this day."""
        for s, e in self._slots.get((teacher_id, day_of_week), []):
            # Two time ranges overlap if one starts before the other ends
            if s < end_time and start_time < e:
                return True
        return False

    def has_exact(self, teacher_id: str, day_of_week: int, start_time: str) -> bool:
        """Exact start_time match (for unavailability checks)."""
        return (teacher_id, day_of_week, start_time) in self._exact


@dataclass
class PlacementState:
    """Mutable state during demand-driven placement."""
    chromosomes: dict[str, np.ndarray]
    teacher_busy: TeacherBusyTracker
    placement_counts: dict[tuple[str, int], int]  # (div_id, la_idx) → placed count
    # History for backtracking: list of (div_id, la_idx, gene_index, teacher_slots_added)
    # Each teacher_slot is now (teacher_id, day_of_week, start_time, end_time)
    history: list[tuple[str, int, int, list[tuple[str, int, str, str]]]]
    # Elective slot reservations: (div_id, la_idx) → set of allowed gene indices.
    # Used when per-division elective groups share a teacher in the same division.
    # Each group gets a non-overlapping set of slots so they don't starve each other.
    elective_slot_reserves: dict[tuple[str, int], set[int]] = field(default_factory=dict)
    placed_ok: int = 0
    backtracked: int = 0
    fallback: int = 0


def _build_elective_slot_reserves(state: PlacementState, wsd: WholeSchoolData) -> None:
    """Detect per-division elective groups that share a teacher within the
    same division and store the conflict info for soft scoring.

    We don't hard-reserve slots (too restrictive with maxPeriodsPerDay +
    period preferences), but we store which (div_id, la_idx) pairs conflict
    so _find_valid_slots can apply dynamic scoring.
    """
    for div_id, div_data in wsd.divisions.items():
        per_div_electives: list[tuple[int, LogicalAssignment]] = []
        for la_idx, la in enumerate(div_data.logical_assignments):
            if not la.is_elective or not la.elective_group_id:
                continue
            if la.elective_group_id in wsd.cross_div_electives:
                continue
            per_div_electives.append((la_idx, la))

        if len(per_div_electives) < 2:
            continue

        # Find conflicting pairs (share a teacher)
        for i, (la_idx_a, la_a) in enumerate(per_div_electives):
            for j in range(i + 1, len(per_div_electives)):
                la_idx_b, la_b = per_div_electives[j]
                if set(la_a.teacher_ids) & set(la_b.teacher_ids):
                    # Mark both as having elective conflicts — store the
                    # conflicting la_idx so scoring can check remaining demand.
                    # Use elective_slot_reserves with a sentinel value (empty set)
                    # to signal "has conflict" without hard-filtering.
                    key_a = (div_id, la_idx_a)
                    key_b = (div_id, la_idx_b)
                    if key_a not in state.elective_slot_reserves:
                        state.elective_slot_reserves[key_a] = set()
                    if key_b not in state.elective_slot_reserves:
                        state.elective_slot_reserves[key_b] = set()
                    # Store conflicting partner indices (overload the set with negative sentinels)
                    state.elective_slot_reserves[key_a].add(-la_idx_b - 1)  # negative to distinguish
                    state.elective_slot_reserves[key_b].add(-la_idx_a - 1)

                    shared_names = []
                    for tid in set(la_a.teacher_ids) & set(la_b.teacher_ids):
                        tinfo = wsd.teachers.get(tid)
                        shared_names.append(tinfo.name if tinfo else tid[:8])
                    logger.info("Elective teacher conflict in %s: %s and %s share %s",
                                div_id[:8], la_a.display_name, la_b.display_name,
                                shared_names)


def _get_block_size(la: LogicalAssignment) -> int:
    """Determine placement block size for an assignment.

    Returns block_size >= 2 if block-atomic mode, else 1 for single mode.
    Block mode requires: HARD + preferAdjacentPeriods + minPeriodsPerDay >= 2.
    """
    prefs = la.scheduling_preferences
    if not prefs or not isinstance(prefs, dict):
        return 1
    if prefs.get("constraintType") != "HARD":
        return 1
    if not prefs.get("preferAdjacentPeriods"):
        return 1
    min_pd = prefs.get("minPeriodsPerDay")
    if min_pd is not None and min_pd >= 2:
        return int(min_pd)
    return 1


def _auto_relax_blocks(
    remaining: dict[tuple[str, int, int], int],
    wsd: WholeSchoolData,
) -> None:
    """Auto-relax block-mode assignments when a division's block demand
    exceeds its available block positions.

    For each division, count total blocks needed vs available positions.
    If demand > supply, demote the least-critical block assignments to
    single-mode (the minimum number needed to fit).

    Relaxation priority (relax first → last):
      1. Per-division non-elective subjects (most flexible)
      2. Per-division elective subjects
      3. Cross-division electives (never relax)

    Within the same priority tier, relax the subject with the most
    individual valid slots (least hurt by losing block mode).
    """
    # Group block-mode items by division
    div_blocks: dict[str, list[tuple[int, int, int]]] = defaultdict(list)
    for (div_id, la_idx, bsize), count in remaining.items():
        if bsize >= 2 and count > 0:
            div_blocks[div_id].append((la_idx, bsize, count))

    for div_id, block_items in div_blocks.items():
        div_data = wsd.divisions[div_id]
        ppd = div_data.periods_per_day

        # Count available block positions per block_size
        # We check all block sizes used in this division
        block_sizes_used = set(bsize for _, bsize, _ in block_items)

        for block_size in block_sizes_used:
            items_of_size = [(la_idx, count) for la_idx, bs, count in block_items if bs == block_size]
            total_blocks_needed = sum(count for _, count in items_of_size)

            # Count available block positions that at least ONE block-mode
            # assignment can actually use (respecting HARD period preferences).
            # A position is usable if ALL slots in the block satisfy any
            # assignment's HARD period range (union of valid positions).
            available_positions = 0
            for day_idx in range(div_data.num_days):
                for p in range(ppd - block_size + 1):
                    block_ok = True
                    for offset in range(1, block_size):
                        if (day_idx, p + offset) in div_data.period_after_break:
                            block_ok = False
                            break
                    if not block_ok:
                        continue

                    # Check if ANY block-mode assignment can use this position
                    usable_by_any = False
                    for la_idx, _ in items_of_size:
                        la = div_data.logical_assignments[la_idx]
                        prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
                        is_hard = prefs and prefs.get("constraintType") == "HARD"
                        pref_range = prefs.get("preferredPeriodRange") if prefs else None

                        all_slots_valid = True
                        for offset in range(block_size):
                            gi = day_idx * ppd + p + offset
                            if gi >= len(div_data.period_slots):
                                all_slots_valid = False
                                break
                            slot = div_data.period_slots[gi]
                            if is_hard and pref_range and slot.slot_number is not None:
                                if slot.slot_number < pref_range.get("min", 1) or slot.slot_number > pref_range.get("max", 99):
                                    all_slots_valid = False
                                    break
                        if all_slots_valid:
                            usable_by_any = True
                            break

                    if usable_by_any:
                        available_positions += 1

            if total_blocks_needed <= available_positions:
                continue  # Fits — no relaxation needed

            deficit = total_blocks_needed - available_positions
            logger.info("Block over-demand in %s: need %d blocks of %d, only %d positions available (deficit=%d)",
                        div_id[:8], total_blocks_needed, block_size, available_positions, deficit)

            # Sort items by relaxation priority:
            # Priority 0 = per-div non-elective (relax first)
            # Priority 1 = per-div elective
            # Priority 2 = cross-div elective (never relax)
            def relax_priority(la_idx: int) -> int:
                la = div_data.logical_assignments[la_idx]
                eg_id = wsd.cross_div_la_map.get((div_id, la_idx))
                if eg_id:
                    return 2  # cross-div — never relax
                if la.is_elective:
                    return 1  # per-div elective
                return 0      # regular subject

            # Within same priority, relax the one with highest weightage
            # (more periods = more flexibility as singles)
            items_sorted = sorted(
                items_of_size,
                key=lambda x: (relax_priority(x[0]), -div_data.logical_assignments[x[0]].weightage),
            )

            relaxed_total = 0
            for la_idx, count in items_sorted:
                if relaxed_total >= deficit:
                    break
                if relax_priority(la_idx) >= 2:
                    break  # Don't relax cross-div electives

                la = div_data.logical_assignments[la_idx]
                # How many blocks to relax (minimum needed)
                to_relax = min(count, deficit - relaxed_total)

                # Move from block-mode to single-mode
                key_block = (div_id, la_idx, block_size)
                key_single = (div_id, la_idx, 1)
                remaining[key_block] -= to_relax
                if remaining[key_block] <= 0:
                    del remaining[key_block]
                remaining[key_single] = remaining.get(key_single, 0) + to_relax * block_size

                relaxed_total += to_relax
                logger.info("  Auto-relaxed %s in %s: %d block(s) -> %d singles",
                            la.display_name, div_id[:8], to_relax, to_relax * block_size)


def _pick_with_lookahead(
    candidates: list[tuple[int, float]],
    la: LogicalAssignment,
    la_idx: int,
    div_id: str,
    div_data: SchoolData,
    state: PlacementState,
    wsd: WholeSchoolData,
    remaining: dict[tuple[str, int, int], int],
) -> int:
    """Pick the best slot from candidates using forward-checking.

    For each candidate slot (in demand order), tentatively place the
    assignment there and check if all other remaining assignments in
    the SAME division still have at least 1 valid slot. If placing
    here would strand another assignment, skip to the next candidate.

    Returns the chosen gene index. Falls back to the first candidate
    if no safe option exists (or after checking top 5 candidates).
    """
    # Only check top N candidates to limit performance impact
    max_check = min(5, len(candidates))
    default_gi = candidates[0][0]

    # Collect other remaining assignments in this division
    div_others: list[tuple[int, int]] = []
    for (d, la2, bs2), cnt in remaining.items():
        if d == div_id and la2 != la_idx and cnt > 0:
            div_others.append((la2, bs2))

    if not div_others:
        return default_gi  # No other assignments to worry about

    for i in range(max_check):
        gi = candidates[i][0]

        # Tentatively place
        _place_assignment(state, div_id, la_idx, gi, div_data, la, wsd)

        # Check if all other remaining assignments in this div still have ≥1 valid slot
        all_ok = True
        for other_la_idx, other_bs in div_others:
            other_la = div_data.logical_assignments[other_la_idx]
            if other_bs >= 2:
                other_valid = _find_valid_blocks(other_la, other_la_idx, div_id, div_data, other_bs, state, wsd)
            else:
                other_valid = _find_valid_slots(other_la, other_la_idx, div_id, div_data, state, wsd)
            if len(other_valid) == 0:
                all_ok = False
                break

        # Undo tentative placement
        last_entry = state.history.pop()
        _unplace_assignment(state, last_entry[0], last_entry[1], last_entry[2], last_entry[3])

        if all_ok:
            return gi  # This slot is safe

    return default_gi  # No safe option found, use best demand


def _try_constraint_relaxation(
    la: LogicalAssignment,
    la_idx: int,
    div_id: str,
    div_data: SchoolData,
    bsize: int,
    state: PlacementState,
    wsd: WholeSchoolData,
    cross_div_eg_id: Optional[str],
    div_labels: dict[str, str],
) -> Optional[int]:
    """Try progressively relaxing HARD constraints to find a valid slot.

    Relaxation ladder (each step makes one constraint looser):
      1. maxPeriodsPerDay += 1
      2. Expand preferredPeriodRange by 1 in each direction
      3. Disable preferAdjacentPeriods
      4. Remove preferredDays / excludedDays
      5. All relaxations failed → return None

    Only the current period is affected — not a permanent change.
    Returns the best gi if found, else None.
    """
    prefs = la.scheduling_preferences
    if not prefs or not isinstance(prefs, dict):
        return None

    original_prefs = dict(prefs)
    div_label = div_labels.get(div_id, div_id[:8])

    relaxation_steps = [
        "maxPeriodsPerDay",
        "preferredPeriodRange",       # expand by ±1
        "preferredPeriodRange_remove", # remove entirely
        "preferAdjacentPeriods",
        "dayPreferences",
        "combined",                    # all relaxations at once
    ]

    for step in relaxation_steps:
        # Create a temporary modified copy of preferences
        relaxed = dict(original_prefs)

        if step == "maxPeriodsPerDay":
            mpd = relaxed.get("maxPeriodsPerDay")
            if mpd is None:
                continue
            relaxed["maxPeriodsPerDay"] = mpd + 1

        elif step == "preferredPeriodRange":
            pr = relaxed.get("preferredPeriodRange")
            if not pr:
                continue
            relaxed["preferredPeriodRange"] = {
                "min": max(1, pr.get("min", 1) - 1),
                "max": min(div_data.periods_per_day, pr.get("max", 99) + 1),
            }

        elif step == "preferredPeriodRange_remove":
            if not relaxed.get("preferredPeriodRange"):
                continue
            relaxed.pop("preferredPeriodRange", None)

        elif step == "preferAdjacentPeriods":
            if not relaxed.get("preferAdjacentPeriods"):
                continue
            relaxed["preferAdjacentPeriods"] = False

        elif step == "dayPreferences":
            if not relaxed.get("preferredDays") and not relaxed.get("excludedDays"):
                continue
            relaxed.pop("preferredDays", None)
            relaxed.pop("excludedDays", None)

        elif step == "combined":
            # Nuclear option: relax everything at once
            has_any = (relaxed.get("maxPeriodsPerDay") is not None
                       or relaxed.get("preferredPeriodRange")
                       or relaxed.get("preferAdjacentPeriods")
                       or relaxed.get("preferredDays")
                       or relaxed.get("excludedDays"))
            if not has_any:
                continue
            mpd = relaxed.get("maxPeriodsPerDay")
            if mpd is not None:
                relaxed["maxPeriodsPerDay"] = mpd + 2
            relaxed.pop("preferredPeriodRange", None)
            relaxed["preferAdjacentPeriods"] = False
            relaxed.pop("preferredDays", None)
            relaxed.pop("excludedDays", None)

        # Temporarily swap preferences and find valid slots
        la.scheduling_preferences = relaxed

        if cross_div_eg_id:
            if bsize >= 2:
                candidates = _find_valid_blocks_cross_div(cross_div_eg_id, bsize, state, wsd)
            else:
                candidates = _find_valid_slots_cross_div(cross_div_eg_id, state, wsd)
        else:
            if bsize >= 2:
                candidates = _find_valid_blocks(la, la_idx, div_id, div_data, bsize, state, wsd)
            else:
                candidates = _find_valid_slots(la, la_idx, div_id, div_data, state, wsd)

        # Restore original preferences
        la.scheduling_preferences = original_prefs

        if candidates:
            candidates.sort(key=lambda x: x[1])
            gi = candidates[0][0]
            logger.info("Constraint relaxation: %s in %s -- relaxed %s, found slot gi=%d (%d candidates)",
                        la.display_name, div_label, step, gi, len(candidates))
            return gi

    return None


def schedule_all(
    wsd: WholeSchoolData,
    on_progress: ProgressCallback = None,
    div_labels: dict[str, str] | None = None,
) -> tuple[dict[str, np.ndarray], list[dict]]:
    """
    Run the full 5-step scheduling pipeline.
    Returns: (chromosomes, failure_analyses)
    """
    if div_labels is None:
        div_labels = {d: d[:8] for d in wsd.divisions}

    # ── Step 1: Build unplaced items with block classification ────────────
    # Each item is (div_id, la_idx, block_size).
    # Block-mode: block_size >= 2 (from minPeriodsPerDay + adjacency).
    # Single-mode: block_size == 1.
    # Cross-division electives appear ONCE using (first_div_id, la_idx).
    cross_div_seen: set[str] = set()
    # remaining keyed by (div_id, la_idx, block_size) → count
    remaining: dict[tuple[str, int, int], int] = defaultdict(int)

    block_mode_count = 0
    single_mode_count = 0

    for div_id, div_data in wsd.divisions.items():
        for la_idx, la in enumerate(div_data.logical_assignments):
            eg_id = wsd.cross_div_la_map.get((div_id, la_idx))
            if eg_id:
                if eg_id in cross_div_seen:
                    continue
                cross_div_seen.add(eg_id)

            block_size = _get_block_size(la)
            if block_size >= 2:
                full_blocks = la.weightage // block_size
                remainder = la.weightage % block_size
                remaining[(div_id, la_idx, block_size)] += full_blocks
                block_mode_count += full_blocks * block_size
                if remainder > 0:
                    remaining[(div_id, la_idx, 1)] += remainder
                    single_mode_count += remainder
            else:
                remaining[(div_id, la_idx, 1)] += la.weightage
                single_mode_count += la.weightage

    total_items = sum(
        sum(la.weightage for la in d.logical_assignments)
        for d in wsd.divisions.values()
    )

    # ── Auto-relax blocks that exceed division capacity ──────────────────
    _auto_relax_blocks(remaining, wsd)

    # Recalculate counts after relaxation
    block_mode_count = sum(bsize * count for (_, _, bsize), count in remaining.items() if bsize >= 2)
    single_mode_count = sum(count for (_, _, bsize), count in remaining.items() if bsize == 1)

    # Verify remaining matches total_items accounting for cross-div multiplier
    remaining_periods = sum(
        bsize * count * (len(wsd.cross_div_electives.get(wsd.cross_div_la_map.get((d, l), ''), [d])))
        for (d, l, bsize), count in remaining.items()
    )
    logger.info("Step 3: Demand-driven placement -- %d assignment-periods across %d divisions "
                "(%d cross-division elective groups, %d in block-mode, %d in single-mode, "
                "remaining_periods_with_crossdiv=%d)",
                total_items, len(wsd.divisions), len(wsd.cross_div_electives),
                block_mode_count, single_mode_count, remaining_periods)

    # ── Initialize state ──────────────────────────────────────────────────
    state = PlacementState(
        chromosomes={
            div_id: np.full(div_data.total_periods, -1, dtype=np.int32)
            for div_id, div_data in wsd.divisions.items()
        },
        teacher_busy=TeacherBusyTracker(),
        placement_counts=defaultdict(int),
        history=[],
    )

    # ── Pre-compute elective slot reservations ───────────────────────────
    _build_elective_slot_reserves(state, wsd)

    # Collect failure analyses for the summary
    failure_analyses: list[dict] = []

    # ── Step 3: Demand-driven placement loop ──────────────────────────────
    placed_total = 0
    path_counts = defaultdict(int)  # track which code path each iteration takes
    # Track per-(div,la) what path was taken each iteration
    per_la_paths: dict[tuple[str, int], list[str]] = defaultdict(list)

    # Dump initial remaining for senior divisions
    for (d, l, bs), cnt in sorted(remaining.items(), key=lambda x: x[0]):
        dl = div_labels.get(d, d[:8])
        if 'XI' in dl or 'XII' in dl:
            la_name = wsd.divisions[d].logical_assignments[l].display_name
            eg = wsd.cross_div_la_map.get((d, l))
            logger.info("INIT_REMAIN %s la[%d] %s blk=%d count=%d%s",
                        dl, l, la_name, bs, cnt, f" CROSSDIV={eg[:8]}" if eg else "")

    while remaining:
        # Find the most constrained unplaced item (fewest valid positions)
        best_item: Optional[tuple[str, int, int]] = None
        best_valid_count = float('inf')
        best_candidates: list[tuple[int, float]] = []
        best_is_cross_div: Optional[str] = None

        for (div_id, la_idx, bsize), rem_count in remaining.items():
            if rem_count <= 0:
                continue
            div_data = wsd.divisions[div_id]
            la = div_data.logical_assignments[la_idx]

            eg_id = wsd.cross_div_la_map.get((div_id, la_idx))
            if eg_id:
                if bsize >= 2:
                    candidates = _find_valid_blocks_cross_div(eg_id, bsize, state, wsd)
                else:
                    candidates = _find_valid_slots_cross_div(eg_id, state, wsd)
            else:
                if bsize >= 2:
                    candidates = _find_valid_blocks(la, la_idx, div_id, div_data, bsize, state, wsd)
                else:
                    candidates = _find_valid_slots(la, la_idx, div_id, div_data, state, wsd)
            valid_count = len(candidates)

            if valid_count < best_valid_count:
                best_valid_count = valid_count
                best_item = (div_id, la_idx, bsize)
                best_candidates = candidates
                best_is_cross_div = eg_id

            if valid_count == 0:
                break

        if best_item is None:
            break

        div_id, la_idx, bsize = best_item
        div_data = wsd.divisions[div_id]
        la = div_data.logical_assignments[la_idx]

        # Debug: log placement decisions for first 100 and last 50 iterations
        items_left = sum(c for c in remaining.values())
        if placed_total < 100 or items_left <= 50:
            div_label = div_labels.get(div_id, div_id[:8])
            filled = sum(1 for g in range(div_data.total_periods) if state.chromosomes[div_id][g] != -1)
            top_scores = sorted(best_candidates, key=lambda x: x[1])[:3] if best_candidates else []
            scores_str = ", ".join(f"gi={g}:d={d:.1f}" for g, d in top_scores)
            logger.info("PLACE #%d: %s %s (w=%d, blk=%d) valid=%d filled=%d/%d slots=[%s]%s",
                        placed_total + 1, div_label, la.display_name, la.weightage, bsize,
                        int(best_valid_count) if best_valid_count != float('inf') else 0,
                        filled, div_data.total_periods,
                        scores_str,
                        " CROSS-DIV" if best_is_cross_div else "")

        iter_path = 'UNKNOWN'
        if best_candidates:
            best_candidates.sort(key=lambda x: x[1])

            gi = best_candidates[0][0]
            if not best_is_cross_div and bsize == 1 and len(best_candidates) > 1:
                gi = _pick_with_lookahead(
                    best_candidates, la, la_idx, div_id, div_data,
                    state, wsd, remaining,
                )

            if best_is_cross_div:
                if bsize >= 2:
                    _place_block_cross_div(state, best_is_cross_div, gi, bsize, wsd)
                else:
                    _place_cross_div(state, best_is_cross_div, gi, wsd)
                n_divs = len(wsd.cross_div_electives[best_is_cross_div])
                n_placed = bsize * n_divs
                state.placed_ok += n_placed
                placed_total += n_placed
                iter_path = 'crossdiv_ok'
                path_counts['crossdiv_ok'] += 1
            elif bsize >= 2:
                _place_block(state, div_id, la_idx, gi, bsize, div_data, la, wsd)
                state.placed_ok += bsize
                placed_total += bsize
                iter_path = 'block_ok'
                path_counts['block_ok'] += 1
            else:
                _place_assignment(state, div_id, la_idx, gi, div_data, la, wsd)
                state.placed_ok += 1
                placed_total += 1
                iter_path = 'single_ok'
                path_counts['single_ok'] += 1
        elif _try_backtrack(state, div_id, la_idx, div_data, la, wsd, max_depth=5):
            state.backtracked += 1
            placed_total += 1
            iter_path = 'backtrack'
            path_counts['backtrack'] += 1
            # Backtrack places 1 period. If this was a block entry (bsize >= 2),
            # the remaining bsize-1 periods need to go back as singles.
            if bsize >= 2:
                key_single = (div_id, la_idx, 1)
                remaining[key_single] = remaining.get(key_single, 0) + (bsize - 1)
                logger.info("Backtrack partial block: %s in %s -- placed 1 of %d, returning %d as singles",
                            la.display_name, div_labels.get(div_id, div_id[:8]), bsize, bsize - 1)
        elif not best_is_cross_div and bsize >= 2:
            key_block = (div_id, la_idx, bsize)
            key_single = (div_id, la_idx, 1)
            remaining[key_single] = remaining.get(key_single, 0) + bsize
            logger.info("Runtime block demotion: %s in %s -- block of %d demoted to %d singles",
                        la.display_name, div_labels.get(div_id, div_id[:8]), bsize, bsize)
            iter_path = 'block_demote'
            path_counts['block_demote'] += 1
        else:
            # ── Constraint relaxation ladder ─────────────────────────────
            # Before falling back, try progressively relaxing constraints
            # one step at a time. Each relaxation creates a temporary copy
            # of the assignment's preferences with one constraint loosened.
            relaxed_gi = _try_constraint_relaxation(
                la, la_idx, div_id, div_data, bsize, state, wsd,
                best_is_cross_div, div_labels,
            )
            if relaxed_gi is not None:
                # Relaxation found a slot — place it
                if best_is_cross_div:
                    if bsize >= 2:
                        _place_block_cross_div(state, best_is_cross_div, relaxed_gi, bsize, wsd)
                    else:
                        _place_cross_div(state, best_is_cross_div, relaxed_gi, wsd)
                    n_divs = len(wsd.cross_div_electives[best_is_cross_div])
                    n_placed = bsize * n_divs
                    state.placed_ok += n_placed
                    placed_total += n_placed
                elif bsize >= 2:
                    _place_block(state, div_id, la_idx, relaxed_gi, bsize, div_data, la, wsd)
                    state.placed_ok += bsize
                    placed_total += bsize
                else:
                    _place_assignment(state, div_id, la_idx, relaxed_gi, div_data, la, wsd)
                    state.placed_ok += 1
                    placed_total += 1
                iter_path = 'relaxed'
                path_counts['relaxed'] += 1
            else:
                # Relaxation failed too — go to fallback
                analysis = _build_failure_analysis(la, la_idx, div_id, div_data, state, wsd, div_labels)
                failure_analyses.append(analysis)
                logger.warning("Fallback #%d: %s in %s — %s (valid_count=%d, block=%d)",
                               state.fallback + 1, la.display_name, div_labels.get(div_id, div_id[:8]),
                               analysis.get("reason", ""),
                               int(best_valid_count) if best_valid_count != float('inf') else 0,
                               bsize)

                if best_is_cross_div:
                    placed = False
                    first_div = wsd.cross_div_electives[best_is_cross_div][0]
                    first_data = wsd.divisions[first_div]
                    first_la = next((l for l in first_data.logical_assignments if l.elective_group_id == best_is_cross_div), la)
                    for fgi in range(div_data.total_periods):
                        all_empty = all(
                            state.chromosomes[d][fgi] == -1
                            for d in wsd.cross_div_electives[best_is_cross_div]
                        )
                        if not all_empty:
                            continue
                        fslot = first_data.period_slots[fgi] if fgi < len(first_data.period_slots) else None
                        if fslot:
                            fpicked = first_la.pick_available_teachers(
                                fslot.day_of_week, fslot.start_time,
                                state.teacher_busy, wsd.teacher_unavailable_times,
                                wsd.teacher_partitions, first_div,
                                end_time=fslot.end_time,
                            )
                            if fpicked is None:
                                continue
                        _place_cross_div(state, best_is_cross_div, fgi, wsd)
                        state.fallback += len(wsd.cross_div_electives[best_is_cross_div])
                        placed_total += len(wsd.cross_div_electives[best_is_cross_div])
                        placed = True
                        break
                    if not placed:
                        # Do NOT force-place cross-div with teacher conflicts.
                        logger.warning("Cannot place %s cross-div -- no teacher-safe slot (skipped to avoid double-booking)", la.display_name)
                        placed_total += len(wsd.cross_div_electives[best_is_cross_div])
                else:
                    # Single-mode fallback — prefer slots where teacher is free
                    placed = False
                    for fgi in range(div_data.total_periods):
                        if state.chromosomes[div_id][fgi] == -1:
                            fslot = div_data.period_slots[fgi] if fgi < len(div_data.period_slots) else None
                            if fslot:
                                fpicked = la.pick_available_teachers(
                                    fslot.day_of_week, fslot.start_time,
                                    state.teacher_busy, wsd.teacher_unavailable_times,
                                    wsd.teacher_partitions, div_id,
                                    end_time=fslot.end_time,
                                )
                                if fpicked is not None:
                                    _place_assignment(state, div_id, la_idx, fgi, div_data, la, wsd)
                                    state.fallback += 1
                                    placed = True
                                    break
                    if not placed:
                        # Do NOT force-place with teacher conflicts — this creates
                        # double-bookings visible in the teacher timetable view.
                        # Leave the slot empty; the failure analysis will report it.
                        logger.warning("Cannot place %s in %s -- no teacher-safe slot available (skipped to avoid double-booking)",
                                       la.display_name, div_labels.get(div_id, div_id[:8]))
                        iter_path = 'unplaceable'
                        path_counts['unplaceable'] += 1
                    else:
                        iter_path = 'fallback'
                        path_counts['fallback'] += 1
                    placed_total += 1  # count even unplaceable to avoid infinite loop

        # Track path for senior divisions
        per_la_paths[(div_id, la_idx)].append(iter_path)

        remaining[(div_id, la_idx, bsize)] -= 1
        if remaining[(div_id, la_idx, bsize)] <= 0:
            del remaining[(div_id, la_idx, bsize)]

        # Progress callback
        if on_progress and (placed_total % 20 == 0 or placed_total >= total_items or not remaining):
            desc = f"{la.display_name} ({div_id[:8]})"
            on_progress(
                placed_total, total_items,
                state.placed_ok, state.backtracked, state.fallback,
                desc, int(best_valid_count) if best_valid_count != float('inf') else 0,
            )

    if remaining:
        logger.warning("REMAINING after loop exit: %s",
                       {f"{div_labels.get(d,d[:8])}:{wsd.divisions[d].logical_assignments[l].display_name}:blk{b}": c
                        for (d, l, b), c in remaining.items()})
    # Verify per-division fill
    for div_id2, div_data2 in wsd.divisions.items():
        chrom = state.chromosomes[div_id2]
        placed_count = sum(1 for g in range(div_data2.total_periods) if chrom[g] != -1)
        expected = div_data2.total_periods
        la_counts = defaultdict(int)
        for g in range(div_data2.total_periods):
            idx = int(chrom[g])
            if idx >= 0:
                la_counts[idx] += 1
        for la_idx2, la2 in enumerate(div_data2.logical_assignments):
            actual = la_counts.get(la_idx2, 0)
            if actual != la2.weightage:
                pc = state.placement_counts.get((div_id2, la_idx2), 0)
                paths = per_la_paths.get((div_id2, la_idx2), [])
                logger.warning("MISMATCH %s la[%d] %s: chrom=%d, pc=%d, w=%d, paths=%s",
                               div_labels.get(div_id2, div_id2[:8]), la_idx2,
                               la2.display_name, actual, pc, la2.weightage, paths)
    logger.info("Demand-driven placement complete: %d OK, %d backtracked, %d fallback, placed_total=%d, total_items=%d, paths=%s",
                state.placed_ok, state.backtracked, state.fallback, placed_total, total_items, dict(path_counts))

    # ── Post-placement diagnostic: check for unfilled divisions ──────────
    for div_id, div_data in wsd.divisions.items():
        chromosome = state.chromosomes[div_id]
        filled = sum(1 for g in range(div_data.total_periods) if chromosome[g] != -1)
        if filled < div_data.total_periods:
            empty_gis = [g for g in range(div_data.total_periods) if chromosome[g] == -1]
            placed_la = defaultdict(int)
            for g in range(div_data.total_periods):
                idx = int(chromosome[g])
                if idx >= 0:
                    placed_la[idx] += 1
            # Find under-placed assignments
            under_placed = []
            for la_idx2, la2 in enumerate(div_data.logical_assignments):
                actual = placed_la.get(la_idx2, 0)
                if actual < la2.weightage:
                    under_placed.append(f"{la2.display_name} placed={actual}/{la2.weightage}")
            div_label = div_labels.get(div_id, div_id[:8])
            logger.warning("UNFILLED %s: %d/%d slots filled. Empty gene indices: %s. Under-placed: %s",
                           div_label, filled, div_data.total_periods,
                           empty_gis, "; ".join(under_placed) if under_placed else "none")

    # ── Step 4b: Post-placement repair — fill empty slots via swaps ──────
    _post_placement_repair(state, wsd, div_labels)

    # ── Step 5: Local optimization ────────────────────────────────────────
    logger.info("Step 5: Local optimization for %d divisions", len(wsd.divisions))
    for div_id, div_data in wsd.divisions.items():
        chromosome = state.chromosomes[div_id]
        _local_optimize(chromosome, div_data, state.teacher_busy, wsd, div_id)

    return state.chromosomes, failure_analyses


def _find_valid_slots_cross_div(
    eg_id: str,
    state: PlacementState,
    wsd: WholeSchoolData,
) -> list[tuple[int, float]]:
    """Find valid slots for a cross-division elective.

    A slot is valid only if it's empty in ALL divisions and the teachers
    (checked via first division's LA) are available.
    """
    div_ids = wsd.cross_div_electives[eg_id]
    first_div = div_ids[0]
    first_data = wsd.divisions[first_div]
    first_la = None
    for la in first_data.logical_assignments:
        if la.elective_group_id == eg_id:
            first_la = la
            break
    if not first_la:
        return []

    prefs = first_la.scheduling_preferences \
        if first_la.scheduling_preferences and isinstance(first_la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    excl_range = prefs.get("excludedPeriodRange") if prefs else None

    candidates: list[tuple[int, float]] = []

    for gi in range(first_data.total_periods):
        # Must be empty in ALL divisions
        all_empty = True
        for div_id in div_ids:
            if state.chromosomes[div_id][gi] != -1:
                all_empty = False
                break
        if not all_empty:
            continue

        slot = first_data.period_slots[gi] if gi < len(first_data.period_slots) else None
        if not slot:
            continue

        if is_hard:
            if slot.day_of_week in excluded_days:
                continue
            if preferred_days and slot.day_of_week not in preferred_days:
                continue

        period_num = slot.slot_number
        if is_hard and period_num is not None:
            if pref_range and (period_num < pref_range.get("min", 1) or period_num > pref_range.get("max", 99)):
                continue
            if excl_range and excl_range.get("min", 99) <= period_num <= excl_range.get("max", 0):
                continue

        # HARD maxPeriodsPerDay — check across first division
        ppd = first_data.periods_per_day
        day_idx = gi // ppd
        period_idx = gi % ppd
        if is_hard and prefs:
            max_pd = prefs.get("maxPeriodsPerDay")
            if max_pd is not None:
                first_la_idx = next(
                    i for i, la in enumerate(first_data.logical_assignments)
                    if la.elective_group_id == eg_id
                )
                day_count = sum(
                    1 for g in range(day_idx * ppd, min((day_idx + 1) * ppd, first_data.total_periods))
                    if int(state.chromosomes[first_div][g]) == first_la_idx
                )
                if day_count >= max_pd:
                    continue

        # NOTE: minPeriodsPerDay for cross-div electives is now handled by
        # _find_valid_blocks_cross_div() in block-atomic mode.

        # Teacher check — teachers are shared, only need to check once
        picked = first_la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, first_div,
            end_time=slot.end_time,
        )
        if picked is None:
            continue

        # Demand scoring with adjacency
        demand = 0.0
        want_adjacent = (
            wsd.adjacency_constraint_enabled
            or (prefs and prefs.get("preferAdjacentPeriods"))
        )
        hard_adjacent = is_hard and prefs and prefs.get("preferAdjacentPeriods")

        first_la_idx_adj = next(
            i for i, la in enumerate(first_data.logical_assignments)
            if la.elective_group_id == eg_id
        )
        chromosome = state.chromosomes[first_div]
        has_neighbor = False
        if want_adjacent:
            # Break-aware adjacency: no break between slots
            if period_idx > 0 and (day_idx, period_idx) not in first_data.period_after_break:
                if int(chromosome[day_idx * ppd + period_idx - 1]) == first_la_idx_adj:
                    has_neighbor = True
            if period_idx < ppd - 1 and (day_idx, period_idx + 1) not in first_data.period_after_break:
                if int(chromosome[day_idx * ppd + period_idx + 1]) == first_la_idx_adj:
                    has_neighbor = True

        # HARD adjacency: enforce only within same day
        placed_this_day = sum(
            1 for g in range(day_idx * ppd, min((day_idx + 1) * ppd, first_data.total_periods))
            if int(chromosome[g]) == first_la_idx_adj
        )
        if hard_adjacent and placed_this_day > 0 and not has_neighbor:
            continue

        if want_adjacent:
            if has_neighbor:
                demand -= 10
            elif placed_this_day > 0:
                demand += 5

        # Spread — avoid piling on one day
        first_la_idx = next(
            i for i, la in enumerate(first_data.logical_assignments)
            if la.elective_group_id == eg_id
        )
        day_count = sum(
            1 for g in range(day_idx * ppd, min((day_idx + 1) * ppd, first_data.total_periods))
            if int(state.chromosomes[first_div][g]) == first_la_idx
        )
        demand += day_count * 2

        candidates.append((gi, demand))

    return candidates


def _place_cross_div(
    state: PlacementState,
    eg_id: str,
    gi: int,
    wsd: WholeSchoolData,
) -> None:
    """Place a cross-division elective at gi in ALL participating divisions.

    Teachers are marked busy ONCE (they teach all divisions simultaneously).
    """
    div_ids = wsd.cross_div_electives[eg_id]

    for div_id in div_ids:
        div_data = wsd.divisions[div_id]
        for la_idx, la in enumerate(div_data.logical_assignments):
            if la.elective_group_id == eg_id:
                existing = int(state.chromosomes[div_id][gi])
                if existing >= 0 and existing != la_idx:
                    existing_name = div_data.logical_assignments[existing].display_name if existing < len(div_data.logical_assignments) else f"la[{existing}]"
                    logger.warning("CROSS-DIV OVERWRITE in %s gi=%d: %s (la[%d]) overwritten by %s (la[%d]) eg=%s",
                                   div_id[:8], gi, existing_name, existing, la.display_name, la_idx, eg_id[:8])
                state.chromosomes[div_id][gi] = la_idx
                state.placement_counts[(div_id, la_idx)] += 1
                break

    # Mark teachers busy ONCE using first division's LA
    first_div = div_ids[0]
    first_data = wsd.divisions[first_div]
    first_la = None
    first_la_idx = 0
    for idx, la in enumerate(first_data.logical_assignments):
        if la.elective_group_id == eg_id:
            first_la = la
            first_la_idx = idx
            break

    added_slots: list[tuple[str, int, str, str]] = []
    if first_la:
        slot = first_data.period_slots[gi] if gi < len(first_data.period_slots) else None
        if slot:
            picked = first_la.pick_available_teachers(
                slot.day_of_week, slot.start_time,
                state.teacher_busy, wsd.teacher_unavailable_times,
                wsd.teacher_partitions, first_div,
                end_time=slot.end_time,
            )
            if picked is None:
                picked = first_la.teacher_ids
            picked_set = set(picked)
            for tid in picked:
                state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))
            # Mark ALL split-mode elective teachers busy — they will be
            # distributed to specific slots by the output writer, so no
            # regular assignment should occupy any elective slot for them.
            if first_la.is_elective:
                for tid in first_la.teacher_ids:
                    if tid not in picked_set:
                        state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                        added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))

    state.history.append((first_div, first_la_idx, gi, added_slots))


def _find_valid_blocks(
    la: LogicalAssignment,
    la_idx: int,
    div_id: str,
    div_data: SchoolData,
    block_size: int,
    state: PlacementState,
    wsd: WholeSchoolData,
) -> list[tuple[int, float]]:
    """Find valid block starting positions for block-atomic placement.

    A valid block at gi_start means gi_start..gi_start+block_size-1 are ALL:
    - Empty, on the same day, no breaks between consecutive slots
    - Within HARD period range, day preferences
    - Teacher(s) available at all slots
    - existing + block_size <= maxPeriodsPerDay

    Returns: [(gi_start, demand_score), ...]
    """
    prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    max_pd = prefs.get("maxPeriodsPerDay") if prefs else None

    chromosome = state.chromosomes[div_id]
    ppd = div_data.periods_per_day
    candidates: list[tuple[int, float]] = []

    # Count existing placements per day (per la_idx for spread)
    day_counts: dict[int, int] = defaultdict(int)
    for gi2 in range(div_data.total_periods):
        if int(chromosome[gi2]) == la_idx:
            day_counts[gi2 // ppd] += 1

    # Subject-level day counts for maxPeriodsPerDay
    subject_day_counts: dict[int, int] | None = None
    if not la.is_elective and la.members:
        this_subject_id = la.members[0].subject_id
        same_subject_idxs = [
            idx for idx, other_la in enumerate(div_data.logical_assignments)
            if not other_la.is_elective and other_la.members
            and other_la.members[0].subject_id == this_subject_id
        ]
        if len(same_subject_idxs) > 1:
            subject_day_counts = defaultdict(int)
            for gi2 in range(div_data.total_periods):
                placed_idx = int(chromosome[gi2])
                if placed_idx >= 0 and placed_idx in same_subject_idxs:
                    subject_day_counts[gi2 // ppd] += 1

    for gi_start in range(div_data.total_periods - block_size + 1):
        day_idx = gi_start // ppd
        period_start = gi_start % ppd

        # Block must fit within the same day
        if period_start + block_size > ppd:
            continue

        # Check all slots in the block
        block_valid = True
        block_slots: list = []

        for offset in range(block_size):
            gi = gi_start + offset
            p_idx = period_start + offset

            # Must be empty
            if chromosome[gi] != -1:
                block_valid = False
                break

            # No break between consecutive slots in the block
            if offset > 0 and (day_idx, p_idx) in div_data.period_after_break:
                block_valid = False
                break

            slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
            if not slot:
                block_valid = False
                break

            # HARD day constraints
            if is_hard:
                if slot.day_of_week in excluded_days:
                    block_valid = False
                    break
                if preferred_days and slot.day_of_week not in preferred_days:
                    block_valid = False
                    break

            # HARD period range
            period_num = slot.slot_number
            if is_hard and period_num is not None and pref_range:
                if period_num < pref_range.get("min", 1) or period_num > pref_range.get("max", 99):
                    block_valid = False
                    break

            # Teacher availability
            picked = la.pick_available_teachers(
                slot.day_of_week, slot.start_time,
                state.teacher_busy, wsd.teacher_unavailable_times,
                wsd.teacher_partitions, div_id,
                end_time=slot.end_time,
            )
            if picked is None:
                block_valid = False
                break

            block_slots.append(slot)

        if not block_valid:
            continue

        # HARD maxPeriodsPerDay: existing + block_size must not exceed max
        # Uses subject-level counting for multi-teacher subjects
        if is_hard and max_pd is not None:
            mpd_count = (subject_day_counts or day_counts).get(day_idx, 0)
            if mpd_count + block_size > max_pd:
                continue

        # Score: average demand across all slots in the block
        total_demand = 0.0
        for gi in range(gi_start, gi_start + block_size):
            total_demand += _compute_slot_demand(gi, div_id, div_data, state, wsd)
        demand = total_demand / block_size

        # Spread penalty
        demand += day_counts.get(day_idx, 0) * 2

        # maxPerDay-aware scoring (subject-level)
        if max_pd is not None and max_pd > 0:
            mpd_day_counts = subject_day_counts or day_counts
            placed_on_day = mpd_day_counts.get(day_idx, 0)
            remaining_for_this = la.weightage - state.placement_counts.get((div_id, la_idx), 0)
            if subject_day_counts is not None and not la.is_elective and la.members:
                this_sid = la.members[0].subject_id
                remaining_for_this = 0
                for idx2, la2 in enumerate(div_data.logical_assignments):
                    if not la2.is_elective and la2.members and la2.members[0].subject_id == this_sid:
                        remaining_for_this += la2.weightage - state.placement_counts.get((div_id, idx2), 0)
            if remaining_for_this > 0:
                days_needed = -(-remaining_for_this // max_pd)
                days_with_room = sum(
                    1 for d in range(div_data.num_days)
                    if mpd_day_counts.get(d, 0) + block_size <= max_pd
                )
                if placed_on_day > 0 and days_needed >= days_with_room:
                    demand += 20
                elif placed_on_day + block_size >= max_pd:
                    demand += 10

        # Elective teacher conflict scoring
        elective_conflict_partners: list[int] = []
        conflict_info = state.elective_slot_reserves.get((div_id, la_idx))
        if conflict_info:
            elective_conflict_partners = [-(v + 1) for v in conflict_info if v < 0]
        if elective_conflict_partners:
            for partner_idx in elective_conflict_partners:
                partner_remaining = (
                    div_data.logical_assignments[partner_idx].weightage
                    - state.placement_counts.get((div_id, partner_idx), 0)
                )
                if partner_remaining <= 0:
                    continue
                partner_on_day = sum(
                    1 for g2 in range(day_idx * ppd, min((day_idx + 1) * ppd, div_data.total_periods))
                    if int(chromosome[g2]) == partner_idx
                )
                if partner_on_day == 0 and partner_remaining >= 3:
                    demand += 5

        candidates.append((gi_start, demand))

    return candidates


def _find_valid_blocks_cross_div(
    eg_id: str,
    block_size: int,
    state: PlacementState,
    wsd: WholeSchoolData,
) -> list[tuple[int, float]]:
    """Find valid block starting positions for a cross-division elective.

    All divisions must have the block of slots empty, break-free, and
    teachers available at all slot positions.
    """
    div_ids = wsd.cross_div_electives[eg_id]
    first_div = div_ids[0]
    first_data = wsd.divisions[first_div]
    first_la = None
    for la in first_data.logical_assignments:
        if la.elective_group_id == eg_id:
            first_la = la
            break
    if first_la is None:
        return []

    prefs = first_la.scheduling_preferences if first_la.scheduling_preferences and isinstance(first_la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    max_pd = prefs.get("maxPeriodsPerDay") if prefs else None

    ppd = first_data.periods_per_day
    candidates: list[tuple[int, float]] = []

    first_la_idx = next(
        i for i, la2 in enumerate(first_data.logical_assignments)
        if la2.elective_group_id == eg_id
    )
    day_counts: dict[int, int] = defaultdict(int)
    for gi2 in range(first_data.total_periods):
        if int(state.chromosomes[first_div][gi2]) == first_la_idx:
            day_counts[gi2 // ppd] += 1

    for gi_start in range(first_data.total_periods - block_size + 1):
        day_idx = gi_start // ppd
        period_start = gi_start % ppd

        if period_start + block_size > ppd:
            continue

        block_valid = True

        for offset in range(block_size):
            gi = gi_start + offset
            p_idx = period_start + offset

            # All divisions must have this slot empty
            if not all(state.chromosomes[d][gi] == -1 for d in div_ids):
                block_valid = False
                break

            # No break between consecutive slots
            if offset > 0 and (day_idx, p_idx) in first_data.period_after_break:
                block_valid = False
                break

            slot = first_data.period_slots[gi] if gi < len(first_data.period_slots) else None
            if not slot:
                block_valid = False
                break

            if is_hard:
                if slot.day_of_week in excluded_days:
                    block_valid = False
                    break
                if preferred_days and slot.day_of_week not in preferred_days:
                    block_valid = False
                    break

            period_num = slot.slot_number
            if is_hard and period_num is not None and pref_range:
                if period_num < pref_range.get("min", 1) or period_num > pref_range.get("max", 99):
                    block_valid = False
                    break

            picked = first_la.pick_available_teachers(
                slot.day_of_week, slot.start_time,
                state.teacher_busy, wsd.teacher_unavailable_times,
                wsd.teacher_partitions, first_div,
                end_time=slot.end_time,
            )
            if picked is None:
                block_valid = False
                break

        if not block_valid:
            continue

        if is_hard and max_pd is not None:
            if day_counts.get(day_idx, 0) + block_size > max_pd:
                continue

        demand = 0.0
        demand += day_counts.get(day_idx, 0) * 2

        candidates.append((gi_start, demand))

    return candidates


def _place_block(
    state: PlacementState,
    div_id: str,
    la_idx: int,
    gi_start: int,
    block_size: int,
    div_data: SchoolData,
    la: LogicalAssignment,
    wsd: WholeSchoolData,
) -> None:
    """Atomically place a block of block_size consecutive slots."""
    all_added_slots: list[tuple[str, int, str, str]] = []

    for offset in range(block_size):
        gi = gi_start + offset
        state.chromosomes[div_id][gi] = la_idx
        state.placement_counts[(div_id, la_idx)] += 1

        slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
        if slot:
            picked = la.pick_available_teachers(
                slot.day_of_week, slot.start_time,
                state.teacher_busy, wsd.teacher_unavailable_times,
                wsd.teacher_partitions, div_id,
                end_time=slot.end_time,
            )
            if picked is None:
                picked = la.teacher_ids
            picked_set = set(picked)
            for tid in picked:
                state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                all_added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))
            # Mark ALL split-mode elective teachers busy
            if la.is_elective:
                for tid in la.teacher_ids:
                    if tid not in picked_set:
                        state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                        all_added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))

    # Single history entry for the entire block (atomic backtracking)
    state.history.append((div_id, la_idx, gi_start, all_added_slots))


def _place_block_cross_div(
    state: PlacementState,
    eg_id: str,
    gi_start: int,
    block_size: int,
    wsd: WholeSchoolData,
) -> None:
    """Atomically place a block for a cross-division elective in ALL divisions."""
    div_ids = wsd.cross_div_electives[eg_id]

    # Stamp all divisions' chromosomes
    for div_id in div_ids:
        div_data = wsd.divisions[div_id]
        for la_idx, la in enumerate(div_data.logical_assignments):
            if la.elective_group_id == eg_id:
                for offset in range(block_size):
                    gidx = gi_start + offset
                    existing = int(state.chromosomes[div_id][gidx])
                    if existing >= 0 and existing != la_idx:
                        existing_name = div_data.logical_assignments[existing].display_name if existing < len(div_data.logical_assignments) else f"la[{existing}]"
                        logger.warning("CROSS-DIV-BLK OVERWRITE in %s gi=%d: %s (la[%d]) overwritten by %s (la[%d]) eg=%s",
                                       div_id[:8], gidx, existing_name, existing, la.display_name, la_idx, eg_id[:8])
                    state.chromosomes[div_id][gidx] = la_idx
                    state.placement_counts[(div_id, la_idx)] += 1
                break

    # Mark teachers busy ONCE using first division
    first_div = div_ids[0]
    first_data = wsd.divisions[first_div]
    first_la = None
    first_la_idx = 0
    for idx, la in enumerate(first_data.logical_assignments):
        if la.elective_group_id == eg_id:
            first_la = la
            first_la_idx = idx
            break

    all_added_slots: list[tuple[str, int, str, str]] = []
    if first_la:
        for offset in range(block_size):
            gi = gi_start + offset
            slot = first_data.period_slots[gi] if gi < len(first_data.period_slots) else None
            if slot:
                picked = first_la.pick_available_teachers(
                    slot.day_of_week, slot.start_time,
                    state.teacher_busy, wsd.teacher_unavailable_times,
                    wsd.teacher_partitions, first_div,
                    end_time=slot.end_time,
                )
                if picked is None:
                    picked = first_la.teacher_ids
                picked_set = set(picked)
                for tid in picked:
                    state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                    all_added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))
                # Mark ALL split-mode elective teachers busy
                if first_la.is_elective:
                    for tid in first_la.teacher_ids:
                        if tid not in picked_set:
                            state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                            all_added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))

    state.history.append((first_div, first_la_idx, gi_start, all_added_slots))


def _place_assignment(
    state: PlacementState,
    div_id: str,
    la_idx: int,
    gi: int,
    div_data: SchoolData,
    la: LogicalAssignment,
    wsd: WholeSchoolData = None,
) -> None:
    """Place an assignment at a gene index and update state."""
    existing = int(state.chromosomes[div_id][gi])
    if existing >= 0 and existing != la_idx:
        div_data_for_log = wsd.divisions[div_id] if wsd else None
        existing_name = div_data_for_log.logical_assignments[existing].display_name if div_data_for_log and existing < len(div_data_for_log.logical_assignments) else f"la[{existing}]"
        logger.warning("OVERWRITE in %s gi=%d: %s (la[%d]) overwritten by %s (la[%d])",
                       div_id[:8], gi, existing_name, existing, la.display_name, la_idx)
    state.chromosomes[div_id][gi] = la_idx
    state.placement_counts[(div_id, la_idx)] += 1

    # Mark teachers as busy — for electives, mark ALL teachers (including
    # split-mode teachers not picked) since the output writer will distribute
    # them to specific slots and no regular assignment should overlap.
    slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
    added_slots: list[tuple[str, int, str, str]] = []
    if slot:
        picked = la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, div_id,
            end_time=slot.end_time,
        )
        if picked is None:
            picked = la.teacher_ids
        picked_set = set(picked)
        for tid in picked:
            state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
            added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))
        # Mark ALL split-mode elective teachers busy
        if la.is_elective:
            for tid in la.teacher_ids:
                if tid not in picked_set:
                    state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                    added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))

    state.history.append((div_id, la_idx, gi, added_slots))


def _unplace_assignment(
    state: PlacementState,
    div_id: str,
    la_idx: int,
    gi: int,
    teacher_slots: list[tuple[str, int, str, str]],
) -> None:
    """Undo a placement."""
    state.chromosomes[div_id][gi] = -1
    state.placement_counts[(div_id, la_idx)] -= 1
    for tid, dow, st, et in teacher_slots:
        state.teacher_busy.remove(tid, dow, st, et)


def _build_failure_analysis(
    la: LogicalAssignment,
    la_idx: int,
    div_id: str,
    div_data: SchoolData,
    state: PlacementState,
    wsd: WholeSchoolData,
    div_labels: dict[str, str],
) -> dict:
    """Build a structured failure analysis with actionable suggestions.

    Returns a dict with: type, severity, division, subject, teacher,
    message, suggestion, reason (compact log string), details.
    """
    prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    excl_range = prefs.get("excludedPeriodRange") if prefs else None

    chromosome = state.chromosomes[div_id]
    total_slots = div_data.total_periods
    full = 0
    day_blocked = 0
    period_blocked = 0
    teacher_unavail = 0
    teacher_busy_count = 0
    partition_blocked = 0
    max_per_day_blocked = 0

    max_per_day = prefs.get("maxPeriodsPerDay") if prefs else None
    ppd = div_data.periods_per_day

    for gi in range(total_slots):
        if chromosome[gi] != -1:
            full += 1
            continue
        slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
        if not slot:
            continue

        if is_hard:
            if slot.day_of_week in excluded_days or (preferred_days and slot.day_of_week not in preferred_days):
                day_blocked += 1
                continue
        if is_hard and slot.slot_number is not None:
            if pref_range and (slot.slot_number < pref_range.get("min", 1) or slot.slot_number > pref_range.get("max", 99)):
                period_blocked += 1
                continue
            if excl_range and excl_range.get("min", 99) <= slot.slot_number <= excl_range.get("max", 0):
                period_blocked += 1
                continue

        # Check maxPeriodsPerDay (subject-level for multi-teacher subjects)
        if is_hard and max_per_day:
            day_idx = gi // ppd
            day_start = day_idx * ppd
            # Count all same-subject assignments on this day
            if not la.is_elective and la.members:
                this_sid = la.members[0].subject_id
                same_today = sum(
                    1 for g in range(day_start, min(day_start + ppd, total_slots))
                    if int(chromosome[g]) >= 0
                    and not div_data.logical_assignments[int(chromosome[g])].is_elective
                    and div_data.logical_assignments[int(chromosome[g])].members
                    and div_data.logical_assignments[int(chromosome[g])].members[0].subject_id == this_sid
                )
            else:
                same_today = sum(1 for g in range(day_start, min(day_start + ppd, total_slots))
                                 if int(chromosome[g]) == la_idx)
            if same_today >= max_per_day:
                max_per_day_blocked += 1
                continue

        picked = la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, div_id,
            end_time=slot.end_time,
        )
        if picked is None:
            has_unavail = any(
                (tid, slot.day_of_week, slot.start_time) in wsd.teacher_unavailable_times
                for tid in la.teacher_ids
            )
            has_busy = any(
                state.teacher_busy.is_busy(tid, slot.day_of_week, slot.start_time, slot.end_time)
                for tid in la.teacher_ids
            )
            if has_unavail:
                teacher_unavail += 1
            elif has_busy:
                teacher_busy_count += 1
            else:
                partition_blocked += 1

    # ── Build compact reason string (for logs) ──
    reason = (f"full={full} day_pref={day_blocked} period_pref={period_blocked} "
              f"max_per_day={max_per_day_blocked} unavail={teacher_unavail} "
              f"busy={teacher_busy_count} partition={partition_blocked} "
              f"teachers=[{', '.join(la.teacher_ids[:2])}]")

    # ── Resolve names ──
    div_label = div_labels.get(div_id, div_id[:8])
    subject_name = la.display_name

    teacher_names = []
    teacher_loads: dict[str, int] = {}
    for tid in la.teacher_ids:
        tinfo = wsd.teachers.get(tid) or div_data.teachers.get(tid)
        tname = tinfo.name if tinfo else tid[:8]
        teacher_names.append(tname)
        # Compute total load for this teacher across all divisions
        load = 0
        for dd in wsd.divisions.values():
            for a in dd.assignments:
                if a.teacher_id == tid:
                    load += a.weightage
        teacher_loads[tname] = load

    # ── Determine failure type and build message + suggestion ──
    analysis_type = "PLACEMENT_FAILED"
    message = ""
    suggestion = ""

    if teacher_busy_count > 0 and teacher_busy_count >= (total_slots - full - day_blocked - period_blocked - max_per_day_blocked):
        # Primary blocker is teacher busy
        busiest = max(teacher_loads, key=teacher_loads.get) if teacher_loads else ""
        busiest_load = teacher_loads.get(busiest, 0)

        if busiest_load > total_slots:
            analysis_type = "TEACHER_OVERLOAD"
            message = (f"{busiest} has {busiest_load} periods/week but only {total_slots} "
                       f"slots exist. Blocked {teacher_busy_count} empty slot(s) for {subject_name} in {div_label}.")
            # Find which divisions this teacher is in, sorted by load
            teacher_divs = []
            tid_busiest = la.teacher_ids[list(teacher_loads.keys()).index(busiest)] if busiest in teacher_loads else None
            if tid_busiest:
                for dd_id, dd in wsd.divisions.items():
                    for a in dd.assignments:
                        if a.teacher_id == tid_busiest:
                            teacher_divs.append((div_labels.get(dd_id, dd_id[:8]), a.subject_name, a.weightage))
            teacher_divs.sort(key=lambda x: -x[2])
            if teacher_divs:
                top_divs = teacher_divs[:3]
                examples = ", ".join(f"{d[0]} {d[1]} ({d[2]}pw)" for d in top_divs)
                suggestion = f"Reassign {busiest} from a division to reduce total load below {total_slots}pw. Heaviest: {examples}."
            else:
                suggestion = f"Reduce {busiest}'s total teaching load below {total_slots} periods/week."
        else:
            analysis_type = "TEACHER_BUSY"
            # Check if teacher is shared across per-division elective groups in this division
            elective_conflict = _detect_elective_teacher_conflict(la, div_id, div_data, wsd, div_labels)
            if elective_conflict:
                analysis_type = "ELECTIVE_TEACHER_CONFLICT"
                message = elective_conflict["message"]
                suggestion = elective_conflict["suggestion"]
            else:
                message = (f"{busiest} ({busiest_load}pw) is busy in {teacher_busy_count} of "
                           f"{total_slots - full} empty slots for {subject_name} in {div_label}.")
                suggestion = f"Reduce {busiest}'s teaching load or reassign {subject_name} to a less busy teacher."

    elif period_blocked > 0 and period_blocked >= (total_slots - full - day_blocked):
        analysis_type = "PERIOD_PREFERENCE_CONFLICT"
        pref_desc = ""
        if pref_range:
            pref_desc = f"P{pref_range.get('min', '?')}-P{pref_range.get('max', '?')}"
        message = (f"HARD period preference ({pref_desc}) blocked {period_blocked} slot(s) "
                   f"for {subject_name} in {div_label}. Only {total_slots - full - day_blocked - period_blocked} "
                   f"valid slots remain after preferences.")
        suggestion = f"Change period preference from HARD to SOFT for {subject_name} in {div_label}, or widen the allowed range."

    elif max_per_day_blocked > 0 and max_per_day_blocked >= (total_slots - full - day_blocked - period_blocked):
        analysis_type = "MAX_PER_DAY_CONFLICT"
        message = (f"HARD maxPeriodsPerDay={max_per_day} blocked {max_per_day_blocked} remaining slot(s) "
                   f"for {subject_name} in {div_label}. Each day already has {max_per_day} period(s).")
        suggestion = f"Increase maxPeriodsPerDay to {(max_per_day or 2) + 1} for {subject_name}, or change the constraint from HARD to SOFT."

    elif day_blocked > 0 and day_blocked >= (total_slots - full):
        analysis_type = "DAY_PREFERENCE_CONFLICT"
        message = (f"HARD day preference blocked {day_blocked} slot(s) for {subject_name} in {div_label}.")
        suggestion = f"Relax day preferences from HARD to SOFT for {subject_name} in {div_label}."

    elif full >= total_slots - 2:
        analysis_type = "DIVISION_FULL"
        # Calculate effective load for this division
        raw_total = sum(la2.weightage for la2 in div_data.logical_assignments)
        message = (f"{div_label} has {full}/{total_slots} slots occupied. "
                   f"Total weightage is {raw_total}pw but only {total_slots} slots exist.")
        suggestion = f"Reduce total assignment weightage in {div_label} to fit within {total_slots} slots."

    else:
        # Generic — combine all blockers
        parts = []
        if full > 0: parts.append(f"{full} slots occupied")
        if day_blocked > 0: parts.append(f"{day_blocked} blocked by day preference")
        if period_blocked > 0: parts.append(f"{period_blocked} blocked by period preference")
        if max_per_day_blocked > 0: parts.append(f"{max_per_day_blocked} blocked by maxPeriodsPerDay")
        if teacher_busy_count > 0: parts.append(f"{teacher_busy_count} blocked by teacher busy")
        if teacher_unavail > 0: parts.append(f"{teacher_unavail} blocked by teacher unavailability")
        if partition_blocked > 0: parts.append(f"{partition_blocked} blocked by partition")
        message = f"No valid slot for {subject_name} in {div_label}: {'; '.join(parts)}."
        suggestion = "Review teacher assignments and scheduling preferences for this division."

    return {
        "type": analysis_type,
        "severity": "hard",
        "division": div_label,
        "divisionId": div_id,
        "subject": subject_name,
        "teachers": teacher_names,
        "message": message,
        "suggestion": suggestion,
        "reason": reason,
        "details": {
            "totalSlots": total_slots,
            "slotsFull": full,
            "dayBlocked": day_blocked,
            "periodBlocked": period_blocked,
            "maxPerDayBlocked": max_per_day_blocked,
            "teacherUnavail": teacher_unavail,
            "teacherBusy": teacher_busy_count,
            "partitionBlocked": partition_blocked,
            "teacherLoads": teacher_loads,
        },
    }


def _detect_elective_teacher_conflict(
    la: LogicalAssignment,
    div_id: str,
    div_data: SchoolData,
    wsd: WholeSchoolData,
    div_labels: dict[str, str],
) -> dict | None:
    """Check if a teacher appears in multiple per-division elective groups in this division.

    Returns {"message": ..., "suggestion": ...} if found, else None.
    """
    teacher_set = set(la.teacher_ids)
    this_eg = la.elective_group_id

    for other_la in div_data.logical_assignments:
        if not other_la.is_elective or other_la.elective_group_id == this_eg:
            continue
        # Check cross-div — skip those (they're stamped once)
        if other_la.elective_group_id and other_la.elective_group_id in wsd.cross_div_electives:
            continue
        # Check teacher overlap
        other_teachers = set(other_la.teacher_ids)
        shared = teacher_set & other_teachers
        if shared:
            shared_names = []
            for tid in shared:
                tinfo = wsd.teachers.get(tid) or div_data.teachers.get(tid)
                shared_names.append(tinfo.name if tinfo else tid[:8])

            div_label = div_labels.get(div_id, div_id[:8])
            eg1 = la.elective_group_name or la.display_name
            eg2 = other_la.elective_group_name or other_la.display_name
            return {
                "message": (f"{', '.join(shared_names)} teaches in both '{eg1}' and '{eg2}' "
                            f"electives in {div_label}. These two electives can never overlap, "
                            f"needing {la.weightage + other_la.weightage} of {div_data.total_periods} slots."),
                "suggestion": (f"Assign a different teacher for one of the subjects so "
                               f"{', '.join(shared_names)} is not in both elective groups."),
            }
    return None


def _find_valid_slots(
    la: LogicalAssignment,
    la_idx: int,
    div_id: str,
    div_data: SchoolData,
    state: PlacementState,
    wsd: WholeSchoolData,
) -> list[tuple[int, float]]:
    """Find all valid gene indices and score each by demand (lower = better).

    Returns: [(gene_index, demand_score), ...]
    """
    prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    excl_range = prefs.get("excludedPeriodRange") if prefs else None

    chromosome = state.chromosomes[div_id]
    ppd = div_data.periods_per_day
    candidates: list[tuple[int, float]] = []

    # Count existing placements per day for spread scoring (per la_idx)
    day_counts: dict[int, int] = defaultdict(int)
    for gi2 in range(div_data.total_periods):
        if int(chromosome[gi2]) == la_idx:
            day_counts[gi2 // ppd] += 1

    # Count ALL same-subject assignments per day for maxPeriodsPerDay.
    # maxPerDay applies to the SUBJECT across all teachers — e.g. if
    # Maths has 2 teachers (Smitha w=4, Sahana w=3) and maxPerDay=2,
    # a day can have at most 2 Maths periods total, not 2 per teacher.
    subject_day_counts: dict[int, int] | None = None
    if not la.is_elective and la.members:
        this_subject_id = la.members[0].subject_id
        # Find all la_idxs in this division with the same subject_id
        same_subject_idxs = [
            idx for idx, other_la in enumerate(div_data.logical_assignments)
            if not other_la.is_elective and other_la.members
            and other_la.members[0].subject_id == this_subject_id
        ]
        if len(same_subject_idxs) > 1:
            subject_day_counts = defaultdict(int)
            for gi2 in range(div_data.total_periods):
                placed_idx = int(chromosome[gi2])
                if placed_idx >= 0 and placed_idx in same_subject_idxs:
                    subject_day_counts[gi2 // ppd] += 1

    want_adjacent = (
        wsd.adjacency_constraint_enabled
        or (prefs and prefs.get("preferAdjacentPeriods"))
    )

    # Check if this elective has teacher conflicts with another elective
    elective_conflict_partners: list[int] = []
    conflict_info = state.elective_slot_reserves.get((div_id, la_idx))
    if conflict_info:
        elective_conflict_partners = [-(v + 1) for v in conflict_info if v < 0]

    for gi in range(div_data.total_periods):
        if chromosome[gi] != -1:
            continue

        period_idx = gi % ppd
        day_idx = gi // ppd
        slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
        if not slot:
            continue

        # HARD day constraints
        if is_hard:
            if slot.day_of_week in excluded_days:
                continue
            if preferred_days and slot.day_of_week not in preferred_days:
                continue

        # HARD period constraints
        period_num = slot.slot_number
        if is_hard and period_num is not None:
            if pref_range and (period_num < pref_range.get("min", 1) or period_num > pref_range.get("max", 99)):
                continue
            if excl_range and excl_range.get("min", 99) <= period_num <= excl_range.get("max", 0):
                continue

        # Teacher checks — use pick_available_teachers to respect
        # parallel_sections for elective groups
        picked = la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, div_id,
            end_time=slot.end_time,
        )
        if picked is None:
            continue

        # HARD maxPeriodsPerDay — skip if already at max for this day.
        # Uses subject-level counting when multiple teachers teach the same subject.
        if is_hard and prefs:
            max_pd = prefs.get("maxPeriodsPerDay")
            if max_pd is not None:
                mpd_count = (subject_day_counts or day_counts).get(day_idx, 0)
                if mpd_count >= max_pd:
                    continue

        # NOTE: minPeriodsPerDay is now enforced via block-atomic placement.
        # Assignments with adjacency + minPerDay >= 2 use _find_valid_blocks()
        # which guarantees contiguous blocks. This single-mode path only handles
        # assignments without block requirements (or remainder periods from
        # odd-weightage block assignments).

        # HARD adjacency — if periods already placed, ONLY allow adjacent slots.
        # Break-aware: P2 and P3 are NOT adjacent if there's an interval between them.
        hard_adjacent = is_hard and prefs and prefs.get("preferAdjacentPeriods")
        has_neighbor = False
        if want_adjacent:
            # Check left neighbor: gi-1 is adjacent only if no break before current slot
            if period_idx > 0 and (day_idx, period_idx) not in div_data.period_after_break:
                if int(chromosome[day_idx * ppd + period_idx - 1]) == la_idx:
                    has_neighbor = True
            # Check right neighbor: gi+1 is adjacent only if no break before next slot
            if period_idx < ppd - 1 and (day_idx, period_idx + 1) not in div_data.period_after_break:
                if int(chromosome[day_idx * ppd + period_idx + 1]) == la_idx:
                    has_neighbor = True

        # HARD adjacency: enforce only within the same day. If this day already
        # has placements of this assignment, the new slot MUST be adjacent to one.
        # First placement on a new day is always allowed (start a new block).
        placed_this_day = day_counts.get(day_idx, 0)
        if hard_adjacent and placed_this_day > 0 and not has_neighbor:
            continue

        # Score this slot (lower = better for demand-driven selection)
        demand = _compute_slot_demand(gi, div_id, div_data, state, wsd)

        # Adjacency scoring for SOFT or first placement
        if want_adjacent:
            if has_neighbor:
                demand -= 10
            elif placed_this_day > 0:
                demand += 5

        # SOFT day preferences (not excluded during filtering, but penalized)
        if not is_hard and prefs:
            soft_pref_days = set(prefs.get("preferredDays", []))
            soft_excl_days = set(prefs.get("excludedDays", []))
            if soft_pref_days and slot.day_of_week not in soft_pref_days:
                demand += 3
            if slot.day_of_week in soft_excl_days:
                demand += 3
            # SOFT period range
            soft_pref_range = prefs.get("preferredPeriodRange")
            soft_excl_range = prefs.get("excludedPeriodRange")
            if soft_pref_range and period_num is not None:
                if period_num < soft_pref_range.get("min", 1) or period_num > soft_pref_range.get("max", 99):
                    demand += 3
            if soft_excl_range and period_num is not None:
                if soft_excl_range.get("min", 99) <= period_num <= soft_excl_range.get("max", 0):
                    demand += 3

        # Spread bonus — avoid piling on one day
        demand += day_counts.get(day_idx, 0) * 2

        # maxPeriodsPerDay-aware scoring: penalize days approaching the cap.
        # Uses subject-level counts to account for multi-teacher subjects.
        effective_max_pd = None
        if prefs:
            effective_max_pd = prefs.get("maxPeriodsPerDay")
        if effective_max_pd is not None and effective_max_pd > 0:
            mpd_day_counts = subject_day_counts or day_counts
            placed_on_day = mpd_day_counts.get(day_idx, 0)
            # For multi-teacher subjects, compute total remaining across all teachers
            remaining_for_this = la.weightage - state.placement_counts.get((div_id, la_idx), 0)
            if subject_day_counts is not None and not la.is_elective and la.members:
                this_sid = la.members[0].subject_id
                remaining_for_this = 0
                for idx2, la2 in enumerate(div_data.logical_assignments):
                    if not la2.is_elective and la2.members and la2.members[0].subject_id == this_sid:
                        remaining_for_this += la2.weightage - state.placement_counts.get((div_id, idx2), 0)
            if remaining_for_this > 0:
                days_needed = -(-remaining_for_this // effective_max_pd)
                days_with_room = sum(
                    1 for d in range(div_data.num_days)
                    if mpd_day_counts.get(d, 0) < effective_max_pd
                )
                if placed_on_day > 0 and days_needed >= days_with_room:
                    demand += 20
                elif placed_on_day >= effective_max_pd - 1:
                    demand += 10

        # Scarcity-aware scoring: if THIS assignment can use P1 but the slot
        # is P2-P8, penalize it so we preserve P2-P8 slots for assignments
        # that are RESTRICTED to P2-P8 only.
        this_restricted_to_p2_8 = (
            is_hard and pref_range and pref_range.get("min", 1) >= 2
        )
        if not this_restricted_to_p2_8 and period_num is not None and period_num >= 2:
            # Count how many unplaced P2-P8-restricted periods remain in this div
            p2_8_remaining = 0
            p2_8_capacity = sum(
                1 for g2 in range(div_data.total_periods)
                if div_data.period_slots[g2].slot_number and div_data.period_slots[g2].slot_number >= 2
                   and state.chromosomes[div_id][g2] == -1
            )
            for la_idx2, la2 in enumerate(div_data.logical_assignments):
                placed2 = state.placement_counts.get((div_id, la_idx2), 0)
                remaining2 = la2.weightage - placed2
                if remaining2 <= 0:
                    continue
                p2 = la2.scheduling_preferences
                if p2 and isinstance(p2, dict) and p2.get("constraintType") == "HARD":
                    pr2 = p2.get("preferredPeriodRange")
                    if pr2 and pr2.get("min", 1) >= 2:
                        p2_8_remaining += remaining2

            if p2_8_remaining > 0 and p2_8_capacity > 0:
                # Pressure = how tight the P2-P8 supply is
                # 1.0 = balanced, >1.0 = over-demand, <1.0 = plenty of room
                pressure = p2_8_remaining / p2_8_capacity
                if pressure > 0.5:
                    # Steer unrestricted assignments toward P1 slots
                    demand += pressure * 8

        # Elective teacher conflict: if this elective shares a teacher with
        # another per-division elective in this division, prefer days where
        # the OTHER elective has already placed (so they don't overlap on
        # fresh days). The key insight: two electives sharing a teacher
        # can't use the same slot, so we want them on DIFFERENT periods
        # of the SAME day or on different days entirely.
        if elective_conflict_partners:
            for partner_idx in elective_conflict_partners:
                partner_remaining = (
                    div_data.logical_assignments[partner_idx].weightage
                    - state.placement_counts.get((div_id, partner_idx), 0)
                )
                if partner_remaining <= 0:
                    continue
                # Check how many valid slots the partner has on this day
                partner_on_day = sum(
                    1 for g2 in range(day_idx * ppd, min((day_idx + 1) * ppd, div_data.total_periods))
                    if int(chromosome[g2]) == partner_idx
                )
                # If the partner hasn't placed on this day yet and still
                # has many periods to place, penalize — leave room for them
                if partner_on_day == 0 and partner_remaining >= 3:
                    demand += 5

        candidates.append((gi, demand))

    return candidates


def _compute_slot_demand(
    gi: int,
    div_id: str,
    div_data: SchoolData,
    state: PlacementState,
    wsd: WholeSchoolData,
) -> float:
    """Compute how many other assignments in this division could use this slot.

    Higher demand = more contested = worse choice (save it for someone who needs it more).
    """
    chromosome = state.chromosomes[div_id]
    slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
    if not slot:
        return 0

    demand = 0
    for la_idx2, la2 in enumerate(div_data.logical_assignments):
        placed = state.placement_counts.get((div_id, la_idx2), 0)
        if placed >= la2.weightage:
            continue  # already fully placed

        # Could this assignment use this slot? (respects parallel_sections)
        picked = la2.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            end_time=slot.end_time,
        )
        if picked is not None:
            demand += 1

    return demand


def _try_backtrack(
    state: PlacementState,
    div_id: str,
    la_idx: int,
    div_data: SchoolData,
    la: LogicalAssignment,
    wsd: WholeSchoolData,
    max_depth: int = 5,
) -> bool:
    """Try to free up a slot by undoing recent placements.

    Look at the last max_depth history entries involving the same teachers
    as the stuck assignment. Undo them, place the current assignment, then
    re-place the undone ones.
    """
    teacher_ids = set(la.teacher_ids)
    if not teacher_ids:
        return False

    # Find recent history entries that involve the same teachers
    undo_candidates: list[int] = []
    for hi in range(len(state.history) - 1, max(len(state.history) - 50, -1), -1):
        if hi < 0:
            break
        h_div_id, h_la_idx, h_gi, h_teacher_slots = state.history[hi]
        # Check if any teacher slot conflicts with our stuck assignment
        for tid, dow, st, et in h_teacher_slots:
            if tid in teacher_ids:
                undo_candidates.append(hi)
                break
        if len(undo_candidates) >= max_depth:
            break

    if not undo_candidates:
        return False

    # Try undoing each candidate and see if the current assignment fits
    for hi in undo_candidates:
        h_div_id, h_la_idx, h_gi, h_teacher_slots = state.history[hi]

        # Undo
        _unplace_assignment(state, h_div_id, h_la_idx, h_gi, h_teacher_slots)

        # Try placing current assignment
        candidates = _find_valid_slots(la, la_idx, div_id, div_data, state, wsd)
        if candidates:
            candidates.sort(key=lambda x: x[1])
            best_gi = candidates[0][0]
            _place_assignment(state, div_id, la_idx, best_gi, div_data, la, wsd)

            # Try re-placing the undone assignment
            h_div_data = wsd.divisions[h_div_id]
            h_la = h_div_data.logical_assignments[h_la_idx]
            h_candidates = _find_valid_slots(h_la, h_la_idx, h_div_id, h_div_data, state, wsd)
            if h_candidates:
                h_candidates.sort(key=lambda x: x[1])
                _place_assignment(state, h_div_id, h_la_idx, h_candidates[0][0], h_div_data, h_la, wsd)
                return True
            else:
                # Re-placing failed — undo both and try next candidate
                # Undo current
                last_entry = state.history.pop()
                _unplace_assignment(state, last_entry[0], last_entry[1], last_entry[2], last_entry[3])
                # Restore original
                _place_assignment(state, h_div_id, h_la_idx, h_gi, h_div_data, h_la, wsd)
        else:
            # Current still can't fit — restore and try next
            h_div_data = wsd.divisions[h_div_id]
            h_la = h_div_data.logical_assignments[h_la_idx]
            _place_assignment(state, h_div_id, h_la_idx, h_gi, h_div_data, h_la, wsd)

    return False


def _post_placement_repair(
    state: PlacementState,
    wsd: WholeSchoolData,
    div_labels: dict[str, str],
) -> None:
    """Post-placement repair: fill empty slots by swapping assignments within
    the same division so that unplaced assignments can fit.

    Two passes:
      Pass 1: respect all HARD constraints
      Pass 2: progressively relax HARD constraints (minimal breakage)

    For each unplaced assignment-period, try to find a filled slot in the same
    division where:
      - The unplaced assignment's teachers are free at the filled slot's time
      - The filled slot's assignment can move to the empty slot without creating
        teacher conflicts in OTHER divisions
    If a direct swap works, do it. Otherwise try a 2-hop chain.
    """
    repairs = 0
    repairs_relaxed = 0

    for div_id, div_data in wsd.divisions.items():
        chromosome = state.chromosomes[div_id]
        ppd = div_data.periods_per_day
        logicals = div_data.logical_assignments

        # Find empty slots and under-placed assignments
        empty_gis = [g for g in range(div_data.total_periods) if chromosome[g] == -1]
        if not empty_gis:
            continue

        placed_counts: dict[int, int] = defaultdict(int)
        for g in range(div_data.total_periods):
            idx = int(chromosome[g])
            if idx >= 0:
                placed_counts[idx] += 1

        unplaced: list[tuple[int, int]] = []  # (la_idx, remaining_count)
        for la_idx, la in enumerate(logicals):
            remaining = la.weightage - placed_counts.get(la_idx, 0)
            if remaining > 0 and not la.is_elective:
                unplaced.append((la_idx, remaining))

        if not unplaced:
            continue

        div_label = div_labels.get(div_id, div_id[:8])

        for la_idx, remaining in unplaced:
            la = logicals[la_idx]

            for _ in range(remaining):
                placed = _try_repair_swap(
                    state, div_id, div_data, la, la_idx, chromosome,
                    wsd, div_label, respect_hard=True,
                )
                if placed:
                    repairs += 1
                else:
                    # Pass 2: relax hard constraints
                    placed = _try_repair_swap(
                        state, div_id, div_data, la, la_idx, chromosome,
                        wsd, div_label, respect_hard=False,
                    )
                    if placed:
                        repairs_relaxed += 1

    if repairs or repairs_relaxed:
        logger.info("Post-placement repair: %d fixed (strict), %d fixed (relaxed)",
                    repairs, repairs_relaxed)


def _try_repair_swap(
    state: PlacementState,
    div_id: str,
    div_data: SchoolData,
    la: LogicalAssignment,
    la_idx: int,
    chromosome: np.ndarray,
    wsd: WholeSchoolData,
    div_label: str,
    respect_hard: bool,
) -> bool:
    """Try to place one period of `la` by swapping an existing assignment
    in the same division to an empty slot.

    Returns True if a swap was made.
    """
    ppd = div_data.periods_per_day
    logicals = div_data.logical_assignments
    empty_gis = [g for g in range(div_data.total_periods) if chromosome[g] == -1]
    if not empty_gis:
        return False

    # Check hard constraints for the unplaced assignment at a given gi
    def _is_valid_for_la(gi: int) -> bool:
        slot = div_data.period_slots[gi] if gi < len(div_data.period_slots) else None
        if not slot:
            return False

        prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
        is_hard = prefs and prefs.get("constraintType") == "HARD"

        if respect_hard and is_hard and prefs:
            # Day constraints
            preferred_days = set(prefs.get("preferredDays", []))
            excluded_days = set(prefs.get("excludedDays", []))
            if slot.day_of_week in excluded_days:
                return False
            if preferred_days and slot.day_of_week not in preferred_days:
                return False

            # Period range
            pref_range = prefs.get("preferredPeriodRange")
            period_num = slot.slot_number
            if pref_range and period_num is not None:
                if period_num < pref_range.get("min", 1) or period_num > pref_range.get("max", 99):
                    return False

            # maxPeriodsPerDay
            max_pd = prefs.get("maxPeriodsPerDay")
            if max_pd is not None:
                day_idx = gi // ppd
                day_count = sum(1 for g2 in range(day_idx * ppd, min((day_idx + 1) * ppd, div_data.total_periods))
                                if int(chromosome[g2]) == la_idx)
                if day_count >= max_pd:
                    return False

        # Teacher availability
        picked = la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, div_id,
            end_time=slot.end_time,
        )
        return picked is not None

    # Try direct placement into empty slots first (no swap needed)
    for gi_empty in empty_gis:
        if _is_valid_for_la(gi_empty):
            _place_assignment(state, div_id, la_idx, gi_empty, div_data, la, wsd)
            logger.info("Repair: placed %s in %s at gi=%d (direct)", la.display_name, div_label, gi_empty)
            return True

    # Try single swap: move existing assignment to empty, place unplaced in its old slot
    for gi_empty in empty_gis:
        empty_slot = div_data.period_slots[gi_empty] if gi_empty < len(div_data.period_slots) else None
        if not empty_slot:
            continue

        for gi_filled in range(div_data.total_periods):
            if chromosome[gi_filled] == -1:
                continue
            existing_idx = int(chromosome[gi_filled])
            existing_la = logicals[existing_idx]

            # Don't move elective assignments
            if existing_la.is_elective:
                continue

            filled_slot = div_data.period_slots[gi_filled] if gi_filled < len(div_data.period_slots) else None
            if not filled_slot:
                continue

            # Check 1: Can the unplaced assignment go at gi_filled?
            if not _is_valid_for_la(gi_filled):
                continue

            # Check 2: Can existing assignment move to gi_empty?
            # Remove existing from gi_filled temporarily
            old_teacher_slots = []
            for tid in existing_la.teacher_ids:
                state.teacher_busy.remove(tid, filled_slot.day_of_week, filled_slot.start_time, filled_slot.end_time)
                old_teacher_slots.append((tid, filled_slot.day_of_week, filled_slot.start_time, filled_slot.end_time))
            chromosome[gi_filled] = -1
            state.placement_counts[(div_id, existing_idx)] -= 1

            # Check existing's teachers at gi_empty's time (other divisions)
            existing_can_move = True
            for tid in existing_la.teacher_ids:
                if state.teacher_busy.is_busy(tid, empty_slot.day_of_week, empty_slot.start_time, empty_slot.end_time):
                    existing_can_move = False
                    break
                if (tid, empty_slot.day_of_week, empty_slot.start_time) in wsd.teacher_unavailable_times:
                    existing_can_move = False
                    break

            # Also re-verify unplaced at gi_filled with existing removed
            unplaced_can_go = existing_can_move and _is_valid_for_la(gi_filled)

            if existing_can_move and unplaced_can_go:
                # Execute the swap: place existing at gi_empty, unplaced at gi_filled
                # existing at gi_empty
                chromosome[gi_empty] = existing_idx
                state.placement_counts[(div_id, existing_idx)] += 1
                for tid in existing_la.teacher_ids:
                    state.teacher_busy.add(tid, empty_slot.day_of_week, empty_slot.start_time, empty_slot.end_time)

                # unplaced at gi_filled
                _place_assignment(state, div_id, la_idx, gi_filled, div_data, la, wsd)

                logger.info("Repair: swapped %s(gi=%d) -> gi=%d, placed %s at gi=%d in %s%s",
                            existing_la.display_name, gi_filled, gi_empty,
                            la.display_name, gi_filled, div_label,
                            "" if respect_hard else " (relaxed)")
                return True
            else:
                # Revert: put existing back at gi_filled
                chromosome[gi_filled] = existing_idx
                state.placement_counts[(div_id, existing_idx)] += 1
                for tid, dow, st, et in old_teacher_slots:
                    state.teacher_busy.add(tid, dow, st, et)

    return False


def _local_optimize(
    chromosome: np.ndarray,
    div_data: SchoolData,
    teacher_busy: TeacherBusyTracker,
    wsd: WholeSchoolData,
    div_id: str = '',
) -> None:
    """Step 5: Deterministic local swaps to improve soft constraints.

    For each day, try swapping pairs of periods. Accept if:
    1. No new teacher conflicts are created
    2. Soft score improves (adjacency, spread, period preference)

    IMPORTANT: After each accepted swap, teacher_busy is updated to reflect
    the new teacher positions. This prevents stale tracker state from allowing
    teacher double-bookings when later divisions are optimized.

    Cross-division elective slots are NEVER swapped — they must stay
    synchronized across all divisions in the group.
    """
    ppd = div_data.periods_per_day
    logicals = div_data.logical_assignments
    improved = 0

    # Build set of gene indices that hold cross-div elective assignments.
    # These must not be moved — they are synchronized across divisions.
    cross_div_gis: set[int] = set()
    for gi in range(div_data.total_periods):
        la_idx = int(chromosome[gi])
        if la_idx >= 0:
            la = logicals[la_idx]
            if la.elective_group_id and wsd.cross_div_la_map.get((div_id, la_idx)):
                cross_div_gis.add(gi)

    for day_idx in range(div_data.num_days):
        start = day_idx * ppd
        for i in range(ppd):
            for j in range(i + 1, ppd):
                gi_a = start + i
                gi_b = start + j

                # Never swap cross-div elective slots
                if gi_a in cross_div_gis or gi_b in cross_div_gis:
                    continue

                a_idx = int(chromosome[gi_a])
                b_idx = int(chromosome[gi_b])

                if a_idx == b_idx:
                    continue  # same assignment or both empty

                slot_i = div_data.period_slots[gi_a] if gi_a < len(div_data.period_slots) else None
                slot_j = div_data.period_slots[gi_b] if gi_b < len(div_data.period_slots) else None
                if not slot_i or not slot_j:
                    continue

                # Collect teacher IDs for each side of the swap
                tids_a = logicals[a_idx].teacher_ids if a_idx >= 0 else []
                tids_b = logicals[b_idx].teacher_ids if b_idx >= 0 else []

                # To check conflicts accurately, temporarily remove BOTH
                # sets of teacher entries, then check if the swapped
                # positions would create new conflicts with OTHER divisions.
                # This avoids false positives from the swap partners' own entries.
                for tid in tids_a:
                    teacher_busy.remove(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time)
                for tid in tids_b:
                    teacher_busy.remove(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)

                conflict = False
                # Check: assignment A at slot_j (new position)
                for tid in tids_a:
                    if teacher_busy.is_busy(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time):
                        conflict = True
                        break
                # Check: assignment B at slot_i (new position)
                if not conflict:
                    # Also need to temporarily add A at slot_j before checking B,
                    # in case A and B share a teacher
                    for tid in tids_a:
                        teacher_busy.add(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)
                    for tid in tids_b:
                        if teacher_busy.is_busy(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time):
                            conflict = True
                            break
                    # Remove A from slot_j (we'll decide below whether to keep)
                    for tid in tids_a:
                        teacher_busy.remove(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)

                if conflict:
                    # Revert: put teachers back in original positions
                    for tid in tids_a:
                        teacher_busy.add(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time)
                    for tid in tids_b:
                        teacher_busy.add(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)
                    continue

                # Compute soft score before and after
                # Put teachers back in original positions for score_before
                for tid in tids_a:
                    teacher_busy.add(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time)
                for tid in tids_b:
                    teacher_busy.add(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)

                score_before = _soft_score_pair(chromosome, div_data, gi_a, gi_b, wsd)
                chromosome[gi_a], chromosome[gi_b] = chromosome[gi_b], chromosome[gi_a]
                score_after = _soft_score_pair(chromosome, div_data, gi_a, gi_b, wsd)

                if score_after < score_before:
                    # Keep the swap — update teacher_busy to reflect new positions
                    for tid in tids_a:
                        teacher_busy.remove(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time)
                    for tid in tids_b:
                        teacher_busy.remove(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)
                    for tid in tids_a:
                        teacher_busy.add(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time)
                    for tid in tids_b:
                        teacher_busy.add(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time)
                    improved += 1
                else:
                    # Revert the swap — teacher_busy stays as-is (original positions)
                    chromosome[gi_a], chromosome[gi_b] = chromosome[gi_b], chromosome[gi_a]

    if improved > 0:
        logger.debug("Local optimization: %d improving swaps", improved)


def _soft_score_pair(
    chromosome: np.ndarray,
    div_data: SchoolData,
    gi_a: int,
    gi_b: int,
    wsd: WholeSchoolData,
) -> float:
    """Compute soft constraint score for the two swapped positions.

    Lower = better. Considers adjacency and spread.
    """
    ppd = div_data.periods_per_day
    score = 0.0

    for gi in [gi_a, gi_b]:
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        la = div_data.logical_assignments[a_idx]
        day_idx = gi // ppd
        period_idx = gi % ppd
        prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None

        want_adjacent = (
            wsd.adjacency_constraint_enabled
            or (prefs and prefs.get("preferAdjacentPeriods"))
        )

        # Adjacency: reward being next to same assignment (break-aware)
        if want_adjacent:
            has_neighbor = False
            if period_idx > 0 and (day_idx, period_idx) not in div_data.period_after_break:
                if int(chromosome[day_idx * ppd + period_idx - 1]) == a_idx:
                    has_neighbor = True
            if period_idx < ppd - 1 and (day_idx, period_idx + 1) not in div_data.period_after_break:
                if int(chromosome[day_idx * ppd + period_idx + 1]) == a_idx:
                    has_neighbor = True
            if not has_neighbor:
                score += 5  # penalty for isolation

        # Spread: count how many of this assignment are on this day
        day_count = 0
        for p in range(ppd):
            if int(chromosome[day_idx * ppd + p]) == a_idx:
                day_count += 1
        if day_count > 2:
            score += (day_count - 2) * 3  # penalty for >2 of same subject per day

        # Period preference: prefer earlier periods for high-weightage
        if la.weightage >= 4:
            score += period_idx * 0.3

    return score
