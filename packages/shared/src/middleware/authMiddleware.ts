import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { AppError } from '../errors';
import { RequestContext } from './types';

/**
 * Extract school_id and user_id from the JWT authorizer claims.
 *
 * In LOCAL DEV mode (STAGE=dev without Cognito), the mock auth middleware
 * in the Auth Service injects these into the headers instead. Each service
 * handler calls this function to populate RequestContext.
 */
export function authMiddleware(event: APIGatewayProxyEventV2): Partial<RequestContext> {
  // Production path: Cognito authorizer claims
  const claims = (event.requestContext as unknown as Record<string, unknown>)?.authorizer as
    | Record<string, unknown>
    | undefined;

  if (claims?.jwt) {
    const jwtClaims = (claims.jwt as Record<string, unknown>).claims as Record<string, string>;
    const schoolId = jwtClaims['custom:school_id'];
    const userId = jwtClaims.sub;
    if (!schoolId || !userId) {
      throw new AppError('Missing school_id or user_id in token claims', 401, 'UNAUTHORIZED');
    }
    return { schoolId, userId };
  }

  // Local dev path: mock auth headers
  const schoolId = event.headers?.['x-school-id'];
  const userId = event.headers?.['x-user-id'];
  if (schoolId && userId) {
    return { schoolId, userId };
  }

  throw new AppError('Unauthorized — no valid token or mock headers', 401, 'UNAUTHORIZED');
}
