-- Allow multiple division_assignments to share the same (timetable, working_day, slot)
-- so that elective groups with parallel sections (e.g. Class IX Mal/Hindi with
-- 2 Mal teachers + 1 Hindi teacher) can place all 3 assignments in the same cell.
ALTER TABLE "timetable_slots"
  DROP CONSTRAINT IF EXISTS "timetable_slots_timetable_id_working_day_id_slot_id_key";

-- Prisma's original unique created both a constraint AND a backing unique
-- index with the same name. DROP CONSTRAINT only removes the former; we
-- must drop the index explicitly to remove the uniqueness enforcement.
DROP INDEX IF EXISTS "timetable_slots_timetable_id_working_day_id_slot_id_key";

-- Replace the dropped unique with a regular index for the same query patterns.
CREATE INDEX IF NOT EXISTS "timetable_slots_timetable_id_working_day_id_slot_id_idx"
  ON "timetable_slots" ("timetable_id", "working_day_id", "slot_id");
