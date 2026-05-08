# Enhancement 1: Teacher Timetable DnD + Swap Resolution Table

> Status: PLANNING -- all questions resolved, ready for implementation
> Created: April 27, 2026

## Key Reference

**Elective logic**: See `Documentaion/Engine_Algorithm.md` section "Elective Groups -- Two Types" (line ~675) for:
- Per-division vs cross-division electives and how they're identified (`num_divisions`)
- Symmetric vs asymmetric cross-division (different subject subsets per division)
- Parallel vs split teacher mode (`parallel_sections` in `elective_group_subjects`)
- How the engine co-schedules cross-div elective slots (all divisions get same time)
- Teacher busy-marking rules (UNION of all division teachers)

**Elective swap logic** (already implemented): See `Documentaion/Elective_Swap_Implementation_Plan.md` for:
- How `swapElectiveSlots()` moves entire elective blocks atomically
- Cross-structure time envelope pattern (`widenTimeEnvelope()`)
- How `swapSlots()` auto-delegates to `swapElectiveSlots()` when elective involvement detected
- The conflict resolution table in `ElectiveSwapConfirmDialog`

## Scope

This enhancement covers three related features:

- **A**: Teacher timetable drag-and-drop (cross-division aware)
- **B**: Upgrade class timetable regular swap conflict dialog with interactive resolution table
- **C**: Preview/confirmation dialog for all swap types with conflict resolution

## Decisions Made

| Decision | Answer |
|----------|--------|
| Cross-division swaps allowed? | Yes -- swap across any divisions |
| Confirmation required? | Yes -- preview dialog for all cross-division and conflicted swaps |
| Valid targets scope | Entire grid -- all cells across all divisions the teacher teaches in |
| Empty slot targets | Only from the source assignment's division (swap within that timetable) |
| Elective cells | One atomic block, not split. Same behavior as class timetable DnD |
| Double-booked cells | Split into separate draggable blocks with conflict warning indicator |
| Assistant teacher cells | Draggable -- primary teacher's timetable also affected, conflicts checked |
| Period structure mismatch | Block swap with clear error, mark as non-swappable |
| Resolution candidates | Pre-filtered to conflict-free swaps only (no cascading conflicts) |
| After resolving all conflicts | User must click "Confirm Swap" explicitly |
| Cache invalidation | All affected teacher timetables auto-refresh (RTK Query tag invalidation) |
| Class timetable resolution table | Same resolution table added to regular (non-elective) swap conflict dialog |

---

## Architecture Overview

### Cross-Division Swap Mechanics

When teacher Julie drags "Math VI-C Mon P1" to "Math XI-A Mon P6":

```
BEFORE:
  VI-C timetable:  P1 = Julie Math    |  P6 = Jaya Hindi
  XI-A timetable:  P1 = Ravi Physics  |  P6 = Julie Math

AFTER:
  VI-C timetable:  P1 = Jaya Hindi    |  P6 = Julie Math     ← P1↔P6 swap in VI-C
  XI-A timetable:  P1 = Julie Math    |  P6 = Ravi Physics   ← P1↔P6 swap in XI-A
```

This is **two atomic swaps** in two different timetables. Four teachers potentially affected:
- Julie (the dragging teacher)
- Jaya (displaced in VI-C)
- Ravi (displaced in XI-A)
- Any other teacher at VI-C P6 or XI-A P1

All four need bidirectional conflict checking against ALL their other divisions.

### Conflict Flow

```
1. Teacher drags cell → fetch valid swap targets (highlights)
2. Teacher drops on target → call preview endpoint
3. Preview shows:
   - Affected divisions table (what moves where)
   - Conflict resolution table (if conflicts exist)
4. User resolves conflicts one by one (dropdown + Resolve button)
5. Once all resolved → "Confirm Swap" (clean)
   OR "Swap Anyway" (force with remaining conflicts)
6. Swap executes → all timetables refresh
```

---

## Implementation Phases

### Phase 1: Backend -- Update Teacher Timetable API Response -- IMPLEMENTED

