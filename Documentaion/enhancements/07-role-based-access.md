# Enhancement 7: Role-Based Access Control

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 28, 2026

## Key Reference

**SMS Architecture**: See `Documentaion/SMS_Architecture_Decisions.md` section "2. Authentication & Authorization" -- separate Cognito pools per school, granular permissions planned.

**Current auth**: `packages/shared/src/middleware/authMiddleware.ts` extracts JWT → resolves SchoolUser → returns `{ schoolId, userId, userRole }`. Roles: SUPER_ADMIN, SCHOOL_ADMIN, VIEWER. No backend enforcement, no frontend route guards.

## Overview

Implement feature-based permission system with roles (SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, VIEWER). Add user management pages, teacher account linking, profile pages, backend authorization enforcement, frontend route/action guards, and a fun access denied page.

## Decisions Made

| Decision | Answer |
|----------|--------|
| Permission model | Feature-based (per-feature permissions, not just role hierarchy) |
| Roles for now | SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, VIEWER (Student/Parent deferred to SMS) |
| Higher role precedence | If user is both school admin and teacher, SCHOOL_ADMIN takes precedence |
| Teacher login | Optional -- teacher can exist without login. Email field added to Teacher model (optional). |
| Teacher ↔ User linking | Via `schoolUserId` FK on Teacher model. System intelligently links existing teachers when creating teacher-role users. |
| Creating teacher-role user | Also creates/links Teacher record in teachers table |
| Disabling teacher user | Login disabled (Cognito + SchoolUser disabled flag). Admin asked whether to also disable teacher record. |
| User management UI | Dedicated "Users" page under "System" group in sidebar |
| Profile page | All users have a profile page (/my-profile) from avatar dropdown |
| Profile pic | Stored in S3, `profilePicUrl` field on SchoolUser |
| Email change | User can change own email with OTP verification. Cascades to SchoolUser + Cognito. |
| First login | OTP email verification mandatory when logging in with temp password |
| Backend enforcement | `requirePermission()` middleware on every endpoint |
| Frontend enforcement | Hidden nav items + hidden action buttons for unauthorized roles |
| Access denied page | Fun page with 100 rotating messages (fetched from backend), includes emojis |
| Access denied logging | Every unauthorized access attempt logged to audit log |
| SUPER_ADMIN | Can do everything across all schools, including creating teacher/viewer users |
| SCHOOL_ADMIN | Can manage their school: CRUD all entities + manage users (teacher, viewer) |
| TEACHER | View own timetable + classes they teach. Edit own profile (name, qualifications, pic, email). Export viewable timetables. |
| VIEWER | Read-only access to everything in their school. Can export. Created by school admin or super admin. |
| Sidebar items | Hidden entirely for unauthorized roles (not grayed out) |
| Action buttons | Hidden entirely (not disabled) |
| Direct URL access | Shows "Access Denied" page with fun message + "Return to Dashboard" button |

---

## Permission Matrix

