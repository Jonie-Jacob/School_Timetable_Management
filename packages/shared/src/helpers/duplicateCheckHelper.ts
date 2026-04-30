import { prisma } from '../db/client';
import { ConflictError } from '../errors';

type ModelName = 'teacher' | 'class' | 'subject' | 'periodStructure' | 'academicYear' | 'electiveGroup' | 'division';

const MODEL_CONFIG: Record<ModelName, {
  prismaModel: string;
  nameField: string;
  useCaseInsensitive: boolean;
  useAcademicYear: boolean;
  label: string;
}> = {
  teacher: { prismaModel: 'teacher', nameField: 'name', useCaseInsensitive: true, useAcademicYear: true, label: 'Teacher' },
  class: { prismaModel: 'class', nameField: 'name', useCaseInsensitive: true, useAcademicYear: true, label: 'Class' },
  subject: { prismaModel: 'subject', nameField: 'name', useCaseInsensitive: true, useAcademicYear: true, label: 'Subject' },
  periodStructure: { prismaModel: 'periodStructure', nameField: 'name', useCaseInsensitive: true, useAcademicYear: true, label: 'Period structure' },
  academicYear: { prismaModel: 'academicYear', nameField: 'label', useCaseInsensitive: false, useAcademicYear: false, label: 'Academic year' },
  electiveGroup: { prismaModel: 'electiveGroup', nameField: 'name', useCaseInsensitive: true, useAcademicYear: true, label: 'Elective group' },
  division: { prismaModel: 'division', nameField: 'label', useCaseInsensitive: true, useAcademicYear: false, label: 'Division' },
};

/**
 * Generic case-insensitive duplicate name check with soft-delete awareness.
 * Throws ConflictError if a duplicate is found.
 *
 * Consolidates 12+ instances across teacher, class, subject, school-config,
 * academic-year, and division-assignment services.
 */
export async function checkDuplicateName(params: {
  model: ModelName;
  name: string;
  schoolId: string;
  academicYearId?: string;
  excludeId?: string;
  parentId?: string;        // e.g., classId for division uniqueness
  parentField?: string;     // e.g., 'classId'
  entityLabel?: string;
}): Promise<void> {
  const { model, name, schoolId, academicYearId, excludeId, parentId, parentField, entityLabel } = params;
  const config = MODEL_CONFIG[model];

  const where: Record<string, unknown> = {
    schoolId,
    [config.nameField]: config.useCaseInsensitive
      ? { equals: name, mode: 'insensitive' }
      : name,
    deletedAt: null,
  };

  if (config.useAcademicYear && academicYearId) {
    where.academicYearId = academicYearId;
  }

  if (excludeId) {
    where.id = { not: excludeId };
  }

  if (parentId && parentField) {
    where[parentField] = parentId;
  }

  const existing = await (prisma as any)[config.prismaModel].findFirst({ where });

  if (existing) {
    const label = entityLabel ?? config.label;
    throw new ConflictError(`${label} '${name}' already exists`);
  }
}
