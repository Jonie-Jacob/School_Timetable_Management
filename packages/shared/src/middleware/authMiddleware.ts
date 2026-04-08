import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AppError } from '../errors';
import { RequestContext } from './types';
import { prisma } from '../db';

/**
 * Extract school_id and user_id from the JWT authorizer claims.
 * Resolves school by email lookup if custom:school_id is not set.
 *
 * In LOCAL DEV mode (STAGE=dev without Cognito), the mock auth middleware
 * in the Auth Service injects these into the headers instead.
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

    // Try custom:school_id first (fastest — no DB call)
    const schoolId = jwtClaims?.['custom:school_id'];
    if (schoolId && userId) {
      return { schoolId, userId };
    }

    // Fallback: look up school by email from JWT (requires DB call)
    const email = jwtClaims?.email;
    if (email && userId) {
      const school = await prisma.school.findFirst({
        where: { adminEmail: email },
        select: { id: true },
      });
      if (school) {
        return { schoolId: school.id, userId };
      }
      // School not found — user registered in Cognito but not in our DB yet
      // Return userId only; the caller must handle missing schoolId
      return { userId };
    }

    if (userId) {
      return { userId };
    }
  }

  // Local dev path: mock auth headers
  const schoolId = event.headers?.['x-school-id'];
  const userId = event.headers?.['x-user-id'];
  if (schoolId && userId) {
    return { schoolId, userId };
  }

  throw new AppError('Unauthorized — no valid token or mock headers', 401, 'UNAUTHORIZED');
}

/**
 * Convenience: resolve schoolId, throwing if not found.
 */
export async function resolveSchoolId(auth: Partial<RequestContext>): Promise<string> {
  if (auth.schoolId) return auth.schoolId;
  throw new AppError('School not found for this user', 404, 'SCHOOL_NOT_FOUND');
}
