# Elective Slot Swap -- Implementation Plan

> Created: April 27, 2026
> Status: IN PROGRESS -- Phases 1-6 complete, Phase 7 (testing) remaining

## Overview

Enable drag-and-drop swapping for elective cells in the timetable view. Currently, elective cells are locked (non-draggable, backend rejects swap/override). This plan covers per-division electives, cross-division electives, and asymmetric cross-division electives.

## Key Principle

**An elective group is an atomic block.** When any slot belonging to an elective group moves, ALL slots belonging to that same group across ALL participating divisions must move to the same new time coordinate. Teacher-to-slot distribution within the block does NOT change -- only the time coordinates (workingDayId, slotId) change.

## Cross-Structure Time Envelope (Design Pattern)

**Applies to:** Phase 1 (swapElectiveSlots), Phase 2 (getValidElectiveSwapTargets), Phase 3 (regular swap delegation), Phase 5 (preview)

Elective divisions may use different period structures with different clock times for the same `sortOrder`. For example:
- XII A (Normal structure): P3 = 10:50-11:30
- XII B (Extended structure): P3 = 10:30-11:10

A teacher busy at 10:30-10:50 in another class would conflict with XII B's P3 but NOT with XII A's P3. If we only checked against one division's times, we'd miss the conflict.

**Solution:** Wherever teacher conflicts are checked for an elective swap, we:
1. Collect slot `startTime`/`endTime` from ALL divisions in the elective
2. Compute the **widest time envelope**: `min(startTime)` to `max(endTime)`
3. Use this envelope for `findTeacherTimeConflict()` calls

This is implemented via the `widenTimeEnvelope()` helper in `service.ts`. Any new phase that adds conflict checking for elective swaps **must** use this pattern -- never use a single division's times.

---

## Current State

| Layer | Current Behavior | File |
|-------|-----------------|------|
| Backend `swapSlots()` | Rejects if source OR target has `electiveGroupId` | `services/timetable/src/service.ts:771-797` |
| Backend `getValidSwapTargets()` | Marks all elective cells as invalid | `services/timetable/src/service.ts:582-586` |
| Backend `overrideSlot()` | Rejects if cell is elective or DTO is elective | `services/timetable/src/service.ts:630-728` |
| Frontend drag start | Prevents drag initiation for `isElective` cells | `TimetableViewPage.tsx:296` |
| Frontend drag end | Aborts swap if source or target `isElective` | `TimetableViewPage.tsx:233-236` |
| Frontend cell render | Renders non-draggable `ElectiveCellContent` | `TimetableViewPage.tsx:386-397` |
| Schema DTO | `swapSlotsSchema` takes `sourceSlotId` + `targetSlotId` (single slot IDs) | `timetable.schema.ts:12-16` |

## Data Model Context

A single elective cell in the timetable grid corresponds to **multiple `timetable_slot` rows**:
- Each parallel teacher/assignment = one row
- All rows share the same `(timetableId, workingDayId, slotId)` coordinates
- The frontend knows these as `period.slotIds[]` (array of all row IDs) and `period.timetableSlotId` (first row ID)

For cross-division electives, each participating division has its own set of `timetable_slot` rows at the SAME `(dayOfWeek, slot.sortOrder)` coordinates but in DIFFERENT timetables.

---

## Implementation Phases

### Phase 1: New Swap Endpoint & Schema

**Goal:** Create a new `swapElectiveSlots` endpoint that handles the atomic swap of an entire elective block (all rows, all divisions).

#### 1.1 Update Zod Schema

**File:** `packages/shared/src/models/schemas/timetable.schema.ts`

Add new schema:
```typescript
export const swapElectiveSlotsSchema = z.object({
  // The timetable slot ID of the source elective cell (any one row from the block)
  sourceSlotId: z.string().uuid(),
  // Target coordinates -- where to move the elective block
  targetDayOfWeek: z.number().int().min(1).max(7),
  targetSlotSortOrder: z.number().int().min(0),
  // Force swap even with conflicts
  force: z.boolean().optional(),
});
```

**Why coordinates instead of slot ID:** Cross-division electives span multiple timetables. We can't use a target `timetableSlotId` because the target coordinates need to be resolved in EACH participating division's timetable independently. Using `(dayOfWeek, slotSortOrder)` is the universal coordinate system.

