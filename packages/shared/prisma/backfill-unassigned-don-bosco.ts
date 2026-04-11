/**
 * Backfill: insert DivisionAssignment rows with teacherId=null for every
 * Don Bosco subject that the original import script skipped because
 * the teacher was '*unassigned*'.
 *
 * Safe to re-run: skips rows that already exist.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx packages/shared/prisma/backfill-unassigned-don-bosco.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const DON_BOSCO_NAME = 'Don Bosco';

interface UnassignedRow {
  className: string;
  divLabel: string;
  subject: string;
  weightage: number;
}

function parseUnassignedRows(): UnassignedRow[] {
  const importPath = path.join(__dirname, 'import-don-bosco.ts');
  const src = fs.readFileSync(importPath, 'utf8');
  const rows: UnassignedRow[] = [];

  // Match tuple form: ['Class X', 'A', 'Subject', '*unassigned*', N]
  const tupleRe = /\['([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'\*unassigned\*',\s*(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = tupleRe.exec(src)) !== null) {
    rows.push({
      className: m[1],
      divLabel: m[2],
      subject: m[3],
      weightage: Number(m[4]),
    });
  }

  // Note: object-form *unassigned* rows (electives) are skipped here —
  // they belong in elective groups and were patched separately.
  return rows;
}

async function main() {
  console.log('🔍 Parsing unassigned rows from import-don-bosco.ts...');
  const rows = parseUnassignedRows();
  console.log(`  Found ${rows.length} unassigned rows`);

  const school = await prisma.school.findFirst({ where: { name: DON_BOSCO_NAME } });
  if (!school) {
    console.error(`❌ School "${DON_BOSCO_NAME}" not found`);
    process.exit(1);
  }
  console.log(`  School: ${school.name} (${school.id})`);

  const ay = await prisma.academicYear.findFirst({
    where: { schoolId: school.id, status: 'ACTIVE', deletedAt: null },
  });
  if (!ay) {
    console.error('❌ No active academic year for Don Bosco');
    process.exit(1);
  }
  console.log(`  Academic year: ${ay.name} (${ay.id})`);

  // Build subject lookup
  const subjects = await prisma.subject.findMany({
    where: { schoolId: school.id, academicYearId: ay.id, deletedAt: null },
  });
  const subjectMap = new Map(subjects.map((s) => [s.name, s.id]));

  // Build division lookup keyed "Class X-Y"
  const divisions = await prisma.division.findMany({
    where: { schoolId: school.id, academicYearId: ay.id, deletedAt: null },
    include: { class: true },
  });
  const divMap = new Map(divisions.map((d) => [`${d.class.name}-${d.label}`, d.id]));

  let created = 0;
  let skipped = 0;
  let missing = 0;

  for (const r of rows) {
    const subjectId = subjectMap.get(r.subject);
    if (!subjectId) {
      console.warn(`  ⚠ Subject not found: "${r.subject}"`);
      missing++;
      continue;
    }
    const divisionId = divMap.get(`${r.className}-${r.divLabel}`);
    if (!divisionId) {
      console.warn(`  ⚠ Division not found: ${r.className}-${r.divLabel}`);
      missing++;
      continue;
    }

    // Skip if an assignment for this (division, subject, teacher=null, no elective) already exists
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId: school.id,
        academicYearId: ay.id,
        divisionId,
        subjectId,
        teacherId: null,
        electiveGroupId: null,
        deletedAt: null,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.divisionAssignment.create({
      data: {
        schoolId: school.id,
        academicYearId: ay.id,
        divisionId,
        subjectId,
        teacherId: null,
        weightage: r.weightage,
        electiveGroupId: null,
      },
    });
    created++;
  }

  console.log(`\n✅ Backfill complete: ${created} created, ${skipped} already existed, ${missing} missing refs`);
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
