-- DropForeignKey (period_structure_classes — already removed from schema)
ALTER TABLE "period_structure_classes" DROP CONSTRAINT IF EXISTS "period_structure_classes_class_id_fkey";
ALTER TABLE "period_structure_classes" DROP CONSTRAINT IF EXISTS "period_structure_classes_period_structure_id_fkey";
ALTER TABLE "period_structure_classes" DROP CONSTRAINT IF EXISTS "period_structure_classes_school_id_fkey";

-- DropTable (period_structure_classes — replaced by divisions.period_structure_id)
DROP TABLE IF EXISTS "period_structure_classes";

-- AlterTable: add period_structure_id to divisions (if not already present)
ALTER TABLE "divisions" ADD COLUMN IF NOT EXISTS "period_structure_id" TEXT;

-- AlterTable: add scheduling_preferences to division_assignments (if not already present)
ALTER TABLE "division_assignments" ADD COLUMN IF NOT EXISTS "scheduling_preferences" JSONB;

-- AlterTable: add max_periods_per_week to teachers (if not already present)
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "max_periods_per_week" INTEGER;

-- CreateTable: setup_wizard_state
CREATE TABLE "setup_wizard_state" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setup_wizard_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setup_wizard_state_school_id_academic_year_id_key" ON "setup_wizard_state"("school_id", "academic_year_id");

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "divisions_period_structure_id_idx" ON "divisions"("period_structure_id");

-- AddForeignKey: divisions.period_structure_id -> period_structures.id
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_period_structure_id_fkey" FOREIGN KEY ("period_structure_id") REFERENCES "period_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: setup_wizard_state.school_id -> schools.id
ALTER TABLE "setup_wizard_state" ADD CONSTRAINT "setup_wizard_state_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: setup_wizard_state.academic_year_id -> academic_years.id
ALTER TABLE "setup_wizard_state" ADD CONSTRAINT "setup_wizard_state_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
