-- Add periods_per_week to elective_groups
ALTER TABLE "elective_groups" ADD COLUMN "periods_per_week" INTEGER NOT NULL DEFAULT 0;

-- Add parallel_sections to elective_group_subjects
ALTER TABLE "elective_group_subjects" ADD COLUMN "parallel_sections" INTEGER NOT NULL DEFAULT 1;

-- Backfill periods_per_week for existing groups:
-- Use MAX(weightage) across assignments in the group (matches current frontend logic).
UPDATE "elective_groups" eg
SET "periods_per_week" = COALESCE(
  (SELECT MAX(da."weightage")
   FROM "division_assignments" da
   WHERE da."elective_group_id" = eg."id" AND da."deleted_at" IS NULL),
  0
);

-- Backfill parallel_sections for existing subjects:
-- For each (group, subject), find a representative division and compute
-- sections = ROUND(SUM(weightage for that subject in that division) / periods_per_week)
-- Fall back to 1 if computation yields 0 or periods_per_week is 0.
WITH section_calc AS (
  SELECT
    egs."id" AS egs_id,
    GREATEST(1,
      COALESCE(
        ROUND(
          CAST(
            (SELECT SUM(da."weightage")
             FROM "division_assignments" da
             WHERE da."elective_group_id" = egs."elective_group_id"
               AND da."subject_id" = egs."subject_id"
               AND da."deleted_at" IS NULL
               AND da."division_id" = (
                 SELECT da2."division_id"
                 FROM "division_assignments" da2
                 WHERE da2."elective_group_id" = egs."elective_group_id"
                   AND da2."subject_id" = egs."subject_id"
                   AND da2."deleted_at" IS NULL
                 LIMIT 1
               ))
            AS NUMERIC
          )
          / NULLIF(
            (SELECT eg."periods_per_week"
             FROM "elective_groups" eg
             WHERE eg."id" = egs."elective_group_id"),
            0
          )
        )::INTEGER,
        1
      )
    ) AS sections
  FROM "elective_group_subjects" egs
)
UPDATE "elective_group_subjects" egs
SET "parallel_sections" = sc.sections
FROM section_calc sc
WHERE egs."id" = sc.egs_id;
