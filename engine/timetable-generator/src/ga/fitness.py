"""
Fitness function for timetable chromosomes.

Hard constraints (violations → heavy penalty):
  H1 — Teacher no double-booking: same teacher cannot teach two divisions in the same slot.
  H2 — Correct periods_per_week: each assignment must appear exactly `weightage` times.
  H3 — Teacher availability: teacher must not be assigned to a slot they're unavailable for.
  H4 — No breaks assigned: only PERIOD-type slots should have assignments (enforced by encoding).
  H5 — Elective alignment: all divisions in the same elective group get their elective
        subjects in the same slot.
  H6 — Teacher-subject match: the teacher must be qualified for the subject (enforced by
        assignment data — always satisfied by construction).

Soft constraints (violations → weighted penalty):
  S1 — Subject spread: each subject's periods should be spread across different days.
  S2 — Weightage period preference: higher-weightage subjects get earlier periods.
  S3 — No consecutive same-subject: avoid the same subject in adjacent periods.
  S4 — Teacher workload balance: distribute teacher's load evenly across the week.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np

from ..data_loader import SchoolData
from .chromosome import decode_gene, get_day_slice

# Penalty weights
HARD_PENALTY = 1000.0
SOFT_WEIGHT_SPREAD = 5.0
SOFT_WEIGHT_PREFERENCE = 1.0
SOFT_WEIGHT_CONSECUTIVE = 3.0
SOFT_WEIGHT_BALANCE = 2.0


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

    penalties += _s1_subject_spread(data, chromosome)
    penalties += _s2_period_preference(data, chromosome)
    penalties += _s3_consecutive_same_subject(data, chromosome)
    penalties += _s4_teacher_workload_balance(data, chromosome)

    return -penalties


def _h1_teacher_conflicts(
    data: SchoolData,
    chromosome: np.ndarray,
    other_chromosomes: dict[str, np.ndarray] | None,
) -> float:
    """Penalty for teacher double-booking across divisions."""
    violations = 0
    total = data.total_periods
    assignments = data.assignments

    # Build this division's slot→teacher map
    slot_teachers: dict[tuple[str, str], list[str]] = defaultdict(list)
    for gi in range(total):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        _, _, wd_id, slot_id = decode_gene(data, gi)
        teacher_id = assignments[a_idx].teacher_id
        slot_teachers[(wd_id, slot_id)].append(teacher_id)

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
                day_idx = gi // other_ppd if other_ppd > 0 else 0
                period_idx = gi % other_ppd if other_ppd > 0 else 0
                if day_idx < data.num_days:
                    wd_id = data.working_day_ids[day_idx]
                    other_slots = data.slots_by_day.get(wd_id, [])
                    if period_idx < len(other_slots):
                        slot_id = other_slots[period_idx].id
                        other_teacher = other_assignments[a_idx].teacher_id
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
    """Penalty for assigning teachers to slots where they're unavailable."""
    violations = 0
    total = data.total_periods
    assignments = data.assignments

    for gi in range(total):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        _, _, wd_id, slot_id = decode_gene(data, gi)
        teacher_id = assignments[a_idx].teacher_id
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
        day_idx = gi // ppd
        teacher_id = data.assignments[a_idx].teacher_id
        teacher_daily[teacher_id][day_idx] += 1

    for counts in teacher_daily.values():
        std = float(np.std(counts))
        if std > 1.0:
            penalty += (std - 1.0) * SOFT_WEIGHT_BALANCE

    return penalty