**Goal:** Add explicit `timetableId`, `divisionId`, `className`, `divisionLabel` to each period in the teacher timetable response. Currently these are hacked into the `teacher` field.

#### 1.1 Update `TeacherPeriodDto` type -- DONE

**File:** `services/timetable/src/service.ts`

Add to the period DTO returned by `getTeacherTimetable()`:

```typescript
type TeacherPeriodDto = {
  timetableSlotId: string;
  slotIds: string[];
  slot: { ... };
  assignments: TeacherAssignmentDto[];
  isElective: boolean;
  // NEW fields:
  timetableId: string;
  divisionId: string;
  className: string;
  divisionLabel: string;
};
```

#### 1.2 Populate new fields in the overlay loop -- DONE

In the `getTeacherTimetable()` method, where `slots` are overlaid onto the grid skeleton, set:
- `period.timetableId = s.timetableId`
- `period.divisionId = s.timetable.division.id`
- `period.className = className`
- `period.divisionLabel = s.timetable.division.label`

For empty cells (no assignment), these remain empty strings (no timetable association).

For elective cells with multiple assignments from different divisions, use the first division's info (the swap logic handles all divisions atomically).

#### 1.3 Update frontend type `TimetablePeriod` -- DONE

**File:** `apps/frontend/src/features/timetable/timetableApi.ts`

Add optional fields to `TimetablePeriod`:
```typescript
timetableId?: string;
divisionId?: string;
className?: string;
divisionLabel?: string;
```

---

### Phase 2: Backend -- `previewTeacherSwap()` Endpoint -- IMPLEMENTED

**Goal:** Return a detailed preview of what will happen when two slots are swapped, including all affected divisions and teachers.

#### 2.1 Schema

**File:** `packages/shared/src/models/schemas/timetable.schema.ts`

```typescript
export const previewTeacherSwapSchema = z.object({
  sourceSlotId: z.string().uuid(),
  targetSlotId: z.string().uuid(),
});
```

#### 2.2 Service method

**File:** `services/timetable/src/service.ts`

New method: `previewTeacherSwap(schoolId, dto)`

**Logic:**

1. Load source and target slots with full includes
2. Determine swap type:
   - Same timetable → simple swap preview
   - Different timetables → cross-division preview
   - Either is elective → delegate to `previewElectiveSwap()` with coordinate conversion
3. For same-timetable swap:
   - Show the two cells that will swap
   - Check source teacher at target time, target teacher at source time
   - Return conflicts with resolution candidates
4. For cross-division swap:
   - Identify all 4 cells (source timetable P1/P6, target timetable P1/P6)
   - Load current contents of all 4 cells
   - Check ALL involved teachers (source teacher + up to 2 displaced teachers)
   - Return affected divisions table + conflicts with resolution candidates

**Response:**
```typescript
{
  swapType: 'same_division' | 'cross_division' | 'elective';
  sourceSummary: { className, divisionLabel, dayLabel, periodNumber, subjectName, teacherName };
  targetSummary: { className, divisionLabel, dayLabel, periodNumber, subjectName, teacherName };
  affectedCells: {
    timetableId: string;
    className: string;
    divisionLabel: string;
    dayLabel: string;
    periodNumber: number;
    currentSubject: string | null;
    currentTeacher: string | null;
    newSubject: string | null;
    newTeacher: string | null;
  }[];
  conflicts: {
    teacherName: string;
    teacherId: string;
    className: string;
    divisionLabel: string;
    divisionId: string;
    conflictedSlotId: string;
    reason: string;
  }[];
}
```

#### 2.3 Route and controller

**File:** `services/timetable/src/router.ts`
- `POST /api/timetables/slots/preview-teacher-swap`

**File:** `services/timetable/src/controller.ts`
- `previewTeacherSwap(event)` method

#### 2.4 Serverless.yml

Add the new route to `services/timetable/serverless.yml`.

#### 2.5 Frontend API

**File:** `apps/frontend/src/features/timetable/timetableApi.ts`
- New types for preview response
- New mutation: `previewTeacherSwap`

---

