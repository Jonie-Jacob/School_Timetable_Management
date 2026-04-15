"""
Main entry point for the timetable generation engine.

Usage (single division):
    python -m src.main \
        --job-id <JOB_ID> \
        --school-id <SCHOOL_ID> \
        --division-id <DIVISION_ID> \
        --academic-year-id <AY_ID> \
        [--adjacency-constraint]

Usage (batch — whole-school constraint-priority):
    python -m src.main \
        --job-ids <ID1,ID2,...> \
        --school-id <SCHOOL_ID> \
        --division-ids <DIV1,DIV2,...> \
        --academic-year-id <AY_ID> \
        [--adjacency-constraint]

Batch mode uses a two-phase approach:
  Phase 1: Greedy priority placement — all assignments across all divisions
           sorted by constraint tightness, placed most-constrained-first.
  Phase 2: Per-division GA polish — short GA run seeded with the greedy
           result to optimize soft constraints.

Environment:
    DATABASE_URL — PostgreSQL connection string
    WS_ENDPOINT  — WebSocket service URL for progress updates
    GA_*         — GA hyperparameters (see engine.py)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from .data_loader import load_school_data
from .whole_school_loader import load_whole_school_data
from .ga.engine import run_ga
from .ga.greedy import schedule_all
from .ga.fitness import audit_violations
from .output_writer import mark_job_running, mark_job_failed, write_timetable, save_batch_result_summary
from . import ws_pusher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("timetable-engine")


# ── Single-division generation (unchanged) ────────────────────────────────

def generate_single(
    job_id: str,
    school_id: str,
    division_id: str,
    academic_year_id: str,
    adjacency_constraint: bool,
) -> None:
    """Generate a timetable for a single division (legacy path)."""
    logger.info(
        "Starting single-division generation: job=%s division=%s",
        job_id, division_id,
    )
    try:
        mark_job_running(job_id)

        data = load_school_data(
            school_id, academic_year_id, division_id,
            adjacency_constraint_enabled=adjacency_constraint,
        )
        logger.info(
            "Loaded: %d assignments, %d days, %d periods/day, %d total periods",
            len(data.assignments), data.num_days, data.periods_per_day, data.total_periods,
        )

        if not data.assignments:
            raise ValueError("No division assignments found")
        if data.total_periods == 0:
            raise ValueError("No period slots found")

        def on_progress(gen: int, best: float, avg: float):
            logger.info("Gen %d: best=%.2f avg=%.2f", gen, best, avg)
            ws_pusher.push_progress(school_id, division_id, job_id, gen, best, avg)

        result = run_ga(data, on_progress=on_progress)
        logger.info(
            "GA finished: %d gens, fitness=%.2f, converged=%s, elapsed=%.1fs",
            result.generations_run, result.best_fitness, result.converged, result.elapsed_seconds,
        )

        timetable_id = write_timetable(data, result.best_chromosome, job_id, adjacency_constraint)
        logger.info("Timetable written: %s", timetable_id)

        ws_pusher.push_completed(
            school_id, division_id, job_id, timetable_id,
            result.generations_run, result.elapsed_seconds, result.best_fitness,
        )

    except Exception as e:
        logger.error("Generation failed: %s", e, exc_info=True)
        mark_job_failed(job_id, str(e))
        ws_pusher.push_failed(school_id, division_id, job_id, str(e))
        sys.exit(1)


# ── Batch generation (5-step constraint propagation) ─────────────────────

def generate_batch(
    job_ids: list[str],
    school_id: str,
    division_ids: list[str],
    academic_year_id: str,
    adjacency_constraint: bool,
) -> None:
    """Generate timetables for all divisions using constraint propagation."""
    total = len(division_ids)
    batch_start = time.time()

    logger.info("=== BATCH GENERATION: %d divisions ===", total)

    # ── Step 1: Loading ───────────────────────────────────────────────────
    ws_pusher.push_phase(school_id, "loading",
                         f"Loading school data for {total} divisions...", total)

    # Mark all jobs as RUNNING
    for jid in job_ids:
        mark_job_running(jid)

    wsd = load_whole_school_data(
        school_id, academic_year_id, division_ids,
        adjacency_constraint_enabled=adjacency_constraint,
    )

    # Build division label lookup
    div_labels: dict[str, str] = {}
    for div_id in wsd.divisions:
        div_labels[div_id] = div_id[:8]
    _load_division_labels(school_id, academic_year_id, division_ids, div_labels)

    total_assignments = sum(
        sum(la.weightage for la in d.logical_assignments)
        for d in wsd.divisions.values()
    )
    logger.info("Loaded %d divisions, %d total assignment-periods", total, total_assignments)

    # ── Step 2: Constraints + partitioning ────────────────────────────────
    ws_pusher.push_phase(school_id, "sorting",
                         f"Computing constraints & partitioning {total_assignments} assignments...", total)

    shared_teachers = sum(1 for t, parts in wsd.teacher_partitions.items()
                          if len(parts) >= 2)
    logger.info("Teacher partitioning: %d shared teachers", shared_teachers)

    ws_pusher.push_phase(school_id, "teacher_partitioning",
                         f"Partitioned {shared_teachers} shared teachers across divisions", total)

    # ── Steps 3+4: Demand-driven placement + backtracking ────────────────
    ws_pusher.push_phase(school_id, "demand_placement",
                         f"Demand-driven placement ({total_assignments} assignment-periods)...", total)

    def on_placement_progress(placed, total_a, ok, backtracked, fallback, desc, demand):
        ws_pusher.push_step(
            school_id, "demand_placement",
            total_a, placed, ok, backtracked,
            desc, float(demand),
        )

    chromosomes, failure_analyses = schedule_all(wsd, on_progress=on_placement_progress, div_labels=div_labels)

    # ── Step 5 (local optimization) already done inside schedule_all ──────

    # ── Write timetables + audit violations ───────────────────────────────
    ws_pusher.push_phase(school_id, "writing",
                         f"Writing timetables for {total} divisions...", total)

    division_results: list[dict] = []

    for i, div_id in enumerate(division_ids):
        job_id = job_ids[i]
        div_data = wsd.divisions[div_id]
        chromosome = chromosomes.get(div_id)
        label = div_labels.get(div_id, div_id[:8])

        if chromosome is None or not div_data.assignments or div_data.total_periods == 0:
            logger.warning("[%d/%d] %s has no data, skipping", i + 1, total, label)
            mark_job_failed(job_id, "No assignments found for this division")
            continue

        # Write timetable
        timetable_id = write_timetable(
            div_data, chromosome, job_id, adjacency_constraint,
        )

        # Audit violations
        violations = audit_violations(div_data, chromosome)

        # Push division completion
        ws_pusher.push_division_completed(
            school_id, div_id, label,
            i + 1, total, 0, 0.0,
            timetable_id, violations,
        )

        division_results.append({
            "divisionId": div_id,
            "divisionLabel": label,
            "timetableId": timetable_id,
            "violations": violations if violations else None,
        })

    # ── Complete ──────────────────────────────────────────────────────────
    total_elapsed = time.time() - batch_start
    ws_pusher.push_phase(school_id, "complete",
                         f"All {total} timetables generated in {total_elapsed:.0f}s",
                         total, total)

    ws_pusher.push_summary(school_id, total, total_elapsed, division_results, failure_analyses)

    # Persist batch result summary (including failure analyses) on the first job
    # so the frontend can fetch it on page refresh without relying on WebSocket
    if job_ids:
        save_batch_result_summary(job_ids[0], {
            "totalDivisions": total,
            "totalElapsed": round(total_elapsed, 2),
            "placedOk": sum(1 for _ in division_results),
            "failureAnalysis": failure_analyses,
        })

    logger.info("=== BATCH COMPLETE: %d divisions in %.1fs ===", total, total_elapsed)


def _load_division_labels(
    school_id: str,
    academic_year_id: str,
    division_ids: list[str],
    labels: dict[str, str],
) -> None:
    """Load class name + division label from DB for progress messages."""
    import psycopg2
    import psycopg2.extras
    from .data_loader import DATABASE_URL

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            placeholders = ",".join(["%s"] * len(division_ids))
            cur.execute(f"""
                SELECT d.id, d.label, c.name as class_name
                FROM divisions d
                JOIN classes c ON c.id = d.class_id
                WHERE d.id IN ({placeholders})
            """, tuple(division_ids))
            for row in cur.fetchall():
                labels[row["id"]] = f"{row['class_name']} {row['label']}"
    finally:
        conn.close()


# ── CLI entry point ───────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Timetable Generation Engine")
    parser.add_argument("--job-id", help="GenerationJob UUID (single mode)")
    parser.add_argument("--division-id", help="Division UUID (single mode)")
    parser.add_argument("--job-ids", help="Comma-separated GenerationJob UUIDs (batch mode)")
    parser.add_argument("--division-ids", help="Comma-separated Division UUIDs (batch mode)")
    parser.add_argument("--school-id", required=True, help="School UUID")
    parser.add_argument("--academic-year-id", required=True, help="AcademicYear UUID")
    parser.add_argument(
        "--adjacency-constraint", action="store_true", default=False,
        help="Enable adjacency constraint",
    )
    args = parser.parse_args()

    if args.job_ids and args.division_ids:
        # Batch mode
        job_ids = [j.strip() for j in args.job_ids.split(",") if j.strip()]
        division_ids = [d.strip() for d in args.division_ids.split(",") if d.strip()]

        if len(job_ids) != len(division_ids):
            logger.error("job-ids count (%d) != division-ids count (%d)", len(job_ids), len(division_ids))
            sys.exit(1)

        generate_batch(
            job_ids=job_ids,
            school_id=args.school_id,
            division_ids=division_ids,
            academic_year_id=args.academic_year_id,
            adjacency_constraint=args.adjacency_constraint,
        )

    elif args.job_id and args.division_id:
        # Single division mode
        generate_single(
            job_id=args.job_id,
            school_id=args.school_id,
            division_id=args.division_id,
            academic_year_id=args.academic_year_id,
            adjacency_constraint=args.adjacency_constraint,
        )

    else:
        parser.error("Provide --job-id + --division-id (single) or --job-ids + --division-ids (batch)")


if __name__ == "__main__":
    main()
