# Enhancement 14: Shared Service Helpers in Lambda Layer

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 30, 2026
> Dependencies: None for Phase 1-4 (existing code). Phases 5-10 align with their respective enhancements.

## Overview

Extract duplicated logic from individual services into `packages/shared/src/helpers/` and pre-build shared infrastructure for upcoming enhancements (status flags, audit logging, RBAC, impact assessment, email, subscription). Incremental deployment -- each phase updates only the affected services.

## Decisions Made

| Decision | Answer |
|----------|--------|
| Scope | Both existing duplicates AND future enhancement infrastructure |
| Location | `packages/shared/src/helpers/` (already in Lambda layer) |
| Deploy strategy | Incremental -- rebuild layer + redeploy affected services per phase |
| Backward compatibility | Clean break -- refactor callers to use new shared functions |
| Testing approach | Manual via Postman after each phase deploy |

---

## Inventory of Shared Functions

### Group A: Extract from Existing Code

| ID | Function | Source Services | Target File |
|----|----------|----------------|-------------|
| A1 | Teacher time-overlap conflict detection | teacher, timetable, export | `conflictDetectionHelper.ts` |
| A2 | Timetable invalidation + notification + backfill | shared/notificationHelper, school-config, teacher, class | `timetableFlagHelper.ts` (merge + enhance) |
| A3 | Teacher load computation (with cross-div dedup) | teacher, export | `teacherLoadHelper.ts` |
| A4 | Cross-div elective group identification | teacher, export | `electiveGroupHelper.ts` |
| A5 | Period structure slot loading | school-config, export, timetable | `periodStructureHelper.ts` |
| A6 | Duplicate name/existence check | teacher, class, subject, school-config, academic-year | `duplicateCheckHelper.ts` |

### Group B: Pre-Build for Future Enhancements

| ID | Function | For Enhancement | Target File |
|----|----------|----------------|-------------|
| B1 | Timetable status recomputation | Enh 3 (Status Flags) | `timetableStatusHelper.ts` |
| B2 | Assignment impact assessment | Enh 4 (Timetable-Aware Assignments) | `assignmentImpactHelper.ts` |
| B3 | Audit log writer (DynamoDB) | Enh 6 (Audit Log) | `auditLogHelper.ts` |
| B4 | Request context builder | Enh 6, 7 | `requestContext.ts` |
| B5 | Permission checker + registry | Enh 7 (RBAC) | `permissionHelper.ts` |
| B6 | Email sender (AWS SES) | Enh 13 (Super Admin Portal) | `emailHelper.ts` |
| B7 | Subscription tier checker | Enh 13 (Super Admin Portal) | `subscriptionHelper.ts` |

---

## Implementation Phases

### Phase 1: Conflict Detection Helper -- IMPLEMENTED

#### 1.1 Create `conflictDetectionHelper.ts` -- DONE

**File:** `packages/shared/src/helpers/conflictDetectionHelper.ts` (NEW)

Extract teacher time-overlap logic used by 3 services into a single function.

```typescript
import { PrismaClient } from '@prisma/client';

interface TimeConflictResult {
  teacherId: string;
  teacherName: string;
  subjectName: string;
  className: string;
  divisionLabel: string;
  divisionId: string;
}

/**
 * Find all teachers busy during a given time range on a given day.
 * Uses time-range overlap: slotStart < queryEnd AND slotEnd > queryStart.
 * Checks both primary and assistant teachers.
 * Deduplicates by teacherId + divisionId.
 */
export async function findTeachersAtTime(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    dayOfWeek: number;
    startTime: Date | string;
    endTime: Date | string;
    excludeSlotIds?: string[];
    excludeDivisionId?: string;
  }
): Promise<TimeConflictResult[]>

/**
 * Check if a specific teacher is busy during a given time range.
 * Returns the first conflicting slot info, or null if free.
 */
export async function isTeacherBusyAt(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    teacherId: string;
    dayOfWeek: number;
    startTime: Date | string;
    endTime: Date | string;
    excludeSlotIds?: string[];
  }
): Promise<TimeConflictResult | null>

/**
 * Build a Map of teacherId → busy time ranges for a set of teachers.
 * Used by export service for free period grid computation.
 */
export async function buildTeacherBusyRanges(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    teacherIds: string[];
  }
): Promise<Map<string, Array<{ dayOfWeek: number; startTime: number; endTime: number }>>>
```

#### 1.2 Refactor teacher service -- DONE

