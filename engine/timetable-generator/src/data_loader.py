"""
Data loader — reads all tables required for timetable generation from PostgreSQL
and builds in-memory data structures used by the GA engine.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional

import psycopg2
import psycopg2.extras

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://timetable_admin:localdev123@localhost:5433/timetable_dev",
)


# ── Data classes ────────────────────────────────────────────────────────────

@dataclass
class SlotInfo:
    id: str
    working_day_id: str
    slot_type: str
    slot_number: Optional[int]
    sort_order: int
    day_of_week: int
    day_label: str
    start_time: str  # e.g. "09:00:00"
    end_time: str    # e.g. "09:45:00"


@dataclass
class Assignment:
    id: str
    division_id: str
    subject_id: str
    subject_name: str
    teacher_id: Optional[str]     # NULL = unassigned — still gets scheduled
    teacher_name: Optional[str]
    assistant_teacher_id: Optional[str]
    weightage: int
    elective_group_id: Optional[str]
    # Scheduling preferences loaded from the JSONB column.
    # Fields (all optional):
    #   constraintType: 'HARD' | 'SOFT'
    #   preferredDays: list[int]        (0=Mon..6=Sun)
    #   excludedDays:  list[int]
    #   preferredPeriodRange: {min,max} (1-based, inclusive)
    #   excludedPeriodRange:  {min,max}
    #   preferAdjacentPeriods: bool
    #   minPeriodsPerDay: int
    #   maxPeriodsPerDay: int
    scheduling_preferences: Optional[dict] = None


@dataclass
class TeacherInfo:
    id: str
    name: str
    max_periods_per_week: Optional[int]


@dataclass
class LogicalAssignment:
    """A unit of scheduling.

    For an ordinary subject this wraps exactly one DivisionAssignment.
    For an elective group it wraps EVERY DivisionAssignment that belongs
    to the group within this division — all of those assignments must
    occupy the same (day, slot) cell at the same time.

    The chromosome encoding indexes into a list of LogicalAssignments
    rather than raw DivisionAssignments. The output writer expands one
    placement of an elective LogicalAssignment into N TimetableSlot rows
    (one per member assignment).
    """
    members: list[Assignment]
    weightage: int                 # for non-elective: members[0].weightage
                                   # for elective:     ElectiveGroup.periodsPerWeek
    elective_group_id: Optional[str]
    elective_group_name: Optional[str]
    # Scheduling preferences. For an elective group we take the prefs
    # from the first member that has them set (members should agree, but
    # we don't enforce that here).
    scheduling_preferences: Optional[dict] = None

    # For elective groups: subject_id → (list of teacher_ids, parallel_sections).
    # During scheduling, only `parallel_sections` teachers per subject need to be
    # free simultaneously — not ALL teachers.  The output writer later decides
    # which specific teacher teaches which slot.
    # Empty for non-elective assignments (use teacher_ids directly).
    subject_teacher_map: dict[str, tuple[list[str], int]] = field(default_factory=dict)

    @property
    def is_elective(self) -> bool:
        return self.elective_group_id is not None

    @property
    def teacher_ids(self) -> list[str]:
        """Every non-null teacher_id AND assistant_teacher_id from the underlying members.
        Assistant teachers are treated identically to primary teachers for scheduling
        — they must be free and are marked busy when the slot is placed."""
        ids: list[str] = []
        for m in self.members:
            if m.teacher_id is not None and m.teacher_id not in ids:
                ids.append(m.teacher_id)
            if m.assistant_teacher_id is not None and m.assistant_teacher_id not in ids:
                ids.append(m.assistant_teacher_id)
        return ids

    @property
    def display_name(self) -> str:
        if self.is_elective and self.elective_group_name:
            return self.elective_group_name
        return self.members[0].subject_name if self.members else "?"

    def pick_available_teachers(
        self,
        day_of_week: int,
        start_time: str,
        teacher_busy,
        teacher_unavailable: set,
        teacher_partitions: Optional[dict] = None,
        div_id: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> Optional[list[str]]:
        """Pick the minimum set of teachers needed for a slot.

        For non-elective: all teacher_ids must be free → returns them or None.
        For elective with subject_teacher_map: for each subject, pick
        `parallel_sections` free teachers → returns the picked set or None.

        teacher_busy can be a TeacherBusyTracker (with time-range overlap
        detection) or a plain set (legacy, exact match only).

        Returns None if not enough teachers available.
        """
        def _is_teacher_busy(tid: str) -> bool:
            # Check unavailability (exact start_time match)
            if (tid, day_of_week, start_time) in teacher_unavailable:
                return True
            # Check teacher_busy with time-range overlap if tracker, else exact
            if hasattr(teacher_busy, 'is_busy'):
                if teacher_busy.is_busy(tid, day_of_week, start_time, end_time or start_time):
                    return True
            else:
                if (tid, day_of_week, start_time) in teacher_busy:
                    return True
            # Check partition
            if teacher_partitions and div_id:
                partition = teacher_partitions.get(tid, {}).get(div_id)
                if partition is not None and (day_of_week, start_time) not in partition:
                    return True
            return False

        if not self.subject_teacher_map:
            for tid in self.teacher_ids:
                if _is_teacher_busy(tid):
                    return None
            return self.teacher_ids

        picked: list[str] = []
        for subject_id, (tids, parallel) in self.subject_teacher_map.items():
            need = min(parallel, len(tids))
            free = []
            for tid in tids:
                if not _is_teacher_busy(tid):
                    free.append(tid)
            if len(free) < need:
                return None
            if len(tids) <= parallel:
                # All teachers teach simultaneously — all must be free
                picked.extend(free)
            else:
                # Split-teacher mode: only parallel_sections teach per slot.
                # Pick the ones that are free. Mark them busy so they're
                # reserved. The output writer handles distribution.
                picked.extend(free[:need])

        # Also check assistant teachers — they must be free too.
        # Assistants are in teacher_ids but NOT in subject_teacher_map.
        stm_tids = set()
        for tids, _ in self.subject_teacher_map.values():
            stm_tids.update(tids)
        for tid in self.teacher_ids:
            if tid not in stm_tids and tid not in picked:
                if _is_teacher_busy(tid):
                    return None
                picked.append(tid)

        return picked


@dataclass
class TeacherUnavailability:
    """A slot where a teacher is NOT available."""
    teacher_id: str
    working_day_id: str
    slot_id: str


@dataclass
class ElectiveGroupInfo:
    id: str
    name: str
    periods_per_week: int = 0
    subject_ids: list[str] = field(default_factory=list)
    # subject_id → number of parallel sections (e.g. 2 for Malayalam in Mal/Hindi)
    subject_parallel_sections: dict[str, int] = field(default_factory=dict)
    # division_id → assignment mapping for divisions that have this elective
    division_assignments: dict[str, Assignment] = field(default_factory=dict)


@dataclass
class SchoolData:
    """All data needed for timetable generation for a single division."""
    school_id: str
    academic_year_id: str
    division_id: str

    # Global flag — when True, the GA fitness function rewards clustering
    # multi-period subjects into adjacent slots within the same day, and
    # disables the spread/anti-consecutive constraints that would oppose it.
    adjacency_constraint_enabled: bool = False

    # Period slots only (no intervals/lunch), ordered by day then sort_order
    period_slots: list[SlotInfo] = field(default_factory=list)
    # All slots grouped by working_day_id
    slots_by_day: dict[str, list[SlotInfo]] = field(default_factory=dict)
    # Unique working day ids in order
    working_day_ids: list[str] = field(default_factory=list)
    # day_of_week → working_day_id
    day_map: dict[int, str] = field(default_factory=dict)
    # (day_idx, period_idx) → True iff there is at least one INTERVAL or
    # LUNCH_BREAK slot between this period and the previous period in real
    # clock time. Used by the adjacency clustering constraint to refuse to
    # call P3+P4 "adjacent" when a break sits between them.
    period_after_break: set[tuple[int, int]] = field(default_factory=set)

    # Assignments for this division
    assignments: list[Assignment] = field(default_factory=list)

    # Logical assignments — what the GA chromosome actually encodes.
    # One per non-elective Assignment, plus one per elective_group_id present
    # in this division (collapsing all member assignments into one slot).
    logical_assignments: list['LogicalAssignment'] = field(default_factory=list)

    # Teacher metadata (id → TeacherInfo). Used to enforce maxPeriodsPerWeek.
    teachers: dict[str, TeacherInfo] = field(default_factory=dict)

    # Teacher unavailability set: (teacher_id, working_day_id, slot_id)
    teacher_unavailable: set[tuple[str, str, str]] = field(default_factory=set)

    # Teacher slots already occupied in OTHER divisions' existing timetables
    # within this school+AY. Used by the fitness function to prevent
    # cross-division teacher double-booking when we generate one division at
    # a time. Each tuple is (teacher_id, working_day_id, slot_id).
    existing_teacher_slots: set[tuple[str, str, str]] = field(default_factory=set)

    # Elective groups relevant to this division
    elective_groups: dict[str, ElectiveGroupInfo] = field(default_factory=dict)

    # All assignments across ALL divisions in this school+AY (for teacher conflict checks)
    all_division_assignments: dict[str, list[Assignment]] = field(default_factory=dict)

    # All division IDs being generated in this batch (for elective alignment)
    batch_division_ids: list[str] = field(default_factory=list)

    @property
    def num_days(self) -> int:
        return len(self.working_day_ids)

    @property
    def periods_per_day(self) -> int:
        if not self.slots_by_day:
            return 0
        first_day = self.working_day_ids[0]
        return len(self.slots_by_day[first_day])

    @property
    def total_periods(self) -> int:
        return sum(len(slots) for slots in self.slots_by_day.values())


def load_school_data(
    school_id: str,
    academic_year_id: str,
    division_id: str,
    batch_division_ids: list[str] | None = None,
    adjacency_constraint_enabled: bool = False,
) -> SchoolData:
    """Load all data for timetable generation from the database."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            data = SchoolData(
                school_id=school_id,
                academic_year_id=academic_year_id,
                division_id=division_id,
                adjacency_constraint_enabled=adjacency_constraint_enabled,
                batch_division_ids=batch_division_ids or [division_id],
            )

            _load_period_slots(cur, data)
            _load_assignments(cur, data)
            _load_all_division_assignments(cur, data)
            _load_teachers(cur, data)
            _load_teacher_unavailability(cur, data)
            _load_elective_groups(cur, data)
            _load_existing_teacher_slots(cur, data)
            _build_logical_assignments(data)

            return data
    finally:
        conn.close()