Export the schema and DTO type from `packages/shared/src/index.ts`.

#### 1.2 Add Route & Controller

**File:** `services/timetable/src/router.ts`

Add route: `POST /api/timetables/slots/swap-elective` -> `controller.swapElectiveSlots(event)`

**File:** `services/timetable/src/controller.ts`

Add controller method that parses DTO, calls service, returns response.

#### 1.3 Implement `swapElectiveSlots()` Service Method

**File:** `services/timetable/src/service.ts`

This is the core logic. Steps in order:

**Step A -- Resolve the source elective block:**

1. Load the source `timetable_slot` by ID, including `divisionAssignment.electiveGroupId`
2. If no `electiveGroupId`, throw error (not an elective -- use regular swap)
3. Load ALL `timetable_slot` rows for this elective group at the source time coordinates:
   ```
   WHERE divisionAssignment.electiveGroupId = sourceElectiveGroupId
     AND workingDay.dayOfWeek = sourceDayOfWeek
     AND slot.sortOrder = sourceSlotSortOrder
   ```
   This gives us rows across ALL participating divisions
4. Group these rows by `timetableId` (one group per division)

**Step B -- Resolve target cells in each division:**

For each participating division (each timetableId from Step A):
1. Find the timetable's `workingDay` record matching `targetDayOfWeek`
2. Find the `slot` record matching `targetSlotSortOrder` (must be a PERIOD slot)
3. If either doesn't exist (e.g., division has different period structure without that slot), throw error: "Target slot not available in all participating divisions"
4. Load ALL `timetable_slot` rows at the target coordinates `(workingDayId, slotId)` for this division -- these are the "displaced" assignments
5. Check if ANY of the displaced rows are also elective:
   - If they belong to the SAME elective group: throw error "Source and target are the same elective"
   - If they belong to a DIFFERENT elective group: this is an **elective-vs-elective swap** (handled, see below)
   - If they are regular assignments: straightforward displacement

**Step C -- Collect ALL teacher IDs for conflict checking:**

From the source elective block (all divisions):
- Collect UNION of all `teacherId` and `assistantTeacherId` from all source rows

From the displaced target cells (all divisions):
- Collect UNION of all `teacherId` and `assistantTeacherId` from all target rows

**Step D -- Check teacher conflicts (with cross-structure time envelope):**

**Critical:** Elective divisions may use different period structures with different clock times for the same `sortOrder`. For example, XII A's P3 = 10:50-11:30 but XII B's P3 = 10:30-11:10. Using a single division's times for conflict detection would miss overlaps in other structures.

**Solution:** Collect slot times from ALL divisions and compute the **widest time envelope** (`min(startTime)` to `max(endTime)`) before checking conflicts. This ensures any teacher booking that overlaps with ANY division's time range is caught.

For each source teacher:
1. Check if teacher is busy at the TARGET time envelope in any OTHER division (not the ones being swapped)
2. Exclude all slot IDs involved in this swap from the conflict check

For each displaced target teacher:
1. Check if teacher is busy at the SOURCE time envelope in any OTHER division
2. Same exclusion logic

Build a `conflicts[]` array with:
```typescript
{
  teacherName: string;
  className: string;
  divisionLabel: string;
  divisionId: string;
  conflictedSlotId: string;
  direction: 'elective_to_target' | 'displaced_to_source';
  affectedDivision: string; // Which division of the elective is affected
}
```

**Step E -- Handle elective-vs-elective swap (if target is also elective):**

If the target cell belongs to a DIFFERENT elective group:
1. Resolve the TARGET elective's full block (same as Step A but for the target elective)
2. Check that the target elective's divisions all have the SOURCE time slot available
3. Collect all teachers from BOTH elective groups for bidirectional conflict checking
4. The swap becomes: Source elective block moves to target coordinates, target elective block moves to source coordinates, across ALL divisions of both groups

**Step F -- If conflicts exist and `force !== true`, return 409:**

Return all conflicts in the response for the user to review.

**Step G -- Execute the atomic swap in a transaction:**