**File:** `services/teacher/src/service.ts`

Replace `getSlotConflicts()` implementation (lines 414-491) to use `findTeachersAtTime()`.

Before:
```typescript
// ~80 lines of inline Prisma query + dedup logic
```

After:
```typescript
import { findTeachersAtTime } from '@timetable/shared';

async getSlotConflicts(schoolId, academicYearId, workingDayId, slotId, excludeDivisionId) {
  const sourceSlot = await prisma.slot.findUnique({ where: { id: slotId }, select: { startTime: true, endTime: true } });
  const sourceDay = await prisma.workingDay.findUnique({ where: { id: workingDayId }, select: { dayOfWeek: true } });
  if (!sourceSlot || !sourceDay) return [];

  return findTeachersAtTime(prisma, {
    schoolId, academicYearId,
    dayOfWeek: sourceDay.dayOfWeek,
    startTime: sourceSlot.startTime,
    endTime: sourceSlot.endTime,
    excludeDivisionId: excludeDivisionId ?? undefined,
  });
}
```

#### 1.3 Refactor timetable service -- DONE

**File:** `services/timetable/src/service.ts`

Replace `findTeacherTimeConflict()` (lines ~502-540) to use `isTeacherBusyAt()`.

The timetable service's version takes `excludeSlotIds` to ignore the source/target slots during swap. The shared function supports this parameter.

#### 1.4 Refactor export service -- DONE

**File:** `services/export/src/service.ts`

Replace inline `isTeacherBusy()` function and `busyRanges` map building (lines 648-671) to use `buildTeacherBusyRanges()`.

#### 1.5 Deploy -- PENDING (batching with other phases)

---

### Phase 2: Timetable Flagging Helper (Merge & Enhance) -- IMPLEMENTED

#### 2.1 Create unified `timetableFlagHelper.ts` -- DONE

**File:** `packages/shared/src/helpers/notificationHelper.ts` (MODIFY)

Currently has `flagAffectedTimetables()`. Merge with school-config's `flagAndBackfillTimetables()` to create one unified function.

```typescript
/**
 * Flag timetables as OUTDATED and create notifications.
 * Optionally backfill empty timetable_slot rows for new slots.
 *
 * Replaces:
 * - shared/notificationHelper.ts :: flagAffectedTimetables()
 * - school-config/service.ts :: flagAndBackfillTimetables()
 * - teacher/service.ts :: inline flagging (lines 621-636)
 * - class/service.ts :: inline flagging (lines 338-355)
 */
export async function flagTimetables(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    conflictType: ConflictType;
    changeDescription: string;
    // Target: specify ONE of these to determine which timetables to flag
    divisionIds?: string[];           // flag timetables for specific divisions
    periodStructureId?: string;       // flag all timetables using this structure
    teacherId?: string;               // flag timetables where teacher has assignments
    subjectId?: string;               // flag timetables where subject has assignments
    timetableIds?: string[];          // flag specific timetable IDs
    // Optional: backfill empty slots for new period slots
    backfillSlotIds?: string[];       // new slot IDs to create empty timetable_slot rows
  }
): Promise<{ flaggedCount: number }>
```

#### 2.2 Refactor all callers -- DONE (school-config 4 sites, class 1 site, teacher 3 sites, subject 1 site, division-assignment 6 sites = 15 total)

**Files to modify:**
- `services/teacher/src/service.ts` -- replace inline flagging in `delete()` 
- `services/class/src/service.ts` -- replace inline flagging in `executeClassTeacherSwap()`
- `services/school-config/src/service.ts` -- replace `flagAndBackfillTimetables()` with shared `flagTimetables()`
- `services/subject/src/service.ts` -- ensure using shared function
- `services/division-assignment/src/service.ts` -- ensure using shared function

#### 2.3 Remove old functions -- DONE (deprecated export kept, private method deleted, all imports switched)

- Delete `school-config/service.ts :: flagAndBackfillTimetables()` (lines 803-878)
- Delete inline flagging code in teacher and class services
- Keep old `flagAffectedTimetables()` as deprecated alias pointing to new `flagTimetables()`

#### 2.4 Deploy -- PENDING (batching with other phases)

---

### Phase 3: Teacher Load & Elective Group Helpers -- IMPLEMENTED

#### 3.1 Create `electiveGroupHelper.ts` -- DONE

**File:** `packages/shared/src/helpers/electiveGroupHelper.ts` (NEW)

