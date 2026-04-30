# Enhancement 6: Audit Log UI

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 28, 2026
> Depends on: Enhancement 3 (Status Flags -- removes notification-driven status)

## Key Reference

**SMS Architecture**: See `Documentaion/SMS_Architecture_Decisions.md` section "19. Audit Log Storage" -- DynamoDB chosen for audit logs, `SCHOOL#{schoolId}` partition key, never-delete retention.

**DPDP Compliance**: See `Documentaion/SMS_Architecture_Decisions.md` section "10. Compliance & Data" -- detailed audit logging required, read access logging required for minor data.

## Overview

Replace the current `timetable_notifications` table with a DynamoDB-based audit log system. Log ALL data changes across the system with who, what, when, where (IP), and before/after values. Provide a dedicated audit log page with rich filtering. Remove notification bell and FAB.

## Decisions Made

| Decision | Answer |
|----------|--------|
| Storage | DynamoDB (consistent with SMS Architecture plan) |
| Retention | Never delete |
| Who sees logs? | Users see own actions. School admins see entire school. Super admins see all. |
| What to log | ALL data changes + timetable operations + auth events |
| Before/after values | Yes -- store old and new values for each change |
| User identity | userId, userEmail, userRole captured on every entry |
| IP and user agent | Captured on every entry (DPDP compliance) |
| Logging placement | Service layer (maximum detail) |
| Logging reliability | Fire-and-forget (don't block user if DynamoDB write fails) |
| UI location | Dedicated "/audit-log" page in sidebar under "System" group |
| Pagination | Traditional paginated table (like subjects table) |
| Filtering | Date range, entity type, user, division/class, full text search |
| Notification bell | Remove from header |
| FAB | Already removed in Enhancement 3 |
| Old notifications table | Drop after migration |

---

## DynamoDB Table Design

### Table: `sms-audit-logs`

```
Partition Key (PK): SCHOOL#{schoolId}
Sort Key (SK): {timestamp}#{uuid}   // ISO timestamp + unique ID for ordering
```

### Attributes

```typescript
{
  PK: string;                    // SCHOOL#{schoolId}
  SK: string;                    // 2026-04-28T10:30:00.000Z#uuid
  logId: string;                 // UUID
  schoolId: string;
  academicYearId: string | null;
  
  // WHO
  userId: string;
  userEmail: string;
  userRole: string;              // 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | etc.
  ipAddress: string;
  userAgent: string;
  
  // WHAT
  action: string;                // 'CREATE' | 'UPDATE' | 'DELETE' | 'GENERATE' | 'SWAP' | etc.
  entityType: string;            // 'TEACHER' | 'SUBJECT' | 'ASSIGNMENT' | 'TIMETABLE' | etc.
  entityId: string;
  entityName: string;            // Human-readable: "Julie Scaria", "Mathematics", etc.
  description: string;           // "Updated teacher weightage from 4 to 6"
  
  // DETAILS
  changes: {                     // Before/after for updates
    field: string;
    oldValue: any;
    newValue: any;
  }[] | null;
  
  // CONTEXT
  relatedEntities: {             // Associated records for richer context
    type: string;
    id: string;
    name: string;
  }[] | null;                    // e.g., division, class, elective group
  
  // TIMESTAMPS
  timestamp: string;             // ISO 8601
  createdAt: number;             // epoch ms (for DynamoDB TTL if ever needed)
}
```

### Global Secondary Indexes (GSIs)

| GSI Name | PK | SK | Purpose |
|----------|----|----|---------|
| `GSI-EntityType` | `SCHOOL#{schoolId}#ENTITY#{entityType}` | `{timestamp}` | Filter by entity type |
| `GSI-User` | `SCHOOL#{schoolId}#USER#{userId}` | `{timestamp}` | Filter by user (who made the change) |
| `GSI-Division` | `SCHOOL#{schoolId}#DIV#{divisionId}` | `{timestamp}` | Filter by division/class |

### Query Patterns

| Filter | How to query |
|--------|-------------|
| All logs for school, newest first | PK = `SCHOOL#{schoolId}`, SK descending |
| By date range | PK + SK between `startDate` and `endDate` |
| By entity type | GSI-EntityType PK = `SCHOOL#{schoolId}#ENTITY#TEACHER` |
| By user | GSI-User PK = `SCHOOL#{schoolId}#USER#{userId}` |
| By division | GSI-Division PK = `SCHOOL#{schoolId}#DIV#{divisionId}` |
| Full text search | Client-side filter on `description` field (DynamoDB doesn't support full text) |
| Combined filters | Query by primary filter (GSI), then client-side filter remaining |

---

## Action Types

| Category | Action | Description Example |
|----------|--------|-------------------|
| **Teacher** | `TEACHER_CREATE` | "Created teacher Julie Scaria" |
| | `TEACHER_UPDATE` | "Updated teacher Julie Scaria: maxPeriodsPerWeek 26→28" |
| | `TEACHER_DELETE` | "Deleted teacher Julie Scaria" |
| | `TEACHER_AVAILABILITY_UPDATE` | "Updated availability for Julie Scaria: Wednesday P3 marked unavailable" |
| | `TEACHER_SUBJECTS_UPDATE` | "Updated subject qualifications for Julie Scaria: added Mathematics" |
| **Subject** | `SUBJECT_CREATE` | "Created subject Information Technology" |
| | `SUBJECT_UPDATE` | "Updated subject: name Hindi→हिन्दी" |
| | `SUBJECT_DELETE` | "Deleted subject Art" |
| **Class** | `CLASS_CREATE` | "Created class XII" |
| | `CLASS_UPDATE` | "Updated class XII: sortOrder 12→11" |
| | `CLASS_DELETE` | "Deleted class Nursery" |
| **Division** | `DIVISION_CREATE` | "Created division A in class XII" |
| | `DIVISION_UPDATE` | "Updated XII-A: classTeacher changed to Julie Scaria" |
| | `DIVISION_DELETE` | "Deleted division D from class XII" |
| **Assignment** | `ASSIGNMENT_CREATE` | "Created assignment: Mathematics for XII-A, teacher Julie, 6 P/W" |
| | `ASSIGNMENT_UPDATE` | "Updated assignment: XII-A Mathematics, teacher Julie→Amrutha" |
| | `ASSIGNMENT_DELETE` | "Deleted assignment: XII-A Mathematics (Julie)" |
| **Elective Group** | `ELECTIVE_BULK_SAVE` | "Updated elective group XII Maths/IP/Psy: added subject Art, P/W 8→6" |
| | `ELECTIVE_DELETE` | "Deleted elective group Dance/Music" |
| **Timetable** | `TIMETABLE_GENERATE` | "Generated timetables for all divisions (25 divisions)" |
| | `TIMETABLE_SLOT_SWAP` | "Swapped slots: XII-A Mon P1 ↔ XII-A Wed P3" |
| | `TIMETABLE_ELECTIVE_SWAP` | "Swapped elective XII Maths/IP/Psy: Mon P3 → Wed P7 (3 divisions)" |
| | `TIMETABLE_SLOT_OVERRIDE` | "Override: XII-A Mon P1 assigned to Mathematics (Julie)" |
| | `TIMETABLE_SLOT_CLEAR` | "Cleared slot: XII-A Mon P1" |
| | `TIMETABLE_AUTO_RESOLVE` | "Auto-resolved conflict: moved Mathematics (Julie) to Wed P5 in XII-A" |
| **Period Structure** | `PERIOD_STRUCTURE_CREATE` | "Created period structure 'Normal'" |
| | `PERIOD_STRUCTURE_UPDATE` | "Updated period structure 'Normal': added Friday" |
| | `SLOT_CREATE` | "Added slot P8 (14:55-15:30) to Normal structure" |
| | `SLOT_UPDATE` | "Updated P3 time: 10:50→10:45" |
| | `SLOT_DELETE` | "Removed slot P8 from Normal structure" |
| **Academic Year** | `ACADEMIC_YEAR_CREATE` | "Created academic year 2026-27" |
| | `ACADEMIC_YEAR_ACTIVATE` | "Activated academic year 2026-27" |
| **School Config** | `WORKING_DAYS_UPDATE` | "Updated working days for Normal structure" |
| **Auth** | `LOGIN` | "User admin@school.com logged in" |
| | `LOGOUT` | "User admin@school.com logged out" |

---

## Implementation Phases

### Phase 1: DynamoDB Table Setup

#### 1.1 Create DynamoDB table via Terraform

**File:** `infra/terraform/modules/dynamodb/main.tf`

Add `sms-audit-logs` table with:
- PK: `PK` (String)
- SK: `SK` (String)
- 3 GSIs (EntityType, User, Division)
- Pay-per-request billing (cost-efficient at low volume)
- No TTL (never delete)

#### 1.2 Local development setup

**File:** `docker-compose.yml`

The DynamoDB Local container is already running. Add table creation script for local dev.

#### 1.3 Environment variables

Add `AUDIT_LOG_TABLE` env var to all services (default: `sms-audit-logs`).

---

### Phase 2: Audit Log Service (Shared)

#### 2.1 Create audit log helper

**File:** `packages/shared/src/helpers/auditLogHelper.ts` (NEW)

```typescript
interface AuditLogEntry {
  schoolId: string;
  academicYearId?: string;
  userId: string;
  userEmail: string;
  userRole: string;
  ipAddress: string;
  userAgent: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  description: string;
  changes?: { field: string; oldValue: any; newValue: any }[];
  relatedEntities?: { type: string; id: string; name: string }[];
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  // Fire-and-forget: don't await, catch errors silently
  // Writes to DynamoDB with PK, SK, GSI attributes
}
```

#### 2.2 Create user context extractor

The service layer needs access to user identity (userId, email, role, IP, userAgent) from the Lambda event. Currently the auth middleware returns `{ schoolId }`. Need to extend it or pass context through.

**Approach:** Create a `RequestContext` type that carries user identity through the service layer:

```typescript
interface RequestContext {
  schoolId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  ipAddress: string;
  userAgent: string;
  academicYearId?: string;
}
```

The controller extracts this from the event + auth middleware and passes to service methods.

#### 2.3 Export from shared package

**File:** `packages/shared/src/index.ts`

Export `writeAuditLog`, `RequestContext` type.

---

### Phase 3: Instrument All Services

Add `writeAuditLog()` calls to every service method that modifies data. Fire-and-forget (don't await).

#### 3.1 Teacher service

**File:** `services/teacher/src/service.ts`

Methods to instrument:
- `create()` -- TEACHER_CREATE
- `update()` -- TEACHER_UPDATE (with before/after diff)
- `delete()` -- TEACHER_DELETE
- `updateAvailability()` -- TEACHER_AVAILABILITY_UPDATE
- `updateSubjects()` -- TEACHER_SUBJECTS_UPDATE

#### 3.2 Subject service

**File:** `services/subject/src/service.ts`

- `create()` -- SUBJECT_CREATE
- `update()` -- SUBJECT_UPDATE
- `delete()` -- SUBJECT_DELETE

#### 3.3 Class service

**File:** `services/class/src/service.ts`

- `create()` -- CLASS_CREATE
- `update()` -- CLASS_UPDATE
- `delete()` -- CLASS_DELETE
- Division CRUD within class service
- Class teacher swap

#### 3.4 Division-assignment service

**File:** `services/division-assignment/src/service.ts`

- `createAssignment()` -- ASSIGNMENT_CREATE
- `updateAssignment()` -- ASSIGNMENT_UPDATE
- `deleteAssignment()` -- ASSIGNMENT_DELETE
- `createElectiveAssignment()` -- ASSIGNMENT_CREATE (elective)
- `bulkSaveElectiveGroup()` -- ELECTIVE_BULK_SAVE (with full diff)
- `quickAssign()` -- ASSIGNMENT_CREATE

#### 3.5 Timetable service

**File:** `services/timetable/src/service.ts`

- `triggerGeneration()` -- TIMETABLE_GENERATE
- `swapSlots()` -- TIMETABLE_SLOT_SWAP
- `swapElectiveSlots()` -- TIMETABLE_ELECTIVE_SWAP
- `overrideSlot()` -- TIMETABLE_SLOT_OVERRIDE / TIMETABLE_SLOT_CLEAR
- `autoResolveConflict()` -- TIMETABLE_AUTO_RESOLVE
- `swapTeacherSlots()` -- TIMETABLE_SLOT_SWAP (from Enhancement 1)

#### 3.6 School-config service

**File:** `services/school-config/src/service.ts`

- Period structure CRUD
- Slot CRUD
- Working days update

#### 3.7 Academic-year service

**File:** `services/academic-year/src/service.ts`

- `create()` -- ACADEMIC_YEAR_CREATE
- `activate()` -- ACADEMIC_YEAR_ACTIVATE

#### 3.8 Auth service

**File:** `services/auth/src/service.ts`

- Login -- LOGIN
- Logout -- LOGOUT

#### 3.9 Update controller layer

All controllers need to build `RequestContext` from the Lambda event and pass to services. This requires updating every controller method signature to include context.

**Pattern:**
```typescript
// Before:
async create(event) {
  const auth = await authMiddleware(event);
  const result = await service.create(auth.schoolId!, dto);
}

// After:
async create(event) {
  const auth = await authMiddleware(event);
  const ctx = buildRequestContext(event, auth);
  const result = await service.create(ctx, dto);
}
```

**Helper:**
```typescript
function buildRequestContext(event: APIGatewayProxyEventV2, auth: AuthResult): RequestContext {
  return {
    schoolId: auth.schoolId!,
    userId: auth.userId ?? '',
    userEmail: auth.email ?? '',
    userRole: auth.role ?? 'UNKNOWN',
    ipAddress: event.requestContext.http.sourceIp,
    userAgent: event.headers?.['user-agent'] ?? '',
    academicYearId: undefined, // set by academicYearMiddleware if needed
  };
}
```

---

### Phase 4: Backend -- Audit Log Query API

#### 4.1 Create audit log query endpoint

**File:** `services/notification/src/service.ts` (repurpose this service)

Rename to audit-log focused service. New methods:

**`GET /api/audit-logs`** -- paginated list with filters

Query params:
- `page`, `pageSize` (pagination)
- `startDate`, `endDate` (date range)
- `entityType` (filter by entity)
- `userId` (filter by user)
- `divisionId` (filter by division)
- `search` (text search on description)
- `action` (filter by action type)

Returns:
```typescript
{
  data: AuditLogEntry[];
  meta: { page, pageSize, totalCount, totalPages };
}
```

**Note:** DynamoDB doesn't support COUNT efficiently for pagination. Use a scan with limit+lastEvaluatedKey for forward pagination, or estimate total from table metrics.

#### 4.2 Update router and controller

**File:** `services/notification/src/router.ts`, `services/notification/src/controller.ts`

Replace notification endpoints with audit log endpoints. Keep the service name as `notification` in serverless.yml to avoid CloudFront routing changes, or rename if acceptable.

#### 4.3 Update serverless.yml

**File:** `services/notification/serverless.yml`

Update routes. Add DynamoDB table ARN to IAM permissions.

---

### Phase 5: Frontend -- Audit Log Page

#### 5.1 Create audit log API slice

**File:** `apps/frontend/src/features/audit-log/auditLogApi.ts` (NEW)

```typescript
getAuditLogs: builder.query<PaginatedAuditLogs, AuditLogFilters>({
  query: (filters) => ({
    url: 'audit-logs',
    params: filters,
  }),
}),
```

#### 5.2 Create AuditLogPage

**File:** `apps/frontend/src/features/audit-log/AuditLogPage.tsx` (NEW)

Features:
- DataTable with columns: Timestamp | User | Action | Entity | Description | Details (expandable)
- Filter bar: date range picker, entity type dropdown, user dropdown, division dropdown, search input
- Pagination (same pattern as subjects table)
- Expandable row shows before/after changes and related entities
- Color-coded action badges (green=create, amber=update, red=delete, blue=system)

#### 5.3 Add sidebar entry

**File:** `apps/frontend/src/components/layout/Sidebar.tsx` (or equivalent)

Add "Audit Log" under a new "System" group in sidebar navigation. Icon: `ScrollText` or `FileText` from lucide.

---

### Phase 6: Remove Old Notification System

#### 6.1 Remove notification bell from header

**File:** `apps/frontend/src/components/layout/` (header component)

Remove the bell icon button and notification count badge.

#### 6.2 Remove notification API slice

**File:** `apps/frontend/src/features/notifications/` (if exists)

Remove notification-related API endpoints, hooks, and components.

#### 6.3 Remove notification service endpoints (old ones)

Keep the service file but remove `list()`, `count()`, `dismiss()`, `dismissAll()` methods. Replace with audit log queries.

#### 6.4 Remove `flagAffectedTimetables()` method

Already handled by Enhancement 3 (replaced with `recomputeTimetableStatus()`). Ensure the method in the notification service is deleted.

#### 6.5 Drop `timetable_notifications` table

**Migration:**
```sql
DROP TABLE IF EXISTS timetable_notifications;
```

Remove `TimetableNotification` model and `ConflictType` enum from Prisma schema.

---

### Phase 7: Testing

| # | Test | Expected |
|---|------|----------|
| 1 | Create a teacher | Audit log entry with TEACHER_CREATE, before=null, after=teacher data |
| 2 | Update teacher name | Entry with TEACHER_UPDATE, changes=[{field:"name", old:"X", new:"Y"}] |
| 3 | Delete a subject | Entry with SUBJECT_DELETE, entityName shows subject name |
| 4 | Swap timetable slots | Entry with TIMETABLE_SLOT_SWAP, relatedEntities shows both slots |
| 5 | Bulk save elective group | Entry with ELECTIVE_BULK_SAVE, detailed changes (subjects added/removed, teachers, P/W) |
| 6 | Filter by entity type | Only shows matching entries |
| 7 | Filter by user | Only shows that user's actions |
| 8 | Filter by date range | Only shows entries within range |
| 9 | Filter by division | Only shows entries related to that division |
| 10 | School admin sees all school logs | Correct school scoping |
| 11 | Teacher sees only own logs | Filtered by userId |
| 12 | Notification bell removed | No bell in header |
| 13 | Old notification endpoints return 404 | Endpoints removed |

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `infra/terraform/modules/dynamodb/main.tf` | Add sms-audit-logs table + 3 GSIs | 1 |
| `docker-compose.yml` or seed script | Create local DynamoDB table | 1 |
| `packages/shared/src/helpers/auditLogHelper.ts` | NEW -- writeAuditLog, RequestContext | 2 |
| `packages/shared/src/index.ts` | Export new helpers/types | 2 |
| `services/teacher/src/service.ts` | Add audit log calls to all CRUD methods | 3 |
| `services/teacher/src/controller.ts` | Build RequestContext, pass to service | 3 |
| `services/subject/src/service.ts` | Add audit log calls | 3 |
| `services/subject/src/controller.ts` | Build RequestContext | 3 |
| `services/class/src/service.ts` | Add audit log calls | 3 |
| `services/class/src/controller.ts` | Build RequestContext | 3 |
| `services/division-assignment/src/service.ts` | Add audit log calls | 3 |
| `services/division-assignment/src/controller.ts` | Build RequestContext | 3 |
| `services/timetable/src/service.ts` | Add audit log calls | 3 |
| `services/timetable/src/controller.ts` | Build RequestContext | 3 |
| `services/school-config/src/service.ts` | Add audit log calls | 3 |
| `services/school-config/src/controller.ts` | Build RequestContext | 3 |
| `services/academic-year/src/service.ts` | Add audit log calls | 3 |
| `services/academic-year/src/controller.ts` | Build RequestContext | 3 |
| `services/auth/src/service.ts` | Add login/logout logging | 3 |
| `services/notification/src/service.ts` | Repurpose: remove old methods, add audit log queries | 4 |
| `services/notification/src/router.ts` | Replace routes | 4 |
| `services/notification/src/controller.ts` | Replace controller methods | 4 |
| `services/notification/serverless.yml` | Update routes, add DynamoDB permissions | 4 |
| `apps/frontend/src/features/audit-log/auditLogApi.ts` | NEW -- API slice | 5 |
| `apps/frontend/src/features/audit-log/AuditLogPage.tsx` | NEW -- page component | 5 |
| `apps/frontend/src/components/layout/Sidebar.tsx` | Add "System" group + "Audit Log" entry | 5 |
| `apps/frontend/src/app/router.tsx` | Add /audit-log route | 5 |
| Header/Navbar component | Remove notification bell | 6 |
| `apps/frontend/src/features/notifications/` | Remove notification components/API | 6 |
| `packages/shared/prisma/schema.prisma` | Drop TimetableNotification model + ConflictType enum | 6 |

---

## Appendix: Current Code Inventory (for context after conversation compaction)

### Current Notification System (to be replaced)

| File | Key Details |
|------|-------------|
| `packages/shared/prisma/schema.prisma` lines 521-538 | `TimetableNotification` model: id, schoolId, timetableId, divisionId, conflictType, changeDescription, dismissed |
| `packages/shared/prisma/schema.prisma` lines 38-48 | `ConflictType` enum: TEACHER_CHANGED/DELETED, SUBJECT_CHANGED/DELETED, ASSIGNMENT_CHANGED, SLOT_CHANGED, STRUCTURE_CHANGED, AVAILABILITY_CHANGED, ELECTIVE_GROUP_CHANGED, SWAP_CONFLICT |
| `services/notification/src/service.ts` | list(), count(), dismiss(), dismissAll(), flagAffectedTimetables() |
| `packages/shared/src/helpers/notificationHelper.ts` | Shared `flagAffectedTimetables()` used by 6+ services |

### Auth Middleware (user identity source)

| File | Key Details |
|------|-------------|
| `packages/shared/src/middleware/authMiddleware.ts` | Extracts email from JWT claims, looks up SchoolUser, returns `{ schoolId, userId?, email?, role? }` |
| Lambda event | `event.requestContext.http.sourceIp` for IP, `event.headers['user-agent']` for user agent |

### DynamoDB (existing setup)

| File | Key Details |
|------|-------------|
| `docker-compose.yml` | DynamoDB Local on port 8000 |
| `infra/terraform/modules/dynamodb/main.tf` | Existing `timetable-prod-ws-connections` table |
| `services/websocket/` | Uses DynamoDB for WebSocket connection management -- reference pattern for DynamoDB usage |

### Notification Bell Location

Search for notification-related components in `apps/frontend/src/components/layout/` or the header/navbar component. The bell icon triggers notification list/count display.

## Implementation Order

```
Phase 1: DynamoDB table setup (Terraform + local dev)
Phase 2: Audit log helper + RequestContext (shared package)
Phase 3: Instrument ALL services (10 services, every CRUD method)
Phase 4: Audit log query API (repurpose notification service)
Phase 5: Frontend audit log page + sidebar entry
Phase 6: Remove old notification system (bell, endpoints, table)
Phase 7: Testing
```

Phase 3 is the largest phase -- touching 10 services and all their controller/service methods. It can be broken into sub-phases per service.
