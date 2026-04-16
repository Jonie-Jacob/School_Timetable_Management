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
    # ── Step 1: Build unplaced items ──────────────────────────────────────
    # Cross-division electives appear ONCE using (first_div_id, la_idx).
    # Per-division items appear normally.
    cross_div_seen: set[str] = set()
    items: list[tuple[str, int]] = []

    for div_id, div_data in wsd.divisions.items():
        for la_idx, la in enumerate(div_data.logical_assignments):
            eg_id = wsd.cross_div_la_map.get((div_id, la_idx))
            if eg_id:
                if eg_id in cross_div_seen:
                    continue  # already added from first division
                cross_div_seen.add(eg_id)
            for _ in range(la.weightage):
                items.append((div_id, la_idx))

    total_items = sum(
        sum(la.weightage for la in d.logical_assignments)
        for d in wsd.divisions.values()
    )
    logger.info("Step 3: Demand-driven placement — %d assignment-periods across %d divisions "
                "(%d cross-division elective groups)",
                total_items, len(wsd.divisions), len(wsd.cross_div_electives))

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

    # Track remaining items to place: (div_id, la_idx) → remaining count
    remaining: dict[tuple[str, int], int] = defaultdict(int)
    for div_id, la_idx in items:
        remaining[(div_id, la_idx)] += 1

    # ── Pre-compute elective slot reservations ───────────────────────────
    _build_elective_slot_reserves(state, wsd)

    # Collect failure analyses for the summary
    failure_analyses: list[dict] = []

    # ── Step 3: Demand-driven placement loop ──────────────────────────────
    placed_total = 0
    while remaining:
        # Find the most constrained unplaced item (fewest valid slots)
        best_item = None
        best_valid_count = float('inf')
        best_candidates: list[tuple[int, float]] = []
        best_is_cross_div: Optional[str] = None

        for (div_id, la_idx), rem_count in remaining.items():
            if rem_count <= 0:
                continue
            div_data = wsd.divisions[div_id]
            la = div_data.logical_assignments[la_idx]

            eg_id = wsd.cross_div_la_map.get((div_id, la_idx))
            if eg_id:
                candidates = _find_valid_slots_cross_div(eg_id, state, wsd)
            else:
                candidates = _find_valid_slots(la, la_idx, div_id, div_data, state, wsd)
            valid_count = len(candidates)

            if valid_count < best_valid_count:
                best_valid_count = valid_count
                best_item = (div_id, la_idx)
                best_candidates = candidates
                best_is_cross_div = eg_id

            if valid_count == 0:
                break

        if best_item is None:
            break

        div_id, la_idx = best_item
        div_data = wsd.divisions[div_id]
        la = div_data.logical_assignments[la_idx]

        if best_candidates:
            best_candidates.sort(key=lambda x: x[1])
            gi = best_candidates[0][0]
            if best_is_cross_div:
                _place_cross_div(state, best_is_cross_div, gi, wsd)
                n_divs = len(wsd.cross_div_electives[best_is_cross_div])
                state.placed_ok += n_divs
                placed_total += n_divs
            else:
                _place_assignment(state, div_id, la_idx, gi, div_data, la, wsd)
                state.placed_ok += 1
                placed_total += 1
        elif _try_backtrack(state, div_id, la_idx, div_data, la, wsd, max_depth=5):
            state.backtracked += 1
            placed_total += 1
        else:
            analysis = _build_failure_analysis(la, la_idx, div_id, div_data, state, wsd, div_labels)
            failure_analyses.append(analysis)
            logger.warning("Fallback #%d: %s in %s — %s (valid_count=%d)",
                           state.fallback + 1, la.display_name, div_labels.get(div_id, div_id[:8]),
                           analysis.get("reason", ""), int(best_valid_count) if best_valid_count != float('inf') else 0)

            if best_is_cross_div:
                # Fallback for cross-div: place in any empty slot across all divisions
                placed = False
                for gi in range(div_data.total_periods):
                    all_empty = all(
                        state.chromosomes[d][gi] == -1
                        for d in wsd.cross_div_electives[best_is_cross_div]
                    )
                    if all_empty:
                        _place_cross_div(state, best_is_cross_div, gi, wsd)
                        state.fallback += len(wsd.cross_div_electives[best_is_cross_div])
                        placed_total += len(wsd.cross_div_electives[best_is_cross_div])
                        placed = True
                        break
                if not placed:
                    logger.warning("Cannot place %s cross-div — no common empty slot", la.display_name)
                    placed_total += len(wsd.cross_div_electives[best_is_cross_div])
            else:
                placed = False
                for gi in range(div_data.total_periods):
                    if state.chromosomes[div_id][gi] == -1:
                        _place_assignment(state, div_id, la_idx, gi, div_data, la, wsd)
                        state.fallback += 1
                        placed = True
                        break
                if not placed:
                    logger.warning("Cannot place %s in %s — all slots full", la.display_name, div_id[:8])
                placed_total += 1

        remaining[(div_id, la_idx)] -= 1
        if remaining[(div_id, la_idx)] <= 0:
            del remaining[(div_id, la_idx)]

        # Progress callback
        if on_progress and (placed_total % 20 == 0 or placed_total >= total_items or not remaining):
            desc = f"{la.display_name} ({div_id[:8]})"
            on_progress(
                placed_total, total_items,
                state.placed_ok, state.backtracked, state.fallback,
                desc, int(best_valid_count) if best_valid_count != float('inf') else 0,
            )

    logger.info("Demand-driven placement complete: %d OK, %d backtracked, %d fallback, %d total",
                state.placed_ok, state.backtracked, state.fallback, total_items)

    # ── Step 5: Local optimization ────────────────────────────────────────
    logger.info("Step 5: Local optimization for %d divisions", len(wsd.divisions))
    for div_id, div_data in wsd.divisions.items():
        chromosome = state.chromosomes[div_id]
        _local_optimize(chromosome, div_data, state.teacher_busy, wsd)

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

        # HARD minPeriodsPerDay for cross-div electives (only with adjacency)
        if is_hard and prefs and prefs.get("preferAdjacentPeriods"):
            min_pd = prefs.get("minPeriodsPerDay")
            if min_pd is not None and min_pd >= 2:
                first_la_idx_min = next(
                    (i for i, la2 in enumerate(first_data.logical_assignments)
                     if la2.elective_group_id == eg_id), -1
                )
                day_count_min = sum(
                    1 for g in range(day_idx * ppd, min((day_idx + 1) * ppd, first_data.total_periods))
                    if int(state.chromosomes[first_div][g]) == first_la_idx_min
                ) if first_la_idx_min >= 0 else 0
                if day_count_min == 0:
                    chromosome_cd = state.chromosomes[first_div]
                    max_block = 1
                    left = period_idx - 1
                    while left >= 0:
                        if (day_idx, left + 1) in first_data.period_after_break:
                            break
                        if chromosome_cd[day_idx * ppd + left] != -1:
                            break
                        max_block += 1
                        left -= 1
                    right = period_idx + 1
                    while right < ppd:
                        if (day_idx, right) in first_data.period_after_break:
                            break
                        if chromosome_cd[day_idx * ppd + right] != -1:
                            break
                        max_block += 1
                        right += 1
                    if max_block < min_pd:
                        continue

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
            )
            if picked is None:
                picked = first_la.teacher_ids
            for tid in picked:
                state.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                added_slots.append((tid, slot.day_of_week, slot.start_time, slot.end_time))

    state.history.append((first_div, first_la_idx, gi, added_slots))


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
    state.chromosomes[div_id][gi] = la_idx
    state.placement_counts[(div_id, la_idx)] += 1

    # Mark teachers as busy — use pick_available_teachers to respect
    # parallel_sections for elective groups (only mark the minimum needed).
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
        for tid in picked:
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

        # Check maxPeriodsPerDay
        if is_hard and max_per_day:
            day_idx = gi // ppd
            day_start = day_idx * ppd
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

    # Count existing placements per day for spread scoring
    day_counts: dict[int, int] = defaultdict(int)
    for gi2 in range(div_data.total_periods):
        if int(chromosome[gi2]) == la_idx:
            day_counts[gi2 // ppd] += 1

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

        # HARD maxPeriodsPerDay — skip if already at max for this day
        if is_hard and prefs:
            max_pd = prefs.get("maxPeriodsPerDay")
            if max_pd is not None and day_counts.get(day_idx, 0) >= max_pd:
                continue

        # HARD minPeriodsPerDay — only enforced when preferAdjacentPeriods is
        # also true. If placing the FIRST period on this day, verify that
        # enough truly-adjacent empty slots exist to reach the minimum.
        # Prevents isolated single periods on a day when pairs are required.
        # (0 periods on a day is fine — the min only applies to days where
        # the subject IS scheduled.)
        if is_hard and prefs and prefs.get("preferAdjacentPeriods"):
            min_pd = prefs.get("minPeriodsPerDay")
            if min_pd is not None and min_pd >= 2 and day_counts.get(day_idx, 0) == 0:
                max_block = 1
                left = period_idx - 1
                while left >= 0:
                    if (day_idx, left + 1) in div_data.period_after_break:
                        break
                    if chromosome[day_idx * ppd + left] != -1:
                        break
                    max_block += 1
                    left -= 1
                right = period_idx + 1
                while right < ppd:
                    if (day_idx, right) in div_data.period_after_break:
                        break
                    if chromosome[day_idx * ppd + right] != -1:
                        break
                    max_block += 1
                    right += 1
                if max_block < min_pd:
                    continue

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
        # Without this, the engine piles periods on early-evaluated days,
        # then runs out of days. E.g. English w=7, maxPerDay=2 → needs at
        # least ceil(7/2)=4 days, so prefer spreading to fresh days.
        effective_max_pd = None
        if prefs:
            effective_max_pd = prefs.get("maxPeriodsPerDay")
        if effective_max_pd is not None and effective_max_pd > 0:
            placed_on_day = day_counts.get(day_idx, 0)
            remaining_for_this = la.weightage - state.placement_counts.get((div_id, la_idx), 0)
            if remaining_for_this > 0:
                days_needed = -(-remaining_for_this // effective_max_pd)  # ceil div
                # Count days that still have room (haven't hit the cap)
                days_with_room = sum(
                    1 for d in range(div_data.num_days)
                    if day_counts.get(d, 0) < effective_max_pd
                )
                if placed_on_day > 0 and days_needed >= days_with_room:
                    # Running out of usable days — strongly prefer a fresh day
                    demand += 20
                elif placed_on_day >= effective_max_pd - 1:
                    # This day is about to hit the cap — prefer another day
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


def _local_optimize(
    chromosome: np.ndarray,
    div_data: SchoolData,
    teacher_busy: TeacherBusyTracker,
    wsd: WholeSchoolData,
) -> None:
    """Step 5: Deterministic local swaps to improve soft constraints.

    For each day, try swapping pairs of periods. Accept if:
    1. No new teacher conflicts are created
    2. Soft score improves (adjacency, spread, period preference)
    """
    ppd = div_data.periods_per_day
    logicals = div_data.logical_assignments
    improved = 0

    for day_idx in range(div_data.num_days):
        start = day_idx * ppd
        for i in range(ppd):
            for j in range(i + 1, ppd):
                gi_a = start + i
                gi_b = start + j
                a_idx = int(chromosome[gi_a])
                b_idx = int(chromosome[gi_b])

                if a_idx == b_idx:
                    continue  # same assignment or both empty

                # Check if swap creates teacher conflicts
                slot_i = div_data.period_slots[gi_a] if gi_a < len(div_data.period_slots) else None
                slot_j = div_data.period_slots[gi_b] if gi_b < len(div_data.period_slots) else None
                if not slot_i or not slot_j:
                    continue

                conflict = False
                # If a_idx moves to slot_j, check a's teachers at j's time
                if a_idx >= 0:
                    la_a = logicals[a_idx]
                    for tid in la_a.teacher_ids:
                        if teacher_busy.is_busy(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time):
                            # Check if the only busy entry is from this same swap partner
                            if not teacher_busy.is_busy(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time):
                                conflict = True
                                break
                            # The teacher is busy at slot_j but also at slot_i (this assignment)
                            # — swapping would just move the busy entry, which is fine IF
                            # slot_j's time doesn't overlap with a DIFFERENT busy entry.
                            # For simplicity in within-day swaps (same day, same structure),
                            # the start times are always different, so overlap with self is
                            # not possible. Skip the conflict.
                if conflict:
                    continue

                if b_idx >= 0:
                    la_b = logicals[b_idx]
                    for tid in la_b.teacher_ids:
                        if teacher_busy.is_busy(tid, slot_i.day_of_week, slot_i.start_time, slot_i.end_time):
                            if not teacher_busy.is_busy(tid, slot_j.day_of_week, slot_j.start_time, slot_j.end_time):
                                conflict = True
                                break
                if conflict:
                    continue

                # Compute soft score before and after
                score_before = _soft_score_pair(chromosome, div_data, gi_a, gi_b, wsd)
                chromosome[gi_a], chromosome[gi_b] = chromosome[gi_b], chromosome[gi_a]
                score_after = _soft_score_pair(chromosome, div_data, gi_a, gi_b, wsd)

                if score_after < score_before:
                    improved += 1  # keep the swap
                else:
                    chromosome[gi_a], chromosome[gi_b] = chromosome[gi_b], chromosome[gi_a]  # revert

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
