# Enhancement 11: Period Structure Changes -- Timetable-Aware

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 30, 2026
> Depends on: Enhancement 3 (Status Flags), Enhancement 4 (Resolution Wizard)

## Overview

When a period structure is modified (periods added/removed, working days added/removed, slot type changes), the system should save the change first, then present the Resolution Wizard (from Enhancement 4) to guide the user through fixing affected timetables. The wizard shows SLOT_FILL steps for new empty slots and PW_BALANCE steps when total P/W exceeds the new slot count.

## Decisions Made

| Decision | Answer |
|----------|--------|
| When does the wizard appear? | After save completes successfully |
| Save atomic or preview? | Save first (option A), then wizard for cleanup |
| Bulk changes (add + remove in one save)? | Compute net diff, assess impact once at the end |
| Impact assessment location? | Backend returns affected divisions + change summary; frontend calls impact assessment endpoint |
| Adding a period | SLOT_FILL steps per division (user assigns subjects/teachers to new empty slots) |
| Removing a period | Timetable slots on removed period are deleted by backend; PW_BALANCE if P/W > new slot count |
| Adding a working day | SLOT_FILL steps per division (all new period slots on the new day) |
| Removing a working day | Warning dialog before save; PW_BALANCE after save if P/W > new slot count |
| PERIOD -> INTERVAL | No resolution triggered (intervals don't affect P/W) |
| INTERVAL -> PERIOD | Treated as "period added" (SLOT_FILL) |
| Multiple divisions on same structure | Sequential resolution steps per division (same as Enhancement 4 cascade) |
| Elective impact | Handled naturally by PW_BALANCE step (cross-div elective rows shown with cascade warning) |
| Resolve Later / Dismiss | Timetable retains status flags (EMPTY_SLOTS, EXCESS_ASSIGNMENTS per Enhancement 3); user fixes later from timetable view or assignment editor |
| Step ordering | SLOT_FILL first (new slots), then PW_BALANCE (excess assignments) |

---

## Trigger Points

Every period structure modification that changes the number of PERIOD-type slots or working days:

| Change | Effect | Resolution Steps |
|--------|--------|------------------|
| Add PERIOD slot | New empty timetable_slot rows backfilled | SLOT_FILL per division |
| Remove PERIOD slot | timetable_slots for that slot deleted | PW_BALANCE per division (if P/W > slots) |
| Add working day | New day with all PERIOD slots created | SLOT_FILL per division (all new day's slots) |
| Remove working day | All timetable_slots for that day deleted | PW_BALANCE per division (if P/W > slots) |
| INTERVAL -> PERIOD | New PERIOD slot, backfill empty rows | SLOT_FILL per division |
| PERIOD -> INTERVAL | No resolution | None (timetable_slots deleted, status flags set) |
| Periods JSON bulk update | Net diff computed: added periods + removed periods | Combined SLOT_FILL + PW_BALANCE |

---

## Implementation Phases

### Phase 1: Change Detection -- Diff Computation

#### 1.1 Compute slot diff on period structure update

**File:** `services/school-config/src/service.ts`

When `updatePeriodStructure()` or `regenerateSlotsForStructure()` runs, compute a diff between old and new PERIOD-type slots.

**Diff algorithm:**

```typescript
interface SlotDiff {
  addedSlotIds: string[];      // New PERIOD slots that were created
  removedSlotIds: string[];    // PERIOD slots that were deleted
  affectedDivisionIds: string[]; // All divisions using this structure
  totalNewPeriodCount: number;  // New total PERIOD slots per day
  totalOldPeriodCount: number;  // Old total PERIOD slots per day
  workingDayCount: number;      // Number of working days
}
```

**Matching strategy for bulk update:**
1. Load old slots (PERIOD-type only) grouped by workingDayId, sorted by sortOrder
2. Regenerate new slots from periods JSON
3. Compare by position (sortOrder): slots at same position with same time range = unchanged; extra new = added; missing old = removed
4. Alternative simpler approach: since `regenerateSlotsForStructure()` deletes ALL old slots and creates new ones, we can track old PERIOD slot IDs before deletion and new PERIOD slot IDs after creation. Slots that exist in new but not old = added. Slots in old but not new = removed.

**Use simpler approach** since the existing code already deletes and recreates all slots.

#### 1.2 Compute working day diff

**File:** `services/school-config/src/service.ts`

When `setWorkingDays()` runs, compute diff:

```typescript
interface WorkingDayDiff {
  addedDays: number[];          // dayOfWeek values added
  removedDays: number[];        // dayOfWeek values removed
  addedSlotIds: string[];       // All PERIOD slots on newly added days
  removedSlotIds: string[];     // All PERIOD slots on removed days (before deletion)
  affectedDivisionIds: string[];
}
```

#### 1.3 Return diff in API response

**Files:** `services/school-config/src/service.ts`, `services/school-config/src/controller.ts`

Modify the response for these endpoints to include the diff:

- `PUT /api/config/period-structures/{id}` (update)
- `PUT /api/config/period-structures/{id}/working-days` (set working days)
- `POST /api/config/period-structures/{id}/slots/generate` (regenerate)
- `POST /api/config/period-structures/{id}/days/{dayId}/slots` (add slot)
- `DELETE /api/config/period-structures/{id}/days/{dayId}/slots/{slotId}` (delete slot)

**Response shape:**

```typescript
interface PeriodStructureChangeResponse {
  data: PeriodStructure; // existing response
  impact: {
    hasImpact: boolean;
    addedPeriodSlots: number;       // count of new PERIOD slots
    removedPeriodSlots: number;     // count of removed PERIOD slots
    affectedDivisionIds: string[];  // divisions using this structure
    affectedTimetableCount: number; // how many timetables exist
    newTotalSlotsPerWeek: number;   // new total PERIOD slots × working days
  } | null;
}
```

If `impact.hasImpact` is false or no timetables exist, frontend skips the wizard.

---

### Phase 2: Impact Assessment Endpoint

#### 2.1 New endpoint: assess period structure impact

**File:** `services/school-config/src/service.ts`

New method: `assessPeriodStructureImpact()`

**Endpoint:** `POST /api/config/period-structures/{id}/assess-impact`

**Request:**
```typescript
{
  addedSlotIds: string[];     // from Phase 1 diff
  removedSlotIds: string[];   // from Phase 1 diff
}
```

**Logic:**

1. Load all divisions using this period structure (with timetables)
2. Filter to divisions that have generated timetables
3. For each division:
   a. Load all division assignments (non-deleted) with weightages
   b. Compute `totalPw` = sum of all assignment weightages
   c. Compute `totalSlots` = new total PERIOD slots per week (slots × working days)
   d. **If `addedSlotIds` non-empty**: Create SLOT_FILL step
      - Load the new empty timetable_slot rows (backfilled by save)
      - Group by (workingDayId, slotId) → list of empty slots for this division
      - Load existing assignments for the dropdown
   e. **If `removedSlotIds` non-empty AND `totalPw > totalSlots`**: Create PW_BALANCE step
      - Calculate overflow: `totalPw - totalSlots`
      - Load all assignments with current weightages
      - Mark cross-div elective rows with cascade warning

**Response:**
```typescript
{
  steps: ResolutionStep[];  // Same shape as Enhancement 4
}
```

Uses the same `ResolutionStep` type from Enhancement 4:

```typescript
interface ResolutionStep {
  type: 'SLOT_FILL' | 'PW_BALANCE';
  divisionId: string;
  className: string;
  divisionLabel: string;
  isCascade: boolean;
  details: SlotFillDetails | PwBalanceDetails;
}
```

#### 2.2 SLOT_FILL details for period structure changes

```typescript
interface SlotFillDetails {
  freedSlots: {
    timetableSlotId: string;
    workingDayId: string;
    slotId: string;
    dayLabel: string;
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
  }[];
  existingAssignments: {
    id: string;
    subjectId: string;
    subjectName: string;
    teacherId: string | null;
    teacherName: string | null;
    currentWeightage: number;
    electiveGroupId: string | null;
    electiveGroupName: string | null;
  }[];
}
```

#### 2.3 PW_BALANCE details

Same as Enhancement 4 -- no changes needed:

```typescript
interface PwBalanceDetails {
  divisionId: string;
  currentTotal: number;        // sum of all P/W
  availableSlots: number;      // new total slots
  subjects: {
    assignmentId: string;
    subjectName: string;
    electiveGroupId: string | null;
    electiveGroupName: string | null;
    currentWeightage: number;
    isCrossDivElective: boolean;
    crossDivDivisions: string[];
  }[];
}
```

#### 2.4 Step ordering

For each division, steps are ordered:
1. **SLOT_FILL** first (new empty slots from added periods/days)
2. **PW_BALANCE** second (if assignments exceed new slot count)

Divisions are ordered by class sortOrder → division label.

---

### Phase 3: Frontend -- Warning Dialog Before Destructive Changes

#### 3.1 Warning dialog for removing working day

**File:** `apps/frontend/src/features/period-structures/PeriodStructureEditor.tsx`

When the user unchecks a working day that has existing timetable data:

```
┌─────────────────────────────────────────────────┐
│  ⚠ Remove Working Day                          │
│                                                  │
│  Removing "Friday" will delete all timetable     │
│  data scheduled on Fridays for 10 divisions      │
│  using this period structure.                    │
│                                                  │
│  You will be guided through resolving any        │
│  assignment overflow after saving.               │
│                                                  │
│                     [Cancel]  [Remove & Save]    │
└─────────────────────────────────────────────────┘
```

**Logic:**
- Before removing a day, check if any divisions using this structure have timetables
- If yes, show warning dialog
- If no timetables exist, proceed without warning

#### 3.2 Warning dialog for removing a period

**File:** `apps/frontend/src/features/period-structures/PeriodStructureEditor.tsx`

When the user deletes a PERIOD-type slot:

```
┌─────────────────────────────────────────────────┐
│  ⚠ Remove Period                                │
│                                                  │
│  Removing "P8 (14:00-14:45)" will delete all    │
│  timetable data at this period for 10 divisions. │
│                                                  │
│  You will be guided through resolving any        │
│  assignment overflow after saving.               │
│                                                  │
│                     [Cancel]  [Remove & Save]    │
└─────────────────────────────────────────────────┘
```

#### 3.3 No warning for additions

Adding periods or working days is non-destructive -- no warning needed. The wizard appears after save for SLOT_FILL.

---

### Phase 4: Frontend -- Wire Resolution Wizard After Save

#### 4.1 Period structure editor save flow

**File:** `apps/frontend/src/features/period-structures/PeriodStructureEditor.tsx`

**Updated save flow:**

```
User clicks Save
    ↓
Save period structure (name + periods)  ──→  response1 { data, impact }
    ↓
Set working days (if changed)  ──→  response2 { data, impact }
    ↓
Assign divisions (if changed)
    ↓
Merge impacts from all responses
    ↓
If any impact.hasImpact && impact.affectedTimetableCount > 0:
    ↓
Call POST /api/config/period-structures/{id}/assess-impact
    with merged { addedSlotIds, removedSlotIds }
    ↓
Receive resolution steps
    ↓
Open ResolutionWizardModal with steps
    ↓
(User completes or dismisses wizard)
    ↓
Navigate back / show success
```

#### 4.2 State management

```typescript
const [resolutionSteps, setResolutionSteps] = useState<ResolutionStep[] | null>(null);
const [showResolutionWizard, setShowResolutionWizard] = useState(false);
```

#### 4.3 Resolution wizard integration

```typescript
{showResolutionWizard && resolutionSteps && (
  <ResolutionWizardModal
    open={showResolutionWizard}
    onClose={() => {
      setShowResolutionWizard(false);
      toast.info('You can fix remaining issues from each division\'s timetable view.');
      navigate('/period-structures');
    }}
    initialSteps={resolutionSteps}
    onStepComplete={handleStepComplete}
  />
)}
```

#### 4.4 Step completion handlers

Reuse the same resolution endpoints from Enhancement 4:

| Step Type | Endpoint Called |
|-----------|----------------|
| SLOT_FILL | `POST /api/assignments/resolve-slot-fill` |
| PW_BALANCE | `POST /api/assignments/resolve-pw-balance` |

These endpoints already exist per Enhancement 4's plan. No new backend resolution logic needed.

---

### Phase 5: SLOT_FILL Step Customization for Period Structure Context

#### 5.1 Enhanced SLOT_FILL step for bulk slots

The existing SLOT_FILL step from Enhancement 4 shows individual freed slots. For period structure changes, we may have 5+ new slots per division (one per working day for the new period). The UI should group them:

**File:** `apps/frontend/src/components/shared/SlotFillStep.tsx` (modify)

**Layout for period structure context:**

```
┌──────────────────────────────────────────────────────┐
│  Fill New Slots -- Class I Division A                │
│  5 new slots added (Period 9 across all days)        │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Day       │ Period │ Time          │ Assignment  │ │
│  │───────────│────────│───────────────│─────────────│ │
│  │ Monday    │ P9     │ 14:00-14:45   │ [Select ▼]  │ │
│  │ Tuesday   │ P9     │ 14:00-14:45   │ [Select ▼]  │ │
│  │ Wednesday │ P9     │ 14:00-14:45   │ [Select ▼]  │ │
│  │ Thursday  │ P9     │ 14:00-14:45   │ [Select ▼]  │ │
│  │ Friday    │ P9     │ 14:00-14:45   │ [Select ▼]  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  Assignment dropdown shows:                           │
│  - Existing assignments: "English - Sreethu (5 P/W)" │
│  - "Leave empty"                                      │
│                                                       │
│  [Fill Selected]                           [Skip All] │
└──────────────────────────────────────────────────────┘
```

**Dropdown options per slot:**
- All existing division assignments with subject name, teacher name, current P/W
- "Leave empty" option
- User can assign different subjects to different days

**Batch assign:** Optional "Apply to all" checkbox -- assign the same subject/teacher to all new slots on this step.

#### 5.2 When adding a working day

If a new working day is added (e.g., Saturday), ALL period slots on that day are new. The SLOT_FILL step shows:

```
Fill New Slots -- Class I Division A
8 new slots added (Saturday: P1-P8)

| Period | Time          | Assignment   |
|--------|---------------|-------------|
| P1     | 08:30-09:10   | [Select ▼]  |
| P2     | 09:10-09:50   | [Select ▼]  |
| ...    | ...           | ...         |
| P8     | 14:00-14:45   | [Select ▼]  |
```

---

### Phase 6: Edge Cases & Alternate Flows

#### 6.1 No timetables exist

If no divisions using the structure have generated timetables:
- Save proceeds normally
- No wizard shown
- Backend still updates slots (for future timetable generation)

#### 6.2 Structure used by 0 divisions

If no divisions are assigned to this period structure:
- Save proceeds normally
- No impact assessment needed

#### 6.3 Mixed add + remove in one save

User edits periods JSON: removes P7, adds P9 and P10.

**Flow:**
1. Backend saves: deletes old slots, creates new slots
2. Diff: 1 removed PERIOD slot, 2 added PERIOD slots
3. Impact assessment per division:
   - Old total: 7 periods × 5 days = 35 slots/week
   - New total: 8 periods × 5 days = 40 slots/week
   - Removed 1 period: timetable_slots on P7 deleted (assignments lost)
   - Added 2 periods: empty timetable_slots backfilled for P9, P10
   - If old P/W was 35: no PW_BALANCE needed (35 ≤ 40)
   - If old P/W was 38: no PW_BALANCE needed (38 ≤ 40)
   - SLOT_FILL step: 10 new empty slots (2 periods × 5 days)

**Edge case:** If old P/W was 35 and we remove 2 periods and add 0:
- New total: 5 periods × 5 days = 25 slots/week
- P/W 35 > 25: PW_BALANCE step with overflow of 10

#### 6.4 Cross-division elective cascade

Division A, B, C share a period structure and a cross-div elective (P/W = 8).

User removes 2 periods → new slots = 30 (was 40). All three divisions now have P/W overflow.

**Wizard steps:**
1. PW_BALANCE for Division A -- user reduces some assignment P/W
2. If user reduces the cross-div elective's P/W → cascade to B and C
3. PW_BALANCE for Division B (appended dynamically)
4. PW_BALANCE for Division C (appended dynamically)

This is the same cascade behavior as Enhancement 4. No new logic needed.

#### 6.5 Division with no assignments

A division uses the structure but has 0 assignments:
- Adding periods: SLOT_FILL step skipped (nothing to fill, no assignments exist)
- Removing periods: PW_BALANCE skipped (0 P/W, no overflow)

#### 6.6 Division with timetable but all slots empty

A division has a generated timetable but all timetable_slots have `divisionAssignmentId = null`:
- No resolution needed (nothing to fill, nothing overflows)
- Skip this division in the wizard

#### 6.7 User dismisses wizard

- Timetable retains Enhancement 3 status flags (EMPTY_SLOTS, EXCESS_ASSIGNMENTS, etc.)
- User can fix later from:
  - Timetable view page (click-to-edit cells)
  - Assignment editor (adjust P/W)
  - Regenerate timetable (engine handles assignment)
- Toast message: "You can fix remaining issues from each division's timetable view."

#### 6.8 Re-editing structure while wizard is open

Not possible -- wizard is modal. User must complete or dismiss before further edits.

#### 6.9 Concurrent structure edits

If another user modifies the structure while wizard is open:
- Resolution endpoints may fail with conflicts
- Standard error handling: toast error, user refreshes

#### 6.10 Copy slots between days

`POST /api/config/period-structures/{id}/days/{dayId}/copy-from/{sourceDayId}`

This regenerates all slots on the target day. If the number of PERIOD slots changes:
- Treated as add/remove for that specific day
- Impact assessed for that day's slots only

#### 6.11 Reorder slots

Reordering slots doesn't change the count of PERIOD slots -- no resolution needed. Only `sortOrder` and `slotNumber` change. Timetable_slot references remain valid (they reference slot IDs, not positions).

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `services/school-config/src/service.ts` | Add diff computation to `regenerateSlotsForStructure()`, `setWorkingDays()`, `addSlot()`, `deleteSlot()`. New `assessPeriodStructureImpact()` method. Return impact in responses. | 1, 2 |
| `services/school-config/src/controller.ts` | New controller for `assessPeriodStructureImpact`. Update existing controllers to return impact. | 1, 2 |
| `services/school-config/src/router.ts` | New route: `POST /period-structures/{id}/assess-impact` | 2 |
| `services/school-config/serverless.yml` | New httpApi event for assess-impact | 2 |
| `packages/shared/src/models/schemas/slot.schema.ts` | New `assessImpactSchema` for request validation | 2 |
| `apps/frontend/src/features/period-structures/PeriodStructureEditor.tsx` | Warning dialogs for destructive changes. Updated save flow to call assess-impact and open ResolutionWizardModal. | 3, 4 |
| `apps/frontend/src/features/period-structures/configApi.ts` | New `assessPeriodStructureImpact` query. Update existing mutation response types to include `impact`. | 1, 2, 4 |
| `apps/frontend/src/components/shared/SlotFillStep.tsx` | Enhanced layout for bulk slots (table with day column, batch assign option) | 5 |

**No new files needed** -- reuses ResolutionWizardModal, SlotFillStep, PwBalancerStep from Enhancement 4.

---

## API Endpoints

| Endpoint | Method | Purpose | Phase |
|----------|--------|---------|-------|
| `POST /api/config/period-structures/{id}/assess-impact` | POST | Compute resolution steps for affected divisions | 2 |

Existing endpoints modified to return `impact` field:
- `PUT /api/config/period-structures/{id}`
- `PUT /api/config/period-structures/{id}/working-days`
- `POST /api/config/period-structures/{id}/slots/generate`
- `POST /api/config/period-structures/{id}/days/{dayId}/slots`
- `DELETE /api/config/period-structures/{id}/days/{dayId}/slots/{slotId}`

Resolution execution uses existing Enhancement 4 endpoints:
- `POST /api/assignments/resolve-slot-fill`
- `POST /api/assignments/resolve-pw-balance`

---

## Implementation Order

```
Phase 1: Change detection -- diff computation in backend (slot + working day diffs)
Phase 2: Impact assessment endpoint -- compute resolution steps per division
Phase 3: Frontend warning dialogs for destructive changes
Phase 4: Frontend save flow -- wire ResolutionWizardModal after save
Phase 5: SLOT_FILL step enhancement for bulk slot context
Phase 6: Edge case handling (no timetables, empty divisions, mixed changes, cascade)
```

**Prerequisites:**
- Enhancement 3 (Status Flags) must be complete -- multi-status model, per-slot violations
- Enhancement 4 (Resolution Wizard) must be complete -- ResolutionWizardModal, all step components, resolution endpoints

---

## Appendix: Current Code Inventory

### Period Structure Service

- **File:** `services/school-config/src/service.ts`
- `updatePeriodStructure()` -- calls `regenerateSlotsForStructure()` when periods changed
- `regenerateSlotsForStructure()` -- deletes all old slots, creates new from periods JSON, calls `flagAndBackfillTimetables()`
- `setWorkingDays()` -- deletes old working days + slots, creates new, generates slots
- `addSlot()` -- adds one slot, calls `flagAndBackfillTimetables()` if PERIOD type
- `deleteSlot()` -- deletes one slot (with confirmation), flags timetables if PERIOD type
- `flagAndBackfillTimetables()` -- flags timetables OUTDATED, creates STRUCTURE_CHANGED notifications, backfills empty timetable_slot rows for new slots

### Period Structure Editor

- **File:** `apps/frontend/src/features/period-structures/PeriodStructureEditor.tsx` (~555 lines)
- Save flow: create/update structure → set working days → assign divisions
- Slot editing: drag-and-drop reorder, add/remove, type change, copy between days
- Division assignment: class-level and division-level checkboxes

### Resolution Wizard (Enhancement 4)

- **File:** `apps/frontend/src/components/shared/ResolutionWizardModal.tsx` (planned)
- Props: `open`, `onClose`, `initialSteps`, `onStepComplete`
- Dynamic step counter, left/right navigation, cascade step appending
- Step types: TEACHER_CONFLICT, SLOT_REMOVAL, SLOT_FILL, PW_BALANCE, WEIGHTAGE_ADJUSTMENT

### Resolution Step Components (Enhancement 4)

- `SlotFillStep.tsx` -- shows freed slots with assignment dropdown per slot
- `PwBalancerStep.tsx` -- editable table of all subjects/P/W with total validation
- Both reused as-is for period structure changes (SlotFillStep enhanced in Phase 5)