def _load_period_slots(cur, data: SchoolData) -> None:
    """Load period slots (excluding intervals/lunch) for the division's period structure.

    Period structures are assigned at the DIVISION level via
    divisions.period_structure_id — the old period_structure_classes join table
    was removed.
    """
    cur.execute("""
        SELECT d.period_structure_id
        FROM divisions d
        WHERE d.id = %s AND d.deleted_at IS NULL
    """, (data.division_id,))
    row = cur.fetchone()
    if not row or not row["period_structure_id"]:
        raise ValueError(f"No period structure assigned to division {data.division_id}")
    period_structure_id = row["period_structure_id"]

    # Load ALL slots (periods + breaks) so we can detect which period
    # transitions have a break between them in real clock time. We still
    # only put PERIOD slots into the chromosome encoding, but the adjacency
    # constraint needs to know "is there a break between sortOrder N and M".
    cur.execute("""
        SELECT
            s.id AS slot_id,
            s.working_day_id,
            s.slot_type,
            s.slot_number,
            s.sort_order,
            s.start_time,
            s.end_time,
            wd.day_of_week,
            wd.sort_order AS day_sort_order,
            wd.label AS day_label
        FROM slots s
        JOIN working_days wd ON wd.id = s.working_day_id
        WHERE wd.period_structure_id = %s
        ORDER BY wd.sort_order, s.sort_order
    """, (period_structure_id,))

    # Group all slots (periods + breaks) by working_day_id, in sort_order
    all_slots_by_day: dict[str, list[dict]] = {}
    for row in cur.fetchall():
        wd_id = row["working_day_id"]
        all_slots_by_day.setdefault(wd_id, []).append(row)

    # Walk each day in working-day order, populate period_slots / slots_by_day
    # for PERIOD-only chromosome encoding, and mark each period whose
    # immediately-previous slot was a break.
    sorted_day_keys = sorted(
        all_slots_by_day.keys(),
        key=lambda wid: all_slots_by_day[wid][0]["day_sort_order"],
    )
    day_idx = 0
    for wd_id in sorted_day_keys:
        rows = all_slots_by_day[wd_id]
        period_idx = 0
        prev_was_break = False
        for row in rows:
            if row["slot_type"] != "PERIOD":
                # Non-period slot — mark that the next period (if any) is
                # "after a break" and skip encoding it into the chromosome.
                prev_was_break = True
                continue

            slot = SlotInfo(
                id=row["slot_id"],
                working_day_id=row["working_day_id"],
                slot_type=row["slot_type"],
                slot_number=row["slot_number"],
                sort_order=row["sort_order"],
                day_of_week=row["day_of_week"],
                day_label=row["day_label"],
                start_time=str(row["start_time"]),
                end_time=str(row["end_time"]),
            )
            data.period_slots.append(slot)

            if wd_id not in data.slots_by_day:
                data.slots_by_day[wd_id] = []
                data.working_day_ids.append(wd_id)
                data.day_map[slot.day_of_week] = wd_id
            data.slots_by_day[wd_id].append(slot)

            if prev_was_break and period_idx > 0:
                # period_idx > 0 ensures we don't mark the very first period
                # of the day (no "previous period" to be non-adjacent to)
                data.period_after_break.add((day_idx, period_idx))
            period_idx += 1
            prev_was_break = False
        day_idx += 1