| Feature | Permission Key | SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | VIEWER |
|---------|---------------|-------------|--------------|---------|--------|
| Dashboard | `view_dashboard` | ✓ (admin) | ✓ (school) | ✓ (teacher-specific) | ✓ (read-only school) |
| Classes CRUD | `manage_classes` | ✓ | ✓ | ✗ | ✗ |
| Classes View | `view_classes` | ✓ | ✓ | ✗ | ✓ |
| Teachers CRUD | `manage_teachers` | ✓ | ✓ | ✗ | ✗ |
| Teachers View | `view_teachers` | ✓ | ✓ | ✗ | ✓ |
| Subjects CRUD | `manage_subjects` | ✓ | ✓ | ✗ | ✗ |
| Subjects View | `view_subjects` | ✓ | ✓ | ✗ | ✓ |
| Assignments CRUD | `manage_assignments` | ✓ | ✓ | ✗ | ✗ |
| Assignments View | `view_assignments` | ✓ | ✓ | ✗ | ✓ |
| Elective Groups CRUD | `manage_electives` | ✓ | ✓ | ✗ | ✗ |
| Elective Groups View | `view_electives` | ✓ | ✓ | ✗ | ✓ |
| Period Structures CRUD | `manage_period_structures` | ✓ | ✓ | ✗ | ✗ |
| Period Structures View | `view_period_structures` | ✓ | ✓ | ✗ | ✓ |
| Academic Years CRUD | `manage_academic_years` | ✓ | ✓ | ✗ | ✗ |
| Academic Years View | `view_academic_years` | ✓ | ✓ | ✗ | ✓ |
| Timetable Generate | `generate_timetable` | ✓ | ✓ | ✗ | ✗ |
| Timetable DnD Swap | `edit_timetable` | ✓ | ✓ | ✗ | ✗ |
| Timetable View (all) | `view_all_timetables` | ✓ | ✓ | ✗ | ✓ |
| Timetable View (own classes) | `view_own_timetables` | ✓ | ✓ | ✓ | ✓ |
| Timetable Export | `export_timetable` | ✓ | ✓ | ✓ (own classes) | ✓ |
| Teacher Timetable View (all) | `view_all_teacher_timetables` | ✓ | ✓ | ✗ | ✓ |
| Teacher Timetable View (own) | `view_own_teacher_timetable` | ✓ | ✓ | ✓ | ✓ |
| Teacher Timetable DnD | `edit_teacher_timetable` | ✓ | ✓ | ✗ | ✗ |
| Teacher Timetable Export | `export_teacher_timetable` | ✓ | ✓ | ✓ (own) | ✓ |
| User Management | `manage_users` | ✓ | ✓ | ✗ | ✗ |
| Own Profile Edit | `edit_own_profile` | ✓ | ✓ | ✓ | ✓ |
| Audit Log (all) | `view_all_audit_logs` | ✓ | ✓ | ✗ | ✗ |
| Audit Log (own) | `view_own_audit_logs` | ✓ | ✓ | ✓ | ✗ |
| Settings | `manage_settings` | ✓ | ✓ | ✗ | ✗ |
| School Management | `manage_schools` | ✓ | ✗ | ✗ | ✗ |

---

## Database Changes

### Add `email` to Teacher model

```prisma
model Teacher {
  // existing fields...
  email          String?  @db.VarChar(255)
  schoolUserId   String?  @unique @map("school_user_id")
  
  schoolUser     SchoolUser? @relation(fields: [schoolUserId], references: [id])
}
```

### Add TEACHER to UserRole enum

```prisma
enum UserRole {
  SUPER_ADMIN
  SCHOOL_ADMIN
  TEACHER
  VIEWER
}
```

### Update SchoolUser model

```prisma
model SchoolUser {
  id            String    @id @default(uuid())
  email         String    @db.VarChar(255)
  schoolId      String?   @map("school_id")
  role          UserRole
  name          String?   @db.VarChar(255)
  profilePicUrl String?   @map("profile_pic_url") @db.VarChar(500)
  phone         String?   @db.VarChar(50)
  disabled      Boolean   @default(false)
  emailVerified Boolean   @default(false) @map("email_verified")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  school        School?   @relation(fields: [schoolId], references: [id])
  teacher       Teacher?  // reverse relation from Teacher.schoolUserId

  @@unique([email, schoolId])
  @@index([email])
  @@map("school_users")
}
```

---

## Implementation Phases

### Phase 1: Database Schema Updates

#### 1.1 Migration -- UserRole enum + Teacher fields

- Add `TEACHER` to `UserRole` enum
- Add `email`, `schoolUserId` to `Teacher` model
- Add `name`, `profilePicUrl`, `phone`, `disabled`, `emailVerified` to `SchoolUser` model
- Add relation: `Teacher.schoolUser` ↔ `SchoolUser.teacher`

#### 1.2 Prisma generate + shared package rebuild

---

### Phase 2: Backend -- Permission System

#### 2.1 Define permissions registry

**File:** `packages/shared/src/helpers/permissions.ts` (NEW)

