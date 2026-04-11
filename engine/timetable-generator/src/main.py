"""
Main entry point for the timetable generation engine.

Usage:
    python -m src.main \
        --job-id <JOB_ID> \
        --school-id <SCHOOL_ID> \
        --division-id <DIVISION_ID> \
        --academic-year-id <AY_ID> \
        [--adjacency-constraint]

Environment:
    DATABASE_URL — PostgreSQL connection string
    WS_ENDPOINT  — WebSocket service URL for progress updates
    GA_*         — GA hyperparameters (see engine.py)
"""

from __future__ import annotations

import argparse
import logging
import sys

from dotenv import load_dotenv

load_dotenv()  # Load .env from project root if present

from .data_loader import load_school_data
from .ga.engine import run_ga
from .output_writer import mark_job_running, mark_job_failed, write_timetable
from . import ws_pusher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("timetable-engine")


def main() -> None:
    parser = argparse.ArgumentParser(description="Timetable Generation Engine")
    parser.add_argument("--job-id", required=True, help="GenerationJob UUID")
    parser.add_argument("--school-id", required=True, help="School UUID")
    parser.add_argument("--division-id", required=True, help="Division UUID")
    parser.add_argument("--academic-year-id", required=True, help="AcademicYear UUID")
    parser.add_argument(
        "--adjacency-constraint", action="store_true", default=False,
        help="Enable adjacency constraint (avoid consecutive same-subject)",
    )
    args = parser.parse_args()

    job_id = args.job_id
    school_id = args.school_id
    division_id = args.division_id
    academic_year_id = args.academic_year_id

    logger.info(
        "Starting timetable generation: job=%s school=%s division=%s ay=%s",
        job_id, school_id, division_id, academic_year_id,
    )

    try:
        # ── Mark job as RUNNING ────────────────────────────────────────────
        mark_job_running(job_id)

        # ── Load data ─────────────────────────────────────────────────────
        logger.info("Loading school data... (adjacency=%s)", args.adjacency_constraint)
        data = load_school_data(
            school_id,
            academic_year_id,
            division_id,
            adjacency_constraint_enabled=args.adjacency_constraint,
        )
        logger.info(
            "Loaded: %d assignments, %d days, %d periods/day, %d total periods",
            len(data.assignments),
            data.num_days,
            data.periods_per_day,
            data.total_periods,
        )

        if not data.assignments:
            raise ValueError("No division assignments found — cannot generate timetable")

        if data.total_periods == 0:
            raise ValueError("No period slots found — check period structure configuration")

        # ── Run GA ─────────────────────────────────────────────────────────
        def on_progress(generation: int, best_fitness: float, avg_fitness: float):
            logger.info(
                "Gen %d: best=%.2f avg=%.2f", generation, best_fitness, avg_fitness,
            )
            ws_pusher.push_progress(
                school_id, division_id, job_id,
                generation, best_fitness, avg_fitness,
            )

        logger.info("Running genetic algorithm...")
        result = run_ga(data, on_progress=on_progress)

        logger.info(
            "GA finished: %d generations, fitness=%.2f, converged=%s, elapsed=%.1fs",
            result.generations_run,
            result.best_fitness,
            result.converged,
            result.elapsed_seconds,
        )

        # ── Write output ──────────────────────────────────────────────────
        logger.info("Writing timetable to database...")
        timetable_id = write_timetable(
            data,
            result.best_chromosome,
            job_id,
            args.adjacency_constraint,
        )
        logger.info("Timetable written: %s", timetable_id)

        # ── Notify completion ─────────────────────────────────────────────
        ws_pusher.push_completed(
            school_id, division_id, job_id, timetable_id,
            result.generations_run, result.elapsed_seconds, result.best_fitness,
        )

        logger.info("Generation complete!")

    except Exception as e:
        logger.error("Generation failed: %s", e, exc_info=True)
        mark_job_failed(job_id, str(e))
        ws_pusher.push_failed(school_id, division_id, job_id, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
