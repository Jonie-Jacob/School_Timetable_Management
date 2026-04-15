#!/usr/bin/env python3
"""
Diagnostic: Step-by-step demand-driven placement with backtracking.

Phase 1: Sorted placement (most constrained first, lowest demand slot)
Phase 2: Backtracking on Phase 1 failures (undo recent placements to free slots)

Usage:
    cd engine/timetable-generator
    python diagnostic.py
"""

import os
import sys
import time
from collections import defaultdict

import psycopg2
import psycopg2.extras
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from src.data_loader import DATABASE_URL, SchoolData, LogicalAssignment
from src.whole_school_loader import load_whole_school_data, WholeSchoolData

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ── Data helpers ─────────────────────────────────────────────────────────────

def get_school_info():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT s.id AS school_id, ay.id AS ay_id, s.name AS school_name
                FROM schools s
                JOIN academic_years ay ON ay.school_id = s.id
                LEFT JOIN divisions d
                  ON d.school_id = s.id AND d.academic_year_id = ay.id AND d.deleted_at IS NULL
                WHERE ay.status = 'ACTIVE'
                GROUP BY s.id, ay.id
                ORDER BY COUNT(d.id) DESC LIMIT 1
            """)
            row = cur.fetchone()
            if not row:
                print("ERROR: No active school/academic year found"); sys.exit(1)
            return row["school_id"], row["ay_id"], row["school_name"]
    finally:
        conn.close()


def get_divisions(school_id, ay_id):
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT d.id, d.label, c.name AS class_name, c.sort_order
                FROM divisions d JOIN classes c ON c.id = d.class_id
                WHERE d.deleted_at IS NULL AND d.academic_year_id = %s AND d.school_id = %s
                ORDER BY c.sort_order, d.label
            """, (ay_id, school_id))
            return cur.fetchall()
    finally:
        conn.close()


def slot_desc(slot):
    day = DAY_NAMES[slot.day_of_week] if slot.day_of_week < 7 else f"D{slot.day_of_week}"
    return f"{day} P{slot.slot_number} ({slot.start_time[:5]})"


def tname(wsd, tid):
    t = wsd.teachers.get(tid)
    return t.name if t else tid[:8]


def _format_prefs(prefs):
    if not prefs or not isinstance(prefs, dict):
        return ""
    parts = []
    if prefs.get("constraintType") == "HARD":
        parts.append("HARD")
    if prefs.get("preferredDays"):
        parts.append(f"days=[{','.join(DAY_NAMES[d] for d in prefs['preferredDays'])}]")
    if prefs.get("excludedDays"):
        parts.append(f"excl=[{','.join(DAY_NAMES[d] for d in prefs['excludedDays'])}]")
    if prefs.get("preferredPeriodRange"):
        pr = prefs["preferredPeriodRange"]
        parts.append(f"P{pr.get('min',1)}-P{pr.get('max',99)}")
    if prefs.get("preferAdjacentPeriods"):
        parts.append("adjacent")
    return " ".join(parts)


# ── Placement state ──────────────────────────────────────────────────────────

