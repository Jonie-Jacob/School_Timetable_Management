# Enhancement 8: UI Bug Fixes & UX Improvements

> Status: IN PROGRESS
> Updated: April 30, 2026

## Summary

Collection of UI bugs and UX improvements identified during usage. Items are implemented as they are identified.

---

## Items

### 1. Generation Result Persists After Dismiss -- FIXED

**Problem:** On the All Timetables page, the generation result component re-appears on page refresh even after the user has dismissed it. It should only show for new generation runs.

**Root Cause:** `localStorage('last-generation-result')` was restored unconditionally on mount. Dismissing cleared the item, but any re-render that triggers the WS/polling save path would re-save it.

**Fix:** Store a `generation-result-dismissed-at` timestamp in localStorage when the user dismisses. On mount, compare `savedAt` timestamp on the saved result against `dismissedAt` -- only restore if the result is newer.

**File:** `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx`
- Init state: compare `savedAt` vs `dismissedAt` before restoring
- Dismiss handler: `setItem('generation-result-dismissed-at', Date.now())`
- Save paths (2 locations): include `savedAt: Date.now()` in persisted JSON

---

### 2. View Timetable Button Hidden for Outdated Divisions -- FIXED

**Problem:** On the All Timetables page, the "View" and "Export" buttons for a division were only visible when status was `GENERATED` or `OUTDATED`. With Enhancement 3's multi-status model, the button should be visible whenever a timetable record exists.

**Fix:** Changed condition from `(status === 'GENERATED' || status === 'OUTDATED')` to `div.timetable != null`.

**File:** `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx`
- Line ~459: Updated conditional rendering guard

---

### 3. Cell Edit Drawer Restyle + Assistant Teacher Support -- FIXED

**Problem:**
- (a) The teacher list in the cell edit side drawer had no proper borders -- elements were floating without visual containment.
- (b) No way to assign or change the assistant teacher from the timetable view drawer.

**Fix:**
- **Borders:** Wrapped the primary teacher list in a bordered card (`rounded-xl border border-border/50`) with a header bar showing the section title and filter controls on a muted background.
- **Assistant Teacher:** Added a new bordered section below the primary teacher with a dropdown (`<select>`) showing all teachers (excluding the selected primary). Each option shows `name -- N periods/wk` and `[Conflict: ...]` if conflicted. Below the dropdown, badges show the selected assistant's load and conflict status.
- **Footer:** Changed from light `bg-card/40` to dark gradient (`bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800`) matching the header. Button styles updated for dark background.
- **Save logic:** Updated to persist `assistantTeacherId` on the assignment via `updateAssignment()`.

**File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx`
- Added `sheetSelectedAssistantId` state
- `openEditor`: initializes assistant from `fullAssignment.assistantTeacherId`
- Subject change: resets assistant selection
- Primary teacher click: clears assistant if it matches new primary
- Teacher list: wrapped in bordered card with header, filter controls in border-separated bar
- New "Assistant Teacher (optional)" section with dropdown + badges
- Footer: dark gradient with styled buttons
- Save: updates `assistantTeacherId` on assignment

---

### 4. Elective Grouping Signature Missing periodsPerWeek -- NO CHANGE NEEDED

**Problem (reported):** User wanted to verify that `periodsPerWeek` is included in the grouping signature for the Elective Groups table.

**Finding:** Already included. Signature is `${g.periodsPerWeek}||${subjectSig}||${teacherSig}`.

**File:** `services/division-assignment/src/service.ts` line ~444

---

### 5. Elective Edit Modal -- Scheduling Mode Tick + Header/Footer Restyle -- FIXED

**Problem:**
- (a) The Per-Division / Cross-Division toggle in the elective edit modal had no visual indicator of which option was selected beyond background color.
- (b) The modal header and footer had no dark background -- didn't match the app's design language. The entire modal content scrolled together (header, body, footer), making the save button hard to reach on long forms.

**Fix:**
- **(a) Green tick:** Added a green `<Check>` icon (lucide) inside the active toggle item, making the selection immediately obvious.
- **(b) Modal layout restructured:**
  - `DialogContent` changed to `flex flex-col p-0 gap-0 overflow-hidden`
  - Header: dark gradient (`from-stone-800 via-stone-700 to-stone-800`) with white title text, `shrink-0`
  - Body: `flex-1 overflow-y-auto` with padding -- only this section scrolls
  - Footer: dark gradient (matching header), `shrink-0`, with styled buttons (amber Save, outline Cancel/Delete for dark bg)

**Files:**
- `apps/frontend/src/features/elective-groups/editor/GroupConfigSection.tsx` -- added Check icon import and conditional rendering
- `apps/frontend/src/features/elective-groups/editor/ElectiveGroupEditorModal.tsx` -- restructured layout, removed DialogFooter import, added dark gradient header/footer with proper button styling

---

## Future Items

Items will be added here as identified. Enhancement 10 (Mobile Responsive) covers screen-size-specific fixes.
