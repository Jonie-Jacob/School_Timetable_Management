# Enhancement 4: Timetable-Aware Assignment Editing

> Status: IN PROGRESS -- Phase 1 complete
> Created: April 27, 2026
> Last updated: May 11, 2026

## Progress

- [x] Phase 1 -- `timetable_generated` flag (DB, trigger, API)
- [ ] Phase 2 -- Restrict per-division generation
- [ ] Phase 3 -- Backend impact assessment + resolution endpoints
- [ ] Phase 4 -- Backend assignment CRUD impact integration
- [ ] Phase 5 -- Frontend Unified Resolution Modal
- [ ] Phase 6 -- Integrate resolution into Assignment Editor
- [ ] Phase 7 -- Integrate resolution into other surfaces
- [ ] Phase 8 -- Generation restriction UI

## Key Reference

**Elective logic**: See `Documentaion/Engine_Algorithm.md` section "Elective Groups -- Two Types" (line ~675) for:
- Per-division vs cross-division electives, parallel vs split mode
- `parallel_sections` × `periodsPerWeek` determines max total weightage per subject
- Split mode: teachers take turns, `weightage` per teacher must fit within `P/W × parallel_sections`
- Parallel mode: all teachers teach every slot, each teacher's weightage = `periodsPerWeek`

**Status flags**: See `Documentaion/enhancements/03-timetable-status-flags.md` for the status model this enhancement integrates with.

**Existing assignment editing**: See `services/division-assignment/src/service.ts` for create/update/delete methods. See `apps/frontend/src/features/assignments/AssignmentEditorPage.tsx` for the UI.

## Overview

Make ALL assignment editing timetable-aware: show impact on existing timetable slots, detect conflicts, and provide a unified step-by-step resolution wizard. Also add a mini timetable preview, a `timetable_generated` flag, and restrict per-division generation before first full generation.

## Scope

| Feature | Included |
|---------|----------|
| Unified Resolution Modal (wizard with dynamic steps) | Yes |
| P/W Balancer step | Yes |
| Slot Removal visual picker step | Yes |
| Slot Fill (subject + teacher picker) step | Yes |
| Teacher Conflict resolution step | Yes |
| Cross-div cascade flow (N/N counter) | Yes |
| Mini timetable preview on Assignment Editor | Yes |
| Timetable-aware validation on all CRUD surfaces | Yes |
| Quick Assign with resolution modal | Yes |
| `timetable_generated` flag on academic year | Yes |
| Remove per-division generation before first Generate All | Yes |
| Elective P/W weightage adjustment | Enhancement 5 (uses same modal) |

## Decisions Made

| Decision | Answer |
|----------|--------|
| Timetable-aware checks only active after first generation? | Yes -- flag per (school, academicYear) set on "Generate All" |
| Per-division generation before first Generate All? | No -- removed. Only "Generate All" available first time |
| Per-division generation after first Generate All? | Yes -- allowed |
| P/W exceeds limit -- block save? | No -- save with warning, then show resolution modal |
| Delete assignment with slots? | Allow -- show resolution modal to fill freed slots |
| Teacher max P/W enforcement? | Warning only, not blocked. Status recompute flags it |
| Resolution modal closeable without resolving? | Yes -- user can "resolve later", status reflects issues |
| Dry-run preview before save? | No -- save naturally, status recomputes, resolution modal opens |
| Mini timetable on Assignment Editor? | Read-only condensed preview + "View" button to full timetable |
| Resolution step ordering? | Teacher Conflicts → Slot Removal → Slot Fill → P/W Balance |
| New assignment inline creation from Slot Fill? | Yes -- allow creating new assignment from freed slot UI |
| Visual slot picker for slot removal? | Yes -- timetable grid with checkboxes |
| Cross-div slot removal? | Single picker, removes from ALL divisions simultaneously |

---

## Resolution Scenarios

### All Triggers That Open the Resolution Modal