def _load_assignments(cur, data: SchoolData) -> None:
    """Load division assignments (subject-teacher pairs with weightage).

    LEFT JOIN teachers so that null-teacher ("unassigned") assignments still
    get scheduled — the GA fitness skips teacher-conflict checks when
    teacher_id is None.
    """
    cur.execute("""
        SELECT
            da.id,
            da.division_id,
            da.subject_id,
            sub.name AS subject_name,
            da.teacher_id,
            t.name AS teacher_name,
            da.assistant_teacher_id,
            da.weightage,
            da.elective_group_id,
            da.scheduling_preferences
        FROM division_assignments da
        JOIN subjects sub ON sub.id = da.subject_id
        LEFT JOIN teachers t ON t.id = da.teacher_id
        WHERE da.division_id = %s
          AND da.academic_year_id = %s
          AND da.deleted_at IS NULL
        ORDER BY da.weightage DESC
    """, (data.division_id, data.academic_year_id))

    for row in cur.fetchall():
        data.assignments.append(Assignment(
            id=row["id"],
            division_id=row["division_id"],
            subject_id=row["subject_id"],
            subject_name=row["subject_name"],
            teacher_id=row["teacher_id"],
            teacher_name=row["teacher_name"],
            assistant_teacher_id=row["assistant_teacher_id"],
            weightage=row["weightage"],
            elective_group_id=row["elective_group_id"],
            scheduling_preferences=row["scheduling_preferences"],
        ))


