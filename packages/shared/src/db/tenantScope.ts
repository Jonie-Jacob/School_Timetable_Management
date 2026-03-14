import { prisma } from './client';

/**
 * Returns a Prisma query filter object that scopes to school + soft-delete.
 * Usage: prisma.teacher.findMany({ where: { ...tenantScope(ctx), name: 'X' } })
 */
export function tenantScope(context: { schoolId: string; academicYearId?: string }) {
  const base: Record<string, unknown> = {
    schoolId: context.schoolId,
    deletedAt: null,
  };
  if (context.academicYearId) {
    base.academicYearId = context.academicYearId;
  }
  return base;
}

/**
 * Soft-delete helper: sets deletedAt on a record.
 */
export async function softDelete(
  model: string,
  id: string,
  schoolId: string,
): Promise<void> {
  await (prisma as Record<string, any>)[model].update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export { prisma };
