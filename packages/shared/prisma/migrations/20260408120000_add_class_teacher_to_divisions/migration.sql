-- AlterTable
ALTER TABLE "divisions" ADD COLUMN "class_teacher_id" TEXT;

-- CreateIndex
CREATE INDEX "divisions_class_teacher_id_idx" ON "divisions"("class_teacher_id");

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_class_teacher_id_fkey" FOREIGN KEY ("class_teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateView: unassigned_teacher_subjects
CREATE OR REPLACE VIEW "unassigned_teacher_subjects" AS
SELECT
  ts.id as teacher_subject_id,
  ts.school_id,
  ts.teacher_id,
  ts.subject_id,
  t.name as teacher_name,
  t.academic_year_id,
  s.name as subject_name
FROM teacher_subjects ts
JOIN teachers t ON ts.teacher_id = t.id AND t.deleted_at IS NULL
JOIN subjects s ON ts.subject_id = s.id AND s.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM division_assignments da
  WHERE da.teacher_id = ts.teacher_id
  AND da.subject_id = ts.subject_id
  AND da.deleted_at IS NULL
);