```typescript
await prisma.$transaction(async (tx) => {
  // For each participating division:
  for (const divisionGroup of allDivisionGroups) {
    const { sourceRows, targetRows, targetWorkingDayId, targetSlotId, sourceWorkingDayId, sourceSlotId } = divisionGroup;

    // Move source elective rows to target coordinates
    for (const row of sourceRows) {
      await tx.timetableSlot.update({
        where: { id: row.id },
        data: { workingDayId: targetWorkingDayId, slotId: targetSlotId },
      });
    }

    // Move displaced target rows to source coordinates
    for (const row of targetRows) {
      await tx.timetableSlot.update({
        where: { id: row.id },
        data: { workingDayId: sourceWorkingDayId, slotId: sourceSlotId },
      });
    }
  }
});
```

**Important:** We update `workingDayId` and `slotId` (coordinates), NOT `divisionAssignmentId`. This preserves the teacher-to-slot mapping.

**Step H -- Create conflict notifications for force-swaps:**

For each conflict in the array, create a `timetableNotification` record on the affected timetable.

---

### Phase 2: Update `getValidSwapTargets()` for Electives

**Goal:** When dragging an elective cell, return which time slots are valid targets considering ALL divisions.

**File:** `services/timetable/src/service.ts`

#### 2.1 New method: `getValidElectiveSwapTargets()`

**Input:** `schoolId`, `sourceSlotId` (any row from the elective block)

**Logic:**

1. Resolve the full elective block (same as Phase 1, Step A)
2. Get the set of all unique `(dayOfWeek, slotSortOrder)` time coordinates across the school's period structures. Only include coordinates that exist in ALL structures used by the elective's divisions (intersection, not union).
3. For each candidate time coordinate, check:
   a. Does every participating division have a PERIOD slot at this coordinate? If not, skip (invalid)
   b. Collect ALL teachers from the source elective block
   c. Compute the **widest time envelope** across all structures for both the source and candidate coordinates (same cross-structure approach as Phase 1 Step D)
   d. For each teacher, check if they have any commitment at the candidate's time envelope in a NON-participating division
   e. If the candidate coordinate is occupied in any division, also check the displaced teachers at the source time envelope
4. Return `{ validCoordinates: [{dayOfWeek, slotSortOrder}], invalidCoordinates: [{dayOfWeek, slotSortOrder, reason}] }`

**Note:** The return format changes from `slotIds` to `coordinates` because elective swaps operate on (dayOfWeek, slotSortOrder) across all divisions. The frontend will need to map these coordinates to visual cell positions.

#### 2.2 Add Route

`GET /api/timetables/slots/:slotId/valid-elective-swaps` -> `controller.getValidElectiveSwapTargets(event)`

#### 2.3 Update Frontend API

**File:** `apps/frontend/src/features/timetable/timetableApi.ts`

Add:
```typescript
getValidElectiveSwapTargets: builder.query<ElectiveSwapTargets, string>({
  query: (slotId) => `timetables/slots/${slotId}/valid-elective-swaps`,
  ...
}),

swapElectiveSlots: builder.mutation<ElectiveSwapResponse, ElectiveSwapRequest>({
  query: (body) => ({
    url: 'timetables/slots/swap-elective',
    method: 'POST',
    body,
  }),
  invalidatesTags: ['Timetable'],
}),
```

---

### Phase 3: Update Regular Swap to Handle Elective Targets

**Goal:** When a regular (non-elective) cell is dragged onto an elective cell or vice versa, the system must handle it correctly.

**File:** `services/timetable/src/service.ts`

#### 3.1 Modify `swapSlots()` -- Remove Elective Guards, Add Routing

Currently `swapSlots()` rejects any elective involvement. Change to:

```
if (sourceIsElective || targetIsElective) {
  // Delegate to swapElectiveSlots() with appropriate parameter conversion
  return this.swapElectiveSlots(schoolId, {
    sourceSlotId: sourceIsElective ? sourceSlotId : targetSlotId,
    targetDayOfWeek: sourceIsElective ? targetSlot.workingDay.dayOfWeek : sourceSlot.workingDay.dayOfWeek,
    targetSlotSortOrder: sourceIsElective ? targetSlot.slot.sortOrder : sourceSlot.slot.sortOrder,
    force: dto.force,
  });
}
```

