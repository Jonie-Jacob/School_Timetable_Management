import { prisma } from '../db/client';

/**
 * Directly flags affected timetables when data changes.
 * In production, this would be a Lambda invocation to the Notification Service.
 * For local dev, we call the DB directly.
 */
export async function flagAffectedTimetables(params: {
  schoolId: string;
  academicYearId: string;
  entityType: 'TEACHER' | 'SUBJECT' | 'ASSIGNMENT' | 'SLOT' | 'STRUCTURE' | 'AVAILABILITY' | 'ELECTIVE_GROUP';
  entityId: string;
  changeDescription: string;
  isDeleted?: boolean;
}): Promise<{ affectedCount: number }> {
  const { schoolId, academicYearId, entityType, entityId, changeDescription, isDeleted } = params;

  // Find affected timetable IDs based on entity type
  let affectedTimetableIds: string[] = [];

  if (entityType === 'TEACHER' || entityType === 'SUBJECT') {
    // Find timetables via: timetable_slots → division_assignments where teacher/subject matches
    const field = entityType === 'TEACHER' ? 'teacherId' : 'subjectId';
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: {
          [field]: entityId,
          deletedAt: null,
        },
      },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    affectedTimetableIds = slots.map(s => s.timetableId);
  } else if (entityType === 'ASSIGNMENT') {
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, divisionAssignmentId: entityId },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    affectedTimetableIds = slots.map(s => s.timetableId);
  } else if (entityType === 'AVAILABILITY') {
    // Teacher availability changed — find all timetables where teacher is assigned
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
    affectedTimetableIds = slots.map(s => s.timetableId);
  } else if (entityType === 'ELECTIVE_GROUP') {
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: { electiveGroupId: entityId, deletedAt: null },
      },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    affectedTimetableIds = slots.map(s => s.timetableId);
  } else {
    // SLOT, STRUCTURE — affect all timetables in the academic year
    const timetables = await prisma.timetable.findMany({
      where: { schoolId, academicYearId },
      select: { id: true },
    });
    affectedTimetableIds = timetables.map(t => t.id);
  }

  if (affectedTimetableIds.length === 0) {
    return { affectedCount: 0 };
  }

  // Map entity type to conflict type
  const conflictTypeMap: Record<string, string> = {
    TEACHER: isDeleted ? 'TEACHER_DELETED' : 'TEACHER_CHANGED',
    SUBJECT: isDeleted ? 'SUBJECT_DELETED' : 'SUBJECT_CHANGED',
    ASSIGNMENT: 'ASSIGNMENT_CHANGED',
    SLOT: 'SLOT_CHANGED',
    STRUCTURE: 'STRUCTURE_CHANGED',
    AVAILABILITY: 'AVAILABILITY_CHANGED',
    ELECTIVE_GROUP: 'ELECTIVE_GROUP_CHANGED',
  };
  const conflictType = conflictTypeMap[entityType];

  // Get timetable details for notifications
  const timetables = await prisma.timetable.findMany({
    where: { id: { in: affectedTimetableIds } },
  });

  // Create notifications and update statuses
  for (const tt of timetables) {
    // Check if a similar notification already exists and is undismissed
    const existing = await prisma.timetableNotification.findFirst({
      where: {
        timetableId: tt.id,
        conflictType: conflictType as any,
        dismissed: false,
      },
    });

    if (!existing) {
      await prisma.timetableNotification.create({
        data: {
          schoolId,
          timetableId: tt.id,
          divisionId: tt.divisionId,
          conflictType: conflictType as any,
          changeDescription,
        },
      });
    }

    if (tt.status !== 'OUTDATED') {
      await prisma.timetable.update({
        where: { id: tt.id },
        data: { status: 'OUTDATED' },
      });
    }
  }

  return { affectedCount: timetables.length };
}