### Phase 3: Backend -- `swapTeacherSlots()` Endpoint -- IMPLEMENTED

**Goal:** Execute a swap between two slots that may belong to different timetables.

#### 3.1 Schema

**File:** `packages/shared/src/models/schemas/timetable.schema.ts`

```typescript
export const swapTeacherSlotsSchema = z.object({
  sourceSlotId: z.string().uuid(),
  targetSlotId: z.string().uuid(),
  force: z.boolean().optional(),
});
```

Note: Same shape as `swapSlotsSchema` but with different validation logic. Could reuse same schema.

#### 3.2 Service method

**File:** `services/timetable/src/service.ts`

New method: `swapTeacherSlots(schoolId, dto)`

**Logic:**

1. Load source and target slots with full includes (timetable, division, assignment, teachers)
2. If same timetable → delegate to existing `swapSlots()` (which now handles electives too)
3. If either is elective → delegate to `swapElectiveSlots()` with coordinate conversion
4. If different timetables (cross-division regular swap):

   a. **Identify the 4 cells:**
   ```
   Cell A: source timetable, source coordinates (source teacher's assignment)
   Cell B: source timetable, target coordinates (may have another teacher)
   Cell C: target timetable, target coordinates (target teacher's assignment)
   Cell D: target timetable, source coordinates (may have another teacher)
   ```

   b. **Validate period structure compatibility:**
   - Source timetable must have a slot at target's `(dayOfWeek, sortOrder)`
   - Target timetable must have a slot at source's `(dayOfWeek, sortOrder)`
   - If either doesn't exist → error "Target slot not available in this division's period structure"

   c. **Resolve cells B and D:**
   - Find the `workingDay` and `slot` records in each timetable for the other's coordinates
   - Load the `timetable_slot` rows at those coordinates (may be empty)

   d. **Collect all teacher IDs from cells A, B, C, D**

   e. **Check conflicts for each teacher:**
   - Source teacher: free at target time in all OTHER divisions (exclude cells A, B, C, D)
   - Teacher at cell B (if any): free at source time in all their divisions
   - Target teacher (if different from source): free at source time in all OTHER divisions
   - Teacher at cell D (if any): free at target time in all their divisions
   - Use `widenTimeEnvelope()` for cross-structure time checks

   f. **If conflicts and not force → return 409**

   g. **Execute atomically:**
   ```typescript
   await prisma.$transaction(async (tx) => {
     // Swap in source timetable (A ↔ B)
     await tx.timetableSlot.update({ where: { id: cellA.id }, data: { divisionAssignmentId: cellB.divisionAssignmentId } });
     await tx.timetableSlot.update({ where: { id: cellB.id }, data: { divisionAssignmentId: cellA.divisionAssignmentId } });
     // Swap in target timetable (C ↔ D)
     await tx.timetableSlot.update({ where: { id: cellC.id }, data: { divisionAssignmentId: cellD.divisionAssignmentId } });
     await tx.timetableSlot.update({ where: { id: cellD.id }, data: { divisionAssignmentId: cellC.divisionAssignmentId } });
   });
   ```

   h. **Create conflict notifications for force-swaps**

#### 3.3 Route, controller, serverless.yml

- `POST /api/timetables/slots/swap-teacher`

#### 3.4 Frontend API

- New mutation: `swapTeacherSlots`

---

### Phase 4: Backend -- `getValidTeacherSwapTargets()` Endpoint -- IMPLEMENTED

**Goal:** Return valid swap targets across ALL divisions the teacher teaches in.

#### 4.1 Service method

**File:** `services/timetable/src/service.ts`

New method: `getValidTeacherSwapTargets(schoolId, sourceSlotId)`

**Logic:**

1. Load source slot, identify the teacher
2. Find ALL timetable slots for this teacher (primary + assistant) across all divisions
3. Also find all empty slots in the source division's timetable (same-division empty targets)
4. For each candidate:
   a. If same timetable: standard bidirectional teacher conflict check
   b. If different timetable: check period structure compatibility first, then 4-cell conflict check
   c. If elective: validate using elective-aware logic