class State:
    def __init__(self, wsd: WholeSchoolData):
        self.chromosomes = {
            div_id: np.full(d.total_periods, -1, dtype=np.int32)
            for div_id, d in wsd.divisions.items()
        }
        # Use the engine's TeacherBusyTracker for time-range overlap detection
        from src.ga.greedy import TeacherBusyTracker
        self.teacher_busy = TeacherBusyTracker()
        self.teacher_busy_info: dict[tuple[str, int, str], tuple[str, str]] = {}
        self.placement_counts: dict[tuple[str, int], int] = defaultdict(int)
        # History: (div_id, la_idx, gi, [(tid, dow, st, et), ...])
        self.history: list[tuple[str, int, int, list[tuple[str, int, str, str]]]] = []

    def place(self, div_id, la_idx, gi, div_data, la, div_name, wsd=None):
        self.chromosomes[div_id][gi] = la_idx
        self.placement_counts[(div_id, la_idx)] += 1
        slot = div_data.period_slots[gi]
        added = []
        if wsd:
            picked = la.pick_available_teachers(
                slot.day_of_week, slot.start_time,
                self.teacher_busy, wsd.teacher_unavailable_times,
                wsd.teacher_partitions, div_id,
                end_time=slot.end_time,
            )
        else:
            picked = None
        if picked is None:
            picked = la.teacher_ids
        for tid in picked:
            self.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
            self.teacher_busy_info[(tid, slot.day_of_week, slot.start_time)] = (div_name, la.display_name)
            added.append((tid, slot.day_of_week, slot.start_time, slot.end_time))
        self.history.append((div_id, la_idx, gi, added))

    def unplace(self, div_id, la_idx, gi, teacher_slots):
        self.chromosomes[div_id][gi] = -1
        self.placement_counts[(div_id, la_idx)] -= 1
        for entry in teacher_slots:
            if len(entry) == 4:
                tid, dow, st, et = entry
                self.teacher_busy.remove(tid, dow, st, et)
                self.teacher_busy_info.pop((tid, dow, st), None)
            else:
                # Legacy 3-tuple fallback
                self.teacher_busy_info.pop(entry, None)

    def place_cross_div(self, eg_id, gi, wsd, div_info):
        """Place a cross-division elective at gi in ALL divisions simultaneously.

        Teachers are marked busy ONCE (they teach all divisions at the same slot).
        Each division's chromosome gets the placement.
        """
        div_ids = wsd.cross_div_electives[eg_id]
        added = []
        display_name = None

        for div_id in div_ids:
            div_data = wsd.divisions[div_id]
            # Find this division's la_idx for this elective group
            la_idx = None
            for idx, la in enumerate(div_data.logical_assignments):
                if la.elective_group_id == eg_id:
                    la_idx = idx
                    break
            if la_idx is None:
                continue

            la = div_data.logical_assignments[la_idx]
            display_name = la.display_name
            self.chromosomes[div_id][gi] = la_idx
            self.placement_counts[(div_id, la_idx)] += 1

        # Mark teachers busy ONCE (use first division's LA for teacher picking)
        first_div = div_ids[0]
        first_data = wsd.divisions[first_div]
        first_la = None
        for la in first_data.logical_assignments:
            if la.elective_group_id == eg_id:
                first_la = la
                break

        if first_la and gi < len(first_data.period_slots):
            slot = first_data.period_slots[gi]
            picked = first_la.pick_available_teachers(
                slot.day_of_week, slot.start_time,
                self.teacher_busy, wsd.teacher_unavailable_times,
                wsd.teacher_partitions, first_div,
                end_time=slot.end_time,
            )
            if picked is None:
                picked = first_la.teacher_ids
            dn = div_info.get(first_div, {})
            dn_str = f"{dn.get('class_name','')} {dn.get('label','')}" if dn else "?"
            for tid in picked:
                self.teacher_busy.add(tid, slot.day_of_week, slot.start_time, slot.end_time)
                self.teacher_busy_info[(tid, slot.day_of_week, slot.start_time)] = (dn_str, display_name or "?")
                added.append((tid, slot.day_of_week, slot.start_time, slot.end_time))

        # Record ONE history entry (using first division)
        if first_la:
            first_la_idx = next(i for i, la in enumerate(first_data.logical_assignments)
                                if la.elective_group_id == eg_id)
            self.history.append((first_div, first_la_idx, gi, added))


# ── Slot analysis ────────────────────────────────────────────────────────────

def find_valid_slots_cross_div(eg_id, wsd, state: State):
    """Find valid slots for a cross-division elective.

    A slot is valid only if it works for ALL divisions in the group:
    - The slot is empty in every division's chromosome
    - All HARD day/period constraints satisfied (use first div's LA prefs)
    - Enough teachers free (pick_available_teachers on the first div's LA)

    Returns [(gi, demand), ...].
    """
    div_ids = wsd.cross_div_electives[eg_id]

    # Use first division's LA for preferences and teacher checks
    first_div = div_ids[0]
    first_data = wsd.divisions[first_div]
    first_la = None
    first_la_idx = None
    for idx, la in enumerate(first_data.logical_assignments):
        if la.elective_group_id == eg_id:
            first_la = la
            first_la_idx = idx
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

    valid = []
    for gi in range(first_data.total_periods):
        slot = first_data.period_slots[gi]

        # Check slot is empty in ALL divisions
        all_empty = True
        for div_id in div_ids:
            if state.chromosomes[div_id][gi] != -1:
                all_empty = False
                break
        if not all_empty:
            continue

        # HARD day constraints
        if is_hard:
            if slot.day_of_week in excluded_days:
                continue
            if preferred_days and slot.day_of_week not in preferred_days:
                continue

        # HARD period constraints
        pnum = slot.slot_number
        if is_hard and pnum is not None:
            if pref_range and (pnum < pref_range.get("min", 1) or pnum > pref_range.get("max", 99)):
                continue
            if excl_range and excl_range.get("min", 99) <= pnum <= excl_range.get("max", 0):
                continue

        # HARD maxPeriodsPerDay
        ppd = first_data.periods_per_day
        day_idx = gi // ppd
        period_idx = gi % ppd
        if is_hard and prefs:
            max_pd = prefs.get("maxPeriodsPerDay")
            if max_pd is not None:
                day_count = sum(
                    1 for g in range(day_idx * ppd, min((day_idx + 1) * ppd, first_data.total_periods))
                    if int(state.chromosomes[first_div][g]) == first_la_idx
                )
                if day_count >= max_pd:
                    continue

        # Teacher check — only need teachers from ONE division's LA (they're shared)
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
        if want_adjacent:
            chromosome = state.chromosomes[first_div]
            has_neighbor = False
            if period_idx > 0 and int(chromosome[day_idx * ppd + period_idx - 1]) == first_la_idx:
                has_neighbor = True
            if period_idx < ppd - 1 and int(chromosome[day_idx * ppd + period_idx + 1]) == first_la_idx:
                has_neighbor = True
            if has_neighbor:
                demand -= 10
            elif state.placement_counts.get((first_div, first_la_idx), 0) > 0:
                demand += 5

        # Spread
        day_count = sum(
            1 for g in range(day_idx * ppd, min((day_idx + 1) * ppd, first_data.total_periods))
            if int(state.chromosomes[first_div][g]) == first_la_idx
        )
        demand += day_count * 2

        valid.append((gi, demand))
    return valid


