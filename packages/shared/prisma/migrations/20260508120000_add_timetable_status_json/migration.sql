-- Enhancement 3: Timetable Status Flags Redesign
-- Add JSON status field alongside existing enum status (keep both during transition)

ALTER TABLE timetables ADD COLUMN IF NOT EXISTS status_json JSONB;
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS status_computed_at TIMESTAMP;

-- Backfill: GENERATED → VALID, OUTDATED → empty (needs recompute)
UPDATE timetables SET status_json = '{"statuses":["VALID"],"details":{},"computedAt":"2026-05-08T00:00:00Z"}'::jsonb
  WHERE status = 'GENERATED' AND status_json IS NULL;
UPDATE timetables SET status_json = '{"statuses":[],"details":{},"computedAt":"2026-05-08T00:00:00Z"}'::jsonb
  WHERE status = 'OUTDATED' AND status_json IS NULL;
