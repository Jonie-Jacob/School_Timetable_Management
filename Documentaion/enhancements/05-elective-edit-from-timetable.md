# Enhancement 5: Elective Edit Modal from Timetable View

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 27, 2026
> Depends on: Enhancement 3 (Status Flags) and Enhancement 4 (Timetable-Aware Assignments)

## Key Reference

**Elective logic**: See `Documentaion/Engine_Algorithm.md` section "Elective Groups -- Two Types" (line ~675). Critical concepts:
- **Elective subjects run in parallel at the same slot** -- students pick one
- **Per-division** (`num_divisions = 1`): schedules independently, editing affects only that division
- **Cross-division** (`num_divisions > 1`): ALL divisions share same time slots, changes cascade
- **Asymmetric cross-div**: different divisions have different subject subsets
- **Parallel mode** (`num_teachers <= parallel_sections`): all teachers teach every slot simultaneously
- **Split mode** (`num_teachers > parallel_sections`): teachers take turns, distributed sequentially
- `parallel_sections` is per-subject (in `elective_group_subjects`), `periodsPerWeek` is per-group
- Max total weightage per subject = `periodsPerWeek × parallel_sections`
- Single-subject elective is valid -- keep `electiveGroupId` association

**Existing modal**: `apps/frontend/src/features/elective-groups/editor/ElectiveGroupEditorModal.tsx` -- 5 sections (config, subjects, divisions, preferences). Save calls `bulkSaveElectiveGroup()`.

**Resolution wizard**: From Enhancement 4 -- `ResolutionWizardModal` with step types (TeacherConflict, SlotRemoval, SlotFill, PwBalance).

## Overview

Replace the read-only elective info sheet with the full `ElectiveGroupEditorModal`. Make it timetable-aware: show current timetable state, handle structural changes (subjects, teachers, P/W, parallel_sections, divisions), auto-create/delete/redistribute timetable slots, and open the resolution wizard for conflicts.

## Decisions Made

| Decision | Answer |
|----------|--------|
| Where modal opens from | Class timetable, teacher timetable, Elective Groups page, Assignment Editor -- ALL locations |
| Timetable-aware always? | Yes -- always timetable-aware regardless of where opened |
| Auto-regeneration? | No -- save changes, open resolution wizard for conflicts |
| Save flow | Save immediately, resolution wizard opens if impact exists |
| Teacher assignment required? | Yes -- mandatory before saving |
| Timetable summary in modal | Show at top: "Currently N slots across M divisions" |
| Summary real-time update | If possible show real-time delta, otherwise post-save resolution is fine |

### Subject Changes

| Change | Behavior |
|--------|----------|
| Add subject | Auto-create `timetable_slot` rows at ALL existing time coordinates, in ALL participating divisions. Teacher must be assigned. Check conflicts after save. |
| Remove subject | Delete that subject's `timetable_slot` rows. Remaining subjects unaffected. |
| Single-subject elective | Valid -- stays as elective |

### Periods Per Week Changes

| Change | Behavior |
|--------|----------|
| Increase P/W | Save with warning if exceeds total. Resolution wizard: P/W Balancer for affected divisions. |
| Decrease P/W | Save. Resolution wizard: Slot Removal visual picker. For cross-div: single picker removes from ALL divisions. Cascade: freed slots in each division trigger Slot Fill steps. |

### Weightage Adjustment on P/W Change

When `periodsPerWeek` changes, teacher weightages must fit:
- **Parallel mode**: Auto-adjust each teacher's weightage to new P/W (no user input needed)
- **Split mode**: Total weightage per subject must fit `newPW × parallel_sections`. If over, save succeeds but resolution wizard forces user to adjust individual teacher weightages.
- User can adjust weightages in the modal before saving. If they don't, post-save resolution handles it.

### parallel_sections Changes

| Change | Behavior |
|--------|----------|
| ps increase (split→parallel) | Update weightages (each teacher = P/W). Auto-create additional slot rows at existing coordinates. Post-save conflict resolution if new teacher has conflicts. |
| ps decrease (parallel→split) | Update weightages (split evenly). Redistribute slot rows: first teacher gets first N slots, second gets next N, etc. Sequential distribution by day/period sort order. Delete extra rows. |
| ps increase but fewer teachers than new ps | Block save -- user must add another teacher section first |
| Teacher removed, remaining < ps | Block save -- user must add teacher or reduce ps |