This way, the frontend doesn't need to know which endpoint to call -- the regular swap endpoint detects elective involvement and delegates.

#### 3.2 Modify `getValidSwapTargets()` -- Remove Elective Skip

Remove the `if (target.divisionAssignment?.electiveGroup) { invalidIds.push(...); continue; }` block.

Instead, when the source is an elective, delegate to `getValidElectiveSwapTargets()`.

When the source is regular but a candidate target is an elective, evaluate validity by checking:
- All teachers of the target elective at the source's time coordinates
- The source teacher at the target's time coordinates in all elective divisions
- Mark as valid only if no conflicts (or return with `hasConflict` flag for force-swap UI)

---

### Phase 4: Frontend -- Enable Elective Drag-and-Drop

**Goal:** Make elective cells draggable and show valid targets with cross-division awareness.

#### 4.1 Make Elective Cells Draggable

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Changes to the elective cell rendering block (currently lines 386-397):

```tsx
if (period.isElective) {
  const electiveGroupId = period.assignments.find((a) => a.electiveGroup)?.electiveGroup?.id;
  const sid = period.timetableSlotId;
  const isSource = activeDrag?.slotId === sid;
  const validity = !isSource && swapTargets
    ? swapTargets.valid.has(sid) ? 'valid' : swapTargets.invalid.has(sid) ? 'invalid' : undefined
    : undefined;

  return (
    <td key={slot.id} className="px-1 py-1 border-r border-border/40">
      {isDesktop ? (
        <DraggableCell slotId={sid}>
          <DroppableCell slotId={sid} swapValidity={validity}>
            <ElectiveCellContent assignments={period.assignments} />
          </DroppableCell>
        </DraggableCell>
      ) : (
        <DroppableCell slotId={sid} swapValidity={validity}>
          <ElectiveCellContent assignments={period.assignments} />
        </DroppableCell>
      )}
    </td>
  );
}
```

#### 4.2 Update Drag Start Handler

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Remove the `if (p?.isElective) return;` guard in `onDragStart`.

When an elective is being dragged:
- Call the `getValidElectiveSwapTargets` endpoint instead of `getValidSwapTargets`
- Map returned `(dayOfWeek, slotSortOrder)` coordinates to timetableSlotIds in the current grid for highlighting

```tsx
onDragStart={(e) => {
  const allP = grid.days.flatMap((d) => d.periods);
  const p = allP.find((pp) => pp.timetableSlotId === e.active.id);
  const a = p?.assignments[0];
  if (!a) return;

  setActiveDrag({ slotId: p!.timetableSlotId, assignment: a, isElective: p!.isElective });

  if (p!.isElective) {
    // Fetch elective-aware valid targets
    fetchValidElectiveSwaps(p!.timetableSlotId).unwrap().then((result) => {
      // Map coordinates to slot IDs in the current grid
      const valid = new Set<string>();
      const invalid = new Set<string>();
      for (const coord of result.validCoordinates) {
        const matchingPeriod = findPeriodByCoordinate(grid, coord.dayOfWeek, coord.slotSortOrder);
        if (matchingPeriod) valid.add(matchingPeriod.timetableSlotId);
      }
      for (const coord of result.invalidCoordinates) {
        const matchingPeriod = findPeriodByCoordinate(grid, coord.dayOfWeek, coord.slotSortOrder);
        if (matchingPeriod) invalid.add(matchingPeriod.timetableSlotId);
      }
      setSwapTargets({ valid, invalid });
    }).catch(() => setSwapTargets(null));
  } else {
    // Existing logic for regular slots
    fetchValidSwaps(p!.timetableSlotId).unwrap().then(...)
  }
}}
```

#### 4.3 Update Drag End Handler

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Remove the `if (sourcePeriod?.isElective || targetPeriod?.isElective) { toast.error(...); return; }` guard.

When either source or target is elective:
- Resolve the target's `(dayOfWeek, slotSortOrder)` from the grid
- Call `swapElectiveSlots` mutation (or let the regular `swapSlots` delegate on the backend -- see Phase 3.1)

