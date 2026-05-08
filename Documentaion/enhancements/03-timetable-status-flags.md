# Enhancement 3: Timetable Status Flags Redesign

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 27, 2026

## Overview

Replace the current GENERATED/OUTDATED timetable status model with a computed, multi-status system that reflects the actual state of each timetable. Remove the FAB, setup wizard, and notification-driven status. Add per-slot violation annotations.

## Key Reference

**Elective logic**: See `Documentaion/Engine_Algorithm.md` section "Elective Groups -- Two Types" (line ~675) for:
- Per-division vs cross-division electives (`num_divisions = 1` vs `> 1`)
- Symmetric vs asymmetric cross-division electives
- Parallel vs split teacher mode (`parallel_sections`)
- Cross-div slots are co-scheduled at the same time across all divisions
- Teacher busy-marking uses UNION of all divisions' teachers

Status recomputation must understand these mechanics because:
- **Teacher conflict detection** for elective slots must check ALL teachers across ALL divisions of the elective group, not just the current division
- **Empty slot detection** for electives must consider that elective subjects run in parallel at the same slot -- adding/removing a subject doesn't change the slot count
- **Availability violations** must check all teachers assigned to the elective at that time coordinate, including split-mode teachers who aren't teaching every slot

## Current State

- `TimetableStatus` enum: `GENERATED | OUTDATED`
- Status is set imperatively (code explicitly sets OUTDATED when data changes)
- `timetable_notifications` table stores change records
- FAB doubles as notification hub + setup wizard
- No per-slot violation indicators
- Dashboard shows notification counts

## New Model

### Status Tags

| Status | Severity | Color | Badge Label | Description |
|--------|----------|-------|-------------|-------------|
| `VALID` | Good | Green | "Valid" | All slots correct, no violations |
| `PREFERENCE_VIOLATION_SOFT` | Low warning | Light amber/Yellow | "Soft Preference Break" | Soft scheduling preferences broken |
| `EMPTY_SLOTS` | Warning | Amber | "Incomplete" | Fewer scheduled slots than P/W requires, or slots with null assignment |
| `EXCESS_ASSIGNMENTS` | Warning | Amber | "Excess Assignments" | Total assignment P/W exceeds period structure's total slots |
| `PREFERENCE_VIOLATION_HARD` | High warning | Dark amber/Orange | "Hard Preference Break" | Hard scheduling preferences broken |
| `AVAILABILITY_VIOLATION` | Severe | Orange-red | "Availability Conflict" | Teacher scheduled when marked unavailable |
| `TEACHER_CONFLICT` | Critical | Red | "Teacher Conflict" | Teacher double-booked across divisions at overlapping time |
| `ORPHANED_SLOTS` | Critical | Red | "Orphaned Assignment" | Timetable slots reference a deleted assignment (edge case) |

A timetable can have **multiple statuses simultaneously**. The badge shows the most severe one with "+N more" indicator.

### Storage

Replace the `status TimetableStatus` enum column with a JSON field:

```json
{
  "statuses": ["TEACHER_CONFLICT", "EMPTY_SLOTS"],
  "details": {
    "teacherConflicts": [
      {
        "slotId": "abc",
        "teacherId": "xyz",
        "teacherName": "Julie",
        "dayLabel": "Monday",
        "periodNumber": 3,
        "conflictWith": { "className": "XI", "divisionLabel": "A", "periodNumber": 3 }
      }
    ],
    "emptySlotCount": 3,
    "availabilityViolations": [...],
    "hardPreferenceViolations": [...],
    "softPreferenceViolations": [...],
    "orphanedSlots": [...]
  },
  "computedAt": "2026-04-27T14:30:00Z"
}
```

### Per-Slot Annotations

Backend adds a `violations` array to each slot in the timetable grid response:

```json
{
  "timetableSlotId": "abc",
  "assignments": [...],
  "violations": [
    { "type": "TEACHER_CONFLICT", "teacherName": "Julie", "conflictWith": "XI-A P3" },
    { "type": "AVAILABILITY_VIOLATION", "teacherName": "Julie", "reason": "Unavailable on Wednesdays" }
  ]
}
```

Frontend renders exclamation mark icon on slots with violations. Clicking shows details. Both class timetable and teacher timetable views show violations. **Exports remain unchanged** (no violation markers).

## Decisions Made