```typescript
export const PERMISSIONS = {
  view_dashboard: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'VIEWER'],
  manage_classes: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  view_classes: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'VIEWER'],
  // ... full matrix from above
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: string, permission: Permission): boolean {
  return PERMISSIONS[permission]?.includes(role as any) ?? false;
}
```

#### 2.2 Create `requirePermission()` middleware

**File:** `packages/shared/src/middleware/permissionMiddleware.ts` (NEW)

```typescript
export function requirePermission(auth: AuthResult, permission: Permission): void {
  if (!hasPermission(auth.userRole, permission)) {
    // Log unauthorized attempt to audit log (fire-and-forget)
    writeAuditLog({ action: 'UNAUTHORIZED_ACCESS', ... });
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }
}
```

#### 2.3 Add permission checks to ALL controllers

Every controller method gets a `requirePermission()` call after `authMiddleware()`:

```typescript
async create(event) {
  const auth = await authMiddleware(event);
  requirePermission(auth, 'manage_teachers');
  // ... proceed
}
```

**Services to update:**
- `services/teacher/src/controller.ts` -- manage_teachers / view_teachers
- `services/subject/src/controller.ts` -- manage_subjects / view_subjects
- `services/class/src/controller.ts` -- manage_classes / view_classes
- `services/division-assignment/src/controller.ts` -- manage_assignments / view_assignments
- `services/timetable/src/controller.ts` -- generate_timetable / edit_timetable / view_*_timetables
- `services/school-config/src/controller.ts` -- manage_period_structures
- `services/academic-year/src/controller.ts` -- manage_academic_years
- `services/export/src/controller.ts` -- export_timetable / export_teacher_timetable
- `services/dashboard/src/controller.ts` -- view_dashboard
- `services/notification/src/controller.ts` -- view_*_audit_logs

#### 2.4 Teacher-scoped data filtering

