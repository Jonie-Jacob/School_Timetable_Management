import type { RequestContext } from './types';
import { type Permission, requirePermission } from '../helpers/permissionHelper';
import { writeAuditLog } from '../helpers/auditLogHelper';

/**
 * Controller-level permission check using auth middleware result.
 * Throws ForbiddenError (403) if the user's role lacks the required permission.
 * Logs unauthorized access attempts to audit log (fire-and-forget).
 *
 * Usage in controllers:
 * ```typescript
 * async create(event) {
 *   const auth = await authMiddleware(event);
 *   checkPermission(auth, 'manage_teachers');
 *   const ctx = await academicYearMiddleware(event, auth);
 *   // ... proceed
 * }
 * ```
 */
export function checkPermission(
  auth: Partial<RequestContext>,
  permission: Permission,
  context?: string,
): void {
  try {
    requirePermission(auth.userRole, permission, context);
  } catch (err) {
    // Log unauthorized access attempt (fire-and-forget)
    writeAuditLog({
      schoolId: auth.schoolId ?? '',
      entityType: 'ACCESS_DENIED',
      entityId: permission,
      action: 'UNAUTHORIZED_ACCESS',
      userId: auth.userId ?? '',
      userEmail: '',
      userRole: auth.userRole ?? '',
      ipAddress: '',
      timestamp: new Date().toISOString(),
      academicYearId: auth.academicYearId ?? '',
      metadata: { permission, context },
    }).catch(() => {}); // swallow audit log errors

    throw err; // re-throw the ForbiddenError
  }
}