```tsx
const handleDragEnd = useCallback(async (event: DragEndEvent) => {
  setActiveDrag(null);
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const sourceSlotId = active.id as string;
  const targetSlotId = over.id as string;

  const allPeriods = grid?.days?.flatMap((d) => d.periods) ?? [];
  const sourcePeriod = allPeriods.find((p) => p.timetableSlotId === sourceSlotId);
  const targetPeriod = allPeriods.find((p) => p.timetableSlotId === targetSlotId);

  if (sourcePeriod?.isElective || targetPeriod?.isElective) {
    // Use elective swap endpoint
    const electivePeriod = sourcePeriod?.isElective ? sourcePeriod : targetPeriod;
    const otherPeriod = sourcePeriod?.isElective ? targetPeriod : sourcePeriod;
    // Find the day containing the target
    const targetDay = grid!.days.find((d) => d.periods.some((p) => p.timetableSlotId === (sourcePeriod?.isElective ? targetSlotId : sourceSlotId)));
    await executeElectiveSwap(
      electivePeriod!.timetableSlotId,
      targetDay!.workingDay.dayOfWeek,
      otherPeriod?.slot.sortOrder ?? electivePeriod!.slot.sortOrder,
    );
  } else {
    await executeSwap(sourceSlotId, targetSlotId);
  }
}, [grid, executeSwap, executeElectiveSwap]);
```

#### 4.4 Update `ElectiveCellContent` for Drag State

**File:** `apps/frontend/src/features/timetable/TimetableCells.tsx`

Add `isDragging` prop to `ElectiveCellContent`:

```tsx
export function ElectiveCellContent({ assignments, isDragging }: ElectiveCellContentProps) {
  return (
    <div className={cn(
      'rounded-lg px-1.5 py-1 select-none ring-1 ring-amber-500/40 transition-all',
      isDragging && 'shadow-xl ring-2 ring-amber-500 scale-105 opacity-90',
      !isDragging && 'cursor-grab active:cursor-grabbing hover:ring-amber-500/70 hover:shadow-sm',
      colorClass,
    )}>
      ...
    </div>
  );
}
```

#### 4.5 Drag Overlay for Elective Cells

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Currently the `DragOverlay` renders a `CellContent`. Add elective support:

```tsx
<DragOverlay>
  {activeDrag && (
    activeDrag.isElective
      ? <ElectiveCellContent assignments={activeDragAssignments} isDragging />
      : <CellContent assignment={activeDrag.assignment} isDragging />
  )}
</DragOverlay>
```

---

### Phase 5: Cross-Division Confirmation Dialog

**Goal:** When swapping a cross-division elective, show the user what will happen in ALL divisions before confirming.

#### 5.1 New API Endpoint: Preview Elective Swap

**File:** `services/timetable/src/service.ts`

Add method `previewElectiveSwap()` that returns a dry-run result:

```typescript
{
  sourcElectiveGroup: { name, id },
  sourceCoordinates: { dayLabel, periodNumber },
  targetCoordinates: { dayLabel, periodNumber },
  affectedDivisions: [
    {
      className: "XII",
      divisionLabel: "A",
      currentTargetContent: { subject: "English", teacher: "Aleena Josy" } | null,
      action: "displaced_to_source" | "empty_freed"
    },
    {
      className: "XII",
      divisionLabel: "B",
      currentTargetContent: { subject: "Economics", teacher: "Saritha Mohan" } | null,
      action: "displaced_to_source"
    },
    ...
  ],
  targetElectiveGroup: { name, id } | null, // If swapping with another elective
  conflicts: ConflictInfo[],
}
```

**Route:** `POST /api/timetables/slots/preview-elective-swap`

#### 5.2 Frontend Confirmation Dialog

**File:** `apps/frontend/src/features/timetable/ElectiveSwapConfirmDialog.tsx` (NEW)

A dialog that shows:

```
┌──────────────────────────────────────────────────────────┐
│  Move MATHS / IP / PSY from Monday P3 to Wednesday P7   │
│                                                          │
│  This will affect 3 divisions:                           │
│                                                          │
│  Division   │ Currently at Wed P7  │ Will move to Mon P3 │
│  ──────────────────────────────────────────────────────── │
│  XII A      │ English (Aleena)     │ ← moves to Mon P3   │
│  XII B      │ Economics (Saritha)  │ ← moves to Mon P3   │
│  XII C      │ ACC/HIS (elective)   │ ← swaps with M/I/P  │
│                                                          │
│  ⚠ 1 conflict:                                           │
│  • Teacher "Saritha" also teaches IX A at Wed P7         │
│                                                          │
│  [ Cancel ]  [ Swap Anyway (with conflict) ]  [ Swap ]   │
└──────────────────────────────────────────────────────────┘
```