### Slot Redistribution on ps Decrease (parallel→split)

Example: ps 2→1, P/W=8, Amrutha w=8 + Julie w=8 → Amrutha w=4 + Julie w=4

**Before**: 8 time coordinates × 2 rows each = 16 slot rows
**After**: 8 time coordinates × 1 row each = 8 slot rows

Distribution (sequential by day sort order, then slot sort order):
```
Slots 1-4 (Mon P3, Mon P4, Tue P3, Tue P4): keep Amrutha's row, delete Julie's row
Slots 5-8 (Wed P3, Wed P4, Thu P3, Thu P4): keep Julie's row, delete Amrutha's row
```

### Slot Auto-Creation on ps Increase (split→parallel)

Example: ps 1→2, P/W=8, Amrutha w=4 + Julie w=4 → Amrutha w=8 + Julie w=8

**Before**: 8 time coordinates × 1 row each = 8 slot rows (4 Amrutha, 4 Julie)
**After**: 8 time coordinates × 2 rows each = 16 slot rows

Auto-create:
```
Mon P3 (had Amrutha): add Julie row → check Julie free at Mon P3
Mon P4 (had Amrutha): add Julie row → check Julie free at Mon P4
...
Wed P3 (had Julie): add Amrutha row → check Amrutha free at Wed P3
...
```

If conflicts exist at any slot → save succeeds, resolution wizard opens with Teacher Conflict steps.

### Division Changes

| Change | Behavior |
|--------|----------|
| Remove division | Delete that division's elective slots. Slot Fill step for that division (fill freed slots). Other divisions unaffected. If only 1 division remains, modal reflects "per-division" type. |
| Add division | New division has no slots. Flag for regeneration of that division. |

---

## Implementation Phases

### Phase 1: Replace Info Sheet with Editor Modal

