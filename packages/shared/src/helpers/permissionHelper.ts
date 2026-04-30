import { ForbiddenError } from '../errors';

/**
 * All permission keys in the system.
 * Single source of truth for both backend enforcement and frontend guards.
 */
export type Permission =
  | 'view_dashboard'
  | 'manage_classes' | 'view_classes'
  | 'manage_teachers' | 'view_teachers'
  | 'manage_subjects' | 'view_subjects'
  | 'manage_assignments' | 'view_assignments'
  | 'manage_electives' | 'view_electives'
  | 'manage_period_structures' | 'view_period_structures'
  | 'manage_academic_years' | 'view_academic_years'
  | 'generate_timetable' | 'edit_timetable'
  | 'view_all_timetables' | 'view_own_timetables' | 'export_timetable'
  | 'view_all_teacher_timetables' | 'view_own_teacher_timetable'
  | 'edit_teacher_timetable' | 'export_teacher_timetable'
  | 'manage_users'
  | 'edit_own_profile'
  | 'view_all_audit_logs' | 'view_own_audit_logs'
  | 'manage_settings'
  | 'manage_schools';

export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'VIEWER';

/**
 * Permission matrix: permission key → list of roles that have it.
 * Derived from Enhancement 7's permission table.
 */
const PERMISSIONS: Record<Permission, readonly UserRole[]> = {
  view_dashboard:              ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],

  manage_classes:              ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_classes:                ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  manage_teachers:             ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_teachers:               ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  manage_subjects:             ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_subjects:               ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  manage_assignments:          ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_assignments:            ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  manage_electives:            ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_electives:              ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  manage_period_structures:    ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_period_structures:      ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  manage_academic_years:       ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_academic_years:         ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],

  generate_timetable:          ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  edit_timetable:              ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_all_timetables:         ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],
  view_own_timetables:         ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],
  export_timetable:            ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],

  view_all_teacher_timetables: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],
  view_own_teacher_timetable:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],
  edit_teacher_timetable:      ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  export_teacher_timetable:    ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],

  manage_users:                ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  edit_own_profile:            ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],

  view_all_audit_logs:         ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_own_audit_logs:         ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'],

  manage_settings:             ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  manage_schools:              ['SUPER_ADMIN'],
};

/**
 * The permission matrix exported for frontend consumption.
 * Frontend uses this to conditionally render UI elements.
 */
export const PERMISSION_MATRIX = PERMISSIONS;

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles ? allowedRoles.includes(role as UserRole) : false;
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return (Object.entries(PERMISSIONS) as [Permission, readonly UserRole[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([perm]) => perm);
}

/**
 * Middleware-style guard. Throws ForbiddenError if the role lacks the permission.
 * Used in controller methods after authMiddleware().
 */
export function requirePermission(
  role: string | undefined | null,
  permission: Permission,
  context?: string,
): void {
  if (!role || !hasPermission(role, permission)) {
    const msg = context
      ? `Access denied: insufficient permissions to ${context}`
      : 'Access denied: insufficient permissions';
    throw new ForbiddenError(msg);
  }
}