def find_valid_slots(la, la_idx, div_id, div_data, state: State, wsd):
    """Returns list of (gi, demand) for valid slots."""
    prefs = la.scheduling_preferences \
        if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    excl_range = prefs.get("excludedPeriodRange") if prefs else None

    chromosome = state.chromosomes[div_id]
    ppd = div_data.periods_per_day
    valid = []

    # Pre-compute day counts for this assignment
    day_counts: dict[int, int] = defaultdict(int)
    for gi2 in range(div_data.total_periods):
        if int(chromosome[gi2]) == la_idx:
            day_counts[gi2 // ppd] += 1

    want_adjacent = (
        wsd.adjacency_constraint_enabled
        or (prefs and prefs.get("preferAdjacentPeriods"))
    )
    hard_adjacent = is_hard and prefs and prefs.get("preferAdjacentPeriods")

    for gi in range(div_data.total_periods):
        slot = div_data.period_slots[gi]
        if chromosome[gi] != -1:
            continue
        day_idx = gi // ppd
        period_idx = gi % ppd
        pnum = slot.slot_number

        if is_hard:
            if slot.day_of_week in excluded_days:
                continue
            if preferred_days and slot.day_of_week not in preferred_days:
                continue
        if is_hard and pnum is not None:
            if pref_range and (pnum < pref_range.get("min", 1) or pnum > pref_range.get("max", 99)):
                continue
            if excl_range and excl_range.get("min", 99) <= pnum <= excl_range.get("max", 0):
                continue

        # HARD maxPeriodsPerDay
        if is_hard and prefs:
            max_pd = prefs.get("maxPeriodsPerDay")
            if max_pd is not None and day_counts.get(day_idx, 0) >= max_pd:
                continue

        picked = la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, div_id,
            end_time=slot.end_time,
        )
        if picked is None:
            continue

        # HARD adjacency: enforce within same day only
        has_neighbor = False
        if want_adjacent:
            if period_idx > 0 and int(chromosome[day_idx * ppd + period_idx - 1]) == la_idx:
                has_neighbor = True
            if period_idx < ppd - 1 and int(chromosome[day_idx * ppd + period_idx + 1]) == la_idx:
                has_neighbor = True
        placed_this_day = day_counts.get(day_idx, 0)
        if hard_adjacent and placed_this_day > 0 and not has_neighbor:
            continue

        demand = _compute_demand(gi, div_id, div_data, state, wsd)

        # Adjacency scoring
        if want_adjacent:
            if has_neighbor:
                demand -= 10
            elif placed_this_day > 0:
                demand += 5

        # Spread
        demand += day_counts.get(day_idx, 0) * 2

        # Scarcity-aware: steer unrestricted subjects away from P2-P8
        this_restricted = is_hard and pref_range and pref_range.get("min", 1) >= 2
        if not this_restricted and pnum is not None and pnum >= 2:
            p2_8_remaining = 0
            p2_8_capacity = sum(
                1 for g2 in range(div_data.total_periods)
                if div_data.period_slots[g2].slot_number and div_data.period_slots[g2].slot_number >= 2
                   and state.chromosomes[div_id][g2] == -1
            )
            for la_idx2, la2 in enumerate(div_data.logical_assignments):
                placed2 = state.placement_counts.get((div_id, la_idx2), 0)
                rem2 = la2.weightage - placed2
                if rem2 <= 0:
                    continue
                p2 = la2.scheduling_preferences
                if p2 and isinstance(p2, dict) and p2.get("constraintType") == "HARD":
                    pr2 = p2.get("preferredPeriodRange")
                    if pr2 and pr2.get("min", 1) >= 2:
                        p2_8_remaining += rem2
            if p2_8_remaining > 0 and p2_8_capacity > 0:
                pressure = p2_8_remaining / p2_8_capacity
                if pressure > 0.5:
                    demand += pressure * 8

        valid.append((gi, demand))
    return valid