```typescript
/**
 * Identify which elective groups span multiple divisions (cross-division).
 * Returns a Set of elective group IDs that are cross-division.
 *
 * Replaces duplicate logic in:
 * - teacher/service.ts (lines 118-129, 247-258)
 * - export/service.ts (lines 328-335)
 */
export function identifyCrossDivElectiveGroups(
  assignments: Array<{ electiveGroupId: string | null; divisionId: string }>
): Set<string>

/**
 * Build a map of electiveGroupId → Set<divisionId> for grouping.
 */
export function buildElectiveGroupDivisionMap(
  assignments: Array<{ electiveGroupId: string | null; divisionId: string }>
): Map<string, Set<string>>

/**
 * Build combined class name for cross-div elective display.
 * e.g., "XI B, XI C, XI D" → used in export summary tables.
 */
export function buildElectiveGroupClassName(
  assignments: Array<{
    electiveGroupId: string | null;
    divisionId: string;
    division?: { label: string; class?: { name: string } };
  }>
): Map<string, string>
```

#### 3.2 Create `teacherLoadHelper.ts` -- DONE

**File:** `packages/shared/src/helpers/teacherLoadHelper.ts` (NEW)

```typescript
interface TeacherLoadResult {
  teacherId: string;
  teacherName: string;
  assignedPeriods: number;
  maxPeriodsPerWeek: number | null;
  timetablePeriods: number | null;
  qualifiedSubjectIds: string[];
}

/**
 * Compute assigned periods per teacher with cross-division elective deduplication.
 * Cross-div elective P/W is counted once (not per division).
 *
 * Replaces:
 * - teacher/service.ts :: listLoad() core logic (lines 83-211)
 * - export/service.ts :: teacher stats computation (lines 321-343)
 */
export async function computeTeacherLoads(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    teacherIds?: string[];  // optional filter to specific teachers
    includeTimetablePeriods?: boolean;  // whether to count timetable_slot rows
    includeQualifiedSubjects?: boolean;
  }
): Promise<TeacherLoadResult[]>
```

#### 3.3 Refactor teacher service -- DONE

- `listLoad()` reduced from ~130 lines to 10 lines (delegates to `computeTeacherLoads()`)
- `getTeacherBreakdown()` replaced 12-line cross-div dedup block with 1-line `identifyCrossDivElectiveGroups()` call

#### 3.4 Refactor export service -- DONE

- `getTeacherGrid()` replaced 18-line elective class name building with `buildElectiveGroupClassName()` call
- `exportFreePeriods()` already uses `buildTeacherBusyRanges()` from Phase 1

#### 3.5 Deploy -- PENDING (batching with other phases)

---

### Phase 4: Period Structure & Duplicate Check Helpers

#### 4.1 Create `periodStructureHelper.ts`

**File:** `packages/shared/src/helpers/periodStructureHelper.ts` (NEW)

```typescript
interface PeriodSlot {
  id: string;
  workingDayId: string;
  dayOfWeek: number;
  slotType: string;
  slotNumber: number | null;
  startTime: string;
  endTime: string;
  sortOrder: number;
}

/**
 * Load all PERIOD-type slots for a period structure, grouped by working day.
 * Returns slots sorted by sortOrder within each day.
 *
 * Replaces:
 * - school-config/service.ts :: slot loading in generateSlots(), resetToDefault()
 * - export/service.ts :: slot loading in getDivisionGrid(), getTeacherGrid()
 * - timetable/service.ts :: slot loading for grid rendering
 */
export async function loadPeriodSlots(
  prisma: PrismaClient,
  params: {
    periodStructureId: string;
    includeNonPeriod?: boolean;  // include INTERVAL, LUNCH_BREAK
  }
): Promise<{
  slots: PeriodSlot[];
  byDay: Map<string, PeriodSlot[]>;  // workingDayId → slots
  totalPeriodsPerDay: number;
  workingDayCount: number;
  totalSlotsPerWeek: number;  // totalPeriodsPerDay × workingDayCount
}>

/**
 * Load a division's period structure with all slot info.
 * Convenience wrapper: division → periodStructureId → loadPeriodSlots().
 */
export async function loadDivisionPeriodSlots(
  prisma: PrismaClient,
  divisionId: string,
  options?: { includeNonPeriod?: boolean }
): Promise<ReturnType<typeof loadPeriodSlots> & { periodStructureId: string }>
```

