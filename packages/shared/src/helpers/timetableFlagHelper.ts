import { prisma } from '../db/client';

type ConflictType =
  | 'TEACHER_CHANGED' | 'TEACHER_DELETED'
  | 'SUBJECT_CHANGED' | 'SUBJECT_DELETED'
  | 'ASSIGNMENT_CHANGED'
  | 'SLOT_CHANGED'
  | 'STRUCTURE_CHANGED'
  | 'AVAILABILITY_CHANGED'
  | 'ELECTIVE_GROUP_CHANGED';

/**
 * Unified timetable flagging helper. Marks timetables as OUTDATED and creates
 * notifications. Optionally backfills empty timetable_slot rows for new period slots.
 *
 * Consolidates:
 * - shared/notificationHelper.ts :: flagAffectedTimetables()
 * - school-config/service.ts :: flagAndBackfillTimetables()
 * - class/service.ts :: inline flagging in executeClassTeacherSwap()
 *
 * Resolution strategies (specify ONE):
 * - entityType + entityId: resolve timetables via assignment/teacher/subject lookups
 * - divisionIds: resolve timetables for specific divisions
 * - periodStructureId: resolve timetables for all divisions using a structure
 * - timetableIds: flag specific timetables directly
 */
export async function flagTimetables(params: {
  schoolId: string;
  academicYearId?: string;
  conflictType: ConflictType;
  changeDescription: string;

  // Resolution strategy -- specify ONE
  entityType?: 'TEACHER' | 'SUBJECT' | 'ASSIGNMENT' | 'AVAILABILITY' | 'ELECTIVE_GROUP';
  entityId?: string;
  isDeleted?: boolean;
  divisionIds?: string[];
  periodStructureId?: string;
  timetableIds?: string[];

  // Optional: backfill empty timetable_slot rows for new period slots
  backfillSlotIds?: string[];
}): Promise<{ affectedCount: number }> {
  const { schoolId, academicYearId, conflictType, changeDescription, backfillSlotIds } = params;

  // ── Step 1: Resolve affected timetable IDs ──
  let affectedTimetableIds: string[] = [];

  if (params.timetableIds?.length) {
    affectedTimetableIds = params.timetableIds;

  } else if (params.divisionIds?.length) {
    const timetables = await prisma.timetable.findMany({
      where: { divisionId: { in: params.divisionIds }, schoolId },
      select: { id: true },
    });
    affectedTimetableIds = timetables.map(t => t.id);

  } else if (params.periodStructureId) {
    const divisions = await prisma.division.findMany({
      where: { periodStructureId: params.periodStructureId, deletedAt: null },
      select: { id: true },
    });
    if (divisions.length === 0) return { affectedCount: 0 };

    const timetables = await prisma.timetable.findMany({
      where: { divisionId: { in: divisions.map(d => d.id) } },
      select: { id: true },
    });
    affectedTimetableIds = timetables.map(t => t.id);

  } else if (params.entityType && params.entityId) {
    affectedTimetableIds = await resolveByEntity(
      schoolId, academicYearId, params.entityType, params.entityId,
    );
  }

  if (affectedTimetableIds.length === 0) return { affectedCount: 0 };

  // ── Step 2: Load timetable details for notifications ──
  const timetables = await prisma.timetable.findMany({
    where: { id: { in: affectedTimetableIds } },
    select: { id: true, schoolId: true, divisionId: true, status: true },
  });

  // ── Step 3: Flag OUTDATED + create notifications in a transaction ──
  const notificationsToCreate = timetables.map(tt => ({
    schoolId: tt.schoolId,
    timetableId: tt.id,
    divisionId: tt.divisionId,
    conflictType: conflictType as any,
    changeDescription,
  }));

  const idsToFlag = timetables
    .filter(tt => tt.status !== 'OUTDATED')
    .map(tt => tt.id);

  const txOps: any[] = [];

  if (notificationsToCreate.length > 0) {
    txOps.push(
      prisma.timetableNotification.createMany({
        data: notificationsToCreate,
        skipDuplicates: true,
      }),
    );
  }

  if (idsToFlag.length > 0) {
    txOps.push(
      prisma.timetable.updateMany({
        where: { id: { in: idsToFlag } },
        data: { status: 'OUTDATED' },
      }),
    );
  }

  if (txOps.length > 0) {
    await prisma.$transaction(txOps);
  }

  // ── Step 4: Backfill empty timetable_slot rows for new slots ──
  if (backfillSlotIds && backfillSlotIds.length > 0 && params.periodStructureId) {
    const workingDays = await prisma.workingDay.findMany({
      where: { periodStructureId: params.periodStructureId },
      select: { id: true },
    });

    const backfillRows: Array<{
      schoolId: string;
      timetableId: string;
      workingDayId: string;
      slotId: string;
      divisionAssignmentId: null;
    }> = [];

    for (const tt of timetables) {
      for (const wd of workingDays) {
        for (const slotId of backfillSlotIds) {
          backfillRows.push({
            schoolId: tt.schoolId,
            timetableId: tt.id,
            workingDayId: wd.id,
            slotId,
            divisionAssignmentId: null,
          });
        }
      }
    }

    if (backfillRows.length > 0) {
      await prisma.timetableSlot.createMany({
        data: backfillRows,
        skipDuplicates: true,
      });
    }
  }

  return { affectedCount: timetables.length };
}

/**
 * Resolve affected timetable IDs by entity type + entity ID.
 */
async function resolveByEntity(
  schoolId: string,
  academicYearId: string | undefined,
  entityType: string,
  entityId: string,
): Promise<string[]> {
  if (entityType === 'TEACHER' || entityType === 'SUBJECT') {
    const field = entityType === 'TEACHER' ? 'teacherId' : 'subjectId';
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: { [field]: entityId, deletedAt: null },
      },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  if (entityType === 'ASSIGNMENT') {
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, divisionAssignmentId: entityId },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  if (entityType === 'AVAILABILITY') {
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: {
          OR: [{ teacherId: entityId }, { assistantTeacherId: entityId }],
          deletedAt: null,
        },
      },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  if (entityType === 'ELECTIVE_GROUP') {
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: { electiveGroupId: entityId, deletedAt: null },
      },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  // Fallback: all timetables
  if (academicYearId) {
    const timetables = await prisma.timetable.findMany({
      where: { schoolId, academicYearId },
      select: { id: true },
    });
    return timetables.map(t => t.id);
  }

  return [];
}