| Decision | Answer |
|----------|--------|
| Storage model | JSON field on timetable table (replaces enum) |
| Multiple statuses | Yes -- timetable can have multiple simultaneously |
| Recomputation | Stored and recomputed on every relevant change |
| Recomputation includes | Teacher conflicts, empty/unassigned slots, availability violations, preference violations (hard+soft) |
| Per-slot annotations | Backend-annotated, shown in both class and teacher timetable views |
| Export behavior | Unchanged -- all statuses exportable, no violation markers in exports |
| Notifications table | Repurposed as audit log (Enhancement 6) |
| FAB | Removed entirely |
| Setup wizard | Removed entirely |
| Dashboard | Shows counts per status tag, replaces notification counts |
| WebSocket message | Renamed to `TIMETABLE_STATUS_CHANGED` with new status payload |
| DB migration | Replace enum column with JSON, recompute all existing timetables |
| Preference violations | Both hard (orange) and soft (yellow) detected, different severity levels |

## Recomputation Triggers

| # | Trigger | Affected Timetables |
|---|---------|-------------------|
| 1 | Timetable generation completes | The generated timetable(s) |
| 2 | DnD slot swap (regular) | Both swapped timetables (if cross-division) |
| 3 | DnD elective swap | All timetables of elective's divisions |
| 4 | Assignment add/edit/delete | Timetable of the assignment's division |
| 5 | Elective group bulk save | All timetables of affected divisions |
| 6 | Teacher delete | All timetables where teacher had slots |
| 7 | Teacher availability change | Timetable(s) in the affected division(s)/day(s) |
| 8 | Subject delete | All timetables that had this subject scheduled |
| 9 | Period structure change (slots added/removed) | All timetables using this structure |
| 10 | Working days change | All timetables using this structure |
| 11 | Class teacher swap | The affected division's timetable |
| 12 | Override slot (single cell edit) | That timetable |

---

## Implementation Phases

### Phase 1: Database Schema Migration -- IMPLEMENTED

#### 1.1 Create new migration -- DONE

**File:** `packages/shared/prisma/schema.prisma`

- Replace `status TimetableStatus` with `statusJson Json? @map("status_json")`
- Keep old `status` column temporarily for migration safety
- Add `statusComputedAt DateTime? @map("status_computed_at")`

#### 1.2 Migration SQL -- DONE

```sql
ALTER TABLE timetables ADD COLUMN status_json JSONB;
ALTER TABLE timetables ADD COLUMN status_computed_at TIMESTAMP;
-- Backfill: GENERATED → VALID, OUTDATED → needs recompute
UPDATE timetables SET status_json = '{"statuses":["VALID"],"details":{}}'::jsonb
  WHERE status = 'GENERATED';
UPDATE timetables SET status_json = '{"statuses":[],"details":{}}'::jsonb
  WHERE status = 'OUTDATED';
-- Drop old column after all services are updated
```

#### 1.3 Update Prisma client -- DONE

Run `prisma generate` to update the client with new field.

#### 1.4 Update `TimetableStatus` enum -- DONE (pre-built in Enhancement 14)

**File:** `packages/shared/src/models/enums.ts`

Replace old enum with new status constants:

```typescript
export const TimetableStatusTag = {
  VALID: 'VALID',
  PREFERENCE_VIOLATION_SOFT: 'PREFERENCE_VIOLATION_SOFT',
  EMPTY_SLOTS: 'EMPTY_SLOTS',
  PREFERENCE_VIOLATION_HARD: 'PREFERENCE_VIOLATION_HARD',
  AVAILABILITY_VIOLATION: 'AVAILABILITY_VIOLATION',
  TEACHER_CONFLICT: 'TEACHER_CONFLICT',
  ORPHANED_SLOTS: 'ORPHANED_SLOTS',
} as const;

export type TimetableStatusTag = typeof TimetableStatusTag[keyof typeof TimetableStatusTag];

export const STATUS_SEVERITY: Record<TimetableStatusTag, number> = {
  VALID: 0,
  PREFERENCE_VIOLATION_SOFT: 1,
  EMPTY_SLOTS: 2,
  PREFERENCE_VIOLATION_HARD: 3,
  AVAILABILITY_VIOLATION: 4,
  TEACHER_CONFLICT: 5,
  ORPHANED_SLOTS: 6,
};

export interface TimetableStatusJson {
  statuses: TimetableStatusTag[];
  details: {
    teacherConflicts?: { slotId: string; teacherId: string; teacherName: string; dayLabel: string; periodNumber: number; conflictWith: { className: string; divisionLabel: string; periodNumber: number } }[];
    emptySlotCount?: number;
    availabilityViolations?: { slotId: string; teacherId: string; teacherName: string; dayLabel: string; periodNumber: number; reason: string }[];
    hardPreferenceViolations?: { slotId: string; assignmentId: string; subjectName: string; violation: string }[];
    softPreferenceViolations?: { slotId: string; assignmentId: string; subjectName: string; violation: string }[];
    orphanedSlots?: { slotId: string; subjectName: string; teacherName: string }[];
  };
  computedAt: string;
}
```