def find_valid_slots_detailed(la, la_idx, div_id, div_data, state: State, wsd):
    """Returns (valid, blocked) with detailed blocking reasons."""
    prefs = la.scheduling_preferences \
        if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"
    preferred_days = set(prefs.get("preferredDays", [])) if prefs else set()
    excluded_days = set(prefs.get("excludedDays", [])) if prefs else set()
    pref_range = prefs.get("preferredPeriodRange") if prefs else None
    excl_range = prefs.get("excludedPeriodRange") if prefs else None

    chromosome = state.chromosomes[div_id]
    valid, blocked = [], []

    for gi in range(div_data.total_periods):
        slot = div_data.period_slots[gi]
        sd = slot_desc(slot)
        if chromosome[gi] != -1:
            occ = div_data.logical_assignments[int(chromosome[gi])]
            blocked.append((gi, "OCCUPIED", f"{sd}: {occ.display_name}"))
            continue
        if is_hard:
            if slot.day_of_week in excluded_days:
                blocked.append((gi, "HARD_DAY_EXCLUDED", f"{sd}: {DAY_NAMES[slot.day_of_week]} excluded"))
                continue
            if preferred_days and slot.day_of_week not in preferred_days:
                blocked.append((gi, "HARD_DAY_NOT_PREFERRED", f"{sd}: not in preferred"))
                continue
        pnum = slot.slot_number
        if is_hard and pnum is not None:
            if pref_range and (pnum < pref_range.get("min", 1) or pnum > pref_range.get("max", 99)):
                blocked.append((gi, "HARD_PERIOD_RANGE", f"{sd}: P{pnum} outside range"))
                continue
            if excl_range and excl_range.get("min", 99) <= pnum <= excl_range.get("max", 0):
                blocked.append((gi, "HARD_PERIOD_EXCLUDED", f"{sd}: excluded range"))
                continue
        # Teacher check using pick_available_teachers (respects parallel_sections)
        picked = la.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            wsd.teacher_partitions, div_id,
            end_time=slot.end_time,
        )
        if picked is None:
            # Categorize for diagnostics
            has_unavail = any(
                (tid, slot.day_of_week, slot.start_time) in wsd.teacher_unavailable_times
                for tid in la.teacher_ids
            )
            has_busy = any(
                state.teacher_busy.is_busy(tid, slot.day_of_week, slot.start_time, slot.end_time)
                for tid in la.teacher_ids
            )
            if has_unavail:
                blocked.append((gi, "TEACHER_UNAVAILABLE", f"{sd}: teacher unavailable"))
            elif has_busy:
                busy_teachers = [
                    tname(wsd, tid) for tid in la.teacher_ids
                    if state.teacher_busy.is_busy(tid, slot.day_of_week, slot.start_time, slot.end_time)
                ]
                info = state.teacher_busy_info.get(
                    next(((tid, slot.day_of_week, slot.start_time)
                         for tid in la.teacher_ids
                         if state.teacher_busy.is_busy(tid, slot.day_of_week, slot.start_time, slot.end_time)),
                         None),
                    ("?", "?"))
                blocked.append((gi, "TEACHER_BUSY",
                                f"{sd}: {', '.join(busy_teachers[:2])} in {info[0]} ({info[1]})"))
            else:
                blocked.append((gi, "PARTITION_BLOCKED", f"{sd}: partition"))
            continue
        demand = _compute_demand(gi, div_id, div_data, state, wsd)
        valid.append((gi, demand))
    return valid, blocked


def _compute_demand(gi, div_id, div_data, state: State, wsd):
    slot = div_data.period_slots[gi]
    chromosome = state.chromosomes[div_id]
    demand = 0
    for la_idx2, la2 in enumerate(div_data.logical_assignments):
        placed = 0
        for g in range(div_data.total_periods):
            if int(chromosome[g]) == la_idx2:
                placed += 1
        if placed >= la2.weightage:
            continue
        picked = la2.pick_available_teachers(
            slot.day_of_week, slot.start_time,
            state.teacher_busy, wsd.teacher_unavailable_times,
            end_time=slot.end_time,
        )
        if picked is not None:
            demand += 1
    return demand


# ── Backtracking ─────────────────────────────────────────────────────────────

