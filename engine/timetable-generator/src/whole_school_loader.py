"""
Whole-school data loader — loads data for ALL divisions in a single pass
and computes per-assignment flexibility scores for constraint-priority
scheduling.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from .data_loader import (
    SchoolData, SlotInfo, Assignment, LogicalAssignment,
    TeacherInfo, DATABASE_URL,
    load_school_data,
    _merge_elective_prefs,
)

import psycopg2
import psycopg2.extras

logger = logging.getLogger("timetable-engine")


@dataclass
class WholeSchoolData:
    """All data for whole-school scheduling."""
    school_id: str
    academic_year_id: str
    adjacency_constraint_enabled: bool = False

    # division_id → SchoolData (per-division data with slots, assignments, etc.)
    divisions: dict[str, SchoolData] = field(default_factory=dict)

    # Global teacher info
    teachers: dict[str, TeacherInfo] = field(default_factory=dict)

    # Teacher unavailability as (teacher_id, day_of_week, start_time_str)
    teacher_unavailable_times: set[tuple[str, int, str]] = field(default_factory=set)

    # division_id → list of (logical_assignment_idx, (valid_slots, teacher_load))
    flexibility_scores: dict[str, list[tuple[int, tuple[int, float]]]] = field(default_factory=dict)

    # Teacher partitioning: teacher_id → { division_id → set of (day_of_week, start_time) }
    # Pre-allocated time slots for shared teachers so each division gets a fair share.
    teacher_partitions: dict[str, dict[str, set[tuple[int, str]]]] = field(default_factory=dict)

    # Cross-division electives: elective_group_id → list of division_ids.
    # These electives are placed ONCE and stamped into ALL divisions simultaneously.
    # Teachers teach students from all divisions at the same slot.
    cross_div_electives: dict[str, list[str]] = field(default_factory=dict)

    # Reverse lookup: (div_id, la_idx) → elective_group_id for cross-division electives.
    cross_div_la_map: dict[tuple[str, int], str] = field(default_factory=dict)


def load_whole_school_data(
    school_id: str,
    academic_year_id: str,
    division_ids: list[str],
    adjacency_constraint_enabled: bool = False,
) -> WholeSchoolData:
    """Load data for all divisions and compute flexibility scores."""

    wsd = WholeSchoolData(
        school_id=school_id,
        academic_year_id=academic_year_id,
        adjacency_constraint_enabled=adjacency_constraint_enabled,
    )

    # Load each division's data independently (reuse existing loader).
    # We pass empty existing_teacher_slots since the greedy placer will
    # manage global teacher occupancy itself.
    for div_id in division_ids:
        data = load_school_data(
            school_id,
            academic_year_id,
            div_id,
            adjacency_constraint_enabled=adjacency_constraint_enabled,
        )
        # Clear existing_teacher_slots — greedy placer handles this globally
        data.existing_teacher_slots = set()
        wsd.divisions[div_id] = data

        # Merge teachers into global set
        for tid, tinfo in data.teachers.items():
            if tid not in wsd.teachers:
                wsd.teachers[tid] = tinfo

    # Load teacher unavailability in time-normalized form
    _load_global_teacher_unavailability(wsd)

    # Compute flexibility scores
    for div_id, data in wsd.divisions.items():
        scores = []
        for la_idx, la in enumerate(data.logical_assignments):
            score = compute_flexibility(la, data, wsd)
            scores.append((la_idx, score))
        wsd.flexibility_scores[div_id] = scores

    # Compute teacher partitions
    compute_teacher_partitions(wsd)

    # Detect cross-division electives
    _detect_cross_div_electives(wsd)

    return wsd


def _load_global_teacher_unavailability(wsd: WholeSchoolData) -> None:
    """Load teacher unavailability as (teacher_id, day_of_week, start_time)."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT ta.teacher_id, wd.day_of_week, s.start_time
                FROM teacher_availability ta
                JOIN working_days wd ON wd.id = ta.working_day_id
                JOIN slots s ON s.id = ta.slot_id
                WHERE ta.school_id = %s AND ta.academic_year_id = %s
                  AND s.slot_type = 'PERIOD'
            """, (wsd.school_id, wsd.academic_year_id))

            for row in cur.fetchall():
                wsd.teacher_unavailable_times.add((
                    row["teacher_id"],
                    row["day_of_week"],
                    str(row["start_time"]),
                ))
    finally:
        conn.close()


def _detect_cross_div_electives(wsd: WholeSchoolData) -> None:
    """Identify elective groups that span multiple divisions.

    These electives are co-scheduled: placed once, applied to all divisions
    simultaneously. Teachers teach students from all divisions at the same slot.
    """
    # Collect elective_group_id → set of division_ids across loaded divisions
    eg_divs: dict[str, list[str]] = {}
    for div_id, div_data in wsd.divisions.items():
        for la_idx, la in enumerate(div_data.logical_assignments):
            if la.elective_group_id:
                eg_divs.setdefault(la.elective_group_id, [])
                if div_id not in eg_divs[la.elective_group_id]:
                    eg_divs[la.elective_group_id].append(div_id)

    # Only keep groups that span 2+ divisions
    for eg_id, div_ids in eg_divs.items():
        if len(div_ids) >= 2:
            wsd.cross_div_electives[eg_id] = div_ids
            # Build reverse map: (div_id, la_idx) → eg_id
            for div_id in div_ids:
                div_data = wsd.divisions[div_id]
                for la_idx, la in enumerate(div_data.logical_assignments):
                    if la.elective_group_id == eg_id:
                        wsd.cross_div_la_map[(div_id, la_idx)] = eg_id

    cross_count = len(wsd.cross_div_electives)
    total_divs = sum(len(d) for d in wsd.cross_div_electives.values())
    logger.info("Cross-division electives: %d groups spanning %d divisions", cross_count, total_divs)


def compute_flexibility(
    la: LogicalAssignment,
    div_data: SchoolData,
    wsd: WholeSchoolData,
) -> tuple[int, float]:
    """Compute how constrained this assignment is.

    Returns (valid_slots, teacher_load_factor) for two-level sorting:
      - Primary: valid_slots (fewer = more constrained = place first)
      - Secondary: teacher_load_factor (higher load = busier = place first)

    valid_slots counts positions that satisfy:
      1. HARD scheduling preferences (excluded/preferred days, period ranges)
      2. Teacher availability (from teacher_availability table)

    teacher_load_factor is the total teaching load across all divisions
    for this assignment's teachers — used only as tiebreaker.
    """
    prefs = la.scheduling_preferences if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None

    # Get preferred/excluded days
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    is_hard = prefs and prefs.get("constraintType") == "HARD"

    # Get preferred/excluded period ranges
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    excl_range = prefs.get("excludedPeriodRange") if prefs else None

    teacher_ids = la.teacher_ids

    valid_slots = 0

    for slot in div_data.period_slots:
        dow = slot.day_of_week

        # Check day constraints (only enforce for HARD)
        if is_hard:
            if dow in excluded_days:
                continue
            if preferred_days and dow not in preferred_days:
                continue

        # Check period range constraints (only enforce for HARD)
        period_num = slot.slot_number
        if is_hard and period_num is not None:
            if pref_range:
                if period_num < pref_range.get("min", 1) or period_num > pref_range.get("max", 99):
                    continue
            if excl_range:
                if excl_range.get("min", 99) <= period_num <= excl_range.get("max", 0):
                    continue

        # Check teacher availability
        teacher_blocked = False
        for tid in teacher_ids:
            if (tid, dow, slot.start_time) in wsd.teacher_unavailable_times:
                teacher_blocked = True
                break
        if teacher_blocked:
            continue

        valid_slots += 1

    # Teacher load as tiebreaker (higher = busier = should place first)
    teacher_load = 0.0
    if teacher_ids:
        for tid in teacher_ids:
            for div_data2 in wsd.divisions.values():
                for a in div_data2.assignments:
                    if a.teacher_id == tid:
                        teacher_load += a.weightage

    return (valid_slots, teacher_load)


def compute_teacher_partitions(wsd: WholeSchoolData) -> None:
    """Pre-allocate time slots for shared teachers across divisions.

    For each teacher who teaches in 2+ divisions, distribute their available
    time slots proportionally to each division's weightage. This prevents the
    cascade problem where early divisions consume all of a shared teacher's
    time, starving later divisions.

    Teachers who only teach in one division get all their available slots
    (no partitioning needed).

    The partition respects HARD scheduling preferences — if an assignment in
    division X has HARD preferredDays=[0,1], the partition for that teacher
    in division X will only include Mon/Tue slots.
    """
    # Build teacher → { division_id → total_weightage }
    teacher_div_weights: dict[str, dict[str, int]] = {}
    for div_id, div_data in wsd.divisions.items():
        for la in div_data.logical_assignments:
            for tid in la.teacher_ids:
                teacher_div_weights.setdefault(tid, {})
                teacher_div_weights[tid][div_id] = (
                    teacher_div_weights[tid].get(div_id, 0) + la.weightage
                )

    for tid, div_weights in teacher_div_weights.items():
        if len(div_weights) < 2:
            # Teacher only in one division — no partitioning needed.
            # Give them all available time slots.
            for div_id in div_weights:
                div_data = wsd.divisions[div_id]
                all_slots = set()
                for slot in div_data.period_slots:
                    if (tid, slot.day_of_week, slot.start_time) not in wsd.teacher_unavailable_times:
                        all_slots.add((slot.day_of_week, slot.start_time))
                wsd.teacher_partitions.setdefault(tid, {})[div_id] = all_slots
            continue

        # Shared teacher — collect all available time slots across the school.
        # Use the union of all divisions' period slots (different structures may
        # have slightly different times, but we normalize by (day_of_week, start_time)).
        all_available: list[tuple[int, str]] = []
        seen: set[tuple[int, str]] = set()
        for div_id in div_weights:
            div_data = wsd.divisions[div_id]
            for slot in div_data.period_slots:
                key = (slot.day_of_week, slot.start_time)
                if key not in seen and (tid, slot.day_of_week, slot.start_time) not in wsd.teacher_unavailable_times:
                    all_available.append(key)
                    seen.add(key)

        total_weight = sum(div_weights.values())
        total_available = len(all_available)

        if total_available == 0 or total_weight == 0:
            # No available slots — give empty partitions
            for div_id in div_weights:
                wsd.teacher_partitions.setdefault(tid, {})[div_id] = set()
            continue

        # Sort divisions by weightage descending — heavier divisions get first pick
        sorted_divs = sorted(div_weights.items(), key=lambda x: -x[1])

        # Collect HARD preferred slots per division (if any assignment has HARD day/period prefs)
        div_preferred_slots: dict[str, set[tuple[int, str]]] = {}
        for div_id, _ in sorted_divs:
            div_data = wsd.divisions[div_id]
            preferred: set[tuple[int, str]] = set()
            has_hard_prefs = False
            for la in div_data.logical_assignments:
                if tid not in la.teacher_ids:
                    continue
                prefs = la.scheduling_preferences
                if not prefs or not isinstance(prefs, dict) or prefs.get("constraintType") != "HARD":
                    continue
                has_hard_prefs = True
                pref_days = set(prefs.get("preferredDays", []))
                excl_days = set(prefs.get("excludedDays", []))
                pref_range = prefs.get("preferredPeriodRange")
                excl_range = prefs.get("excludedPeriodRange")
                for slot in div_data.period_slots:
                    if tid not in la.teacher_ids:
                        continue
                    dow = slot.day_of_week
                    pnum = slot.slot_number
                    if dow in excl_days:
                        continue
                    if pref_days and dow not in pref_days:
                        continue
                    if pnum is not None and pref_range:
                        if pnum < pref_range.get("min", 1) or pnum > pref_range.get("max", 99):
                            continue
                    if pnum is not None and excl_range:
                        if excl_range.get("min", 99) <= pnum <= excl_range.get("max", 0):
                            continue
                    preferred.add((dow, slot.start_time))
            if has_hard_prefs and preferred:
                div_preferred_slots[div_id] = preferred

        # Build partitions — NON-EXCLUSIVE. Each division gets ALL slots it
        # could use (filtered by HARD prefs). The demand-driven placer handles
        # actual conflict avoidance via teacher_busy. The partition just ensures
        # HARD-constrained assignments only see their valid slots.
        partition: dict[str, set[tuple[int, str]]] = {}

        for div_id, weight in sorted_divs:
            div_data = wsd.divisions[div_id]
            has_hard_pref_slots = div_preferred_slots.get(div_id)

            if has_hard_pref_slots:
                # Division has HARD preferences — only allow those slots
                partition[div_id] = has_hard_pref_slots
            else:
                # No HARD preferences — allow all available slots valid for this structure
                valid_slots: set[tuple[int, str]] = set()
                for slot_key in all_available:
                    is_valid = any(
                        s.day_of_week == slot_key[0] and s.start_time == slot_key[1]
                        for s in div_data.period_slots
                    )
                    if is_valid:
                        valid_slots.add(slot_key)
                partition[div_id] = valid_slots

        wsd.teacher_partitions[tid] = partition

    shared_count = sum(1 for t, dw in teacher_div_weights.items() if len(dw) >= 2)
    logger.info("Teacher partitioning: %d shared teachers partitioned across divisions",
                shared_count)