#### 4.2 Create `duplicateCheckHelper.ts`

**File:** `packages/shared/src/helpers/duplicateCheckHelper.ts` (NEW)

```typescript
import { ConflictError } from '../errors';

/**
 * Generic case-insensitive duplicate name check with soft-delete awareness.
 *
 * Replaces 12+ instances across teacher, class, subject, school-config, academic-year services.
 */
export async function checkDuplicateName(
  prisma: PrismaClient,
  params: {
    model: 'teacher' | 'class' | 'subject' | 'periodStructure' | 'academicYear' | 'electiveGroup';
    name: string;
    schoolId: string;
    academicYearId?: string;  // not needed for all models
    excludeId?: string;        // exclude current record during updates
    entityLabel?: string;      // custom label for error message (e.g., "Teacher")
  }
): Promise<void>  // throws ConflictError if duplicate exists
```

#### 4.3 Refactor all services using duplicate checks

**Files to modify:**
- `services/teacher/src/service.ts` -- `create()`, `update()`
- `services/class/src/service.ts` -- `create()`, `update()`
- `services/subject/src/service.ts` -- `create()`, `update()`
- `services/school-config/src/service.ts` -- `createPeriodStructure()`, `updatePeriodStructure()`
- `services/academic-year/src/service.ts` -- `create()`, `update()`

#### 4.4 Deploy

- Rebuild shared layer
- Redeploy: teacher, class, subject, school-config, academic-year, export, timetable services

---

### Phase 5: Request Context & Audit Log Infrastructure

> Aligns with Enhancement 6 (Audit Log UI) and Enhancement 7 (RBAC)

#### 5.1 Create `requestContext.ts`

**File:** `packages/shared/src/helpers/requestContext.ts` (NEW)

```typescript
export interface RequestContext {
  schoolId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  academicYearId: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Build RequestContext from Lambda event + auth middleware result.
 * Called at the controller layer, passed through to service methods.
 */
export function buildRequestContext(
  event: APIGatewayProxyEventV2,
  auth: AuthResult,
  ctx: AcademicYearContext
): RequestContext
```

#### 5.2 Create `auditLogHelper.ts`

**File:** `packages/shared/src/helpers/auditLogHelper.ts` (NEW)

```typescript
export interface AuditLogEntry {
  schoolId: string;
  entityType: string;       // 'TEACHER', 'CLASS', 'TIMETABLE', etc.
  entityId: string;
  action: string;           // 'CREATE', 'UPDATE', 'DELETE', 'GENERATE', etc.
  changes?: Record<string, { old: any; new: any }>;
  userId: string;
  userEmail: string;
  userRole: string;
  ipAddress: string;
  timestamp: string;        // ISO 8601
  academicYearId: string;
  metadata?: Record<string, any>;
}

/**
 * Write an audit log entry to DynamoDB. Fire-and-forget (catches errors silently).
 * 
 * Called from every service's CRUD methods.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void>

/**
 * Compute a diff between old and new objects for the `changes` field.
 */
export function computeChanges(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]  // which fields to compare
): Record<string, { old: any; new: any }> | undefined
```

#### 5.3 DynamoDB table for audit logs

**Table:** `timetable-audit-logs`

**Schema:**
```
PK: schoolId
SK: timestamp#entityType#entityId

GSI1 (EntityType): entityType (PK), timestamp (SK)
GSI2 (User): userId (PK), timestamp (SK)
GSI3 (Division): divisionId (PK), timestamp (SK)
```

**Provisioned via Terraform** (or manual creation for now).

#### 5.4 Deploy

- Rebuild shared layer (includes DynamoDB SDK)
- No service redeploys needed yet -- services adopt audit logging when implementing Enhancement 6

---

### Phase 6: Permission Helper

> Aligns with Enhancement 7 (RBAC)

#### 6.1 Create `permissionHelper.ts`

**File:** `packages/shared/src/helpers/permissionHelper.ts` (NEW)

```typescript
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
  | 'view_all_teacher_timetables' | 'view_own_teacher_timetable' | 'export_teacher_timetable'
  | 'manage_users'
  | 'edit_own_profile'
  | 'view_all_audit_logs' | 'view_own_audit_logs'
  | 'manage_settings'
  | 'manage_schools';

export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'VIEWER';

/**
 * Permission matrix: role → set of permissions.
 * Single source of truth for both backend and frontend.
 */
export const PERMISSION_MATRIX: Record<UserRole, Set<Permission>>

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean

/**
 * Middleware-style guard. Throws 403 ForbiddenError if permission denied.
 */
export function requirePermission(
  role: UserRole,
  permission: Permission,
  context?: string  // e.g., "create teacher" for error message
): void
```

