"""
Fitness function for timetable chromosomes.

Hard constraints (violations → heavy penalty):
  H1 — Teacher no double-booking: same teacher cannot teach two divisions in the same slot.
        (skipped when teacher_id is None — unassigned subjects never conflict)
  H2 — Correct periods_per_week: each assignment must appear exactly `weightage` times.
  H3 — Teacher availability: teacher must not be assigned to a slot they're unavailable for.
        (skipped when teacher_id is None)
  H5 — Elective alignment: all divisions in the same elective group get their elective
        subjects in the same slot.
  H7 — HARD scheduling preferences: assignments with constraintType='HARD' must respect
        excludedDays, preferredDays, excludedPeriodRange, preferredPeriodRange.

Soft constraints (violations → weighted penalty):
  S1 — Subject spread: each subject's periods should be spread across different days.
  S2 — Weightage period preference: higher-weightage subjects get earlier periods.
  S3 — No consecutive same-subject: avoid the same subject in adjacent periods.
  S4 — Teacher workload balance: distribute teacher's load evenly across the week.
  S5 — SOFT scheduling preferences: assignments with constraintType='SOFT' should respect
        preferred/excluded days+periods, prefer-adjacent, min/max per day.
  S6 — Teacher maxPeriodsPerWeek: penalize when a teacher exceeds their declared cap.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Optional

import numpy as np

from ..data_loader import SchoolData, Assignment
from .chromosome import decode_gene, get_day_slice

# Penalty weights
HARD_PENALTY = 1000.0
SOFT_WEIGHT_SPREAD = 5.0
SOFT_WEIGHT_PREFERENCE = 1.0
SOFT_WEIGHT_CONSECUTIVE = 3.0
SOFT_WEIGHT_BALANCE = 2.0
SOFT_WEIGHT_PREFS = 4.0
SOFT_WEIGHT_ADJACENT = 2.0
SOFT_WEIGHT_MAX_PERIODS = 6.0
# When the global adjacency_constraint flag is on, we enforce clustering of
# multi-period subjects within the same day with a much higher weight than
# the per-assignment "preferAdjacentPeriods" preference. This is intentionally
# strong (close to a hard constraint) but soft so the GA can still converge
# in tight schedules.
SOFT_WEIGHT_ADJACENCY_GLOBAL = 50.0


def evaluate(
    data: SchoolData,
    chromosome: np.ndarray,
    other_chromosomes: dict[str, np.ndarray] | None = None,
) -> float:
    """
    Evaluate a chromosome and return its fitness score.

    Higher is better. A perfect timetable has fitness 0.0 (no penalties).
    We return the negative sum of all penalties so that maximizing fitness
    is equivalent to minimizing violations.

    other_chromosomes: division_id → chromosome for other divisions in the
    same batch (needed for teacher conflict detection across divisions).
    """
    penalties = 0.0

    penalties += _h1_teacher_conflicts(data, chromosome, other_chromosomes)
    penalties += _h2_weightage_violations(data, chromosome)
    penalties += _h3_availability_violations(data, chromosome)
    penalties += _h5_elective_alignment(data, chromosome, other_chromosomes)
    penalties += _h7_hard_preferences(data, chromosome)

    # When adjacency clustering is the goal, S1 (spread across days) and
    # S3 (avoid consecutive same-subject) directly oppose it — disable them.
    if not data.adjacency_constraint_enabled:
        penalties += _s1_subject_spread(data, chromosome)
        penalties += _s3_consecutive_same_subject(data, chromosome)
    else:
        penalties += _s7_adjacency_clustering(data, chromosome)

    penalties += _s2_period_preference(data, chromosome)
    penalties += _s4_teacher_workload_balance(data, chromosome)
    penalties += _s5_soft_preferences(data, chromosome)
    penalties += _s6_teacher_max_periods(data, chromosome)

    return -penalties


# ── S7: Global adjacency clustering ──────────────────────────────────────

def _s7_adjacency_clustering(data: SchoolData, chromosome: np.ndarray) -> float:
    """Reward (= negative-cost) clustering of multi-period assignments into
    contiguous blocks within the same day. Active only when
    `adjacency_constraint_enabled` is True.

    For each (assignment, day) where the assignment appears 2+ times, we
    count "gap pairs" — adjacent placements that are NOT actually adjacent
    in real clock time. A pair counts as a gap when EITHER:

      * the two period indices are not consecutive (positions[i+1] - positions[i] > 1), OR
      * the two period indices are consecutive but a break/lunch slot sits
        between them in the period structure (data.period_after_break).

    Each gap incurs SOFT_WEIGHT_ADJACENCY_GLOBAL penalty, which is heavy
    enough to dominate small spread/balance signals so the GA chooses
    clustered solutions.

    Single-occurrence-per-day assignments incur no penalty.
    """
    penalty = 0.0
    ppd = data.periods_per_day
    if ppd == 0:
        return 0.0

    # (assignment_idx, day_idx) → list of period_idx
    placements: dict[tuple[int, int], list[int]] = defaultdict(list)
    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        day_idx = gi // ppd
        period_idx = gi % ppd
        placements[(a_idx, day_idx)].append(period_idx)

    for (_, day_idx), positions in placements.items():
        if len(positions) < 2:
            continue
        positions_sorted = sorted(positions)
        gaps = 0
        for i in range(len(positions_sorted) - 1):
            lo = positions_sorted[i]
            hi = positions_sorted[i + 1]
            if hi - lo > 1:
                gaps += 1
                continue
            # hi - lo == 1 → consecutive in chromosome encoding, but check
            # whether a break sits between them in real clock time.
            if (day_idx, hi) in data.period_after_break:
                gaps += 1
        penalty += gaps * SOFT_WEIGHT_ADJACENCY_GLOBAL

    return penalty


# ── Helpers for scheduling_preferences ────────────────────────────────────

def _gene_to_day_period(data: SchoolData, gi: int) -> tuple[int, int]:
    """Return (day_of_week 0-6, 1-based period number) for a gene index."""
    ppd = data.periods_per_day
    day_idx = gi // ppd
    period_idx = gi % ppd
    wd_id = data.working_day_ids[day_idx] if day_idx < len(data.working_day_ids) else None
    # Find the dayOfWeek of this working day
    dow = 0
    for k, v in data.day_map.items():
        if v == wd_id:
            dow = k
            break
    slot = data.slots_by_day.get(wd_id, [])[period_idx] if wd_id else None
    period_num = slot.slot_number if slot and slot.slot_number is not None else (period_idx + 1)
    return dow, period_num


def _prefs_of(a: Assignment) -> Optional[dict]:
    """Return the scheduling_preferences dict if it has any real content."""
    p = a.scheduling_preferences
    if not p or not isinstance(p, dict):
        return None
    return p


def _violates_day_pref(prefs: dict, day_of_week: int) -> bool:
    excluded = prefs.get("excludedDays") or []
    if day_of_week in excluded:
        return True
    preferred = prefs.get("preferredDays") or []
    if preferred and day_of_week not in preferred:
        return True
    return False


def _violates_period_pref(prefs: dict, period_num: int) -> bool:
    excluded = prefs.get("excludedPeriodRange")
    if excluded and isinstance(excluded, dict):
        lo = excluded.get("min")
        hi = excluded.get("max")
        if lo is not None and hi is not None and lo <= period_num <= hi:
            return True
    preferred = prefs.get("preferredPeriodRange")
    if preferred and isinstance(preferred, dict):
        lo = preferred.get("min")
        hi = preferred.get("max")
        if lo is not None and hi is not None and not (lo <= period_num <= hi):
            return True
    return False


def _h1_teacher_conflicts(
    data: SchoolData,
    chromosome: np.ndarray,
    other_chromosomes: dict[str, np.ndarray] | None,
) -> float:
    """Penalty for teacher double-booking across divisions."""
    violations = 0
    total = data.total_periods
    assignments = data.assignments

    # Build this division's slot→teacher map. Skip null teachers entirely —
    # unassigned assignments never cause a teacher conflict.
    slot_teachers: dict[tuple[str, str], list[str]] = defaultdict(list)
    for gi in range(total):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        teacher_id = assignments[a_idx].teacher_id
        if teacher_id is None:
            continue
        _, _, wd_id, slot_id = decode_gene(data, gi)
        slot_teachers[(wd_id, slot_id)].append(teacher_id)

        # Cross-division conflict with already-generated timetables for OTHER
        # divisions in this school+AY. When we generate one division at a time
        # (the common case), this is the only check that catches conflicts
        # with existing timetables. Each violation is one penalty, same as
        # within-batch conflicts below.
        if (teacher_id, wd_id, slot_id) in data.existing_teacher_slots:
            violations += 1

    # Check against other divisions in the batch
    if other_chromosomes:
        for other_div_id, other_chromo in other_chromosomes.items():
            other_assignments = data.all_division_assignments.get(other_div_id, [])
            if not other_assignments:
                continue
            other_ppd = len(other_chromo) // data.num_days if data.num_days > 0 else 0
            for gi in range(len(other_chromo)):
                a_idx = int(other_chromo[gi])
                if a_idx < 0 or a_idx >= len(other_assignments):
                    continue
                other_teacher = other_assignments[a_idx].teacher_id
                if other_teacher is None:
                    continue
                day_idx = gi // other_ppd if other_ppd > 0 else 0
                period_idx = gi % other_ppd if other_ppd > 0 else 0
                if day_idx < data.num_days:
                    wd_id = data.working_day_ids[day_idx]
                    other_slots = data.slots_by_day.get(wd_id, [])
                    if period_idx < len(other_slots):
                        slot_id = other_slots[period_idx].id
                        key = (wd_id, slot_id)
                        if key in slot_teachers:
                            for t in slot_teachers[key]:
                                if t == other_teacher:
                                    violations += 1

    return violations * HARD_PENALTY


def _h2_weightage_violations(data: SchoolData, chromosome: np.ndarray) -> float:
    """Penalty for assignments not meeting their required periods_per_week."""
    violations = 0.0
    for idx, assignment in enumerate(data.assignments):
        actual = int(np.count_nonzero(chromosome == idx))
        expected = assignment.weightage
        diff = abs(actual - expected)
        if diff > 0:
            violations += diff * HARD_PENALTY
    return violations


def _h3_availability_violations(data: SchoolData, chromosome: np.ndarray) -> float:
    """Penalty for assigning teachers to slots where they're unavailable.

    Null teachers (unassigned subjects) are skipped — they have no availability.
    """
    violations = 0
    total = data.total_periods
    assignments = data.assignments

    for gi in range(total):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        teacher_id = assignments[a_idx].teacher_id
        if teacher_id is None:
            continue
        _, _, wd_id, slot_id = decode_gene(data, gi)
        if (teacher_id, wd_id, slot_id) in data.teacher_unavailable:
            violations += 1

    return violations * HARD_PENALTY


def _h5_elective_alignment(
    data: SchoolData,
    chromosome: np.ndarray,
    other_chromosomes: dict[str, np.ndarray] | None,
) -> float:
    """
    Penalty for elective group subjects not aligned in the same slot.
    All divisions in an elective group must have their elective subject
    at the same (day, period) positions.
    """
    if not data.elective_groups or not other_chromosomes:
        return 0.0

    violations = 0
    assignments = data.assignments

    # Find which gene indices have elective assignments in this chromosome
    for eg_id, eg_info in data.elective_groups.items():
        # Find this division's elective slots
        my_elective_slots: set[int] = set()
        for gi in range(data.total_periods):
            a_idx = int(chromosome[gi])
            if a_idx < 0:
                continue
            if assignments[a_idx].elective_group_id == eg_id:
                my_elective_slots.add(gi)

        # Check other divisions that share this elective group
        for other_div_id, other_chromo in other_chromosomes.items():
            if other_div_id == data.division_id:
                continue
            if other_div_id not in eg_info.division_assignments:
                continue
            other_assignments = data.all_division_assignments.get(other_div_id, [])
            if not other_assignments:
                continue

            other_elective_slots: set[int] = set()
            for gi in range(min(len(other_chromo), data.total_periods)):
                a_idx = int(other_chromo[gi])
                if a_idx < 0 or a_idx >= len(other_assignments):
                    continue
                if other_assignments[a_idx].elective_group_id == eg_id:
                    other_elective_slots.add(gi)

            # Symmetric difference = misaligned slots
            misaligned = my_elective_slots.symmetric_difference(other_elective_slots)
            violations += len(misaligned)

    return violations * HARD_PENALTY


def _s1_subject_spread(data: SchoolData, chromosome: np.ndarray) -> float:
    """
    Penalize subjects that are concentrated on fewer days.
    Ideally, a subject with weightage W should spread across min(W, num_days) days.
    """
    penalty = 0.0
    num_days = data.num_days
    ppd = data.periods_per_day

    for idx, assignment in enumerate(data.assignments):
        days_used: set[int] = set()
        for gi in range(data.total_periods):
            if int(chromosome[gi]) == idx:
                day_idx = gi // ppd
                days_used.add(day_idx)

        ideal_days = min(assignment.weightage, num_days)
        actual_days = len(days_used)
        if actual_days < ideal_days:
            penalty += (ideal_days - actual_days) * SOFT_WEIGHT_SPREAD

    return penalty


def _s2_period_preference(data: SchoolData, chromosome: np.ndarray) -> float:
    """
    Penalize high-weightage subjects placed in late periods.
    Higher-weightage (core) subjects should prefer earlier slots.
    """
    penalty = 0.0
    ppd = data.periods_per_day
    if ppd == 0:
        return 0.0

    max_weightage = max((a.weightage for a in data.assignments), default=1)

    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        period_idx = gi % ppd
        weightage = data.assignments[a_idx].weightage
        # Normalized importance (0-1): higher weightage → more important
        importance = weightage / max_weightage
        # Normalized position (0-1): later period → higher position
        position = period_idx / ppd
        # High importance + late position = penalty
        if importance > 0.5 and position > 0.6:
            penalty += importance * position * SOFT_WEIGHT_PREFERENCE

    return penalty


def _s3_consecutive_same_subject(data: SchoolData, chromosome: np.ndarray) -> float:
    """Penalize the same subject appearing in consecutive periods on the same day."""
    penalty = 0.0

    for day_idx in range(data.num_days):
        day_slots = get_day_slice(data, chromosome, day_idx)
        for i in range(len(day_slots) - 1):
            a1 = int(day_slots[i])
            a2 = int(day_slots[i + 1])
            if a1 < 0 or a2 < 0:
                continue
            if data.assignments[a1].subject_id == data.assignments[a2].subject_id:
                penalty += SOFT_WEIGHT_CONSECUTIVE

    return penalty


def _s4_teacher_workload_balance(data: SchoolData, chromosome: np.ndarray) -> float:
    """
    Penalize uneven distribution of a teacher's periods across the week.
    For each teacher, the standard deviation of their daily period count should be low.
    """
    penalty = 0.0
    ppd = data.periods_per_day

    # teacher_id → [count_per_day]
    teacher_daily: dict[str, list[int]] = defaultdict(lambda: [0] * data.num_days)

    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        teacher_id = data.assignments[a_idx].teacher_id
        if teacher_id is None:
            continue
        day_idx = gi // ppd
        teacher_daily[teacher_id][day_idx] += 1

    for counts in teacher_daily.values():
        std = float(np.std(counts))
        if std > 1.0:
            penalty += (std - 1.0) * SOFT_WEIGHT_BALANCE

    return penalty


# ── H7: HARD scheduling preferences ────────────────────────────────────────

def _h7_hard_preferences(data: SchoolData, chromosome: np.ndarray) -> float:
    """Heavy penalty for violating preferences where constraintType=HARD."""
    penalty = 0.0
    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        a = data.assignments[a_idx]
        prefs = _prefs_of(a)
        if not prefs or prefs.get("constraintType") != "HARD":
            continue
        dow, period_num = _gene_to_day_period(data, gi)
        if _violates_day_pref(prefs, dow):
            penalty += HARD_PENALTY
        if _violates_period_pref(prefs, period_num):
            penalty += HARD_PENALTY
    return penalty


# ── S5: SOFT scheduling preferences ────────────────────────────────────────

def _s5_soft_preferences(data: SchoolData, chromosome: np.ndarray) -> float:
    """Weighted penalty for violating SOFT preferences + per-day min/max +
    preferAdjacent. Applied to assignments regardless of constraintType for the
    per-day/adjacency rules (those are always soft), and only to SOFT
    assignments for the day/period-range rules."""
    penalty = 0.0
    ppd = data.periods_per_day

    # Per-assignment, per-day tracking for min/max rules
    # key: (assignment_idx, day_idx) → count
    per_day_counts: dict[tuple[int, int], int] = defaultdict(int)
    # key: assignment_idx → list of (day_idx, period_idx) in chronological order
    placements: dict[int, list[tuple[int, int]]] = defaultdict(list)

    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        a = data.assignments[a_idx]
        prefs = _prefs_of(a)
        day_idx = gi // ppd
        period_idx = gi % ppd
        per_day_counts[(a_idx, day_idx)] += 1
        placements[a_idx].append((day_idx, period_idx))

        if not prefs:
            continue

        # Soft day/period-range checks only for SOFT constraint type
        if prefs.get("constraintType", "SOFT") == "SOFT":
            dow, period_num = _gene_to_day_period(data, gi)
            if _violates_day_pref(prefs, dow):
                penalty += SOFT_WEIGHT_PREFS
            if _violates_period_pref(prefs, period_num):
                penalty += SOFT_WEIGHT_PREFS

    # Min/Max per day + prefer-adjacent checks (always soft)
    for a_idx, a in enumerate(data.assignments):
        prefs = _prefs_of(a)
        if not prefs:
            continue

        min_pd = prefs.get("minPeriodsPerDay")
        max_pd = prefs.get("maxPeriodsPerDay")

        if min_pd is not None or max_pd is not None:
            for day_idx in range(data.num_days):
                cnt = per_day_counts.get((a_idx, day_idx), 0)
                if cnt == 0:
                    continue  # min only applies when the subject is taught that day
                if min_pd is not None and cnt < min_pd:
                    penalty += (min_pd - cnt) * SOFT_WEIGHT_PREFS
                if max_pd is not None and cnt > max_pd:
                    penalty += (cnt - max_pd) * SOFT_WEIGHT_PREFS

        # Prefer adjacent periods: reward being in consecutive slots on the
        # same day; penalize gaps.
        if prefs.get("preferAdjacentPeriods"):
            by_day: dict[int, list[int]] = defaultdict(list)
            for (d, p) in placements.get(a_idx, []):
                by_day[d].append(p)
            for d, ps in by_day.items():
                if len(ps) < 2:
                    continue
                ps_sorted = sorted(ps)
                gaps = 0
                for i in range(len(ps_sorted) - 1):
                    if ps_sorted[i + 1] - ps_sorted[i] > 1:
                        gaps += 1
                penalty += gaps * SOFT_WEIGHT_ADJACENT

    return penalty


# ── S6: Teacher maxPeriodsPerWeek soft cap ────────────────────────────────

def _s6_teacher_max_periods(data: SchoolData, chromosome: np.ndarray) -> float:
    """Penalize teachers who exceed their declared maxPeriodsPerWeek. Soft cap:
    the business rule says the engine may exceed it, but should try not to."""
    penalty = 0.0
    counts: dict[str, int] = defaultdict(int)
    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        teacher_id = data.assignments[a_idx].teacher_id
        if teacher_id is None:
            continue
        counts[teacher_id] += 1
    for teacher_id, total in counts.items():
        tinfo = data.teachers.get(teacher_id)
        if not tinfo or tinfo.max_periods_per_week is None:
            continue
        if total > tinfo.max_periods_per_week:
            penalty += (total - tinfo.max_periods_per_week) * SOFT_WEIGHT_MAX_PERIODS
    return penalty