def _load_all_division_assignments(cur, data: SchoolData) -> None:
    """Load assignments for ALL divisions in the school/AY (for teacher conflict detection).

    LEFT JOIN teachers so null-teacher rows still appear; the fitness function
    skips them during teacher-conflict checks.
    """
    cur.execute("""
        SELECT
            da.id,
            da.division_id,
            da.subject_id,
            sub.name AS subject_name,
            da.teacher_id,
            t.name AS teacher_name,
            da.assistant_teacher_id,
            da.weightage,
            da.elective_group_id,
            da.scheduling_preferences
        FROM division_assignments da
        JOIN subjects sub ON sub.id = da.subject_id
        LEFT JOIN teachers t ON t.id = da.teacher_id
        WHERE da.school_id = %s
          AND da.academic_year_id = %s
          AND da.deleted_at IS NULL
    """, (data.school_id, data.academic_year_id))

    for row in cur.fetchall():
        div_id = row["division_id"]
        if div_id not in data.all_division_assignments:
            data.all_division_assignments[div_id] = []
        data.all_division_assignments[div_id].append(Assignment(
            id=row["id"],
            division_id=div_id,
            subject_id=row["subject_id"],
            subject_name=row["subject_name"],
            teacher_id=row["teacher_id"],
            teacher_name=row["teacher_name"],
            assistant_teacher_id=row["assistant_teacher_id"],
            weightage=row["weightage"],
            elective_group_id=row["elective_group_id"],
            scheduling_preferences=row["scheduling_preferences"],
        ))