#### 6.2 Create `permissionMiddleware.ts`

**File:** `packages/shared/src/middleware/permissionMiddleware.ts` (NEW)

```typescript
/**
 * Controller-level permission check using auth context.
 */
export function checkPermission(
  auth: AuthResult,
  permission: Permission
): void  // throws ForbiddenError
```

#### 6.3 Deploy

- Rebuild shared layer
- No service redeploys needed yet -- services adopt when implementing Enhancement 7

---

### Phase 7: Timetable Status Helper

> Aligns with Enhancement 3 (Status Flags)

#### 7.1 Create `timetableStatusHelper.ts`

**File:** `packages/shared/src/helpers/timetableStatusHelper.ts` (NEW)

```typescript
/**
 * Status tags per Enhancement 3's multi-status model.
 */
export enum TimetableStatusTag {
  VALID = 'VALID',
  EMPTY_SLOTS = 'EMPTY_SLOTS',
  TEACHER_CONFLICT = 'TEACHER_CONFLICT',
  EXCESS_ASSIGNMENTS = 'EXCESS_ASSIGNMENTS',
  MISSING_ASSIGNMENTS = 'MISSING_ASSIGNMENTS',
  STRUCTURE_CHANGED = 'STRUCTURE_CHANGED',
  ASSIGNMENT_CHANGED = 'ASSIGNMENT_CHANGED',
}

export interface TimetableStatusJson {
  statuses: TimetableStatusTag[];
  perSlotViolations?: Array<{
    workingDayId: string;
    slotId: string;
    violations: string[];
  }>;
  computedAt: string;  // ISO timestamp
}

/**
 * Severity ordering for status tags (highest first).
 */
export const STATUS_SEVERITY: Record<TimetableStatusTag, number>

/**
 * Recompute status flags for a single timetable.
 * Queries the timetable's slots, assignments, and structure to determine current state.
 * Updates the timetable's statusJson field in DB.
 *
 * Called from 6+ services after any data change that could affect timetable validity.
 */
export async function recomputeTimetableStatus(
  prisma: PrismaClient,
  timetableId: string
): Promise<TimetableStatusJson>

/**
 * Batch recompute for multiple timetables.
 * Used after bulk operations (teacher delete, subject delete, structure change).
 */
export async function recomputeMultipleTimetableStatuses(
  prisma: PrismaClient,
  timetableIds: string[]
): Promise<void>

/**
 * Find all timetable IDs affected by a change to a given entity.
 * Used to determine which timetables need recomputation.
 */
export async function findAffectedTimetableIds(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    entityType: 'TEACHER' | 'SUBJECT' | 'ASSIGNMENT' | 'PERIOD_STRUCTURE' | 'DIVISION';
    entityId: string;
  }
): Promise<string[]>
```

#### 7.2 Deploy

- Rebuild shared layer
- Services adopt when implementing Enhancement 3

---

### Phase 8: Assignment Impact Assessment Helper

> Aligns with Enhancement 4 (Timetable-Aware Assignments) and Enhancement 11 (Period Structure)

#### 8.1 Create `assignmentImpactHelper.ts`

**File:** `packages/shared/src/helpers/assignmentImpactHelper.ts` (NEW)

```typescript
export type ResolutionStepType =
  | 'TEACHER_CONFLICT'
  | 'SLOT_REMOVAL'
  | 'SLOT_FILL'
  | 'PW_BALANCE'
  | 'WEIGHTAGE_ADJUSTMENT';

export interface ResolutionStep {
  type: ResolutionStepType;
  divisionId: string;
  className: string;
  divisionLabel: string;
  isCascade: boolean;
  details: TeacherConflictDetails | SlotRemovalDetails | SlotFillDetails | PwBalanceDetails | WeightageAdjustmentDetails;
}

export interface AssignmentImpact {
  hasImpact: boolean;
  steps: ResolutionStep[];
}

// Detail interfaces for each step type
export interface TeacherConflictDetails { ... }
export interface SlotRemovalDetails { ... }
export interface SlotFillDetails { ... }
export interface PwBalanceDetails { ... }
export interface WeightageAdjustmentDetails { ... }

/**
 * Assess the timetable impact of an assignment change.
 * Returns resolution steps the user needs to complete.
 *
 * Used by:
 * - division-assignment service (assignment CRUD)
 * - school-config service (period structure changes, via Enhancement 11)
 */
export async function assessAssignmentImpact(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    academicYearId: string;
    divisionId: string;
    changeType: 'CREATE' | 'UPDATE' | 'DELETE' | 'PW_CHANGE' | 'TEACHER_CHANGE' | 'STRUCTURE_CHANGE';
    assignmentId?: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    // For period structure changes (Enhancement 11)
    addedSlotIds?: string[];
    removedSlotIds?: string[];
  }
): Promise<AssignmentImpact>
```