| # | Trigger | Source Surface | What Resolution Shows |
|---|---------|---------------|----------------------|
| A1 | Add assignment (timetable exists, P/W now exceeds) | Assignment Editor | P/W Balancer for that division |
| A2 | Delete assignment (has timetable slots) | Assignment Editor | Slot Fill -- pick subject+teacher for each freed slot |
| A3 | Increase P/W (exceeds total) | Assignment Editor | P/W Balancer for that division |
| A4 | Decrease P/W (excess slots) | Assignment Editor | Slot Removal -- visual picker for excess slots |
| A5 | Change teacher (conflicts at slot times) | Assignment Editor | Teacher Conflict resolution table |
| A6 | Change assistant teacher (conflicts) | Assignment Editor | Teacher Conflict resolution table |
| A7 | Quick assign (teacher conflicts) | Unassigned Subjects | Teacher Conflict resolution table |
| T1 | Change teacher via cell editor | Timetable View | Teacher Conflict resolution table |

### Cross-Division Cascade (from P/W Balancer)

When the P/W Balancer reduces a cross-div elective's P/W:
1. `ElectiveGroup.periodsPerWeek` is updated immediately
2. Cascade warning shown: "This affects divisions X, Y, Z"
3. If user proceeds, current step saves
4. New steps are appended to the wizard for each cascaded division
5. Step counter updates dynamically (e.g., 1/1 → 1/3)
6. Each cascaded division shows its own resolution (Slot Removal for the freed time slot + Slot Fill if user wants to assign something else)

**Cross-div slot removal**: Since cross-div electives share time coordinates, the slot picker is shown ONCE and removes from ALL divisions simultaneously. Cascade steps only handle filling the freed slots.

---

## Resolution Step Types

### Step Type 1: Teacher Conflict Resolution

**When**: Teacher changed, new teacher has conflicts at existing slot times.

**UI**: Table with columns:
- Class Division | Conflict Reason | Resolution (dropdown with swap candidates) | Action (Resolve button)
- Reuses `ConflictResolutionTable` component from Enhancement 1

**Behavior**: Each row resolved independently. Row turns green on success. User can skip (close modal).

### Step Type 2: Slot Removal (Visual Picker)

**When**: P/W decreased, excess slots need removing.

**UI**: Condensed timetable grid showing the division's week. Slots belonging to the affected subject are highlighted with checkboxes. For electives, each time coordinate is one selectable item (all parallel subjects at that time shown together). Shows exactly how many to remove: "Select 2 slots to remove."

**For cross-div electives**: Single picker (shared times), note shows "Affects: XII A, XII B, XII C."

**Behavior**: User checks the required number of slots → "Remove Selected" button → slots deleted from all affected divisions.

### Step Type 3: Slot Fill (Subject + Teacher Picker)

**When**: Assignment deleted or slot freed, empty slots to fill.

**UI**: List of freed slots with:
- Day + Period label
- Subject dropdown (existing assignments in this division + "Create new assignment" option)
- Teacher dropdown (filtered by subject qualification, shows load)
- "Assign" button per slot
- Or "Leave empty" option

**Behavior**: Each slot filled independently. Unfilled slots remain empty (EMPTY_SLOTS status).

### Step Type 4: P/W Balancer

**When**: Total P/W exceeds period structure total slots after a change.

**UI**: Table showing ALL subjects in the division:
- Subject Name | Elective Group | Current P/W (editable) | Status
- "Just changed" label on the subject that was just modified (still editable)
- Cross-div elective rows show cascade warning icon
- Total row at bottom: "42 / 40 -- reduce by 2"
- Save button disabled until total <= limit

**Behavior**: User adjusts P/W values. If a cross-div elective is reduced, cascade warning shown. On save, assignment weightages are updated. If cascade needed, new steps appended to wizard.

### Step Ordering

When multiple step types are needed for a single division:

```
1. Teacher Conflicts (most urgent -- double-bookings)
2. Slot Removal (if P/W decreased)
3. Slot Fill (if slots freed from deletion or removal)
4. P/W Balance (if total exceeds)
```

---

## Implementation Phases

### Phase 1: Database -- `timetable_generated` Flag ✅ COMPLETE

#### 1.1 Add migration ✅

**File:** `packages/shared/prisma/schema.prisma`

Added to `AcademicYear` model:
```prisma
timetableGeneratedAt DateTime? @map("timetable_generated_at")
```

#### 1.2 Migration SQL ✅

**File:** `packages/shared/prisma/migrations/20260511120000_add_timetable_generated_at_to_academic_years/migration.sql`

```sql
ALTER TABLE "academic_years" ADD COLUMN "timetable_generated_at" TIMESTAMP(3);
```

Applied to local dev DB via `prisma db execute`, marked applied via `prisma migrate resolve --applied`.

#### 1.3 Set flag on "Generate All" ✅

**File:** `services/timetable/src/service.ts`

In `triggerGeneration()`, after divisions validation, count total active divisions for the academic year. If `divisionIds.length === totalActiveDivisions`, this is a full generation -- set the flag. Always overwrites (latest full-gen attempt timestamp).

```typescript
const totalActiveDivisions = await prisma.division.count({
  where: { schoolId, academicYearId, deletedAt: null },
});
const isFullGeneration = divisionIds.length === totalActiveDivisions;
if (isFullGeneration) {
  await prisma.academicYear.update({
    where: { id: academicYearId },
    data: { timetableGeneratedAt: new Date() },
  });
}
```

#### 1.4 Expose flag in API ✅

Backend: no change needed -- `services/academic-year/src/service.ts` uses default Prisma return (no explicit `select`), so the new field is auto-included in all responses (list, getById, update, activate).

Frontend: `apps/frontend/src/features/academic-years/academicYearApi.ts` -- added `timetableGeneratedAt: string | null` to the `AcademicYear` interface.

---

### Phase 2: Restrict Per-Division Generation

#### 2.1 Backend guard

**File:** `services/timetable/src/service.ts`

In `triggerGeneration()`, check if `timetableGeneratedAt` is null:
- If null AND request is not for ALL divisions → throw error "Generate All must be run first"
- If null AND request is for ALL divisions → allow and set the flag
- If not null → allow any generation (per-division or all)

#### 2.2 Frontend -- hide per-division generate buttons before first generation

**File:** `apps/frontend/src/features/timetable/GeneratorPage.tsx`
**File:** `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx`

Check `academicYear.timetableGeneratedAt`:
- If null: only show "Generate All" button, hide per-division generate buttons
- If set: show all buttons (per-division and all)

---

### Phase 3: Backend -- Timetable Impact Assessment -- TYPES ALREADY BUILT (Enhancement 14, Phase 8)

> Types and skeleton were pre-built in Enhancement 14, Phase 8.
> File: `packages/shared/src/helpers/assignmentImpactHelper.ts`
>
> **Already available from `@timetable/shared`:**
> ```typescript
> import {
>   assessAssignmentImpact,
>   type AssignmentImpact, type ResolutionStep, type ResolutionStepType,
>   type TeacherConflictDetails, type SlotRemovalDetails,
>   type SlotFillDetails, type PwBalanceDetails, type WeightageAdjustmentDetails,
> } from '@timetable/shared';
> ```
>
> - All types fully defined (5 step detail interfaces)
> - `assessAssignmentImpact()` is a skeleton returning `{ hasImpact: false, steps: [] }`
> - **This phase fills in the actual assessment logic**

#### 3.1 Implement `assessAssignmentImpact()` logic

#### 3.2 Create `getAssignmentImpact()` endpoint

**File:** `services/division-assignment/src/service.ts`

New method that returns the impact of a just-saved change. Called by frontend after saving.