5. Return with rich metadata (division info, subject, teacher, empty flag)

**Response:**
```typescript
{
  validTargets: {
    slotId: string;
    dayOfWeek: number;
    sortOrder: number;
    className: string;
    divisionLabel: string;
    subjectName: string | null;
    teacherName: string | null;
    isEmpty: boolean;
    isSameDivision: boolean;
    isElective: boolean;
  }[];
  invalidTargets: {
    slotId: string;
    dayOfWeek: number;
    sortOrder: number;
    reason: string;
  }[];
}
```

#### 4.2 Route, controller, serverless.yml

- `GET /api/timetables/teacher-slots/:slotId/valid-swaps`

#### 4.3 Frontend API

- New lazy query: `useLazyGetValidTeacherSwapTargetsQuery`

---

### Phase 5: Upgrade Class Timetable Conflict Dialog with Resolution Table -- IMPLEMENTED

**Goal:** Add the interactive resolution table (dropdown + Resolve button) to the EXISTING regular swap conflict dialog in `TimetableViewPage.tsx`.

#### 5.1 Create `SwapConflictResolutionDialog` component

**File:** `apps/frontend/src/features/timetable/SwapConflictResolutionDialog.tsx` (NEW)

This replaces/upgrades the current inline conflict dialog in TimetableViewPage. Reuses the same pattern as `ElectiveSwapConfirmDialog`:

- Table columns: Class Division | Conflict Reason | Resolution (dropdown) | Action (button)
- Fetches `getResolutionCandidates` for each conflict
- Dropdown pre-selects best candidate
- "Resolve" button executes the resolution swap
- Row turns green on success
- "Confirm Swap" when all resolved, "Swap Anyway" if unresolved remain
- Used for BOTH class timetable swaps AND teacher timetable swaps

#### 5.2 Integrate into TimetableViewPage

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Replace the existing simple conflict dialog (lines 1067-1126) with `SwapConflictResolutionDialog`.

The current flow:
```
Conflict detected → simple dialog "Teacher X busy" → "Swap Anyway" button
```

New flow:
```
Conflict detected → resolution table dialog → resolve conflicts → "Confirm Swap"
                                            → or "Swap Anyway" to force
```

#### 5.3 Update ElectiveSwapConfirmDialog to use shared component

Extract the resolution table into a shared sub-component (`ConflictResolutionTable`) used by both:
- `SwapConflictResolutionDialog` (regular swaps)
- `ElectiveSwapConfirmDialog` (elective swaps)
- Teacher timetable swap dialog (Phase 7)

---

### Phase 6: Frontend -- TeacherTimetableGrid DnD

**Goal:** Make the teacher timetable grid interactive with drag-and-drop.

#### 6.1 Split double-booked cells

Currently `assignments[0]` is rendered for each period. Change to:
- If `assignments.length > 1` AND cell is NOT elective: render each assignment as a separate stacked draggable block with red/amber conflict border
- If cell is elective: render as single atomic block (existing `ElectiveCellContent` pattern)

```tsx
// Double-booked cell (NOT elective):
<td>
  <div className="space-y-0.5">
    <DraggableCell slotId={slotIds[0]}>
      <DroppableCell><CellContent assignment={assignments[0]} /></DroppableCell>
    </DraggableCell>
    <DraggableCell slotId={slotIds[1]}>
      <div className="ring-1 ring-red-500/60 rounded-lg">
        <CellContent assignment={assignments[1]} />
        <AlertTriangle className="size-3 text-red-500" />  <!-- conflict indicator -->
      </div>
    </DraggableCell>
  </div>
</td>
```

#### 6.2 Wrap cells in DraggableCell + DroppableCell

- Regular cells: `DraggableCell` + `DroppableCell`
- Elective cells: `DraggableCell` + `DroppableCell` (atomic block)
- Empty cells: `DroppableCell` only (can receive drops, not draggable)
- Break/lunch cells: neither (not interactive)

#### 6.3 Drag start handler