#### 1.1 Update TimetableViewPage -- elective click handler

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`

Replace the read-only info Sheet with `ElectiveGroupEditorModal`:
- Remove the `electiveInfoGroupId` state and Sheet component
- When elective cell is clicked, open `ElectiveGroupEditorModal` with the elective group's data
- Need to fetch `GroupedElectiveGroup` data for the clicked elective group ID

#### 1.2 Update TeacherTimetableGrid -- elective click handler

**File:** `apps/frontend/src/features/teacher-timetable/TeacherTimetableGrid.tsx`

Add click handler on elective cells that opens `ElectiveGroupEditorModal`. Currently elective cells have no click handler in the teacher view.

#### 1.3 Fetch elective group data for modal

The modal needs `GroupedElectiveGroup` as `initialData`. When clicking an elective cell, we have the `electiveGroupId`. Need to:
- Use `useGetGroupedElectiveGroupsQuery()` and find by ID
- Or add a new query `useGetElectiveGroupQuery(id)` that returns a single group

---

### Phase 2: Add Timetable Summary to Modal

#### 2.1 Backend -- elective timetable summary endpoint

**File:** `services/division-assignment/src/service.ts` or `services/timetable/src/service.ts`

New endpoint: `GET /api/elective-groups/:id/timetable-summary`

Returns:
```typescript
{
  electiveGroupId: string;
  periodsPerWeek: number;
  generatedSlotCount: number;  // distinct time coordinates with slots
  divisions: {
    divisionId: string;
    className: string;
    divisionLabel: string;
    slotCount: number;
    hasSlots: boolean;
  }[];
  timeCoordinates: {
    dayLabel: string;
    periodNumber: number;
    dayOfWeek: number;
    slotSortOrder: number;
  }[];  // all time coordinates where this elective has slots
}
```

#### 2.2 Frontend -- show summary in modal header

**File:** `apps/frontend/src/features/elective-groups/editor/ElectiveGroupEditorModal.tsx`

Below the group name/config section, show:
- "Currently 8 slots generated across 3 divisions (XII A, XII B, XII C)"
- Only shown when timetable exists (`timetableGeneratedAt` is set)
- Optionally update in real-time as user changes P/W

---

### Phase 3: Backend -- Enhanced `bulkSaveElectiveGroup()` with Timetable Operations

#### 3.1 Auto-create slots for new subjects

**File:** `services/division-assignment/src/service.ts`

In `bulkSaveElectiveGroup()`, after creating new `DivisionAssignment` records for a new subject:

1. Find all existing time coordinates for this elective group (from other subjects' slots)
2. For each coordinate, in each participating division:
   - Create a `timetable_slot` row pointing to the new subject's assignment
3. Only do this when `timetableGeneratedAt` is set

#### 3.2 Auto-create/delete rows for parallel_sections changes

In `bulkSaveElectiveGroup()`, detect `parallel_sections` changes per subject:

**ps increase (split→parallel):**
1. Update all teacher weightages to P/W
2. For each time coordinate, find which teachers are missing a slot row
3. Create the missing rows

**ps decrease (parallel→split):**
1. Calculate new weightages (distribute total evenly)
2. Sort existing time coordinates by day sort order, then slot sort order
3. Assign teachers sequentially: first teacher gets first `weightage` slots, etc.
4. Delete the extra rows (teachers who shouldn't be at that coordinate anymore)

#### 3.3 Weightage auto-adjustment for P/W changes

When `periodsPerWeek` changes:
- **Parallel mode subjects**: Auto-set each teacher's weightage = new P/W
- **Split mode subjects**: If total weightage > newPW × ps, flag for resolution (don't block save)

#### 3.4 Handle division removal with slot cleanup

When a division is removed from the elective:
- Delete all `timetable_slot` rows for that division's assignments in this elective
- The freed slots become empty in that division's timetable

#### 3.5 Return impact details

Update `BulkSaveResponse` to include impact information:
```typescript
interface BulkSaveResponse {
  groupIds: string[];
  divisionsAffected: number;
  impact?: {
    slotsCreated: number;      // new subject auto-created slots
    slotsDeleted: number;      // removed subject/division slots
    slotsRedistributed: number; // ps change redistribution
    weightagesAdjusted: { teacherName: string; from: number; to: number }[];
    affectedDivisions: string[];
  };
}
```

#### 3.6 Compute post-save resolution steps

After the bulk save, call `assessAssignmentImpact()` (from Enhancement 4) for each affected division to determine if resolution is needed (teacher conflicts from auto-created slots, P/W imbalance, freed slots to fill).

Return the resolution steps alongside the response.

---

### Phase 4: Backend -- Validation Guards

#### 4.1 Teacher assignment mandatory

In `bulkSaveElectiveGroup()`, validate that every subject has at least one teacher assigned before saving. Return 400 if missing.

#### 4.2 parallel_sections vs teacher count

If `parallel_sections` for any subject exceeds the number of teachers assigned to that subject, return 400: "Subject X needs at least Y teachers for Z parallel sections."

#### 4.3 P/W warning (not blocking)

If `periodsPerWeek` change causes total division P/W to exceed period structure slots, save succeeds but include a warning in the response and resolution steps.

---

### Phase 5: Frontend -- Wire Resolution Wizard After Elective Save

#### 5.1 Update ElectiveGroupEditorModal save handler

After successful save:
1. Check response for `impact` and resolution steps
2. If steps exist → close the editor modal → open `ResolutionWizardModal` with steps
3. If no steps → close modal, show success toast

#### 5.2 Handle elective-specific resolution steps

The resolution wizard from Enhancement 4 handles generic steps. Elective-specific additions:

**New step type: WEIGHTAGE_ADJUSTMENT**

When P/W decreased and split-mode teachers have excess weightage:
```
┌──────────────────────────────────────────────┐
│ Step 1/2: Adjust Teacher Weightages          │
│                                              │
│ Subject: IP (parallel_sections: 1)           │
│ New P/W: 6    Max total weightage: 6         │
│                                              │
│ Teacher    | Current | New                   │
│ Anitha     | 4       | [3] ← editable        │
│ Shijo      | 4       | [3] ← editable        │
│            | Total: 8 | Total: 6 / 6 ✓       │
│                                              │
│                             [Save Weightages]│
└──────────────────────────────────────────────┘
```

This step should be added to `ResolutionWizardModal` as a 5th step type.

#### 5.3 Cross-div cascade in resolution

When P/W decrease on a cross-div elective triggers slot removal:
1. Slot Removal step (single picker for all divisions)
2. For each division: Slot Fill step if user wants to fill freed slots
3. Step counter grows dynamically as cascades are discovered

---

### Phase 6: Frontend -- Update All Elective Click Locations

#### 6.1 Elective Groups page

Already opens `ElectiveGroupEditorModal` -- add resolution wizard integration (same as Phase 5.1).

#### 6.2 Assignment Editor page

Already opens `ElectiveGroupEditorModal` for elective edit -- add resolution wizard integration.

#### 6.3 Ensure consistent behavior

All 4 surfaces (class timetable, teacher timetable, elective groups page, assignment editor) should have identical post-save resolution behavior.

---

### Phase 7: Testing & Edge Cases

#### 7.1 Subject Changes

| # | Test | Expected |
|---|------|----------|
| 1 | Add subject to per-div elective with timetable | Slots auto-created at existing coordinates, teacher conflict check |
| 2 | Add subject to cross-div elective | Slots auto-created in ALL divisions |
| 3 | Remove subject (2→1 subjects) | Subject's slots deleted, elective remains with 1 subject |
| 4 | Remove last subject | Elective itself should be deleted or kept empty? (Keep -- single subject valid, 0 subject = deleted) |
| 5 | Add subject to elective with no timetable | No slots created (timetable not generated yet) |

#### 7.2 P/W Changes

| # | Test | Expected |
|---|------|----------|
| 6 | Increase P/W (cross-div) | Save succeeds, P/W Balancer opens for each affected division |
| 7 | Decrease P/W (cross-div) | Save succeeds, Slot Removal picker (single for all divs), then Slot Fill per division |
| 8 | Decrease P/W, split mode teacher weightage over | Weightage Adjustment step in resolution wizard |
| 9 | P/W change with cascade (reducing another cross-div elective to balance) | Dynamic step growth in wizard |

#### 7.3 parallel_sections Changes

| # | Test | Expected |
|---|------|----------|
| 10 | ps 1→2 (split→parallel) | Weightages auto-updated, additional slot rows created, conflict check |
| 11 | ps 2→1 (parallel→split) | Weightages halved, slot rows redistributed sequentially, extra rows deleted |
| 12 | ps increase but not enough teachers | Save blocked: "Need at least N teachers" |
| 13 | Teacher removed, remaining < ps | Save blocked: "Add teacher or reduce parallel sections" |

#### 7.4 Division Changes

| # | Test | Expected |
|---|------|----------|
| 14 | Remove division from cross-div (3→2) | Division's slots deleted, Slot Fill step for that division |
| 15 | Remove division (2→1) | Becomes per-division, modal UI reflects change |
| 16 | Add division to cross-div | No slots for new division, flag for generation |

#### 7.5 Teacher Changes

| # | Test | Expected |
|---|------|----------|
| 17 | Change teacher for a subject | Assignment updated in-place, conflict check at existing slot times |
| 18 | Add second teacher to a subject (split mode) | New assignment created, slots redistributed |
| 19 | Remove teacher from subject (still >= ps) | Teacher's slots redistributed to remaining teachers |

#### 7.6 Modal Source

| # | Test | Expected |
|---|------|----------|
| 20 | Open from class timetable view | Modal opens, timetable-aware, resolution wizard after save |
| 21 | Open from teacher timetable view | Same behavior, shows full elective group |
| 22 | Open from Elective Groups page | Same behavior |
| 23 | Open from Assignment Editor | Same behavior |

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Replace info Sheet with ElectiveGroupEditorModal, remove electiveInfoGroupId state | 1 |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetableGrid.tsx` | Add elective click → modal handler | 1 |
| `services/division-assignment/src/service.ts` | Timetable summary endpoint, enhanced bulkSaveElectiveGroup (auto-create slots, ps redistribution, weightage adjustment, impact return) | 2-3 |
| `services/division-assignment/src/router.ts` | New routes | 2-3 |
| `services/division-assignment/src/controller.ts` | New controller methods | 2-3 |
| `services/division-assignment/serverless.yml` | New API Gateway routes | 2-3 |
| `apps/frontend/src/features/elective-groups/electiveGroupApi.ts` | New timetable-summary query, update BulkSaveResponse type | 2-3 |
| `apps/frontend/src/features/elective-groups/editor/ElectiveGroupEditorModal.tsx` | Timetable summary display, validation guards (teacher mandatory, ps vs teacher count), resolution wizard trigger after save | 2, 4, 5 |
| `apps/frontend/src/components/shared/WeightageAdjustmentStep.tsx` | NEW -- resolution step for split-mode weightage adjustment | 5 |
| `apps/frontend/src/components/shared/ResolutionWizardModal.tsx` | Add WEIGHTAGE_ADJUSTMENT step type support | 5 |
| `apps/frontend/src/features/assignments/AssignmentEditorPage.tsx` | Wire resolution wizard for elective edit | 6 |

