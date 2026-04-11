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