**Route:** `POST /api/assignments/impact`

**Request:**
```typescript
{
  divisionId: string;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  assignmentId: string;
  previousValues?: { teacherId?: string; weightage?: number }; // for comparison
}
```

**Response:** `AssignmentImpact` with resolution steps

#### 3.3 Create resolution execution endpoints

These endpoints execute individual resolution actions:

**`POST /api/assignments/resolve-pw-balance`**
```typescript
{
  changes: { assignmentId: string; newWeightage: number }[];
}
```
Updates multiple assignment weightages atomically. Triggers status recompute for affected timetables.

**`POST /api/assignments/resolve-slot-removal`**
```typescript
{
  slotIds: string[]; // timetable_slot IDs to delete
}
```
Deletes specified timetable slots. Triggers status recompute.

**`POST /api/assignments/resolve-slot-fill`**
```typescript
{
  fills: { timetableSlotId: string; divisionAssignmentId: string }[];
}
```
Assigns subjects to empty slots. Triggers status recompute.

(Teacher conflict resolution already exists via `swapSlots` and `getResolutionCandidates`.)

#### 3.4 P/W Balancer data endpoint

**`GET /api/assignments/division-pw-summary/:divisionId`**

Returns all subjects in a division with their P/W, grouped properly:
```typescript
{
  divisionId: string;
  className: string;
  divisionLabel: string;
  totalSlots: number; // from period structure
  subjects: {
    assignmentId: string;
    subjectName: string;
    teacherName: string;
    weightage: number;
    electiveGroupId: string | null;
    electiveGroupName: string | null;
    isCrossDiv: boolean;
    crossDivDivisions: string[]; // if cross-div, list other divisions
  }[];
  totalWeightage: number;
}
```

---

### Phase 4: Backend -- Update Assignment CRUD for Impact

#### 4.1 Update `createAssignment()`

After creating, if `timetableGeneratedAt` is set, compute impact and return it alongside the assignment.

#### 4.2 Update `updateAssignment()`

After updating, compute impact. If teacher changed, check conflicts at existing slot times. If weightage changed, check P/W balance.

#### 4.3 Update `deleteAssignment()`

Remove the current block on deleting assignments with slots. Instead:
- Soft-delete the assignment
- Hard-delete its timetable slots
- Compute impact (freed slots, P/W imbalance)
- Return impact for resolution

#### 4.4 Update `quickAssign()`

After creating assignment, compute full impact (not just conflict detection). Return impact for resolution modal.

#### 4.5 Update response types

All assignment CRUD responses include `impact?: AssignmentImpact` when timetable exists.

---

### Phase 5: Frontend -- Unified Resolution Modal

#### 5.1 Create `ResolutionWizardModal` component

**File:** `apps/frontend/src/components/shared/ResolutionWizardModal.tsx` (NEW)

The core component. Props:
```typescript
interface ResolutionWizardModalProps {
  open: boolean;
  onClose: () => void;
  initialSteps: ResolutionStep[];
  onStepComplete: (stepIndex: number, result: any) => void;
}
```

Features:
- Dynamic step counter: "Step 1/3" with left/right navigation
- Step type determines which sub-component renders
- Steps can be added dynamically (cascade)
- "Resolve Later" button to close without completing all steps
- Completed steps show green checkmark, can't be re-entered

#### 5.2 Create `TeacherConflictStep` component

Reuses `ConflictResolutionTable` from Enhancement 1.

#### 5.3 Create `SlotRemovalStep` component

Visual timetable grid with checkboxes on the affected subject's slots.
- Shows "Select N slots to remove"
- Disables "Remove" button until exactly N selected
- For elective slots, shows all parallel subjects at each time coordinate
- For cross-div: note "Affects: XII A, XII B, XII C"

#### 5.4 Create `SlotFillStep` component

