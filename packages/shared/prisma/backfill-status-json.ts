/**
 * Backfill script: Recompute status_json for all existing timetables.
 *
 * Usage:
 *   npx tsx packages/shared/prisma/backfill-status-json.ts
 *
 * This runs recomputeTimetableStatus() on every timetable in the database,
 * replacing any stale status_json values (or null) with freshly computed ones.
 */
import { prisma } from '../src/db/client';
import { recomputeTimetableStatus } from '../src/helpers/timetableStatusHelper';

async function main() {
  const timetables = await prisma.timetable.findMany({
    select: { id: true, divisionId: true },
  });

  console.log(`Found ${timetables.length} timetables to recompute.`);

  let success = 0;
  let failed = 0;

  for (const tt of timetables) {
    try {
      const result = await recomputeTimetableStatus(tt.id);
      success++;
      const statuses = result.statuses.join(', ');
      console.log(`  [${success + failed}/${timetables.length}] ${tt.id} → ${statuses}`);
    } catch (err) {
      failed++;
      console.error(`  [${success + failed}/${timetables.length}] FAILED ${tt.id}:`, err);
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
