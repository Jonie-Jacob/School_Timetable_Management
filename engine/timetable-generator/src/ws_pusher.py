"""
WebSocket push notifier — sends progress and completion updates
to connected clients via the WebSocket service.

In production: could use DynamoDB + API Gateway Management API directly.
In local dev: sends HTTP requests to the WebSocket service's broadcast endpoint.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

# Empty-string WS_ENDPOINT (the prod default) disables broadcasting entirely.
# The engine must never crash just because WebSocket progress updates can't
# reach a listener.
WS_ENDPOINT = os.getenv("WS_ENDPOINT", "").strip()


def push_progress(
    school_id: str,
    division_id: str,
    job_id: str,
    generation: int,
    best_fitness: float,
    avg_fitness: float,
) -> None:
    """Send a generation progress update."""
    _send_broadcast(school_id, {
        "type": "generation_progress",
        "payload": {
            "jobId": job_id,
            "divisionId": division_id,
            "generation": generation,
            "bestFitness": round(best_fitness, 2),
            "avgFitness": round(avg_fitness, 2),
        },
    })


def push_completed(
    school_id: str,
    division_id: str,
    job_id: str,
    timetable_id: str,
    generations_run: int,
    elapsed_seconds: float,
    best_fitness: float,
) -> None:
    """Send a generation-completed notification."""
    _send_broadcast(school_id, {
        "type": "generation_completed",
        "payload": {
            "jobId": job_id,
            "divisionId": division_id,
            "timetableId": timetable_id,
            "generationsRun": generations_run,
            "elapsedSeconds": round(elapsed_seconds, 2),
            "bestFitness": round(best_fitness, 2),
        },
    })


def push_failed(
    school_id: str,
    division_id: str,
    job_id: str,
    error_message: str,
) -> None:
    """Send a generation-failed notification."""
    _send_broadcast(school_id, {
        "type": "generation_failed",
        "payload": {
            "jobId": job_id,
            "divisionId": division_id,
            "error": error_message,
        },
    })


def push_phase(
    school_id: str,
    phase: str,
    message: str,
    total_divisions: int,
    completed_divisions: int = 0,
) -> None:
    """Send a major phase transition event."""
    _send_broadcast(school_id, {
        "type": "generation_phase",
        "payload": {
            "phase": phase,
            "message": message,
            "totalDivisions": total_divisions,
            "completedDivisions": completed_divisions,
        },
    })


def push_step(
    school_id: str,
    phase: str,
    total_assignments: int,
    placed_assignments: int,
    placed_successfully: int,
    placed_with_conflict: int,
    current_assignment: str,
    flexibility: float,
) -> None:
    """Send granular progress within a phase."""
    _send_broadcast(school_id, {
        "type": "generation_step",
        "payload": {
            "phase": phase,
            "totalAssignments": total_assignments,
            "placedAssignments": placed_assignments,
            "placedSuccessfully": placed_successfully,
            "placedWithConflict": placed_with_conflict,
            "currentAssignment": current_assignment,
            "flexibility": round(flexibility, 1),
        },
    })


def push_division_progress(
    school_id: str,
    division_id: str,
    division_label: str,
    generation: int,
    max_generations: int,
    best_fitness: float,
    hard_violations: int,
    status: str,
) -> None:
    """Send per-division GA optimization progress."""
    _send_broadcast(school_id, {
        "type": "division_progress",
        "payload": {
            "divisionId": division_id,
            "divisionLabel": division_label,
            "phase": "ga_optimization",
            "generation": generation,
            "maxGenerations": max_generations,
            "bestFitness": round(best_fitness, 2),
            "hardViolations": hard_violations,
            "status": status,
        },
    })


def push_division_completed(
    school_id: str,
    division_id: str,
    division_label: str,
    completed_index: int,
    total_divisions: int,
    generations_run: int,
    elapsed: float,
    timetable_id: str,
    violations: list[dict],
) -> None:
    """Send per-division completion with violation details."""
    _send_broadcast(school_id, {
        "type": "division_completed",
        "payload": {
            "divisionId": division_id,
            "divisionLabel": division_label,
            "completedIndex": completed_index,
            "totalDivisions": total_divisions,
            "generationsRun": generations_run,
            "elapsed": round(elapsed, 2),
            "hardViolations": len([v for v in violations if v.get("severity") == "hard"]),
            "timetableId": timetable_id,
            "violations": violations,
        },
    })


def push_summary(
    school_id: str,
    total_divisions: int,
    total_elapsed: float,
    division_results: list[dict],
    failure_analyses: list[dict] | None = None,
) -> None:
    """Send final generation summary."""
    perfect = sum(1 for d in division_results if not d.get("violations"))
    with_violations = [d for d in division_results if d.get("violations")]
    _send_broadcast(school_id, {
        "type": "generation_summary",
        "payload": {
            "totalDivisions": total_divisions,
            "completedDivisions": len(division_results),
            "totalElapsed": round(total_elapsed, 2),
            "perfectDivisions": perfect,
            "divisionsWithViolations": len(with_violations),
            "allViolations": with_violations,
            "failureAnalysis": failure_analyses or [],
        },
    })


def _send_broadcast(school_id: str, message: dict) -> None:
    """Send a broadcast message via the WebSocket service REST endpoint.

    Fully best-effort: any error (missing endpoint, unreachable host, bad
    URL, network timeout, JSON error) is swallowed with a warning so the
    engine's generation pipeline keeps running. Timetable correctness must
    never depend on a WebSocket broadcast succeeding.
    """
    if not WS_ENDPOINT:
        return  # Broadcasting disabled

    try:
        url = f"{WS_ENDPOINT.rstrip('/')}/ws/broadcast"
        if not (url.startswith("http://") or url.startswith("https://")):
            logger.warning("WS broadcast skipped: WS_ENDPOINT must start with http(s)://")
            return

        body = json.dumps({
            "schoolId": school_id,
            **message,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-user-id": "engine",
                "x-school-id": school_id,
                "x-user-role": "system",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            logger.debug("WS broadcast sent: %s (status %d)", message.get("type"), resp.status)
    except Exception as e:  # noqa: BLE001 — intentionally broad
        logger.warning("WS broadcast failed: %s", e)