List of freed slots with subject + teacher pickers.
- Subject dropdown: existing assignments + "Create new assignment"
- Teacher dropdown: filtered by qualification, shows load
- "Assign" button per slot
- "Leave empty" option per slot

#### 5.5 Create `PwBalancerStep` component

Editable P/W table for all subjects in a division.
- "Just changed" label on recently modified subject
- All P/W fields editable (including the just-changed one)
- Cross-div elective rows show warning icon
- Total row: "42 / 40 -- reduce by 2"
- On cross-div P/W change: cascade warning dialog → "Proceed" appends cascade steps
- "Save" disabled until total <= limit

---

### Phase 6: Frontend -- Integrate Resolution into Assignment Editor

#### 6.1 Wire resolution modal into AssignmentEditorPage

After any assignment save (create/update/delete):
1. Check response for `impact` field
2. If `impact.hasImpact && impact.steps.length > 0` → open `ResolutionWizardModal` with steps
3. If no impact → just show success toast

#### 6.2 Add mini timetable preview

Condensed read-only timetable grid on the Assignment Editor page. Shows subject abbreviations in small cells. "View" button navigates to full timetable view.

Only shown when `timetableGeneratedAt` is set for the academic year.

#### 6.3 Add P/W warning on input

When editing P/W and it would exceed the period structure total:
- Show inline warning below the P/W input: "Total P/W will exceed available slots by X"
- Still allow save

---

### Phase 7: Frontend -- Integrate Resolution into Other Surfaces

#### 7.1 Timetable View inline editor

After teacher change via cell editor, check impact. If teacher conflicts, open resolution modal.

#### 7.2 Unassigned Subjects Quick Assign

After quick assign, check impact. If conflicts, open resolution modal instead of just showing a toast.

#### 7.3 Elective Group Editor Modal (prep for Enhancement 5)

Ensure the resolution modal can be triggered from ElectiveGroupEditorModal. The actual elective-specific logic (P/W change with parallel_sections adjustment, cross-div cascade) is Enhancement 5, but the modal integration point is set up here.

---

### Phase 8: Frontend -- Generation Restriction

#### 8.1 Update TimetablesOverviewPage

Check `timetableGeneratedAt`:
- If null: show only "Generate All" button prominently. Hide per-division generate buttons.
- If set: show all buttons. Per-division buttons available.

#### 8.2 Update GeneratorPage

If `timetableGeneratedAt` is null and user navigates to a per-division generator:
- Show message: "Generate All must be run first before individual division generation."
- Redirect or disable the generate button.

#### 8.3 Update ClassDetailPage

Hide per-division generate buttons when `timetableGeneratedAt` is null.

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `packages/shared/prisma/schema.prisma` | Add `timetableGeneratedAt` to AcademicYear | 1 |
| `services/timetable/src/service.ts` | Set flag on Generate All, guard per-division | 1-2 |
| `packages/shared/src/helpers/assignmentImpactHelper.ts` | NEW -- impact assessment | 3 |
| `services/division-assignment/src/service.ts` | Impact endpoint, P/W summary, update CRUD | 3-4 |
| `services/division-assignment/src/router.ts` | New routes (impact, resolve-*, pw-summary) | 3 |
| `services/division-assignment/src/controller.ts` | New controller methods | 3 |
| `services/division-assignment/serverless.yml` | New API Gateway routes | 3 |
| `apps/frontend/src/components/shared/ResolutionWizardModal.tsx` | NEW -- wizard modal | 5 |
| `apps/frontend/src/components/shared/TeacherConflictStep.tsx` | NEW (or reuse ConflictResolutionTable) | 5 |
| `apps/frontend/src/components/shared/SlotRemovalStep.tsx` | NEW -- visual slot picker | 5 |
| `apps/frontend/src/components/shared/SlotFillStep.tsx` | NEW -- subject+teacher picker | 5 |
| `apps/frontend/src/components/shared/PwBalancerStep.tsx` | NEW -- editable P/W table | 5 |
| `apps/frontend/src/features/assignments/AssignmentEditorPage.tsx` | Wire resolution + mini timetable | 6 |
| `apps/frontend/src/features/assignments/assignmentApi.ts` | New endpoints | 3-4 |
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Wire resolution for inline editor | 7 |
| `apps/frontend/src/features/unassigned/UnassignedSubjectsPage.tsx` | Wire resolution for quick assign | 7 |
| `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx` | Generation restriction | 8 |
| `apps/frontend/src/features/timetable/GeneratorPage.tsx` | Generation restriction | 8 |
| `apps/frontend/src/features/classes/ClassDetailPage.tsx` | Hide per-div generate before first gen | 8 |