For TEACHER role, backend must filter data:
- `getDivisionTimetable()`: only divisions where teacher has assignments
- `getTeacherTimetable()`: only own timetable (teacherId = logged-in teacher's linked ID)
- `export`: only own classes/own timetable
- Teacher list: returns only own record

Add helper: `getTeacherIdForUser(schoolUserId)` that looks up the linked Teacher record.

---

### Phase 3: Backend -- User Management API

#### 3.1 User CRUD endpoints

**File:** `services/auth/src/service.ts` (extend existing auth service)

**`GET /api/auth/users`** -- list users (school admin sees their school, super admin sees all)
- Paginated, filterable by role, search by name/email
- Returns: `{ id, email, name, role, disabled, emailVerified, lastLogin, linkedTeacherId? }`

**`POST /api/auth/users`** -- create user
- Input: `{ email, name, role, tempPassword }`
- Creates SchoolUser record
- Creates Cognito user with temp password + forced change
- If role=TEACHER: intelligently link to existing Teacher record (match by email) or create new Teacher record
- Returns created user

**`PUT /api/auth/users/:id`** -- update user
- Input: `{ name?, role?, disabled? }`
- If disabling a TEACHER user: prompt whether to also disable Teacher record
- If role changed TO TEACHER: create/link Teacher record
- If role changed FROM TEACHER: ask whether to keep or remove Teacher record

**`DELETE /api/auth/users/:id`** -- soft delete user
- Disables Cognito user
- Soft-deletes SchoolUser

**`POST /api/auth/users/:id/reset-password`** -- admin resets user password
- Sets new temp password in Cognito, forces change on next login

#### 3.2 Intelligent teacher linking

When creating a TEACHER-role user:
1. Check if a `Teacher` record exists with matching email → link via `schoolUserId`
2. If no match, check by name → suggest link (don't auto-link, names can be ambiguous)
3. If no match at all → create new Teacher record

When linking from Teachers page (adding email to existing teacher):
1. Check if `SchoolUser` exists with that email → link
2. If no SchoolUser → create SchoolUser + Cognito user with temp password

#### 3.3 Routes and serverless.yml

Add new routes to `services/auth/serverless.yml`.

---

### Phase 4: Backend -- Profile API

#### 4.1 Profile endpoints

**`GET /api/auth/me/profile`** -- get own profile
- Returns: name, email, role, profilePicUrl, phone, qualifications (if teacher), linkedTeacher info

**`PUT /api/auth/me/profile`** -- update own profile
- Updateable: name, phone, profilePicUrl
- For teachers: maxPeriodsPerWeek, qualifications (teacher subjects)

**`POST /api/auth/me/change-email`** -- initiate email change
- Sends OTP to new email
- Returns: `{ otpSent: true }`

**`POST /api/auth/me/verify-email`** -- verify OTP and update email
- Input: `{ newEmail, otp }`
- Updates: SchoolUser.email + Cognito email + Teacher.email (if linked)
- Updates: emailVerified = true

**`POST /api/auth/me/change-password`** -- change own password
- Input: `{ oldPassword, newPassword }`
- Cognito password change

#### 4.2 Profile pic upload

**`POST /api/auth/me/profile-pic`** -- upload profile picture
- Accepts multipart/form-data or presigned URL approach
- Stores in school's S3 bucket: `s3://sms-files-{school-slug}/profiles/{userId}.jpg`
- Updates `profilePicUrl` on SchoolUser

#### 4.3 First login OTP flow

When user logs in with temp password:
1. Cognito returns `NEW_PASSWORD_REQUIRED` challenge
2. Frontend shows password change form
3. After password change, send OTP to user's email
4. User verifies OTP → `emailVerified = true`
5. Only then is login complete

---

### Phase 5: Frontend -- Permission Hooks & Guards

#### 5.1 Create permission hook

**File:** `apps/frontend/src/hooks/usePermission.ts` (NEW)

```typescript
export function usePermission(permission: Permission): boolean {
  const role = useAppSelector(state => state.auth.userRole);
  return hasPermission(role, permission);
}

export function usePermissions(): { can: (p: Permission) => boolean } {
  const role = useAppSelector(state => state.auth.userRole);
  return { can: (p) => hasPermission(role, p) };
}
```

#### 5.2 Create ProtectedRoute component

**File:** `apps/frontend/src/components/auth/ProtectedRoute.tsx` (NEW)

```typescript
export function ProtectedRoute({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = usePermission(permission);
  if (!allowed) return <AccessDeniedPage />;
  return <>{children}</>;
}
```

#### 5.3 Create AccessDeniedPage

**File:** `apps/frontend/src/features/auth/AccessDeniedPage.tsx` (NEW)

- Fetches a random funny message from `GET /api/auth/access-denied-message`
- Shows the message with emoji
- "Return to Dashboard" button
- Logs the attempt (frontend calls audit API or backend logs on 403)

100 funny messages stored in backend, served randomly.

---

### Phase 6: Frontend -- Sidebar & Route Guards

#### 6.1 Update Sidebar

**File:** `apps/frontend/src/components/layout/Sidebar.tsx`

Each nav item gets a `permission` prop. Use `usePermission()` to conditionally render:

```typescript
const navItems = [
  { label: 'Dashboard', path: '/', permission: 'view_dashboard' },
  { label: 'Classes', path: '/classes', permission: 'view_classes' },
  { label: 'Teachers', path: '/teachers', permission: 'view_teachers' },
  // ...
  { label: 'Users', path: '/users', permission: 'manage_users', group: 'System' },
  { label: 'Audit Log', path: '/audit-log', permission: 'view_all_audit_logs', group: 'System' },
];
// Only render items where usePermission(item.permission) === true
```

#### 6.2 Update Router

**File:** `apps/frontend/src/app/router.tsx`

Wrap routes with `ProtectedRoute`:

```typescript
{ path: '/classes', element: <ProtectedRoute permission="view_classes"><ClassesPage /></ProtectedRoute> }
{ path: '/teachers', element: <ProtectedRoute permission="view_teachers"><TeachersPage /></ProtectedRoute> }
// ...
```

#### 6.3 Hide action buttons

Across all pages, wrap CRUD buttons with permission checks:

```typescript
{can('manage_teachers') && <Button onClick={...}>Add Teacher</Button>}
```

Pages to update:
- ClassesPage, ClassDetailPage
- TeachersPage, TeacherDetailPage
- SubjectsPage
- AssignmentEditorPage
- ElectiveGroupsPage
- TimetablesOverviewPage (generate buttons)
- TimetableViewPage (DnD, override)
- TeacherTimetablePage (DnD)
- PeriodStructureEditor
- AcademicYearsPage
- Settings pages

---

### Phase 7: Frontend -- User Management Page

#### 7.1 Create Users page

**File:** `apps/frontend/src/features/users/UsersPage.tsx` (NEW)

DataTable with columns: Name | Email | Role | Status | Last Login | Actions

Features:
- Filter by role (dropdown)
- Search by name/email
- Pagination
- "Add User" button → dialog: name, email, role (dropdown), temp password
- Edit button → edit dialog
- Disable/Enable toggle
- Reset Password button
- For TEACHER role: shows linked teacher name (if linked)

#### 7.2 Create user API slice

**File:** `apps/frontend/src/features/users/userApi.ts` (NEW)

CRUD endpoints for user management.

#### 7.3 Add "Users" to sidebar

Under "System" group, alongside "Audit Log".

---

### Phase 8: Frontend -- Profile Page

#### 8.1 Create MyProfilePage

**File:** `apps/frontend/src/features/profile/MyProfilePage.tsx` (NEW)

Sections:
- Profile picture (upload/change with preview)
- Name (editable)
- Email (editable with OTP flow)
- Phone (editable)
- Password change (old + new + confirm)
- For TEACHER: qualifications (subject checkboxes), max periods/week

#### 8.2 Add profile link

Avatar dropdown in header → "My Profile" link → `/my-profile`

#### 8.3 First login flow

When `emailVerified === false` after password change:
- Redirect to email verification page
- Send OTP → user enters → verified → proceed to dashboard

---

### Phase 9: Backend -- Access Denied Messages

#### 9.1 Create messages endpoint

**`GET /api/auth/access-denied-message`** -- returns a random funny message

100 messages stored in a JSON file or hardcoded array in the service. Each message includes text + emoji.

Examples:
- "Whoa there! This area is for admins only. Your superpowers don't extend here! 🦸"
- "Plot twist: you need admin access for this page. Talk to your school admin! 🎬"
- "Error 403: Your enthusiasm is appreciated, but not authorized. 🚫😄"
- ... (97 more)

---

### Phase 10: Testing

| # | Test | Expected |
|---|------|----------|
| 1 | TEACHER logs in | Sees teacher dashboard, own timetable, own classes only |
| 2 | TEACHER navigates to /subjects | Access Denied page with funny message |
| 3 | TEACHER API call to POST /teachers | 403 Forbidden |
| 4 | VIEWER logs in | Sees all data read-only, no edit/delete/add buttons |
| 5 | SCHOOL_ADMIN creates TEACHER user | SchoolUser + Cognito + Teacher record created |
| 6 | SCHOOL_ADMIN creates TEACHER user, email matches existing teacher | Links to existing Teacher record |
| 7 | TEACHER edits own profile | Can change name, phone, pic, qualifications |
| 8 | TEACHER changes email | OTP sent, verified, cascades to SchoolUser + Cognito + Teacher |
| 9 | First login with temp password | Force password change → OTP verification → dashboard |
| 10 | SCHOOL_ADMIN disables teacher user | Cognito disabled, SchoolUser.disabled = true, prompted about Teacher record |
| 11 | SUPER_ADMIN sees all schools | Full access across all schools |
| 12 | Access denied logged in audit | Audit log entry for unauthorized access attempt |
| 13 | TEACHER exports own timetable | Allowed |
| 14 | TEACHER exports other teacher's timetable | 403 |
| 15 | Class teacher views division stats | Can see assignment stats for their division |

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `packages/shared/prisma/schema.prisma` | Add TEACHER role, Teacher.email/schoolUserId, SchoolUser fields | 1 |
| `packages/shared/src/helpers/permissions.ts` | NEW -- permission registry + hasPermission() | 2 |
| `packages/shared/src/middleware/permissionMiddleware.ts` | NEW -- requirePermission() | 2 |
| All 10 service controllers | Add requirePermission() calls | 2 |
| `services/timetable/src/service.ts` | Teacher-scoped data filtering | 2 |
| `services/auth/src/service.ts` | User CRUD, profile API, OTP flow, access denied messages | 3-4, 9 |
| `services/auth/src/router.ts` | New routes | 3-4 |
| `services/auth/serverless.yml` | New API Gateway routes | 3-4 |
| `apps/frontend/src/hooks/usePermission.ts` | NEW -- permission hook | 5 |
| `apps/frontend/src/components/auth/ProtectedRoute.tsx` | NEW -- route guard | 5 |
| `apps/frontend/src/features/auth/AccessDeniedPage.tsx` | NEW -- fun 403 page | 5 |
| `apps/frontend/src/components/layout/Sidebar.tsx` | Permission-filtered nav items | 6 |
| `apps/frontend/src/app/router.tsx` | ProtectedRoute wrappers | 6 |
| All page components (~15 pages) | Hide CRUD buttons by permission | 6 |
| `apps/frontend/src/features/users/UsersPage.tsx` | NEW -- user management | 7 |
| `apps/frontend/src/features/users/userApi.ts` | NEW -- user API | 7 |
| `apps/frontend/src/features/profile/MyProfilePage.tsx` | NEW -- profile page | 8 |
| Header component | Avatar dropdown → "My Profile" link | 8 |

---

## Appendix: Current Code Inventory (for context after conversation compaction)

### Auth Middleware

- **File:** `packages/shared/src/middleware/authMiddleware.ts`
- Extracts JWT claims (sub, email) from Cognito authorizer
- Resolves SchoolUser records by email
- Returns `{ schoolId, userId, userRole, email }`
- **NO permission checking** -- just identity resolution

### SchoolUser Model (current)

- **File:** `packages/shared/prisma/schema.prisma` lines ~93-107
- Fields: id, email, schoolId (nullable for SUPER_ADMIN), role (UserRole enum)
- Unique: [email, schoolId]
- **Missing:** name, profilePicUrl, phone, disabled, emailVerified

### Teacher Model (current)

- **File:** `packages/shared/prisma/schema.prisma` lines ~228-248
- Fields: id, schoolId, academicYearId, name, contact, maxPeriodsPerWeek, deletedAt
- **Missing:** email, schoolUserId

### UserRole Enum (current)

- `SUPER_ADMIN`, `SCHOOL_ADMIN`, `VIEWER`
- **Missing:** `TEACHER`

### Frontend Auth State

- **File:** `apps/frontend/src/features/auth/authSlice.ts`
- Stores: isAuthenticated, token, email, schoolId, userId, schoolName, schools[], userRole, activeAcademicYearId
- `userRole` is one of: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER' | null

### Sidebar Navigation

- **File:** `apps/frontend/src/components/layout/Sidebar.tsx` (or equivalent)
- All nav items visible to all roles -- no filtering
- Groups: Dashboard, Workspace, Timetables, Setup

### Router

- **File:** `apps/frontend/src/app/router.tsx`
- AuthenticatedLayout wraps all routes (login check only)
- No ProtectedRoute component, no role-based guards

### Cognito (production)

- User Pool: `ap-south-1_rlYNHNPRZ`
- Client ID: `42r2ih2m9c3l26lb4u1mrrl5sb`
- Auth service: `services/auth/` -- mock auth for local dev, Cognito for prod

## Implementation Order

```
Phase 1:  DB schema (add TEACHER role, Teacher.email, SchoolUser fields)
Phase 2:  Permission system (registry + middleware + controller enforcement)
Phase 3:  User management API (CRUD + teacher linking)
Phase 4:  Profile API (profile CRUD + email change OTP + profile pic)
Phase 5:  Frontend permission hooks + ProtectedRoute + AccessDeniedPage
Phase 6:  Sidebar filtering + route guards + action button visibility
Phase 7:  User management page
Phase 8:  Profile page + first login flow
Phase 9:  Access denied messages (100 variations)
Phase 10: Testing
```
