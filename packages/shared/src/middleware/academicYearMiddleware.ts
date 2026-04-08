import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { RequestContext } from './types';
import { prisma } from '../db/client';
import { ValidationError } from '../errors';
import { resolveSchoolId } from './authMiddleware';

/**
 * Resolve the academic year from the X-Academic-Year-Id header.
 * Falls back to the currently active academic year for the school.
 * Also resolves schoolId if not already set (Cognito email-based lookup).
 */
export async function academicYearMiddleware(
  event: APIGatewayProxyEventV2,
  context: Partial<RequestContext>,
): Promise<RequestContext> {
  // Resolve school ID if not already set
  const schoolId = await resolveSchoolId(context);
  const resolvedContext = { ...context, schoolId };

  const headerValue = event.headers?.['x-academic-year-id'];

  if (headerValue) {
    // Validate that this academic year belongs to the school
    const ay = await prisma.academicYear.findFirst({
      where: { id: headerValue, schoolId },
    });
    if (!ay) {
      throw new ValidationError('Invalid academic year ID');
    }
    return { ...resolvedContext, academicYearId: ay.id } as RequestContext;
  }

  // Fall back to the active academic year
  const activeAy = await prisma.academicYear.findFirst({
    where: { schoolId, status: 'ACTIVE' },
  });
  if (!activeAy) {
    throw new ValidationError('No active academic year. Please set one or pass X-Academic-Year-Id header.');
  }

  return { ...resolvedContext, academicYearId: activeAy.id } as RequestContext;
}