---

## Appendix: Current Code Inventory (for context after conversation compaction)

### Assignment CRUD -- Backend

| Method | File | Lines | Key Behavior |
|--------|------|-------|-------------|
| `createAssignment()` | `services/division-assignment/src/service.ts` | ~28-87 | Creates DivisionAssignment. No timetable impact. Calls `flagAffectedTimetables()` (to be replaced by recompute in Enh 3). |
| `updateAssignment()` | Same | ~89-148 | Updates teacher/weightage/prefs. Cross-div teacher sync for electives. Calls `flagAffectedTimetables()`. |
| `deleteAssignment()` | Same | ~150-174 | **Currently blocked if timetable slots exist**. Soft-deletes. Must be changed to allow deletion + slot cleanup. |
| `createElectiveAssignment()` | Same | ~176-348 | Creates with elective validation (allocation check, cross-div teacher enforcement, auto-sync to sibling divisions). |
| `quickAssign()` | Same | ~1238-1341 | Creates assignment + returns conflicts. Currently creates notifications, not resolution steps. |

### Assignment CRUD -- Frontend

| Surface | File | Operations | Current Timetable Awareness |
|---------|------|------------|---------------------------|
| Assignment Editor Page | `apps/frontend/src/features/assignments/AssignmentEditorPage.tsx` | Create, Edit, Delete | Shows total P/W bar, teacher load. No timetable impact shown. |
| Timetable View Cell Editor | `apps/frontend/src/features/timetable/TimetableViewPage.tsx` ~900-940 | Update teacher | Calls `overrideSlot()`. No conflict resolution. |
| Unassigned Subjects | `apps/frontend/src/features/unassigned/UnassignedSubjectsPage.tsx` | Quick Assign | Shows conflict toast. No resolution modal. |
| Elective Editor Modal | `apps/frontend/src/features/elective-groups/editor/ElectiveGroupEditorModal.tsx` | Create/Edit elective groups | Calls `bulkSaveElectiveGroup()`. Auto-retries slot deletion confirmation. |

### Period Structure (for P/W limit calculation)

- `Division.periodStructureId` → `PeriodStructure` → `WorkingDay` → `Slot` records
- Total slots = count of PERIOD-type slots across all working days
- Currently NO validation that assignment total P/W fits within total slots

### Academic Year API

- `services/academic-year/src/service.ts` -- CRUD for academic years
- Frontend: `apps/frontend/src/features/academic-years/academicYearApi.ts`
- Response includes: `id`, `name`, `startDate`, `endDate`, `status`
- New field needed: `timetableGeneratedAt`

## Implementation Order

```
Phase 1: DB migration -- timetable_generated flag
Phase 2: Per-division generation restriction
Phase 3: Backend -- impact assessment + resolution endpoints
Phase 4: Backend -- update assignment CRUD for impact
Phase 5: Frontend -- Unified Resolution Modal (wizard + 4 step components)
Phase 6: Frontend -- integrate into Assignment Editor
Phase 7: Frontend -- integrate into other surfaces (timetable view, quick assign)
Phase 8: Frontend -- generation restriction UI
```

Each phase is independently deployable and testable.