---

## Appendix: Current Code Inventory (for context after conversation compaction)

### ElectiveGroupEditorModal

- **File**: `apps/frontend/src/features/elective-groups/editor/ElectiveGroupEditorModal.tsx`
- **Props**: `{ open, onOpenChange, initialData: GroupedElectiveGroup | null }`
- **Sections**: GroupConfigSection, SubjectsSection, DivisionParticipationSection, SchedulingPreferencesSection
- **Save**: Builds `BulkSaveRequest`, calls `bulkSave()`, auto-retries with `confirmDeleteSlots: true` if backend returns `SLOTS_REQUIRE_CONFIRMATION`
- **Sub-components** in `apps/frontend/src/features/elective-groups/editor/`:
  - `types.ts` -- form state types, `DEFAULT_PREFS`, conversion helpers
  - `GroupConfigSection.tsx` -- name, P/W, type toggle
  - `SubjectsSection.tsx` -- subject checklist, parallel_sections, teacher dropdowns
  - `DivisionParticipationSection.tsx` -- class multi-select, division×subject grid
  - `SchedulingPreferencesSection.tsx` -- default prefs + per-division overrides

### bulkSaveElectiveGroup() Backend

- **File**: `services/division-assignment/src/service.ts` (lines ~841-1189)
- **Transaction**: 30s timeout
- **Steps**: Validate → soft-delete removed assignments (hard-delete their slots) → upsert ElectiveGroup → upsert ElectiveGroupSubject → upsert DivisionAssignment → flag affected timetables
- **Slot deletion confirmation**: If `confirmDeleteSlots === false` and removed divisions have slots → throws `SLOTS_REQUIRE_CONFIRMATION`
- **Cross-div teacher sync**: When editing assignments, ensures same teacher across sibling divisions

