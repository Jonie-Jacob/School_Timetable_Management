"""
Output writer — writes the best chromosome to the database as timetable_slots rows
and updates generation_jobs status.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from .data_loader import SchoolData, DATABASE_URL
from .ga.chromosome import decode_gene


def write_timetable(
    data: SchoolData,
    chromosome: 'numpy.ndarray',
    job_id: str,
    adjacency_constraint_enabled: bool = False,
) -> str:
    """
    Write the GA result to the database.

    1. Upsert a timetable record for (school, division, academic_year).
    2. Delete old timetable_slots for that timetable.
    3. Insert new timetable_slots from the chromosome.
    4. Update generation_jobs status to COMPLETED.

    Returns the timetable ID.
    """
    import numpy  # local import to avoid circular at module level

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)

            # ── Upsert timetable ───────────────────────────────────────────
            timetable_id = _upsert_timetable(
                cur, data, now, adjacency_constraint_enabled,
            )

            # ── Delete old slots ───────────────────────────────────────────
            cur.execute(
                'DELETE FROM timetable_slots WHERE timetable_id = %s',
                (timetable_id,),
            )

            # ── Insert new slots ───────────────────────────────────────────
            _insert_slots(cur, data, chromosome, timetable_id, now)

            # ── Mark job COMPLETED ─────────────────────────────────────────
            cur.execute("""
                UPDATE generation_jobs
                SET status = 'COMPLETED',
                    completed_at = %s,
                    updated_at = %s
                WHERE id = %s
            """, (now, now, job_id))

            conn.commit()
            return timetable_id

    except Exception:
        conn.rollback()
        # Mark job FAILED
        _mark_job_failed(job_id, conn)
        raise
    finally:
        conn.close()


def mark_job_running(job_id: str) -> None:
    """Update generation_jobs status to RUNNING."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)
            cur.execute("""
                UPDATE generation_jobs
                SET status = 'RUNNING',
                    started_at = %s,
                    updated_at = %s
                WHERE id = %s
            """, (now, now, job_id))
            conn.commit()
    finally:
        conn.close()


def mark_job_failed(job_id: str, error_message: str) -> None:
    """Update generation_jobs status to FAILED with error message."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        _mark_job_failed(job_id, conn, error_message)
    finally:
        conn.close()


def _mark_job_failed(
    job_id: str,
    conn,
    error_message: str = "Internal engine error",
) -> None:
    """Internal: mark job as failed."""
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)
            cur.execute("""
                UPDATE generation_jobs
                SET status = 'FAILED',
                    error_message = %s,
                    completed_at = %s,
                    updated_at = %s
                WHERE id = %s
            """, (error_message, now, now, job_id))
            conn.commit()
    except Exception:
        # Best-effort — don't mask the original error
        pass


def _upsert_timetable(
    cur,
    data: SchoolData,
    now: datetime,
    adjacency_constraint_enabled: bool,
) -> str:
    """Find or create a timetable record for the division."""
    cur.execute("""
        SELECT id FROM timetables
        WHERE school_id = %s AND division_id = %s AND academic_year_id = %s
    """, (data.school_id, data.division_id, data.academic_year_id))
    row = cur.fetchone()

    if row:
        timetable_id = row[0]
        cur.execute("""
            UPDATE timetables
            SET status = 'GENERATED',
                adjacency_constraint_enabled = %s,
                generated_at = %s,
                updated_at = %s
            WHERE id = %s
        """, (adjacency_constraint_enabled, now, now, timetable_id))
    else:
        timetable_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO timetables
                (id, school_id, division_id, academic_year_id, status,
                 adjacency_constraint_enabled, generated_at, created_at, updated_at)
            VALUES (%s, %s, %s, %s, 'GENERATED', %s, %s, %s, %s)
        """, (
            timetable_id, data.school_id, data.division_id,
            data.academic_year_id, adjacency_constraint_enabled,
            now, now, now,
        ))

    return timetable_id