def _load_teachers(cur, data: SchoolData) -> None:
    """Load teacher metadata (id, name, maxPeriodsPerWeek) for the school/AY.

    Used by the fitness function to soft-enforce teacher workload caps.
    """
    cur.execute("""
        SELECT id, name, max_periods_per_week
        FROM teachers
        WHERE school_id = %s
          AND academic_year_id = %s
          AND deleted_at IS NULL
    """, (data.school_id, data.academic_year_id))

    for row in cur.fetchall():
        data.teachers[row["id"]] = TeacherInfo(
            id=row["id"],
            name=row["name"],
            max_periods_per_week=row["max_periods_per_week"],
        )


def _load_existing_teacher_slots(cur, data: SchoolData) -> None:
    """Load teacher slot occupations from OTHER divisions' existing timetables.

    When we generate one division at a time, we must avoid scheduling a
    teacher into a (day, slot) where they are already booked in another
    division's already-generated timetable.

    Different divisions may use DIFFERENT period structures, each with its
    own WorkingDay and Slot IDs. Matching on (working_day_id, slot_id)
    directly would miss cross-structure conflicts. Instead, we load
    (teacher_id, day_of_week, start_time) from other divisions and MAP
    each entry to the CURRENT division's (working_day_id, slot_id)
    coordinates using clock-time + day_of_week matching. The fitness
    function then checks against this remapped set as before.
    """
    cur.execute("""
        SELECT da.teacher_id, wd.day_of_week,
               s.start_time, s.end_time
        FROM timetable_slots ts
        JOIN timetables tt ON tt.id = ts.timetable_id
        JOIN division_assignments da ON da.id = ts.division_assignment_id
        JOIN working_days wd ON wd.id = ts.working_day_id
        JOIN slots s ON s.id = ts.slot_id
        WHERE tt.school_id = %s
          AND tt.academic_year_id = %s
          AND tt.division_id <> %s
          AND da.teacher_id IS NOT NULL
          AND s.slot_type = 'PERIOD'
    """, (data.school_id, data.academic_year_id, data.division_id))

    # Build a lookup from the CURRENT division's period slots:
    # (day_of_week, start_time_str) → (working_day_id, slot_id)
    current_slot_map: dict[tuple[int, str], tuple[str, str]] = {}
    for slot in data.period_slots:
        key = (slot.day_of_week, slot.start_time)
        current_slot_map[key] = (slot.working_day_id, slot.id)

    for row in cur.fetchall():
        teacher_id = row["teacher_id"]
        day_of_week = row["day_of_week"]
        start_time = str(row["start_time"])

        # Map the other division's (day, time) to our slot coordinates
        mapped = current_slot_map.get((day_of_week, start_time))
        if mapped:
            data.existing_teacher_slots.add((teacher_id, mapped[0], mapped[1]))


def _load_teacher_unavailability(cur, data: SchoolData) -> None:
    """Load teacher availability records (slots where teachers are UNavailable).

    Teacher availability may be recorded against ANY period structure's slots
    (e.g. "Senior Block" or "Default"). We need to map those to the CURRENT
    division's slot coordinates using day_of_week + start_time matching,
    just like _load_existing_teacher_slots does for cross-division conflicts.
    """
    cur.execute("""
        SELECT ta.teacher_id, wd.day_of_week, s.start_time
        FROM teacher_availability ta
        JOIN working_days wd ON wd.id = ta.working_day_id
        JOIN slots s ON s.id = ta.slot_id
        WHERE ta.school_id = %s AND ta.academic_year_id = %s
          AND s.slot_type = 'PERIOD'
    """, (data.school_id, data.academic_year_id))

    # Build lookup from current division's slots
    current_slot_map: dict[tuple[int, str], tuple[str, str]] = {}
    for slot in data.period_slots:
        key = (slot.day_of_week, slot.start_time)
        current_slot_map[key] = (slot.working_day_id, slot.id)

    for row in cur.fetchall():
        teacher_id = row["teacher_id"]
        day_of_week = row["day_of_week"]
        start_time = str(row["start_time"])

        mapped = current_slot_map.get((day_of_week, start_time))
        if mapped:
            data.teacher_unavailable.add((teacher_id, mapped[0], mapped[1]))


