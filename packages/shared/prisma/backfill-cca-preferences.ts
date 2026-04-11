/**
 * Backfill: apply a fixed scheduling_preferences JSONB to every active
 * DivisionAssignment whose subject is "Co-Curricular Activities".
 *
 * Default preferences (matches the user's CCA-on-Thursday-late-periods rule):
 *   constraintType:       HARD
 *   preferredDays:        [3]              (Thursday)
 *   excludedDays:         [0,1,2,4,5,6]    (Mon, Tue, Wed, Fri, Sat, Sun)
 *   preferredPeriodRange: { min: 7, max: 8 }
 *   excludedPeriodRange:  { min: 1, max: 6 }
 *
 * Safe to re-run: it overwrites whatever scheduling_preferences are already
 * stored on those rows.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx packages/shared/prisma/backfill-cca-preferences.ts
 *
 * Optional environment overrides:
 *   SUBJECT_NAME    — exact subject name (default: "Co-Curricular Activities")
 *   SCHOOL_NAME     — limit to one school by name; default = all schools
 *   DRY_RUN=1       — print what would change without writing
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUBJECT_NAME = process.env.SUBJECT_NAME ?? 'Co-Curricular Activities';
const SCHOOL_NAME = process.env.SCHOOL_NAME?.trim() || null;
const DRY_RUN = process.env.DRY_RUN === '1';

const PREFERENCES = {
  constraintType: 'HARD' as const,
  preferredDays: [3],
  excludedDays: [0, 1, 2, 4, 5, 6],
  preferredPeriodRange: { min: 7, max: 8 },
  excludedPeriodRange: { min: 1, max: 6 },
};

async function main() {
  console.log(`🔍 Looking for active "${SUBJECT_NAME}" assignments...`);
  if (SCHOOL_NAME) console.log(`   Limited to school: ${SCHOOL_NAME}`);
  if (DRY_RUN) console.log('   DRY RUN — no writes');

  const assignments = await prisma.divisionAssignment.findMany({
    where: {
      deletedAt: null,
      subject: { name: SUBJECT_NAME, deletedAt: null },
      ...(SCHOOL_NAME
        ? { school: { name: SCHOOL_NAME } }
        : {}),
    },
    select: {
      id: true,
      schoolId: true,
      school: { select: { name: true } },
      division: {
        select: {
          label: true,
          class: { select: { name: true } },
        },
      },
    },
    orderBy: [
      { school: { name: 'asc' } },
      { division: { class: { name: 'asc' } } },
      { division: { label: 'asc' } },
    ],
  });

  console.log(`  Found ${assignments.length} assignment(s)`);
  if (assignments.length === 0) {
    return;
  }

  for (const a of assignments) {
    const className = a.division.class.name;
    const divLabel = a.division.label;
    console.log(`  · ${a.school.name} — ${className} ${divLabel}  (${a.id})`);
  }

  if (DRY_RUN) {
    console.log('\n🛑 DRY_RUN=1 — exiting without writes');
    return;
  }

  const result = await prisma.divisionAssignment.updateMany({
    where: { id: { in: assignments.map((a) => a.id) } },
    data: { schedulingPreferences: PREFERENCES },
  });

  console.log(`\n✅ Updated ${result.count} assignment(s) with CCA preferences`);
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