When a cell is dragged:
1. Set `activeDrag` state with slot info + isElective flag
2. Call `getValidTeacherSwapTargets(sourceSlotId)` to get valid/invalid targets
3. Map response to cell positions in the grid for green/red highlighting
4. Show drag overlay with cell content

#### 6.4 Visual feedback

- Green ring on valid targets (same-division targets)
- Green ring with a subtle division badge on valid cross-division targets
- Red/faded on invalid targets
- Non-swappable cells (period structure mismatch) shown as faded with tooltip

#### 6.5 Drag end handler

When dropped:
1. Call `previewTeacherSwap(sourceSlotId, targetSlotId)` to get preview
2. If no conflicts and same-division → swap directly (no dialog)
3. If conflicts or cross-division → show confirmation/resolution dialog
4. User resolves and confirms → execute swap

#### 6.6 Drag overlay

Show the dragged cell content (regular or elective) floating with the cursor.

---

### Phase 7: Frontend -- Teacher Swap Confirmation Dialog

**Goal:** Show preview + conflict resolution for teacher timetable swaps.

#### 7.1 Create `TeacherSwapConfirmDialog` component

**File:** `apps/frontend/src/features/teacher-timetable/TeacherSwapConfirmDialog.tsx` (NEW)

Shows:
- Swap summary: "Moving Math from VI-C Mon P1 to XI-A Mon P6"
- Affected cells table (all 4 cells for cross-division, 2 cells for same-division)
- Conflict resolution table (reuses `ConflictResolutionTable` from Phase 5.3)
- Confirm/Cancel/Swap Anyway buttons

#### 7.2 Integrate into TeacherTimetableDetailPage

**File:** `apps/frontend/src/features/teacher-timetable/TeacherTimetableDetailPage.tsx`

Add:
- DnD state management (activeDrag, swapTargets)
- Swap conflict dialog state
- Pass DnD props down to TeacherTimetableGrid
- Wire up the confirmation dialog

---

### Phase 8: Testing & Edge Cases

#### 8.1 Same-Division Swap (Teacher View)

| # | Test | Expected |
|---|------|----------|
| 1 | Drag regular cell to regular cell (same division) | Standard swap, same as class timetable |
| 2 | Drag regular cell to empty cell (same division) | Assignment moves, source becomes empty |
| 3 | Drag elective cell to regular cell (same division) | Elective block moves atomically |
| 4 | Drag elective cell to elective cell (same division, different group) | Both blocks swap |

#### 8.2 Cross-Division Swap

| # | Test | Expected |
|---|------|----------|
| 5 | Drag VI-C P1 to XI-A P6 (both have assignments) | 4-cell swap in 2 timetables |
| 6 | Drag to cell where displaced teacher has conflict | Conflict shown, resolution offered |
| 7 | Drag across divisions with different period structures | "Target slot not available" error if slot doesn't exist |
| 8 | Drag across divisions, same time slot (Mon P3 → Mon P3) | Special case: only 2 cells change (same coordinates, different timetables) |
| 9 | Force-swap with conflicts | Creates conflict notifications in all affected timetables |

#### 8.3 Elective Swaps in Teacher View

| # | Test | Expected |
|---|------|----------|
| 10 | Drag elective cell in teacher view | Same behavior as class timetable -- all divisions move |
| 11 | Teacher is assistant in elective | Swap still works, primary teacher also affected |

#### 8.4 Double-Booking Split

| # | Test | Expected |
|---|------|----------|
| 12 | Double-booked cell renders as 2 blocks | Both visible with conflict indicator |
| 13 | Drag one block of a double-booked cell | Only that assignment moves |
| 14 | Drag TO a double-booked cell | Warning shown (would create triple-booking) |

#### 8.5 Assistant Teacher

| # | Test | Expected |
|---|------|----------|
| 15 | Drag assistant cell to empty slot | Both primary and assistant move in that timetable |
| 16 | Assistant cell drag, primary teacher has conflict at target | Conflict detected for primary teacher too |

#### 8.6 Resolution Table (Class Timetable)