def _merge_elective_prefs(members: list[Assignment]) -> Optional[dict]:
    """Merge scheduling preferences across elective group members.

    All members share the same time slots, so we combine their preferences
    into the most restrictive superset:
      - constraintType: HARD if ANY member is HARD
      - preferredDays: intersection (days ALL members prefer)
      - excludedDays: union (days ANY member excludes)
      - preferAdjacentPeriods: True if ANY member wants it
      - preferredPeriodRange: tightest (max of mins, min of maxes)
      - excludedPeriodRange: widest (min of mins, max of maxes)
      - minPeriodsPerDay: max across members
      - maxPeriodsPerDay: min across members
    """
    all_prefs = [m.scheduling_preferences for m in members if m.scheduling_preferences]
    if not all_prefs:
        return None

    merged: dict = {}

    # constraintType: HARD wins
    merged["constraintType"] = "HARD" if any(
        p.get("constraintType") == "HARD" for p in all_prefs
    ) else all_prefs[0].get("constraintType", "SOFT")

    # preferredDays: intersection
    pref_days_sets = [set(p["preferredDays"]) for p in all_prefs if p.get("preferredDays")]
    if pref_days_sets:
        merged["preferredDays"] = sorted(set.intersection(*pref_days_sets))

    # excludedDays: union
    excl_days = set()
    for p in all_prefs:
        excl_days.update(p.get("excludedDays") or [])
    if excl_days:
        merged["excludedDays"] = sorted(excl_days)

    # preferAdjacentPeriods: True if any
    if any(p.get("preferAdjacentPeriods") for p in all_prefs):
        merged["preferAdjacentPeriods"] = True

    # preferredPeriodRange: tightest
    pref_ranges = [p["preferredPeriodRange"] for p in all_prefs if p.get("preferredPeriodRange")]
    if pref_ranges:
        merged["preferredPeriodRange"] = {
            "min": max(r["min"] for r in pref_ranges),
            "max": min(r["max"] for r in pref_ranges),
        }

    # excludedPeriodRange: widest
    excl_ranges = [p["excludedPeriodRange"] for p in all_prefs if p.get("excludedPeriodRange")]
    if excl_ranges:
        merged["excludedPeriodRange"] = {
            "min": min(r["min"] for r in excl_ranges),
            "max": max(r["max"] for r in excl_ranges),
        }

    # minPeriodsPerDay: max
    mins = [p["minPeriodsPerDay"] for p in all_prefs if p.get("minPeriodsPerDay") is not None]
    if mins:
        merged["minPeriodsPerDay"] = max(mins)

    # maxPeriodsPerDay: min
    maxes = [p["maxPeriodsPerDay"] for p in all_prefs if p.get("maxPeriodsPerDay") is not None]
    if maxes:
        merged["maxPeriodsPerDay"] = min(maxes)

    return merged if len(merged) > 1 else None  # >1 because constraintType is always set