def _insert_slots(
    cur,
    data: SchoolData,
    chromosome: 'numpy.ndarray',
    timetable_id: str,
    now: datetime,
) -> None:
    """Insert timetable_slot rows from the chromosome.

    For an ordinary LogicalAssignment we write ONE row per slot.
    For an elective LogicalAssignment we distribute members across slots
    based on parallelSections:
      - Subjects with parallelSections >= num_teachers: all teachers appear
        in every slot (they teach different student groups simultaneously).
      - Subjects with parallelSections < num_teachers: teachers split the
        load — each teacher appears in `weightage` slots out of the total.
    Empty slots get a single row with division_assignment_id = NULL.
    """
    logicals = data.logical_assignments
    rows = []

    # ── First pass: collect slot positions per logical assignment index ──
    # la_slot_positions[la_idx] → list of (wd_id, slot_id) in chromosome order
    la_slot_positions: dict[int, list[tuple[str, str]]] = {}
    empty_positions: list[tuple[str, str]] = []

    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        _, _, wd_id, slot_id = decode_gene(data, gi)

        if a_idx < 0 or a_idx >= len(logicals):
            empty_positions.append((wd_id, slot_id))
        else:
            la_slot_positions.setdefault(a_idx, []).append((wd_id, slot_id))

    # ── Empty slots ──
    for wd_id, slot_id in empty_positions:
        rows.append((
            str(uuid.uuid4()), data.school_id, timetable_id,
            wd_id, slot_id, None, now, now,
        ))

    # ── Filled slots ──
    for a_idx, positions in la_slot_positions.items():
        la = logicals[a_idx]

        if not la.is_elective:
            # Non-elective: one member, write to each slot position
            for wd_id, slot_id in positions:
                for member in la.members:
                    rows.append((
                        str(uuid.uuid4()), data.school_id, timetable_id,
                        wd_id, slot_id, member.id, now, now,
                    ))
        else:
            # Elective: distribute split-teacher assignments
            members_per_slot = _distribute_elective_members(
                data, la, len(positions),
            )
            for (wd_id, slot_id), members in zip(positions, members_per_slot):
                for member in members:
                    rows.append((
                        str(uuid.uuid4()), data.school_id, timetable_id,
                        wd_id, slot_id, member.id, now, now,
                    ))

    # Batch insert
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO timetable_slots
            (id, school_id, timetable_id, working_day_id, slot_id,
             division_assignment_id, created_at, updated_at)
           VALUES %s""",
        rows,
    )


def _distribute_elective_members(
    data: SchoolData,
    la,
    num_slots: int,
) -> list[list]:
    """Determine which member assignments appear in each slot.

    Groups members by subject, then for each subject:
    - If num_teachers ≤ parallelSections → all teachers in every slot
      (they teach different student groups simultaneously, e.g. Mal×2 in
      Mal/Hindi where both Mal teachers are in class at once).
    - If num_teachers > parallelSections → teachers split the load. Each
      teacher is assigned to `teacher.weightage` consecutive slots
      (e.g. Maths in Maths/IP/Psy: Julie gets 4 slots, Amrutha gets 4).
    """
    eg = data.elective_groups.get(la.elective_group_id or '')
    if not eg:
        # Fallback: all members in every slot
        return [list(la.members)] * num_slots

    # Group members by subject_id
    by_subject: dict[str, list] = {}
    for m in la.members:
        by_subject.setdefault(m.subject_id, []).append(m)

    # Build per-slot member lists
    slot_members: list[list] = [[] for _ in range(num_slots)]

    for subject_id, teachers in by_subject.items():
        parallel = eg.subject_parallel_sections.get(subject_id, 1)

        if len(teachers) <= parallel:
            # Parallel sections: all teachers appear in every slot
            for i in range(num_slots):
                slot_members[i].extend(teachers)
        else:
            # Split-teacher: distribute across slots by weightage.
            # Sort deterministically by name so the distribution is stable.
            teachers_sorted = sorted(
                teachers,
                key=lambda t: (t.teacher_name or '', t.id),
            )
            slot_cursor = 0
            for teacher in teachers_sorted:
                count = min(teacher.weightage, num_slots - slot_cursor)
                for i in range(slot_cursor, slot_cursor + count):
                    slot_members[i].append(teacher)
                slot_cursor += count

    return slot_members
