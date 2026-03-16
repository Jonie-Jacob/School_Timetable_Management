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


@dataclass
class Assignment:
    id: str
    division_id: str
    subject_id: str
    subject_name: str
    teacher_id: str
    teacher_name: str
    assistant_teacher_id: Optional[str]
    weightage: int
    elective_group_id: Optional[str]


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
    subject_ids: list[str] = field(default_factory=list)
    # division_id → assignment mapping for divisions that have this elective
    division_assignments: dict[str, Assignment] = field(default_factory=dict)


@dataclass
class SchoolData:
    """All data needed for timetable generation for a single division."""
    school_id: str
    academic_year_id: str
    division_id: str

    # Period slots only (no intervals/lunch), ordered by day then sort_order
    period_slots: list[SlotInfo] = field(default_factory=list)
    # All slots grouped by working_day_id
    slots_by_day: dict[str, list[SlotInfo]] = field(default_factory=dict)
    # Unique working day ids in order
    working_day_ids: list[str] = field(default_factory=list)
    # day_of_week → working_day_id
    day_map: dict[int, str] = field(default_factory=dict)

    # Assignments for this division
    assignments: list[Assignment] = field(default_factory=list)

    # Teacher unavailability set: (teacher_id, working_day_id, slot_id)
    teacher_unavailable: set[tuple[str, str, str]] = field(default_factory=set)

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
) -> SchoolData:
    """Load all data for timetable generation from the database."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            data = SchoolData(
                school_id=school_id,
                academic_year_id=academic_year_id,
                division_id=division_id,
                batch_division_ids=batch_division_ids or [division_id],
            )

            _load_period_slots(cur, data)
            _load_assignments(cur, data)
            _load_all_division_assignments(cur, data)
            _load_teacher_unavailability(cur, data)
            _load_elective_groups(cur, data)

            return data
    finally:
        conn.close()


def _load_period_slots(cur, data: SchoolData) -> None:
    """Load period slots (excluding intervals/lunch) for the division's period structure."""
    # Find the period structure for this division's class
    cur.execute("""
        SELECT psc.period_structure_id
        FROM period_structure_classes psc
        JOIN divisions d ON d.class_id = psc.class_id
        WHERE d.id = %s
    """, (data.division_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"No period structure found for division {data.division_id}")
    period_structure_id = row["period_structure_id"]

    # Load working days + period-type slots
    cur.execute("""
        SELECT
            s.id AS slot_id,
            s.working_day_id,
            s.slot_type,
            s.slot_number,
            s.sort_order,
            wd.day_of_week,
            wd.label AS day_label
        FROM slots s
        JOIN working_days wd ON wd.id = s.working_day_id
        WHERE wd.period_structure_id = %s
          AND s.slot_type = 'PERIOD'
        ORDER BY wd.sort_order, s.sort_order
    """, (period_structure_id,))

    for row in cur.fetchall():
        slot = SlotInfo(
            id=row["slot_id"],
            working_day_id=row["working_day_id"],
            slot_type=row["slot_type"],
            slot_number=row["slot_number"],
            sort_order=row["sort_order"],
            day_of_week=row["day_of_week"],
            day_label=row["day_label"],
        )
        data.period_slots.append(slot)

        wd_id = slot.working_day_id
        if wd_id not in data.slots_by_day:
            data.slots_by_day[wd_id] = []
            data.working_day_ids.append(wd_id)
            data.day_map[slot.day_of_week] = wd_id
        data.slots_by_day[wd_id].append(slot)


def _load_assignments(cur, data: SchoolData) -> None:
    """Load division assignments (subject-teacher pairs with weightage)."""
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
            da.elective_group_id
        FROM division_assignments da
        JOIN subjects sub ON sub.id = da.subject_id
        JOIN teachers t ON t.id = da.teacher_id
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
        ))


def _load_all_division_assignments(cur, data: SchoolData) -> None:
    """Load assignments for ALL divisions in the school/AY (for teacher conflict detection)."""
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
            da.elective_group_id
        FROM division_assignments da
        JOIN subjects sub ON sub.id = da.subject_id
        JOIN teachers t ON t.id = da.teacher_id
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
        ))


def _load_teacher_unavailability(cur, data: SchoolData) -> None:
    """Load teacher availability records (slots where teachers are UNavailable)."""
    cur.execute("""
        SELECT teacher_id, working_day_id, slot_id
        FROM teacher_availability
        WHERE school_id = %s AND academic_year_id = %s
    """, (data.school_id, data.academic_year_id))

    for row in cur.fetchall():
        data.teacher_unavailable.add((
            row["teacher_id"],
            row["working_day_id"],
            row["slot_id"],
        ))


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
        SELECT eg.id, eg.name
        FROM elective_groups eg
        WHERE eg.id IN ({placeholders})
          AND eg.deleted_at IS NULL
    """, tuple(elective_ids))

    for row in cur.fetchall():
        eg = ElectiveGroupInfo(id=row["id"], name=row["name"])
        data.elective_groups[eg.id] = eg

    # Load subjects per elective group
    cur.execute(f"""
        SELECT elective_group_id, subject_id
        FROM elective_group_subjects
        WHERE elective_group_id IN ({placeholders})
    """, tuple(elective_ids))
    for row in cur.fetchall():
        eg_id = row["elective_group_id"]
        if eg_id in data.elective_groups:
            data.elective_groups[eg_id].subject_ids.append(row["subject_id"])

    # Load all assignments across divisions that reference these elective groups
    cur.execute(f"""
        SELECT
            da.id, da.division_id, da.subject_id, sub.name AS subject_name,
            da.teacher_id, t.name AS teacher_name,
            da.assistant_teacher_id, da.weightage, da.elective_group_id
        FROM division_assignments da
        JOIN subjects sub ON sub.id = da.subject_id
        JOIN teachers t ON t.id = da.teacher_id
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
            )
            data.elective_groups[eg_id].division_assignments[row["division_id"]] = a