#### 8.2 Deploy

- Rebuild shared layer
- Services adopt when implementing Enhancement 4 and 11

---

### Phase 9: Email Helper

> Aligns with Enhancement 13 (Super Admin Portal)

#### 9.1 Create `emailHelper.ts`

**File:** `packages/shared/src/helpers/emailHelper.ts` (NEW)

```typescript
interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;  // default: noreply@zyphr.co.in
}

/**
 * Send email via AWS SES. Fire-and-forget (catches errors, logs failures).
 */
export async function sendEmail(params: EmailParams): Promise<boolean>

/**
 * Pre-built email templates.
 */
export const EMAIL_TEMPLATES = {
  schoolWelcome: (params: { schoolName: string; adminName: string; loginUrl: string; tempPassword: string; tier: string }) => EmailParams,
  upgradeRequest: (params: { schoolName: string; currentTier: string; requestedTier: string; contactEmail: string }) => EmailParams,
  upgradeApproved: (params: { schoolName: string; newTier: string; startDate: string; endDate: string }) => EmailParams,
  upgradeRejected: (params: { schoolName: string; reason: string }) => EmailParams,
  subscriptionExpiring: (params: { schoolName: string; expiryDate: string; contactEmail: string }) => EmailParams,
  subscriptionExpired: (params: { schoolName: string; contactEmail: string }) => EmailParams,
};
```

#### 9.2 Deploy

- Rebuild shared layer (includes AWS SES SDK)
- Auth service adopts when implementing Enhancement 13

---

### Phase 10: Subscription Helper

> Aligns with Enhancement 13 (Super Admin Portal)

#### 10.1 Create `subscriptionHelper.ts`

**File:** `packages/shared/src/helpers/subscriptionHelper.ts` (NEW)

```typescript
export type SubscriptionTier = 'BASIC' | 'ADVANCED' | 'PREMIUM';

export interface TierLimits {
  maxGenerations: number | null;  // null = unlimited
  allowTeacherAccounts: boolean;
  allowViewerAccounts: boolean;
  hasDedicatedSupport: boolean;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  BASIC: { maxGenerations: 1, allowTeacherAccounts: false, allowViewerAccounts: false, hasDedicatedSupport: false },
  ADVANCED: { maxGenerations: null, allowTeacherAccounts: true, allowViewerAccounts: true, hasDedicatedSupport: false },
  PREMIUM: { maxGenerations: null, allowTeacherAccounts: true, allowViewerAccounts: true, hasDedicatedSupport: true },
};

/**
 * Check if an action is allowed by the school's subscription tier.
 * Throws ForbiddenError with upgrade message if not allowed.
 *
 * Used by:
 * - timetable service (generation limit check)
 * - auth service (user creation limit check)
 */
export async function checkTierAllows(
  prisma: PrismaClient,
  params: {
    schoolId: string;
    action: 'GENERATE_TIMETABLE' | 'CREATE_TEACHER_USER' | 'CREATE_VIEWER_USER';
  }
): Promise<void>

/**
 * Check if a school's subscription is active (not expired/suspended/deactivated).
 * Returns readOnly flag + reason if not active.
 */
export async function checkSubscriptionStatus(
  prisma: PrismaClient,
  schoolId: string
): Promise<{ active: boolean; readOnly: boolean; reason?: 'EXPIRED' | 'SUSPENDED' | 'DEACTIVATED' }>
```

#### 10.2 Deploy

- Rebuild shared layer
- Services adopt when implementing Enhancement 13

---

## Shared Package Exports

#### Update `packages/shared/src/index.ts`