| # | Test | Expected |
|---|------|----------|
| 17 | Regular swap with conflict in class timetable view | Resolution table shown (not just "Swap Anyway") |
| 18 | Resolve conflict via dropdown + Resolve button | Conflict row turns green |
| 19 | All conflicts resolved → "Confirm Swap" | Swap executes cleanly |
| 20 | "Swap Anyway" with unresolved conflicts | Force-swap with notifications |

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `services/timetable/src/service.ts` | Update `getTeacherTimetable()` response, add `previewTeacherSwap()`, `swapTeacherSlots()`, `getValidTeacherSwapTargets()` | 1-4 |
| `packages/shared/src/models/schemas/timetable.schema.ts` | New schemas | 2-3 |
| `packages/shared/src/index.ts` | Export new schemas/types | 2-3 |
| `services/timetable/src/router.ts` | 3 new routes | 2-4 |
| `services/timetable/src/controller.ts` | 3 new controller methods | 2-4 |
| `services/timetable/serverless.yml` | 3 new API Gateway routes | 2-4 |
| `apps/frontend/src/features/timetable/timetableApi.ts` | Update `TimetablePeriod` type, add new endpoints | 1-4 |
| `apps/frontend/src/features/timetable/ConflictResolutionTable.tsx` | NEW -- shared resolution table component | 5.3 |
| `apps/frontend/src/features/timetable/SwapConflictResolutionDialog.tsx` | NEW -- regular swap dialog with resolution | 5.1 |
| `apps/frontend/src/features/timetable/ElectiveSwapConfirmDialog.tsx` | Refactor to use shared `ConflictResolutionTable` | 5.3 |
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Replace simple conflict dialog with resolution dialog | 5.2 |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetableGrid.tsx` | Full rewrite -- add DnD, split double-booked cells, drag overlay | 6 |
| `apps/frontend/src/features/teacher-timetable/TeacherSwapConfirmDialog.tsx` | NEW -- teacher swap confirmation dialog | 7.1 |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetableDetailPage.tsx` | Add DnD state, wire up dialog | 7.2 |

---

## Implementation Order

```
Phase 1: Backend -- Update teacher timetable API response
  1.1  Update TeacherPeriodDto type
  1.2  Populate new fields in getTeacherTimetable()
  1.3  Update frontend TimetablePeriod type

Phase 2: Backend -- previewTeacherSwap() endpoint
  2.1  Schema
  2.2  Service method (same-div + cross-div + elective delegation)
  2.3  Route + controller
  2.4  Serverless.yml
  2.5  Frontend API types + mutation

Phase 3: Backend -- swapTeacherSlots() endpoint
  3.1  Schema (or reuse swapSlotsSchema)
  3.2  Service method (4-cell cross-div swap logic)
  3.3  Route + controller + serverless.yml
  3.4  Frontend API mutation

Phase 4: Backend -- getValidTeacherSwapTargets() endpoint
  4.1  Service method (cross-division target evaluation)
  4.2  Route + controller + serverless.yml
  4.3  Frontend API lazy query

Phase 5: Upgrade class timetable conflict dialog
  5.1  Create SwapConflictResolutionDialog component
  5.2  Integrate into TimetableViewPage (replace simple dialog)
  5.3  Extract ConflictResolutionTable shared component
       Update ElectiveSwapConfirmDialog to use shared component

Phase 6: Frontend -- TeacherTimetableGrid DnD
  6.1  Split double-booked cells rendering
  6.2  Wrap cells in DraggableCell + DroppableCell
  6.3  Drag start handler
  6.4  Visual feedback (valid/invalid highlighting)
  6.5  Drag end handler
  6.6  Drag overlay

Phase 7: Frontend -- Teacher swap confirmation dialog
  7.1  Create TeacherSwapConfirmDialog component
  7.2  Integrate into TeacherTimetableDetailPage

Phase 8: Testing
  8.1-8.6  All test scenarios
```

Each phase is independently deployable. Phases 1-4 can be tested via Postman. Phase 5 can be tested in the class timetable view. Phases 6-7 bring it all together in the teacher view.

---

## Appendix: Current Code Inventory (for context after conversation compaction)