def try_backtrack(state: State, div_id, la_idx, div_data, la, wsd, div_info, max_depth=20):
    """
    Try to free a slot by undoing placements involving same teachers.

    Strategy 1: Find placements in OTHER divisions that block our teachers,
                undo one, place us, re-place the undone one elsewhere.
    Strategy 2: Find placements in THIS division occupying slots where our
                teachers are free, undo one (creating an empty slot we can use),
                then re-place the undone one elsewhere.
    """
    teacher_ids = set(la.teacher_ids)
    if not teacher_ids:
        return False

    prefs = la.scheduling_preferences \
        if la.scheduling_preferences and isinstance(la.scheduling_preferences, dict) else None
    is_hard = prefs and prefs.get("constraintType") == "HARD"

    # --- Strategy 1: Undo teacher-blocking placements in other divisions ---
    # Search ALL history for entries involving our teachers (not just last 100)
    candidates = []
    for hi in range(len(state.history) - 1, -1, -1):
        h_div_id, h_la_idx, h_gi, h_teacher_slots = state.history[hi]
        for tid, dow, st in h_teacher_slots:
            if tid in teacher_ids:
                candidates.append(hi)
                break
        if len(candidates) >= max_depth:
            break

    for hi in candidates:
        h_div_id, h_la_idx, h_gi, h_teacher_slots = state.history[hi]
        state.unplace(h_div_id, h_la_idx, h_gi, h_teacher_slots)

        valid = find_valid_slots(la, la_idx, div_id, div_data, state, wsd)
        if valid:
            valid.sort(key=lambda x: x[1])
            info = div_info.get(div_id, {})
            dn = f"{info.get('class_name','')} {info.get('label','')}"
            state.place(div_id, la_idx, valid[0][0], div_data, la, dn, wsd)

            h_div_data = wsd.divisions[h_div_id]
            h_la = h_div_data.logical_assignments[h_la_idx]
            h_valid = find_valid_slots(h_la, h_la_idx, h_div_id, h_div_data, state, wsd)
            if h_valid:
                h_valid.sort(key=lambda x: x[1])
                h_info = div_info.get(h_div_id, {})
                h_dn = f"{h_info.get('class_name','')} {h_info.get('label','')}"
                state.place(h_div_id, h_la_idx, h_valid[0][0], h_div_data, h_la, h_dn, wsd)
                return True
            else:
                last = state.history.pop()
                state.unplace(last[0], last[1], last[2], last[3])
                h_info = div_info.get(h_div_id, {})
                h_dn = f"{h_info.get('class_name','')} {h_info.get('label','')}"
                state.place(h_div_id, h_la_idx, h_gi, h_div_data, h_la, h_dn, wsd)
        else:
            h_div_data = wsd.divisions[h_div_id]
            h_la = h_div_data.logical_assignments[h_la_idx]
            h_info = div_info.get(h_div_id, {})
            h_dn = f"{h_info.get('class_name','')} {h_info.get('label','')}"
            state.place(h_div_id, h_la_idx, h_gi, h_div_data, h_la, h_dn, wsd)

    # --- Strategy 2: Swap within THIS division ---
    # Find occupied slots where ALL our teachers are free.
    # If we can move that occupant elsewhere, we get an empty slot.
    chromosome = state.chromosomes[div_id]
    for gi in range(div_data.total_periods):
        if chromosome[gi] == -1:
            continue
        slot = div_data.period_slots[gi]

        # Check HARD constraints for our assignment at this slot
        if is_hard:
            pday = set(prefs.get("preferredDays", [])) if prefs else set()
            eday = set(prefs.get("excludedDays", [])) if prefs else set()
            if slot.day_of_week in eday:
                continue
            if pday and slot.day_of_week not in pday:
                continue
            pnum = slot.slot_number
            pr = prefs.get("preferredPeriodRange") if prefs else None
            er = prefs.get("excludedPeriodRange") if prefs else None
            if pnum is not None and pr and (pnum < pr.get("min",1) or pnum > pr.get("max",99)):
                continue
            if pnum is not None and er and er.get("min",99) <= pnum <= er.get("max",0):
                continue

        # Check if ALL our teachers are free at this slot
        all_free = True
        for tid in teacher_ids:
            key = (tid, slot.day_of_week, slot.start_time)
            if key in wsd.teacher_unavailable_times:
                all_free = False; break
            # teacher_busy includes our own division's placements — the occupant
            # is about to be removed, so check if the ONLY busy entry is from
            # the occupant itself
            if key in state.teacher_busy:
                # Is this busy entry from the occupant we're about to remove?
                occ_la = div_data.logical_assignments[int(chromosome[gi])]
                if tid not in occ_la.teacher_ids:
                    all_free = False; break
            prt = wsd.teacher_partitions.get(tid, {}).get(div_id)
            if prt is not None and (slot.day_of_week, slot.start_time) not in prt:
                all_free = False; break
        if not all_free:
            continue

        # Try removing the occupant and placing us here
        occ_idx = int(chromosome[gi])
        occ_la = div_data.logical_assignments[occ_idx]
        # Find the history entry for this placement
        h_entry = None
        for hi in range(len(state.history) - 1, -1, -1):
            h = state.history[hi]
            if h[0] == div_id and h[1] == occ_idx and h[2] == gi:
                h_entry = hi; break
        if h_entry is None:
            continue

        _, _, _, occ_teacher_slots = state.history[h_entry]
        state.unplace(div_id, occ_idx, gi, occ_teacher_slots)

        # Place our assignment
        info = div_info.get(div_id, {})
        dn = f"{info.get('class_name','')} {info.get('label','')}"
        state.place(div_id, la_idx, gi, div_data, la, dn, wsd)

        # Try re-placing occupant
        occ_valid = find_valid_slots(occ_la, occ_idx, div_id, div_data, state, wsd)
        if occ_valid:
            occ_valid.sort(key=lambda x: x[1])
            state.place(div_id, occ_idx, occ_valid[0][0], div_data, occ_la, dn, wsd)
            return True
        else:
            # Revert
            last = state.history.pop()
            state.unplace(last[0], last[1], last[2], last[3])
            state.place(div_id, occ_idx, gi, div_data, occ_la, dn, wsd)

    return False


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    print("=" * 90)
    print("  TIMETABLE DIAGNOSTIC — Demand-Driven Placement + Backtracking")
    print("=" * 90)

    # ── Load ─────────────────────────────────────────────────────────────────
    school_id, ay_id, school_name = get_school_info()
    divisions = get_divisions(school_id, ay_id)
    div_ids = [d["id"] for d in divisions]
    div_info = {d["id"]: d for d in divisions}

    print(f"\nSchool:     {school_name}")
    print(f"Divisions:  {len(divisions)}")

    print("\nLoading data (using engine loaders)...")
    wsd = load_whole_school_data(school_id, ay_id, div_ids)

    total_items = sum(
        sum(la.weightage for la in d.logical_assignments)
        for d in wsd.divisions.values()
    )
    shared = sum(1 for _, p in wsd.teacher_partitions.items() if len(p) >= 2)
    print(f"Assignment-periods: {total_items}")
    print(f"Teachers:           {len(wsd.teachers)}")
    print(f"Shared teachers:    {shared}")
    print(f"Unavail entries:    {len(wsd.teacher_unavailable_times)}")

    # ── Rankings ─────────────────────────────────────────────────────────────
    print(f"\n{'=' * 90}")
    print("  STEP 1-2: Assignment Rankings (most constrained first)")
    print("=" * 90)

    # Track which cross-div elective groups we've already added
    cross_div_seen: set[str] = set()

    rankings = []
    for div_id, scores in wsd.flexibility_scores.items():
        info = div_info[div_id]
        for la_idx, flex_score in scores:
            la = wsd.divisions[div_id].logical_assignments[la_idx]

            # Cross-division elective: only add ONE entry (first division seen)
            eg_id = la.elective_group_id
            is_cross_div = eg_id and eg_id in wsd.cross_div_electives
            if is_cross_div:
                if eg_id in cross_div_seen:
                    continue  # skip duplicates
                cross_div_seen.add(eg_id)
                div_names = ", ".join(
                    f"{div_info[d]['class_name']} {div_info[d]['label']}"
                    for d in wsd.cross_div_electives[eg_id]
                )
            else:
                div_names = None

            teachers_str = ", ".join(tname(wsd, tid) for tid in la.teacher_ids) or "(unassigned)"
            valid_slots, teacher_load = flex_score
            rankings.append({
                "div_id": div_id, "la_idx": la_idx,
                "valid_slots": valid_slots, "teacher_load": teacher_load,
                "class_sort": info["sort_order"],
                "div_name": div_names or f"{info['class_name']} {info['label']}",
                "subject": la.display_name, "teachers": teachers_str,
                "weightage": la.weightage, "prefs": la.scheduling_preferences,
                "la": la,
                "cross_div": eg_id if is_cross_div else None,
            })

    # Sort: valid_slots ASC (fewest first), teacher_load DESC (busiest first), class DESC
    rankings.sort(key=lambda r: (r["valid_slots"], -r["teacher_load"], -r["class_sort"]))

    cross_count = sum(1 for r in rankings if r["cross_div"])
    print(f"\n  Cross-division electives: {cross_count} groups (placed once, applied to all divisions)")

    print(f"\n{'Rank':<5} {'Slots':>5} {'Load':>5} {'Division':<25} {'Subject':<22} {'Teacher':<22} {'Wt':>3} {'Constraints'}")
    print("-" * 130)
    for i, r in enumerate(rankings[:50]):
        cd = " [CROSS]" if r["cross_div"] else ""
        print(f"{i+1:<5} {r['valid_slots']:>5} {r['teacher_load']:>5.0f} {r['div_name'][:24]:<25} "
              f"{r['subject'][:21]:<22} {r['teachers'][:21]:<22} "
              f"{r['weightage']:>3} {_format_prefs(r['prefs'])}{cd}")
    if len(rankings) > 50:
        print(f"  ... and {len(rankings) - 50} more")

    # ── Phase 1: Sorted placement ────────────────────────────────────────────
    print(f"\n{'=' * 90}")
    print("  PHASE 1: Demand-Driven Placement (sorted, no backtracking)")
    print("=" * 90)

    items = []
    for r in rankings:
        for _ in range(r["weightage"]):
            items.append(r)

    # total_count = actual assignment-periods across all divisions
    # cross-div items count for N divisions each
    total_count = 0
    for r in items:
        if r["cross_div"]:
            total_count += len(wsd.cross_div_electives[r["cross_div"]])
        else:
            total_count += 1
    print(f"\n  Total items to place: {total_count} (across all divisions)")

    state = State(wsd)
    placed_ok = 0
    phase1_failures = []

    for item_idx, r in enumerate(items):
        div_id, la_idx = r["div_id"], r["la_idx"]
        div_data = wsd.divisions[div_id]
        la = r["la"]
        eg_id = r["cross_div"]

        if eg_id:
            # Cross-division elective: find slot valid for ALL divisions
            valid = find_valid_slots_cross_div(eg_id, wsd, state)
            if valid:
                valid.sort(key=lambda x: x[1])
                gi = valid[0][0]
                state.place_cross_div(eg_id, gi, wsd, div_info)
                n_divs = len(wsd.cross_div_electives[eg_id])
                placed_ok += n_divs  # counts for all divisions

                if placed_ok % 100 == 0:
                    slot = div_data.period_slots[gi]
                    print(f"  [{placed_ok:>5}/{total_count}] -- {la.display_name} "
                          f"x{n_divs} divs at {slot_desc(slot)}")
            else:
                fail_num = len(phase1_failures) + 1
                placed_so_far = state.placement_counts.get((div_id, la_idx), 0)
                print(f"\n  FAIL #{fail_num} [{placed_ok}/{total_count}]: "
                      f"{la.display_name} in {r['div_name']} [CROSS-DIV]")
                print(f"    Teacher: {r['teachers']}  |  Placed {placed_so_far}/{la.weightage}")
                if r["prefs"] and isinstance(r["prefs"], dict):
                    print(f"    Prefs:   {_format_prefs(r['prefs'])}")
                # Show blocking using first division's detailed check
                _, blocked_list = find_valid_slots_detailed(la, la_idx, div_id, div_data, state, wsd)
                reason_counts = defaultdict(int)
                for _, reason, _ in blocked_list:
                    reason_counts[reason] += 1
                print(f"    Blocking ({div_data.total_periods} slots):")
                for reason, cnt in sorted(reason_counts.items(), key=lambda x: -x[1]):
                    print(f"      {reason}: {cnt}")
                phase1_failures.append(r)
        else:
            # Regular per-division placement
            valid, blocked_list = find_valid_slots_detailed(la, la_idx, div_id, div_data, state, wsd)

            if valid:
                valid.sort(key=lambda x: x[1])
                gi, demand = valid[0]
                state.place(div_id, la_idx, gi, div_data, la, r["div_name"], wsd)
                placed_ok += 1

                if placed_ok % 200 == 0:
                    slot = div_data.period_slots[gi]
                    pct = placed_ok * 100 // total_count
                    print(f"  [{placed_ok:>5}/{total_count}] {pct}% -- {la.display_name} in "
                          f"{r['div_name']} at {slot_desc(slot)} (demand={demand:.0f})")
            else:
                placed_so_far = state.placement_counts.get((div_id, la_idx), 0)
                fail_num = len(phase1_failures) + 1

                print(f"\n  FAIL #{fail_num} [{placed_ok}/{total_count}]: "
                      f"{la.display_name} in {r['div_name']}")
                print(f"    Teacher: {r['teachers']}  |  Placed {placed_so_far}/{la.weightage}")
                if r["prefs"] and isinstance(r["prefs"], dict):
                    print(f"    Prefs:   {_format_prefs(r['prefs'])}")

                reason_counts = defaultdict(int)
                reason_examples = defaultdict(list)
                for gi, reason, detail in blocked_list:
                    reason_counts[reason] += 1
                    if len(reason_examples[reason]) < 3:
                        reason_examples[reason].append(detail)
                print(f"    Blocking ({div_data.total_periods} slots):")
                for reason, cnt in sorted(reason_counts.items(), key=lambda x: -x[1]):
                    print(f"      {reason}: {cnt}")
                    for ex in reason_examples[reason]:
                        print(f"        -> {ex}")

                phase1_failures.append(r)

    t1 = time.time()
    print(f"\n  Phase 1 result: {placed_ok} placed, {len(phase1_failures)} failed ({t1-t0:.1f}s)")

    if not phase1_failures:
        print("\n  ALL ASSIGNMENTS PLACED IN PHASE 1!")
        _print_summary(state, phase1_failures, [], total_count, t1 - t0, wsd, div_info)
        return

    # ── Phase 2: Backtracking ────────────────────────────────────────────────
    print(f"\n{'=' * 90}")
    print(f"  PHASE 2: Backtracking on {len(phase1_failures)} failures")
    print("=" * 90)

    backtrack_ok = 0
    backtrack_failures = []

    for i, r in enumerate(phase1_failures):
        div_id, la_idx = r["div_id"], r["la_idx"]
        div_data = wsd.divisions[div_id]
        la = r["la"]

        # First check if slots opened up (earlier backtracks may have freed slots)
        valid = find_valid_slots(la, la_idx, div_id, div_data, state, wsd)
        if valid:
            valid.sort(key=lambda x: x[1])
            gi = valid[0][0]
            state.place(div_id, la_idx, gi, div_data, la, r["div_name"], wsd)
            slot = div_data.period_slots[gi]
            print(f"  [BT {i+1}/{len(phase1_failures)}] SLOT OPENED: "
                  f"{la.display_name} in {r['div_name']} -> {slot_desc(slot)}")
            backtrack_ok += 1
            continue

        # Try backtracking
        if try_backtrack(state, div_id, la_idx, div_data, la, wsd, div_info, max_depth=15):
            # Find where it was placed (last history entry)
            last_div, last_la, last_gi, _ = state.history[-1]
            last_slot = wsd.divisions[last_div].period_slots[last_gi]
            print(f"  [BT {i+1}/{len(phase1_failures)}] RESOLVED:   "
                  f"{la.display_name} in {r['div_name']} -> swapped to {slot_desc(last_slot)}")
            backtrack_ok += 1
        else:
            # Still can't place — show detailed failure
            _, blocked_list = find_valid_slots_detailed(la, la_idx, div_id, div_data, state, wsd)
            reason_counts = defaultdict(int)
            for _, reason, _ in blocked_list:
                reason_counts[reason] += 1
            reasons_str = ", ".join(f"{r2}={c}" for r2, c in sorted(reason_counts.items(), key=lambda x: -x[1])[:3])

            print(f"  [BT {i+1}/{len(phase1_failures)}] STILL STUCK: "
                  f"{la.display_name} in {r['div_name']} ({r['teachers']}) — {reasons_str}")
            backtrack_failures.append(r)

    t2 = time.time()
    print(f"\n  Phase 2 result: {backtrack_ok} resolved, {len(backtrack_failures)} remaining ({t2-t1:.1f}s)")

    # ── Summary ──────────────────────────────────────────────────────────────
    _print_summary(state, phase1_failures, backtrack_failures, total_count, t2 - t0, wsd, div_info)


