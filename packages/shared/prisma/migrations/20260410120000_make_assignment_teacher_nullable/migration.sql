-- Allow division_assignments.teacher_id to be NULL so a subject can be
-- "scheduled but unassigned" — admin can fill in the teacher later.
ALTER TABLE "division_assignments" ALTER COLUMN "teacher_id" DROP NOT NULL;