### Teacher Timetable -- Frontend (read-only, needs DnD)

| File | Key Details |
|------|-------------|
| `apps/frontend/src/features/teacher-timetable/TeacherTimetableGrid.tsx` | Read-only grid, ~198 lines. Renders cells without DraggableCell/DroppableCell. `assignment.teacher.id` carries divisionId, `assignment.teacher.name` carries division label (e.g., "VI-C"). Shows only `assignments[0]` -- hides double-bookings. |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetableDetailPage.tsx` | Wraps TeacherTimetableGrid + TeacherBreakdown. Export buttons. No DnD state. |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetablePage.tsx` | Teacher listing page (not the grid). Shows load metrics. |
| `apps/frontend/src/features/teacher-timetable/TeacherBreakdown.tsx` | Assignment breakdown table. Shows cross-div electives with Layers icon. |

### Teacher Timetable -- Backend API

| File | Method | Key Details |
|------|--------|-------------|
| `services/timetable/src/service.ts` | `getTeacherTimetable()` ~line 1310 | Returns grid keyed by `dayOfWeek`. `assignment.teacher` field carries division label (hack). `timetableSlotId` set to actual DB slot ID. Currently does NOT return `timetableId`, `divisionId`, `className`, `divisionLabel` as explicit fields -- these need to be added (Phase 1). |

### Class Timetable DnD -- Existing (reference for pattern)

| File | Key Details |
|------|-------------|
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Full DnD implementation: DndContext, DraggableCell, DroppableCell, drag handlers, swap execution, conflict dialog. ~1200 lines. |
| `apps/frontend/src/features/timetable/TimetableCells.tsx` | CellContent, ElectiveCellContent, DraggableCell, DroppableCell components. |
| `apps/frontend/src/features/timetable/ElectiveSwapConfirmDialog.tsx` | Elective swap preview + conflict resolution table with candidate dropdowns. |

### Existing Swap Endpoints (backend)

| Endpoint | Method | File |
|----------|--------|------|
| `POST /api/timetables/slots/swap` | `swapSlots()` | `services/timetable/src/service.ts` ~line 830 |
| `POST /api/timetables/slots/swap-elective` | `swapElectiveSlots()` | Same file ~line 1580 |
| `GET /api/timetables/slots/:id/valid-swaps` | `getValidSwapTargets()` | Same file ~line 536 |
| `GET /api/timetables/slots/:id/valid-elective-swaps` | `getValidElectiveSwapTargets()` | Same file ~line 1860 |
| `POST /api/timetables/slots/preview-elective-swap` | `previewElectiveSwap()` | Same file ~line 1780 |
| `GET /api/timetables/slots/:id/resolution-candidates` | `getResolutionCandidates()` | Same file ~line 1170 |
| `POST /api/timetables/slots/auto-resolve` | `autoResolveConflict()` | Same file ~line 1000 |

### Existing Conflict Dialog (class timetable -- to be upgraded in Phase 5)

Current simple dialog in `TimetableViewPage.tsx` ~line 1067-1126: shows "Teacher X busy" with "Swap Anyway" button. Needs to be replaced with `SwapConflictResolutionDialog` using the same resolution table pattern as `ElectiveSwapConfirmDialog`.

### Key API Types (frontend)

| Type | File | Key Fields |
|------|------|------------|
| `TimetablePeriod` | `timetableApi.ts` | `timetableSlotId`, `slotIds[]`, `slot`, `assignments[]`, `isElective`. Needs new: `timetableId`, `divisionId`, `className`, `divisionLabel` |
| `TimetableSlotAssignment` | `timetableApi.ts` | `id`, `subject`, `teacher` (carries divisionId/label in teacher view), `electiveGroup`, `role`, `assistantTeacher` |
| `SwapConflict` | `timetableApi.ts` | `teacherName`, `className`, `divisionLabel`, `conflictedSlotId`, `direction` |
| `ResolutionCandidate` | `timetableApi.ts` | `slotId`, `dayLabel`, `periodNumber`, `subjectName`, `teacherName`, `isEmpty`, `score` |