#### 5.3 Integrate Dialog into TimetableViewPage

When an elective swap is initiated (drag end or click-swap):
1. Call `previewElectiveSwap()` API
2. If preview shows conflicts or multiple divisions affected, show `ElectiveSwapConfirmDialog`
3. On confirm, call `swapElectiveSlots()` with `force: true/false`
4. On cancel, do nothing

For per-division electives with no conflicts, skip the dialog and swap directly (same UX as regular swaps).

---

### Phase 6: Update `overrideSlot()` for Elective Awareness

**Goal:** The single-cell edit (click cell -> pick assignment) should also work with elective cells, allowing users to swap an elective to a specific slot without drag-drop.

#### 6.1 Modify Override Logic

**File:** `services/timetable/src/service.ts`

When the user clicks an elective cell and picks a different time slot:
- This is equivalent to an elective swap
- Delegate to `swapElectiveSlots()` internally

When the user clicks a regular cell and tries to place an elective assignment:
- Currently blocked -- keep this blocked (placing elective assignments via override is too error-prone)
- User should use drag-drop or regenerate

#### 6.2 Frontend: Elective Cell Click Behavior

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Currently, clicking an elective cell opens a read-only info sheet. Options:
- **Option A**: Keep click as info view, drag for swap (cleaner separation)
- **Option B**: Add a "Move to..." button in the info sheet

**Recommendation**: Option A for now. Click = info, Drag = swap. This is simpler and consistent with regular cell behavior (click = edit, drag = swap).

---

### Phase 7: Testing & Edge Cases

#### 7.1 Per-Division Elective Scenarios

| Test | Source | Target | Expected |
|------|--------|--------|----------|
| 7.1.1 | Elective (2 teachers) | Empty slot | Elective moves, 2 rows get new coordinates |
| 7.1.2 | Elective (2 teachers) | Regular subject (1 teacher) | Elective moves to target, regular moves to source |
| 7.1.3 | Elective (4 teachers) | Regular subject (1 teacher) | 4 rows move to target, 1 row moves to source |
| 7.1.4 | Elective A (2 teachers) | Elective B (3 teachers) | A's 2 rows ↔ B's 3 rows swap coordinates |
| 7.1.5 | Regular subject | Elective target | Same as 7.1.2 but drag direction reversed |
| 7.1.6 | Elective | Elective (same group, different day) | Time swap within same elective group |
| 7.1.7 | Elective with teacher conflict | Regular subject | 409 returned, force-swap creates notifications |

#### 7.2 Cross-Division Elective Scenarios

| Test | Source | Target | Expected |
|------|--------|--------|----------|
| 7.2.1 | Cross-div elective (3 divs) | Empty in ALL divs | 3 divisions' rows move |
| 7.2.2 | Cross-div elective (3 divs) | Regular subjects in each div | Elective moves, 3 regular subjects displaced to source |
| 7.2.3 | Cross-div elective (3 divs) | Mixed (empty in 1, regular in 2) | Elective moves, 2 regular displaced, 1 freed |
| 7.2.4 | Cross-div elective A (3 divs) | Cross-div elective B (2 divs, overlapping 2 divs) | Complex: shared divs swap, non-shared divs swap with whatever occupies |
| 7.2.5 | Cross-div elective (3 divs) | Slot doesn't exist in 1 div (different period structure) | Error: "Target slot not available in all divisions" |
| 7.2.6 | Cross-div elective | Target has teacher conflict in 1 of 3 divs | 409 with conflict in that specific division |
| 7.2.7 | Cross-div elective, force swap | Target with multiple conflicts | Swap executes, notifications created for ALL affected timetables |

#### 7.3 Asymmetric Cross-Division Elective Scenarios