```typescript
// ── Existing exports (unchanged) ──
export * from './errors';
export * from './middleware/authMiddleware';
export * from './middleware/academicYearMiddleware';
export * from './helpers/response';
export * from './helpers/pagination';
export * from './db/prisma';

// ── Phase 1: Conflict Detection ──
export { findTeachersAtTime, isTeacherBusyAt, buildTeacherBusyRanges } from './helpers/conflictDetectionHelper';

// ── Phase 2: Timetable Flagging ──
export { flagTimetables } from './helpers/timetableFlagHelper';

// ── Phase 3: Teacher Load & Elective Groups ──
export { computeTeacherLoads } from './helpers/teacherLoadHelper';
export { identifyCrossDivElectiveGroups, buildElectiveGroupDivisionMap, buildElectiveGroupClassName } from './helpers/electiveGroupHelper';

// ── Phase 4: Period Structure & Duplicate Check ──
export { loadPeriodSlots, loadDivisionPeriodSlots } from './helpers/periodStructureHelper';
export { checkDuplicateName } from './helpers/duplicateCheckHelper';

// ── Phase 5: Audit Log ──
export { writeAuditLog, computeChanges, buildRequestContext } from './helpers/auditLogHelper';
export type { AuditLogEntry, RequestContext } from './helpers/auditLogHelper';

// ── Phase 6: Permissions ──
export { hasPermission, requirePermission, PERMISSION_MATRIX } from './helpers/permissionHelper';
export type { Permission, UserRole } from './helpers/permissionHelper';

// ── Phase 7: Timetable Status ──
export { recomputeTimetableStatus, recomputeMultipleTimetableStatuses, findAffectedTimetableIds, TimetableStatusTag, STATUS_SEVERITY } from './helpers/timetableStatusHelper';
export type { TimetableStatusJson } from './helpers/timetableStatusHelper';

// ── Phase 8: Assignment Impact ──
export { assessAssignmentImpact } from './helpers/assignmentImpactHelper';
export type { AssignmentImpact, ResolutionStep, ResolutionStepType } from './helpers/assignmentImpactHelper';

// ── Phase 9: Email ──
export { sendEmail, EMAIL_TEMPLATES } from './helpers/emailHelper';

// ── Phase 10: Subscription ──
export { checkTierAllows, checkSubscriptionStatus, TIER_LIMITS } from './helpers/subscriptionHelper';
export type { SubscriptionTier, TierLimits } from './helpers/subscriptionHelper';
```

---

## Layer Rebuild & Deploy Process

Each phase follows this deploy pattern:

```bash
# 1. Build shared package
cd packages/shared && npm run build

# 2. Package layer
cd ../../ && ./scripts/build-layer.sh  # or manual zip

# 3. Upload layer
aws s3 cp shared-layer.zip s3://zyphr-timetable-terraform-state/layers/shared-layer.zip

# 4. Publish new layer version
aws lambda publish-layer-version \
  --layer-name timetable-shared \
  --content S3Bucket=zyphr-timetable-terraform-state,S3Key=layers/shared-layer.zip \
  --compatible-runtimes nodejs22.x

# 5. Update SHARED_LAYER_ARN with new version number

# 6. Redeploy affected services
cd services/<service-name> && npx serverless deploy --stage prod
```

---

## File Changes Summary

### New Files

| File | Phase |
|------|-------|
| `packages/shared/src/helpers/conflictDetectionHelper.ts` | 1 |
| `packages/shared/src/helpers/electiveGroupHelper.ts` | 3 |
| `packages/shared/src/helpers/teacherLoadHelper.ts` | 3 |
| `packages/shared/src/helpers/periodStructureHelper.ts` | 4 |
| `packages/shared/src/helpers/duplicateCheckHelper.ts` | 4 |
| `packages/shared/src/helpers/requestContext.ts` | 5 |
| `packages/shared/src/helpers/auditLogHelper.ts` | 5 |
| `packages/shared/src/helpers/permissionHelper.ts` | 6 |
| `packages/shared/src/middleware/permissionMiddleware.ts` | 6 |
| `packages/shared/src/helpers/timetableStatusHelper.ts` | 7 |
| `packages/shared/src/helpers/assignmentImpactHelper.ts` | 8 |
| `packages/shared/src/helpers/emailHelper.ts` | 9 |
| `packages/shared/src/helpers/subscriptionHelper.ts` | 10 |

### Modified Files

