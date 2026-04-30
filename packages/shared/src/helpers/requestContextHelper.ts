import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { RequestContext } from '../middleware/types';

/**
 * Extended context with audit-relevant fields extracted from the Lambda event.
 * Built at the controller layer and passed to service methods that need audit logging.
 */
export interface AuditContext extends RequestContext {
  userEmail: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Build an AuditContext from a Lambda event + auth/academic-year middleware results.
 * Extracts IP address and user agent from request headers.
 *
 * Usage in controllers:
 * ```typescript
 * const auth = await authMiddleware(event);
 * const ctx = await academicYearMiddleware(event, auth);
 * const auditCtx = buildAuditContext(event, ctx);
 * // Pass auditCtx to service methods that need audit logging
 * ```
 */
export function buildAuditContext(
  event: APIGatewayProxyEventV2,
  ctx: RequestContext,
): AuditContext {
  // Extract email from JWT claims or headers
  const claims = (event.requestContext as unknown as Record<string, unknown>)?.authorizer as
    | Record<string, unknown>
    | undefined;
  const jwtClaims = (claims?.jwt as { claims?: Record<string, string> })?.claims;
  const userEmail = jwtClaims?.email
    ?? event.headers?.['x-user-email']
    ?? '';

  // Extract IP from request context or forwarded headers
  const ipAddress = event.requestContext?.http?.sourceIp
    ?? event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    ?? '';

  const userAgent = event.headers?.['user-agent'] ?? '';

  return {
    ...ctx,
    userEmail,
    ipAddress,
    userAgent,
  };
}
