import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { SchoolUser, School } from '@prisma/client';
import { AppError } from '../errors';
import { RequestContext } from './types';
import { prisma } from '../db';

type SchoolUserWithSchool = SchoolUser & { school: Pick<School, 'id' | 'name'> | null };

/**
 * Extract user identity from JWT claims (production) or mock headers (local dev).
 * Resolves school access via SchoolUser table.
 *
 * - SUPER_ADMIN (schoolId = null in SchoolUser) can access any school via X-School-Id header.
 * - SCHOOL_ADMIN can only access schools they're assigned to.
 * - X-School-Id header determines which school context to use.
 * - Falls back to single-school auto-selection if no header provided.
 */
export async function authMiddleware(event: APIGatewayProxyEventV2): Promise<Partial<RequestContext>> {
  // Production path: Cognito authorizer claims
  const claims = (event.requestContext as unknown as Record<string, unknown>)?.authorizer as
    | Record<string, unknown>
    | undefined;

  if (claims?.jwt) {
    const jwtClaims = (claims.jwt as Record<string, unknown>)?.claims as
      | Record<string, string>
      | undefined;

    const userId = jwtClaims?.sub;
    const email = jwtClaims?.email;

    if (email && userId) {
      return resolveSchoolAccess(email, userId, event);
    }

    if (userId) {
      return { userId };
    }
  }

  // Local dev path: mock auth headers
  const schoolId = event.headers?.['x-school-id'];
  const userId = event.headers?.['x-user-id'];
  const email = event.headers?.['x-user-email'];

  // If email provided in mock mode, use SchoolUser lookup
  if (email && userId) {
    return resolveSchoolAccess(email, userId, event);
  }

  // Legacy mock path: direct schoolId + userId headers
  if (schoolId && userId) {
    return { schoolId, userId };
  }

  throw new AppError('Unauthorized — no valid token or mock headers', 401, 'UNAUTHORIZED');
}

/**
 * Look up SchoolUser records for the email and resolve which school to use.
 */
async function resolveSchoolAccess(
  email: string,
  userId: string,
  event: APIGatewayProxyEventV2,
): Promise<Partial<RequestContext>> {
  const schoolUsers: SchoolUserWithSchool[] = await (prisma as any).schoolUser.findMany({
    where: { email },
    include: { school: { select: { id: true, name: true } } },
  });

  // If no SchoolUser records, fall back to legacy School.adminEmail lookup
  if (schoolUsers.length === 0) {
    const school = await prisma.school.findFirst({
      where: { adminEmail: email },
      select: { id: true },
    });
    if (school) {
      return { schoolId: school.id, userId };
    }
    // User exists in Cognito but has no school access
    return { userId };
  }

  const isSuperAdmin = schoolUsers.some((su) => su.role === 'SUPER_ADMIN');
  const requestedSchoolId = event.headers?.['x-school-id'];

  if (isSuperAdmin) {
    if (requestedSchoolId) {
      // Verify school exists
      const school = await prisma.school.findUnique({
        where: { id: requestedSchoolId },
        select: { id: true },
      });
      if (!school) {
        throw new AppError('School not found', 404, 'SCHOOL_NOT_FOUND');
      }
      return { schoolId: requestedSchoolId, userId, userRole: 'SUPER_ADMIN' };
    }
    // No school header — auto-select first available school
    const firstSchool = schoolUsers.find((su) => su.schoolId)?.schoolId;
    if (firstSchool) {
      return { schoolId: firstSchool, userId, userRole: 'SUPER_ADMIN' };
    }
    // SUPER_ADMIN with no specific school assigned — fetch first school in DB
    const anySchool = await prisma.school.findFirst({ select: { id: true } });
    if (anySchool) {
      return { schoolId: anySchool.id, userId, userRole: 'SUPER_ADMIN' };
    }
    return { userId, userRole: 'SUPER_ADMIN' };
  }

  // SCHOOL_ADMIN or VIEWER
  const allowedSchoolIds = schoolUsers
    .filter((su) => su.schoolId)
    .map((su) => su.schoolId!);
  const userRole = schoolUsers[0].role as 'SCHOOL_ADMIN' | 'VIEWER';

  if (requestedSchoolId) {
    if (!allowedSchoolIds.includes(requestedSchoolId)) {
      throw new AppError('Access denied to this school', 403, 'FORBIDDEN');
    }
    return { schoolId: requestedSchoolId, userId, userRole };
  }

  // Auto-select if user has exactly 1 school
  if (allowedSchoolIds.length === 1) {
    return { schoolId: allowedSchoolIds[0], userId, userRole };
  }

  // Multiple schools, no header — return userId only, caller handles missing schoolId
  return { userId, userRole };
}

/**
 * Convenience: resolve schoolId, throwing if not found.
 */
export async function resolveSchoolId(auth: Partial<RequestContext>): Promise<string> {
  if (auth.schoolId) return auth.schoolId;
  throw new AppError('School not found for this user', 404, 'SCHOOL_NOT_FOUND');
}