def _build_logical_assignments(data: SchoolData) -> None:
    """Collapse raw Assignments into LogicalAssignments.

    Each non-elective Assignment becomes its own LogicalAssignment with
    weightage carried through.

    All Assignments belonging to the same elective_group_id collapse into
    a SINGLE LogicalAssignment whose weightage is `ElectiveGroup.periods_per_week`
    (NOT the sum of member weightages — every member shares the same N slots).

    Member ordering inside an elective LogicalAssignment is alphabetical by
    subject then teacher so the resulting cell rendering is stable across runs.
    """
    by_group: dict[str, list[Assignment]] = {}
    standalone: list[Assignment] = []

    for a in data.assignments:
        if a.elective_group_id:
            by_group.setdefault(a.elective_group_id, []).append(a)
        else:
            standalone.append(a)

    logical: list[LogicalAssignment] = []

    for a in standalone:
        logical.append(LogicalAssignment(
            members=[a],
            weightage=a.weightage,
            elective_group_id=None,
            elective_group_name=None,
            scheduling_preferences=a.scheduling_preferences,
        ))

    for eg_id, members in by_group.items():
        eg = data.elective_groups.get(eg_id)
        if eg is None or eg.periods_per_week <= 0:
            # Group metadata missing or zero — fall back to treating each
            # member as its own logical assignment so we don't drop them.
            for m in members:
                logical.append(LogicalAssignment(
                    members=[m],
                    weightage=m.weightage,
                    elective_group_id=None,
                    elective_group_name=None,
                    scheduling_preferences=m.scheduling_preferences,
                ))
            continue

        # Sort members deterministically: subject name, then teacher name.
        members_sorted = sorted(
            members,
            key=lambda m: (m.subject_name or '', m.teacher_name or ''),
        )

        # Merge preferences across all members. For an elective group, all
        # members share the same slots, so we take the MOST RESTRICTIVE
        # combination: intersection of preferredDays, union of excludedDays,
        # tightest preferredPeriodRange, widest excludedPeriodRange.
        prefs = _merge_elective_prefs(members_sorted)

        # Build subject → (teacher_ids, parallel_sections) map for scheduling.
        # This tells the scheduler how many teachers per subject need to be
        # free simultaneously (parallel_sections), rather than requiring ALL.
        # Only PRIMARY teachers go in the map — assistant teachers are checked
        # separately via teacher_ids (which includes both primary + assistant).
        stm: dict[str, tuple[list[str], int]] = {}
        for m in members_sorted:
            if m.teacher_id is None:
                continue
            sid = m.subject_id
            if sid not in stm:
                ps = eg.subject_parallel_sections.get(sid, 1)
                stm[sid] = ([], ps)
            if m.teacher_id not in stm[sid][0]:
                stm[sid][0].append(m.teacher_id)

        logical.append(LogicalAssignment(
            members=members_sorted,
            weightage=eg.periods_per_week,
            elective_group_id=eg.id,
            elective_group_name=eg.name,
            scheduling_preferences=prefs,
            subject_teacher_map=stm,
        ))

    data.logical_assignments = logical


def _load_elective_groups(cur, data: SchoolData) -> None:
    """Load elective groups and their cross-division assignment mappings."""
    # Find elective groups referenced by this division's assignments
    elective_ids = {
        a.elective_group_id for a in data.assignments if a.elective_group_id
    }
    if not elective_ids:
        return

    placeholders = ",".join(["%s"] * len(elective_ids))
    cur.execute(f"""
        SELECT eg.id, eg.name, eg.periods_per_week
        FROM elective_groups eg
        WHERE eg.id IN ({placeholders})
          AND eg.deleted_at IS NULL
    """, tuple(elective_ids))

    for row in cur.fetchall():
        eg = ElectiveGroupInfo(
            id=row["id"],
            name=row["name"],
            periods_per_week=row["periods_per_week"] or 0,
        )
        data.elective_groups[eg.id] = eg

    # Load subjects per elective group (including parallel_sections)
    cur.execute(f"""
        SELECT elective_group_id, subject_id, parallel_sections
        FROM elective_group_subjects
        WHERE elective_group_id IN ({placeholders})
    """, tuple(elective_ids))
    for row in cur.fetchall():
        eg_id = row["elective_group_id"]
        if eg_id in data.elective_groups:
            data.elective_groups[eg_id].subject_ids.append(row["subject_id"])
            data.elective_groups[eg_id].subject_parallel_sections[row["subject_id"]] = row["parallel_sections"] or 1

    # Load all assignments across divisions that reference these elective groups
    cur.execute(f"""
        SELECT
            da.id, da.division_id, da.subject_id, sub.name AS subject_name,
            da.teacher_id, t.name AS teacher_name,
            da.assistant_teacher_id, da.weightage, da.elective_group_id,
            da.scheduling_preferences
        FROM division_assignments da
        JOIN subjects sub ON sub.id = da.subject_id
        LEFT JOIN teachers t ON t.id = da.teacher_id
        WHERE da.elective_group_id IN ({placeholders})
          AND da.academic_year_id = %s
          AND da.deleted_at IS NULL
    """, (*elective_ids, data.academic_year_id))

    for row in cur.fetchall():
        eg_id = row["elective_group_id"]
        if eg_id in data.elective_groups:
            a = Assignment(
                id=row["id"],
                division_id=row["division_id"],
                subject_id=row["subject_id"],
                subject_name=row["subject_name"],
                teacher_id=row["teacher_id"],
                teacher_name=row["teacher_name"],
                assistant_teacher_id=row["assistant_teacher_id"],
                weightage=row["weightage"],
                elective_group_id=eg_id,
                scheduling_preferences=row["scheduling_preferences"],
            )
            data.elective_groups[eg_id].division_assignments[row["division_id"]] = a