### Elective Info Sheet (to be replaced)

- **File**: `apps/frontend/src/features/timetable/TimetableViewPage.tsx` lines ~950-1060
- **State**: `electiveInfoGroupId` state variable
- **UI**: Sheet with elective group name, subjects & teachers list, "Manage in Elective Groups" button
- **Click handler**: Set at elective cell render (lines ~491, ~498)

### Timetable Slot Structure for Electives

- Multiple `timetable_slot` rows share same `(timetableId, workingDayId, slotId)` for parallel teachers
- Each row has `divisionAssignmentId` pointing to one teacher's assignment
- For cross-div: same time coordinates across different timetable IDs (one per division)
- `isElective` flag on frontend period DTO = true when any assignment has `electiveGroupId`

## Implementation Order

```
Phase 1: Replace info sheet with editor modal (all 4 surfaces)
Phase 2: Timetable summary in modal header
Phase 3: Backend -- enhanced bulkSaveElectiveGroup with timetable operations
Phase 4: Backend -- validation guards
Phase 5: Frontend -- wire resolution wizard after save
Phase 6: Frontend -- ensure consistent behavior across all surfaces
Phase 7: Testing
```

All phases depend on Enhancement 3 (status flags) and Enhancement 4 (resolution wizard modal) being implemented first.