| File | Phase | Change |
|------|-------|--------|
| `packages/shared/src/helpers/notificationHelper.ts` | 2 | Merge with school-config's flagAndBackfill |
| `packages/shared/src/index.ts` | All | Add exports per phase |
| `services/teacher/src/service.ts` | 1, 2, 3 | Use shared conflict, flagging, load helpers |
| `services/timetable/src/service.ts` | 1 | Use shared conflict detection |
| `services/export/src/service.ts` | 1, 3, 4 | Use shared conflict, load, period structure helpers |
| `services/school-config/src/service.ts` | 2, 4 | Use shared flagging, period structure, duplicate check |
| `services/class/src/service.ts` | 2, 4 | Use shared flagging, duplicate check |
| `services/subject/src/service.ts` | 2, 4 | Use shared flagging, duplicate check |
| `services/division-assignment/src/service.ts` | 2, 4 | Use shared flagging, duplicate check |
| `services/academic-year/src/service.ts` | 4 | Use shared duplicate check |

---

## Implementation Order & Dependencies

```
Phase 1:  Conflict Detection (no dependencies, fixes existing duplication)
Phase 2:  Timetable Flagging (no dependencies, fixes existing duplication)
Phase 3:  Teacher Load + Elective Group (no dependencies, fixes existing duplication)
Phase 4:  Period Structure + Duplicate Check (no dependencies, fixes existing duplication)
     ↑ Phases 1-4 can be done NOW -- they fix existing code ↑
     ↓ Phases 5-10 are pre-built infrastructure for future enhancements ↓
Phase 5:  Request Context + Audit Log (pre-build for Enhancement 6)
Phase 6:  Permission Helper (pre-build for Enhancement 7)
Phase 7:  Timetable Status (pre-build for Enhancement 3)
Phase 8:  Assignment Impact (pre-build for Enhancement 4, depends on Phase 7)
Phase 9:  Email Helper (pre-build for Enhancement 13)
Phase 10: Subscription Helper (pre-build for Enhancement 13, depends on Phase 1.1 schema)
```

Phases 1-4 are independent and can be implemented in any order.
Phases 5-10 are independent of each other (except Phase 8 depends on Phase 7 types).

---

## Appendix: Current Shared Package Structure

```
packages/shared/src/
  ├── db/
  │   ├── prisma.ts           # PrismaClient singleton
  │   └── tenantScope.ts      # softDelete() helper
  ├── errors/
  │   ├── AppError.ts
  │   ├── NotFoundError.ts
  │   ├── ConflictError.ts
  │   ├── ValidationError.ts
  │   └── index.ts
  ├── helpers/
  │   ├── notificationHelper.ts  # flagAffectedTimetables() -- to be enhanced in Phase 2
  │   ├── pagination.ts          # PaginationParams
  │   └── response.ts           # success(), paginated(), created()
  ├── middleware/
  │   ├── authMiddleware.ts
  │   └── academicYearMiddleware.ts
  ├── models/
  │   ├── enums.ts
  │   └── schemas/              # Zod schemas per entity
  └── index.ts                  # Re-exports
```

After Enhancement 14:
```
packages/shared/src/
  ├── db/                       # unchanged
  ├── errors/                   # unchanged
  ├── helpers/
  │   ├── notificationHelper.ts         # RENAMED → timetableFlagHelper.ts (Phase 2)
  │   ├── pagination.ts                 # unchanged
  │   ├── response.ts                   # unchanged
  │   ├── conflictDetectionHelper.ts    # NEW (Phase 1)
  │   ├── electiveGroupHelper.ts        # NEW (Phase 3)
  │   ├── teacherLoadHelper.ts          # NEW (Phase 3)
  │   ├── periodStructureHelper.ts      # NEW (Phase 4)
  │   ├── duplicateCheckHelper.ts       # NEW (Phase 4)
  │   ├── requestContext.ts             # NEW (Phase 5)
  │   ├── auditLogHelper.ts             # NEW (Phase 5)
  │   ├── permissionHelper.ts           # NEW (Phase 6)
  │   ├── timetableStatusHelper.ts      # NEW (Phase 7)
  │   ├── assignmentImpactHelper.ts     # NEW (Phase 8)
  │   ├── emailHelper.ts               # NEW (Phase 9)
  │   └── subscriptionHelper.ts         # NEW (Phase 10)
  ├── middleware/
  │   ├── authMiddleware.ts             # unchanged
  │   ├── academicYearMiddleware.ts     # unchanged
  │   └── permissionMiddleware.ts       # NEW (Phase 6)
  ├── models/                           # unchanged + new types
  └── index.ts                          # updated with all exports
```
