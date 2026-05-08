import { prisma } from '../db/client';
import { isTeacherBusyAt } from './conflictDetectionHelper';

/**
 * Violation types that can be annotated per-slot in timetable grid responses.
 */
export interface SlotViolation {
  type: 'TEACHER_CONFLICT' | 'AVAILABILITY_VIOLATION' | 'PREFERENCE_VIOLATION_HARD' | 'PREFERENCE_VIOLATION_SOFT' | 'ORPHANED_SLOT';
  teacherName?: string;
  subjectName?: string;
  reason: string;
}

/**
 * Annotate violations for each slot in a timetable.
 * Returns a Map<timetableSlotId, SlotViolation[]>.
 *
 * Used by getDivisionTimetable() and getTeacherTimetable() to include
 * violation markers in the grid response. Frontend renders exclamation marks.
 */
export async function annotateSlotViolations(
  timetableId: string,
  schoolId: string,
): Promise<Map<string, SlotViolation[]>> {
  const violationMap = new Map<string, SlotViolation[]>();

  const slots = await prisma.timetableSlot.findMany({
    where: { timetableId },
    include: {
      workingDay: { select: { id: true, dayOfWeek: true, label: true } },
      slot: { select: { id: true, slotType: true, slotNumber: true, startTime: true, endTime: true, sortOrder: true } },
      divisionAssignment: {
        include: {
          teacher: { select: { id: true, name: true } },
          assistantTeacher: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  const periodSlots = slots.filter(s => s.slot.slotType === 'PERIOD');

  const addViolation = (slotId: string, v: SlotViolation) => {
    const list = violationMap.get(slotId) ?? [];
    list.push(v);
    violationMap.set(slotId, list);
  };

  // ── Teacher Conflicts ──
  const checkedTeacherSlots = new Set<string>();
  for (const s of periodSlots) {
    const da = s.divisionAssignment;
    if (!da?.teacher) continue;

    const teacherIds = [da.teacher.id];
    if (da.assistantTeacher?.id) teacherIds.push(da.assistantTeacher.id);

    for (const teacherId of teacherIds) {
      const key = `${teacherId}-${s.workingDay.dayOfWeek}-${s.slot.sortOrder}`;
      if (checkedTeacherSlots.has(key)) continue;
      checkedTeacherSlots.add(key);

      const conflict = await isTeacherBusyAt({
        schoolId,
        teacherId,
        dayOfWeek: s.workingDay.dayOfWeek,
        startTime: s.slot.startTime,
        endTime: s.slot.endTime,
        excludeSlotIds: [s.id],
      });

      if (conflict) {
        const tName = teacherId === da.teacher.id ? da.teacher.name : (da.assistantTeacher?.name ?? '');
        addViolation(s.id, {
          type: 'TEACHER_CONFLICT',
          teacherName: tName,
          reason: `${tName} also teaching ${conflict.timetable.division?.class?.name ?? ''} ${conflict.timetable.division?.label ?? ''} at this time`,
        });
      }
    }
  }

  // ── Availability Violations ──
  for (const s of periodSlots) {
    const da = s.divisionAssignment;
    if (!da?.teacher) continue;

    const teacherIds = [{ id: da.teacher.id, name: da.teacher.name }];
    if (da.assistantTeacher?.id) teacherIds.push({ id: da.assistantTeacher.id, name: da.assistantTeacher.name });

    for (const t of teacherIds) {
      const unavailable = await prisma.teacherAvailability.findFirst({
        where: { teacherId: t.id, workingDayId: s.workingDayId, slotId: s.slotId },
      });
      if (unavailable) {
        addViolation(s.id, {
          type: 'AVAILABILITY_VIOLATION',
          teacherName: t.name,
          reason: `${t.name} is unavailable at this time`,
        });
      }
    }
  }

  // ── Preference Violations ──
  // Build assignment → slots map
  const slotsByAssignment = new Map<string, typeof periodSlots>();
  for (const s of periodSlots) {
    if (!s.divisionAssignmentId) continue;
    const list = slotsByAssignment.get(s.divisionAssignmentId) ?? [];
    list.push(s);
    slotsByAssignment.set(s.divisionAssignmentId, list);
  }

  for (const [, assignmentSlots] of slotsByAssignment) {
    const da = assignmentSlots[0].divisionAssignment;
    if (!da) continue;

    const prefs = da.schedulingPreferences as {
      constraintType?: 'HARD' | 'SOFT';
      excludedDays?: number[];
      excludedPeriodRange?: { min: number; max: number };
      preferredDays?: number[];
      preferredPeriodRange?: { min: number; max: number };
      preferAdjacentPeriods?: boolean;
      maxPeriodsPerDay?: number;
      minPeriodsPerDay?: number;
    } | null;
    if (!prefs) continue;

    const violationType = prefs.constraintType === 'HARD' ? 'PREFERENCE_VIOLATION_HARD' as const : 'PREFERENCE_VIOLATION_SOFT' as const;
    const subjectName = da.subject?.name ?? 'Unknown';

    // Excluded days
    if (prefs.excludedDays?.length) {
      for (const s of assignmentSlots) {
        if (prefs.excludedDays.includes(s.workingDay.dayOfWeek)) {
          addViolation(s.id, { type: violationType, subjectName, reason: `${subjectName}: scheduled on excluded day (${s.workingDay.label})` });
        }
      }
    }

    // Excluded period range
    if (prefs.excludedPeriodRange) {
      const { min, max } = prefs.excludedPeriodRange;
      for (const s of assignmentSlots) {
        const pn = s.slot.slotNumber ?? 0;
        if (pn >= min && pn <= max) {
          addViolation(s.id, { type: violationType, subjectName, reason: `${subjectName}: in excluded period range P${min}-P${max}` });
        }
      }
    }

    // Preferred days (not on preferred)
    if (prefs.preferredDays?.length) {
      for (const s of assignmentSlots) {
        if (!prefs.preferredDays.includes(s.workingDay.dayOfWeek)) {
          addViolation(s.id, { type: violationType, subjectName, reason: `${subjectName}: not on a preferred day` });
        }
      }
    }

    // Preferred period range (not in range)
    if (prefs.preferredPeriodRange) {
      const { min, max } = prefs.preferredPeriodRange;
      for (const s of assignmentSlots) {
        const pn = s.slot.slotNumber ?? 0;
        if (pn < min || pn > max) {
          addViolation(s.id, { type: violationType, subjectName, reason: `${subjectName}: not in preferred period range P${min}-P${max}` });
        }
      }
    }

    // Max periods per day
    if (prefs.maxPeriodsPerDay) {
      const dayGroups = new Map<number, typeof assignmentSlots>();
      for (const s of assignmentSlots) {
        const list = dayGroups.get(s.workingDay.dayOfWeek) ?? [];
        list.push(s);
        dayGroups.set(s.workingDay.dayOfWeek, list);
      }
      for (const [, daySlots] of dayGroups) {
        if (daySlots.length > prefs.maxPeriodsPerDay) {
          for (const s of daySlots.slice(prefs.maxPeriodsPerDay)) {
            addViolation(s.id, { type: violationType, subjectName, reason: `${subjectName}: exceeds max ${prefs.maxPeriodsPerDay}/day (${daySlots.length} on ${s.workingDay.label})` });
          }
        }
      }
    }
  }

  // ── Orphaned Slots ──
  for (const s of slots) {
    if (s.divisionAssignment && (s.divisionAssignment as any).deletedAt != null) {
      addViolation(s.id, {
        type: 'ORPHANED_SLOT',
        subjectName: s.divisionAssignment?.subject?.name ?? '',
        teacherName: s.divisionAssignment?.teacher?.name ?? '',
        reason: `Assignment deleted but slot remains`,
      });
    }
  }

  return violationMap;
}