def _print_summary(state, phase1_failures, final_failures, total_count, elapsed, wsd, div_info):
    placed_total = total_count - len(final_failures)
    print(f"\n{'=' * 90}")
    print("  FINAL SUMMARY")
    print("=" * 90)
    print(f"\n  Total assignment-periods:  {total_count}")
    print(f"  Phase 1 placed:           {total_count - len(phase1_failures)}")
    print(f"  Phase 2 resolved:         {len(phase1_failures) - len(final_failures)}")
    print(f"  FINAL placed:             {placed_total} ({placed_total*100//total_count}%)")
    print(f"  FINAL failed:             {len(final_failures)}")
    print(f"  Elapsed:                  {elapsed:.1f}s")

    if not final_failures:
        print("\n  ALL ASSIGNMENTS PLACED SUCCESSFULLY!")
        return

    print(f"\n  --- Remaining Failures ---")
    by_div: dict[str, list] = defaultdict(list)
    for r in final_failures:
        by_div[r["div_name"]].append(r)

    for dn in sorted(by_div.keys()):
        fails = by_div[dn]
        print(f"\n    {dn}: {len(fails)} unplaced")
        # Group by subject
        seen = set()
        for r in fails:
            key = (r["subject"], r["teachers"])
            if key in seen:
                continue
            seen.add(key)
            count = sum(1 for r2 in fails if r2["subject"] == r["subject"])
            placed = state.placement_counts.get((r["div_id"], r["la_idx"]), 0)

            # Get blocking reasons
            div_data = wsd.divisions[r["div_id"]]
            la = r["la"]
            _, blocked = find_valid_slots_detailed(
                la, r["la_idx"], r["div_id"], div_data, state, wsd)
            reason_counts = defaultdict(int)
            for _, reason, _ in blocked:
                reason_counts[reason] += 1
            reasons_str = ", ".join(f"{r2}={c}" for r2, c in sorted(reason_counts.items(), key=lambda x: -x[1])[:3])
            print(f"      {r['subject']} ({r['teachers']}) "
                  f"[{placed}/{r['weightage']}] x{count} — {reasons_str}")


if __name__ == "__main__":
    main()