| Test | Source | Target | Expected |
|------|--------|--------|----------|
| 7.3.1 | Asymmetric elective (XI B: 2 teachers, XI C: 2, XI D: 4) | Empty in all | 8 total rows move |
| 7.3.2 | Asymmetric elective | Regular in XI B, empty in XI C, regular in XI D | 2 regular displaced, 8 elective rows moved |
| 7.3.3 | Asymmetric elective, teacher shared across divisions | Target where shared teacher is busy | Conflict detected for the shared teacher |

#### 7.4 Assistant Teacher Scenarios

| Test | Source | Target | Expected |
|------|--------|--------|----------|
| 7.4.1 | Elective with assistant teachers | Target where assistant is busy | Conflict detected for assistant |
| 7.4.2 | Regular with assistant | Elective target | Both primary and assistant checked |

#### 7.5 Edge Cases

| Test | Scenario | Expected |
|------|----------|----------|
| 7.5.1 | Swap to break/lunch slot | Rejected (not a PERIOD slot) |
| 7.5.2 | Swap within same time slot (same day, same period) | Rejected (same slot) |
| 7.5.3 | Source elective was partially deleted (orphaned rows) | Handle gracefully |
| 7.5.4 | Concurrent swap by two users | Transaction isolation prevents corruption |
| 7.5.5 | Elective spans 2 divisions but one timetable is OUTDATED | Still allowed (both GENERATED and OUTDATED are swappable) |
| 7.5.6 | Cross-div elective where divisions use different period structures (different P3 times) | Widest time envelope used for conflict detection -- min(startTime) to max(endTime) |
| 7.5.7 | Teacher busy in a slot that overlaps one division's time but not another's | Detected by envelope -- even partial overlap with any division triggers conflict |
| 7.5.8 | Valid target coordinate exists in all structures but with very different times | Intersection check passes (sortOrder exists in all), envelope covers the full range |

---

## File Change Summary

| File | Change Type | Phase |
|------|------------|-------|
| `packages/shared/src/models/schemas/timetable.schema.ts` | Add `swapElectiveSlotsSchema` | 1.1 |
| `packages/shared/src/index.ts` | Export new schema + type | 1.1 |
| `services/timetable/src/router.ts` | Add 3 new routes | 1.2, 2.2, 5.1 |
| `services/timetable/src/controller.ts` | Add 3 controller methods | 1.2, 2.2, 5.1 |
| `services/timetable/src/service.ts` | Add `swapElectiveSlots()`, `getValidElectiveSwapTargets()`, `previewElectiveSwap()`. Modify `swapSlots()`, `getValidSwapTargets()` | 1.3, 2.1, 3.1, 3.2, 5.1 |
| `apps/frontend/src/features/timetable/timetableApi.ts` | Add 3 new endpoints | 2.3 |
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Enable elective DnD, update handlers | 4.1-4.5 |
| `apps/frontend/src/features/timetable/TimetableCells.tsx` | Add `isDragging` to `ElectiveCellContent` | 4.4 |
| `apps/frontend/src/features/timetable/ElectiveSwapConfirmDialog.tsx` | NEW -- confirmation dialog | 5.2 |

---

## Implementation Order

```
Phase 1 (Backend core)
  1.1  Schema + types
  1.2  Route + controller
  1.3  swapElectiveSlots() service method
       ↓
Phase 2 (Backend valid targets)
  2.1  getValidElectiveSwapTargets() service method
  2.2  Route + controller
  2.3  Frontend API slice
       ↓
Phase 3 (Backend integration)
  3.1  Modify swapSlots() to delegate for electives
  3.2  Modify getValidSwapTargets() to handle elective targets
       ↓
Phase 4 (Frontend DnD)
  4.1  Enable elective cell dragging
  4.2  Update drag start handler
  4.3  Update drag end handler
  4.4  ElectiveCellContent drag state
  4.5  Drag overlay for electives
       ↓
Phase 5 (Confirmation UX)
  5.1  Preview endpoint
  5.2  ElectiveSwapConfirmDialog component
  5.3  Integrate into TimetableViewPage
       ↓
Phase 6 (Override update)
  6.1  Override logic changes
  6.2  Click behavior decision
       ↓
Phase 7 (Testing)
  7.1-7.5 Verify all scenarios
```

Each phase is independently deployable and testable. Phase 1-3 can be tested via Postman before the frontend changes in Phase 4-5.