---

### Phase 2: Status Recomputation Engine -- IMPLEMENTED

> The recomputation helper was pre-built in Enhancement 14, Phase 7.
> File: `packages/shared/src/helpers/timetableStatusHelper.ts`
>
> **Already available from `@timetable/shared`:**
> ```typescript
> import {
>   TimetableStatusTag, STATUS_SEVERITY,
>   recomputeTimetableStatus, recomputeMultipleTimetableStatuses,
>   findAffectedTimetableIds,
>   type TimetableStatusTagType, type TimetableStatusJson,
> } from '@timetable/shared';
> ```
>
> - `recomputeTimetableStatus(timetableId)` -- full status check (empty slots, teacher conflicts, availability, excess assignments, orphaned slots)
> - Uses `findTeachersAtTime()` from Phase 1 for conflict detection
> - Updates `status_json` column via raw SQL (safe if column doesn't exist yet)
> - Scheduling preference violations are stubbed (TODO in this phase)
>
> **What still needs to be done in this phase:**
> 1. Run the Prisma migration to add `status_json` column
> 2. Implement scheduling preference violation checks (hard + soft)
> 3. Wire `recomputeTimetableStatus()` into all 6+ services after data changes

#### 2.1 Complete preference violation checks in `recomputeTimetableStatus()` -- DONE

This is the core function that evaluates a timetable and returns its status. Called after every change.

**Input:** `schoolId`, `timetableId`

**Logic:**

```
1. Load timetable with division info
2. Load all timetable_slots with assignments, teachers, workingDay, slot
3. Load teacher availability records for all teachers in this timetable
4. Load scheduling preferences from each assignment

5. CHECK: Teacher Conflicts
   For each slot with a teacher, find if that teacher has another slot at
   overlapping time in a different timetable (same dayOfWeek, time range overlap).
   Record each conflict.

6. CHECK: Empty/Unassigned Slots
   Count total expected periods (from period structure working days × period slots).
   Count actual filled slots. Difference = empty slots.
   Also count slots with null divisionAssignmentId.

7. CHECK: Availability Violations
   For each slot, check if the teacher has a TeacherAvailability record
   matching (teacherId, workingDayId, slotId). If yes, teacher is marked
   unavailable at that time -- violation.

8. CHECK: Preference Violations (Hard)
   For each slot, check the assignment's schedulingPreferences JSON:
   - Excluded days: is the slot on an excluded day?
   - Excluded period ranges: is the slot in an excluded range?
   - Other hard constraints
   Record each violation.

9. CHECK: Preference Violations (Soft)
   Same as hard but for soft constraints.

10. CHECK: Orphaned Slots
    Slots where divisionAssignment.deletedAt IS NOT NULL (edge case).

11. Build status JSON:
    - If no violations → ["VALID"]
    - Otherwise → list of applicable status tags
    - Include details for each

12. Update timetable record with new statusJson and statusComputedAt
```

#### 2.2 Create `recomputeMultipleTimetableStatuses()` helper -- DONE (pre-built)

Batch version that recomputes status for multiple timetable IDs. Used when a change affects many timetables (e.g., teacher delete).

#### 2.3 Create per-slot violation annotator -- DONE

**File:** `packages/shared/src/helpers/slotViolationHelper.ts` (NEW)

Function that takes timetable slots + teacher availability + preferences and returns violations per slot. Used by the timetable grid API responses (both class and teacher views).

---

### Phase 3: Replace `flagAffectedTimetables()` with Recomputation -- IMPLEMENTED

#### 3.1 Replace all `flagAffectedTimetables()` calls -- DONE

Replace the current pattern:
```typescript
await flagAffectedTimetables({ schoolId, entityType: '...', entityId: '...', ... });
```

With:
```typescript
await recomputeAffectedTimetableStatuses(schoolId, affectedTimetableIds);
```

Each call site already knows which timetables are affected. Instead of setting OUTDATED, recompute the actual status.

**Files to update:**
- `services/division-assignment/src/service.ts` (6 call sites)
- `services/teacher/src/service.ts` (3 call sites + 1 direct OUTDATED set)
- `services/subject/src/service.ts` (1 call site + 1 direct OUTDATED set)
- `services/class/src/service.ts` (1 direct OUTDATED set)
- `services/school-config/src/service.ts` (1 direct OUTDATED set)
- `services/notification/src/service.ts` (1 method -- may be removed/refactored)

#### 3.2 Update timetable generation endpoint -- DONE

**File:** `services/timetable/src/service.ts`

After generation completes, call `recomputeTimetableStatus()` instead of setting `GENERATED`.

#### 3.3 Update Python engine output writer -- DONE

**File:** `engine/timetable-generator/src/output_writer.py`

Change `status = 'GENERATED'` to either:
- Set the JSON status directly in SQL
- Or set a placeholder that the Node.js callback recomputes

Simpler approach: engine sets `status_json = '{"statuses":["VALID"],"details":{}}'` since freshly generated timetables should be valid. The Node.js callback can recompute to verify.

#### 3.4 Update swap endpoints -- DONE

All swap endpoints (`swapSlots`, `swapElectiveSlots`, `swapTeacherSlots`) should recompute status for affected timetables after executing the swap.

#### 3.5 Update override endpoint -- DONE

`overrideSlot()` should recompute status after the override.

---

### Phase 4: Update Timetable Grid APIs with Violations

#### 4.1 Update `getDivisionTimetable()` response

**File:** `services/timetable/src/service.ts`

Add `violations` array to each period in the response. Use the slot violation annotator from Phase 2.3.

Add timetable-level status summary to the response:
```typescript
{
  timetable: {
    id, divisionId,
    statusJson: { statuses: [...], details: {...} },
    ...
  },
  days: [{ periods: [{ ..., violations: [...] }] }]
}
```

#### 4.2 Update `getTeacherTimetable()` response

Same violation annotation for the teacher timetable view. Each slot shows violations relevant to the viewed teacher.

#### 4.3 Update frontend `TimetableGrid` and `TimetablePeriod` types

**File:** `apps/frontend/src/features/timetable/timetableApi.ts`

Add `violations` array to `TimetablePeriod` type. Add `statusJson` to timetable response.

---

### Phase 5: Frontend -- Status Badges & Filtering

#### 5.1 Create `TimetableStatusBadge` component

**File:** `apps/frontend/src/components/shared/TimetableStatusBadge.tsx` (NEW)

Renders the most severe status as a colored badge with "+N more" indicator. Tooltip shows all statuses.

#### 5.2 Update TimetablesOverviewPage

- Replace GENERATED/OUTDATED filter buttons with status tag filter (multi-select)
- Show status badges per division
- Replace "Regenerate Outdated" with "Regenerate" button that shows warning: "You can resolve issues manually via drag-and-drop instead of regenerating"
- Filter by any status tag

#### 5.3 Update ClassesPage

Replace GENERATED/OUTDATED counts with status-based counts.

#### 5.4 Update ClassDetailPage

Replace status badge rendering.

#### 5.5 Update GeneratorPage

Replace status badge and conditional logic.

#### 5.6 Update TimetableViewPage

Replace status badge. Show per-slot violation indicators (exclamation marks). Click to see violation details.

#### 5.7 Update TeacherTimetableGrid

Show per-slot violation indicators for the viewed teacher.

---

### Phase 6: Frontend -- Remove FAB & Setup Wizard

#### 6.1 Remove FAB component

Delete the FAB component and all references.

#### 6.2 Remove Setup Wizard

Delete the setup wizard stepper, progress tracking, and all related components/API calls.

#### 6.3 Remove notification-related UI

- Remove notification count badges
- Remove notification list/dismiss functionality
- Keep the notification service for audit logging (Enhancement 6)

---

### Phase 7: Dashboard Update

#### 7.1 Update dashboard API

**File:** `services/dashboard/src/service.ts`

Replace `GENERATED` count with per-status-tag counts:
```json
{
  "timetableStats": {
    "total": 25,
    "valid": 18,
    "teacherConflict": 3,
    "emptySlots": 2,
    "availabilityViolation": 1,
    "preferenceViolationHard": 1,
    "preferenceViolationSoft": 4,
    "notGenerated": 5
  }
}
```

#### 7.2 Update dashboard frontend

Replace notification counts with status summary cards. Color-coded counts matching the status severity scheme.

---

### Phase 8: WebSocket Update

#### 8.1 Rename WebSocket message

Change `TIMETABLE_OUTDATED` to `TIMETABLE_STATUS_CHANGED`.

Include new status in payload:
```json
{
  "type": "TIMETABLE_STATUS_CHANGED",
  "timetableId": "abc",
  "divisionId": "def",
  "statuses": ["TEACHER_CONFLICT", "EMPTY_SLOTS"]
}
```

#### 8.2 Update frontend WebSocket handler

**File:** `apps/frontend/src/hooks/useWebSocket.ts`

Handle `TIMETABLE_STATUS_CHANGED` message -- invalidate timetable cache tags.

---

### Phase 9: Migration & Backfill

#### 9.1 Migration script

For all existing timetables:
- Run `recomputeTimetableStatus()` on each timetable
- This properly evaluates VALID vs actual conflicts

#### 9.2 Drop old `status` column

After all services are deployed and verified:
- Remove old `status TimetableStatus` enum column
- Remove `TimetableStatus` enum from schema
- Clean migration

---

### Phase 10: Cleanup

#### 10.1 Remove old code

- Delete `flagAffectedTimetables()` helper
- Delete `TimetableStatus` enum
- Remove unused notification service methods
- Remove FAB-related code
- Remove setup wizard code
- Update CLAUDE.md

#### 10.2 Update documentation

- Update SRS.md
- Update Engine_Algorithm.md
- Update CLAUDE.md with new status model

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `packages/shared/prisma/schema.prisma` | Replace status enum with JSON field | 1 |
| `packages/shared/src/models/enums.ts` | New status tag constants + types | 1 |
| `packages/shared/src/helpers/timetableStatusHelper.ts` | NEW -- recomputation engine | 2 |
| `packages/shared/src/helpers/slotViolationHelper.ts` | NEW -- per-slot violation annotator | 2 |
| `packages/shared/src/helpers/notificationHelper.ts` | Remove `flagAffectedTimetables` | 3 |
| `services/timetable/src/service.ts` | Update generation, swap, override, grid APIs | 3-4 |
| `services/division-assignment/src/service.ts` | Replace 6 flagAffected calls | 3 |
| `services/teacher/src/service.ts` | Replace 3 flagAffected calls + 1 direct set | 3 |
| `services/subject/src/service.ts` | Replace 1 flagAffected call + 1 direct set | 3 |
| `services/class/src/service.ts` | Replace 1 direct OUTDATED set | 3 |
| `services/school-config/src/service.ts` | Replace 1 direct OUTDATED set | 3 |
| `services/notification/src/service.ts` | Refactor for audit logging | 3 |
| `services/dashboard/src/service.ts` | New status-based counts | 7 |
| `engine/timetable-generator/src/output_writer.py` | Set JSON status instead of enum | 3 |
| `apps/frontend/src/features/timetable/timetableApi.ts` | Update types with violations + statusJson | 4 |
| `apps/frontend/src/components/shared/TimetableStatusBadge.tsx` | NEW -- status badge component | 5 |
| `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx` | Status filter + badges | 5 |
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Per-slot violation indicators | 5 |
| `apps/frontend/src/features/timetable/GeneratorPage.tsx` | Status badge update | 5 |
| `apps/frontend/src/features/classes/ClassesPage.tsx` | Status counts update | 5 |
| `apps/frontend/src/features/classes/ClassDetailPage.tsx` | Status badge update | 5 |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetableGrid.tsx` | Per-slot violations | 5 |
| FAB component + Setup Wizard | DELETE | 6 |
| `apps/frontend/src/features/dashboard/DashboardPage.tsx` | Status summary cards | 7 |
| `apps/frontend/src/hooks/useWebSocket.ts` | Rename message type | 8 |

## Implementation Order

```
Phase 1:  DB schema migration (add JSON field, keep old column)
Phase 2:  Recomputation engine + slot violation annotator
Phase 3:  Replace all flagAffected calls + update engine
Phase 4:  Update timetable grid APIs with violations
Phase 5:  Frontend status badges, filtering, per-slot indicators
Phase 6:  Remove FAB + setup wizard
Phase 7:  Dashboard update
Phase 8:  WebSocket update
Phase 9:  Migration backfill (recompute all existing timetables)
Phase 10: Cleanup (drop old column, delete dead code, update docs)
```

---

## Appendix: Current Code Inventory (for context after conversation compaction)

### Prisma Schema

- `packages/shared/prisma/schema.prisma` lines 33-36: `TimetableStatus` enum (GENERATED, OUTDATED)
- `packages/shared/prisma/schema.prisma` line 447: `status TimetableStatus` field on Timetable model
- `packages/shared/src/models/enums.ts` lines 14-17: TypeScript enum export

### Backend -- Status WRITE locations (set GENERATED or OUTDATED)

| File | Line(s) | What it does |
|------|---------|-------------|
| `services/timetable/src/service.ts` | ~232, ~243 | Sets GENERATED on timetable upsert after generation |
| `packages/shared/src/helpers/notificationHelper.ts` | ~120-123 | `flagAffectedTimetables()` -- checks if not OUTDATED, sets OUTDATED |
| `services/notification/src/service.ts` | ~151 | Bulk update to OUTDATED |
| `services/class/src/service.ts` | ~340 | Teacher swap → sets OUTDATED |
| `services/teacher/src/service.ts` | ~589 | Teacher delete → sets OUTDATED |
| `services/subject/src/service.ts` | ~165 | Subject delete → sets OUTDATED |
| `services/school-config/src/service.ts` | ~837 | Period structure change → sets OUTDATED |
| `engine/timetable-generator/src/output_writer.py` | ~165, ~177 | Sets 'GENERATED' in SQL UPDATE/INSERT |

### Backend -- Status READ locations (filter/check GENERATED or OUTDATED)

| File | Line(s) | What it does |
|------|---------|-------------|
| `services/teacher/src/service.ts` | ~164, ~265 | Query timetable slots with `status: { in: ['GENERATED', 'OUTDATED'] }` |
| `services/export/src/service.ts` | ~631 | Same filter for free periods export |
| `services/dashboard/src/service.ts` | ~112 | Count timetables with `status: 'GENERATED'` for setup wizard |

### Backend -- `flagAffectedTimetables()` call sites

| File | Line(s) | Trigger |
|------|---------|---------|
| `services/division-assignment/src/service.ts` | ~139, ~164, ~705, ~726, ~810, ~1175 | Assignment create/update/delete, elective bulk save |
| `services/teacher/src/service.ts` | ~509, ~639, ~690 | Teacher update, availability change, subject assignment change |
| `services/subject/src/service.ts` | ~101 | Subject update |

### Frontend -- Status display locations

| File | Line(s) | What it renders |
|------|---------|----------------|
| `apps/frontend/src/features/classes/ClassesPage.tsx` | ~124-125 | Filter/count by GENERATED/OUTDATED |
| `apps/frontend/src/features/classes/ClassDetailPage.tsx` | ~267-269, ~288 | Status badge (green/warning) |
| `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx` | ~278-279, ~287, ~342, ~350, ~451-454, ~459 | Filter, count, badge, export button visibility |
| `apps/frontend/src/features/timetable/GeneratorPage.tsx` | ~108-135 | Status badge, icon, text |
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | ~340 | Status badge in header |
| `apps/frontend/src/hooks/useWebSocket.ts` | ~76 | `TIMETABLE_OUTDATED` message handler |

### Frontend -- FAB & Setup Wizard locations (to be deleted)

Search for: `SetupWizard`, `FAB`, `setupStep`, `guidedSetup`, `useSetupProgress` across `apps/frontend/src/`.

### Teacher Availability (for violation detection)

- `packages/shared/prisma/schema.prisma` lines 273-288: `TeacherAvailability` model
- Records `(teacherId, workingDayId, slotId)` tuples where teacher is **unavailable**
- Unique constraint: `@@unique([teacherId, academicYearId, workingDayId, slotId])`

### Scheduling Preferences (for violation detection)

- `DivisionAssignment.schedulingPreferences` -- JSONB field
- Contains: preferred/excluded days, period ranges, adjacency, min/max per day
- Each preference has `constraintType: 'HARD' | 'SOFT'`
