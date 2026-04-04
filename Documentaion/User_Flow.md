# School Timetable Management System
## User Flow Document

**Version**: 1.0  
**Date**: April 4, 2026  
**Status**: Draft

---

## Overview

This document defines the step-by-step user flow for setting up and using the School Timetable Management System. The flow is designed to match how schools naturally configure their timetable data — each step builds on the previous one.

The frontend application includes a **Guided Setup Wizard** that walks first-time users through each step sequentially, ensuring no prerequisite is missed.

---

## Setup Flow Summary

```
Step 1: Create Academic Year
  │
Step 2: Create Classes & Divisions
  │
Step 3: Create Period Structures & Assign to Divisions
  │
Step 4: Create Subjects & Elective Groups
  │  ├── 4a. Create Subjects
  │  └── 4b. Create Elective Groups (using subjects from 4a)
  │
Step 5: Create Teachers
  │  ├── 5a. Add teacher details & qualified subjects
  │  ├── 5b. Set max periods per week (soft cap)
  │  └── 5c. Set teacher availability (unavailable days/periods)
  │
Step 6: Assign Subjects & Teachers to Divisions
  │  ├── 6a. Regular assignments (subject + teacher + weightage per division)
  │  ├── 6b. Elective group assignments (per division)
  │  ├── 6c. Assistant teacher assignments (optional)
  │  └── 6d. Scheduling preferences (optional, per assignment)
  │
Step 7: Generate Timetable
  │
Step 8: Review & Edit Timetable
  │
Step 9: Export / Print Timetables
     ├── Per division
     ├── Per class (all divisions combined)
     ├── Per teacher
     ├── All teachers (combined)
     └── Group of teachers (custom selection)
```

---

## Detailed Step Descriptions

### Step 1: Create Academic Year

**Screen**: Screen 2 — Academic Year Management  
**Prerequisite**: User has logged in (Screen 0)

**What the user does**:
1. Navigate to Academic Year Management.
2. Click "Create New Academic Year".
3. Enter: Year Label (e.g., "2026–2027"), Start Date, End Date.
4. Save — the new year is automatically set as **Active**.

**Rules**:
- Only one academic year can be active at a time.
- All subsequent data (classes, subjects, teachers, timetables) is scoped to this active year.
- Previous years are archived and accessible in read-only mode.

**Completion criteria**: At least one active academic year exists.

---

### Step 2: Create Classes & Divisions

**Screens**: Screen 8 (Classes List) → Screen 9 (Class Detail & Division Management)  
**Prerequisite**: Step 1 complete (active academic year exists)

**What the user does**:
1. Navigate to Classes.
2. Click "Add Class" — enter class name (e.g., "Nursery", "Class I", "Grade 10").
3. Set display order via drag-and-drop reordering.
4. Optionally enable **Requires Stream** for classes that need stream labels (e.g., Class XI, XII).
5. For each class, click into the class detail and add divisions:
   - Enter division label (e.g., "A", "B").
   - For stream-required classes: also enter stream name (e.g., "Science", "Commerce").
   - Optionally copy assignments from an existing division (useful for similar sections).

**Rules**:
- Class names are user-defined — any naming convention is allowed.
- A class can have zero or more divisions.
- Division labels must be unique within a class.
- Stream names are user-defined (not a fixed list).

**Completion criteria**: At least one class with at least one division exists.

---

### Step 3: Create Period Structures & Assign to Divisions

**Screens**: Screen 3 (Period Structures List) → Screen 3A (Period Structure Editor) → Screen 9 (Class Detail, for reassignment)  
**Prerequisite**: Step 2 complete (classes and divisions exist)

**What the user does**:

#### 3a. Create Period Structure
1. Navigate to Period Structures (under Settings).
2. Click "Add Period Structure".
3. Enter structure name (e.g., "Primary Block", "Senior Block").
4. Select working days (any combination of Mon–Sun).
5. For each working day, configure the slot sequence:
   - Add slots: Period, Interval, or Lunch Break.
   - Set start time and end time for each slot.
   - Reorder slots via drag-and-drop.
   - Period-type slots are auto-numbered (Period 1, 2, 3...).
   - Use "Copy slots from day" to replicate a day's configuration.
6. **Assign divisions** to this structure using the multi-select.

#### 3b. Reassign Period Structures (optional, anytime)
1. Navigate to any class → division edit.
2. Change the assigned period structure from the dropdown (shows all available structures).
3. The currently assigned structure is pre-populated.

**Rules**:
- Each division is linked to exactly one period structure at a time.
- Different divisions within the same class may use different structures.
- A default structure (Mon–Fri, 8 periods, 3 breaks) is created on new account setup.
- Divisions without a period structure are excluded from timetable generation.
- Removing a slot referenced by a generated timetable triggers a confirmation warning.

**Completion criteria**: All divisions that need timetables have a period structure assigned.

---

### Step 4: Create Subjects & Elective Groups

**Screens**: Screen 4–5 (Subjects) → Screen 15 (Elective Groups)  
**Prerequisite**: Step 1 complete (active academic year)

#### Step 4a: Create Subjects
1. Navigate to Subjects.
2. Click "Add New Subject".
3. Enter subject name (e.g., "Mathematics", "Physical Education").
4. Repeat for all subjects the school offers.

**Rules**:
- Subject names must be unique within the school.
- Subjects can be deleted later (with cascade warnings if assigned).

#### Step 4b: Create Elective Groups
1. Navigate to Elective Groups.
2. Click "Add Elective Group".
3. Enter group name (e.g., "Bio/CS", "Maths/CS").
4. Select 2 or more subjects that form the elective group.
5. Save.

**Rules**:
- A subject can belong to multiple elective groups.
- Elective groups are school-level entities scoped to the academic year.
- Editing or deleting a group after it's assigned to divisions triggers warnings.

**Completion criteria**: All required subjects and elective groups are created.

---

### Step 5: Create Teachers

**Screen**: Screen 6–7 (Teachers List & Form)  
**Prerequisite**: Step 4a complete (subjects exist to assign qualifications)

**What the user does**:

#### 5a. Add Teacher Details
1. Navigate to Teachers.
2. Click "Add New Teacher".
3. Enter: Name (required), Contact Details (optional).
4. Select **Subjects They Can Teach** from the multi-select (subjects created in Step 4a).

#### 5b. Set Max Periods Per Week
5. Enter the maximum periods per week (optional soft cap).
   - The timetable engine will attempt to respect this limit.
   - If exceeded, it appears as a warning (not a hard failure).

#### 5c. Set Teacher Availability
6. Use the **Availability Grid** to mark specific days/periods as unavailable.
   - Grid shows all working days across all active period structures.
   - Click cells to toggle unavailability.
   - The timetable engine treats unavailable slots as hard constraints (will never schedule the teacher there).

**Rules**:
- Teacher name is required; contact details are optional.
- A teacher must be qualified for at least one subject.
- Availability is scoped per academic year.
- Deleting a teacher with active assignments triggers a confirmation warning.

**Completion criteria**: All teachers are created with their qualifications and availability set.

---

### Step 6: Assign Subjects & Teachers to Divisions

**Screen**: Screen 10 (Division Assignments Editor)  
**Prerequisite**: Steps 2–5 complete

**What the user does**:

For each division (navigate via Class → Division → Edit Assignments):

#### 6a. Regular Assignments
1. Click "Add Assignment".
2. Select Subject (dropdown).
3. Select Teacher (filtered to those qualified for the subject).
4. Enter Weightage (periods per week for this teacher-subject pair).
5. Save.
6. Repeat — the same subject can be assigned multiple times with different teachers (e.g., English: Teacher X — 3 periods, Teacher Y — 2 periods).

#### 6b. Elective Group Assignments
1. Click "Add Elective Assignment".
2. Select Elective Group (dropdown).
3. For each subject in the group: select a teacher (must be different per subject).
4. Enter Weightage (single value, applied to all subjects in the group).
5. Save.

**Cross-division elective rule**: If the same elective group is assigned to multiple divisions of the same class, teachers are enforced to be the same across all divisions (students physically regroup).

#### 6c. Assistant Teacher (Optional)
- When adding or editing any assignment, optionally select an Assistant Teacher.
- The assistant shares the same time slots as the primary teacher.
- No independent weightage — purely a co-teaching designation.

#### 6d. Scheduling Preferences (Optional)
- When adding or editing any assignment, expand the Scheduling Preferences section:
  - **Constraint Type**: Hard (must satisfy) or Soft (best effort).
  - **Preferred Days**: Days the subject should preferably be scheduled.
  - **Excluded Days**: Days the subject must/should not be scheduled.
  - **Preferred Period Range**: Preferred slot positions (e.g., Period 1–3).
  - **Excluded Period Range**: Slot positions to avoid (e.g., Period 7–8).
  - **Prefer Adjacent Periods**: When subject has 2+ periods on same day, place them consecutively.
  - **Max Periods Per Day**: Cap on how many times this subject appears in one day.
  - **Min Periods Per Day**: Minimum appearances if scheduled on a day.
- For elective groups, preferences apply to the entire group as a unit.

**UI Feedback**:
- The assignments table shows a **total periods summary**: "X / Y periods assigned" (sum of weightages vs. available period slots).
- Balanced indicator: checkmark if sum matches available slots, warning if over/under.

**Completion criteria**: All divisions have their subject-teacher-weightage assignments configured.

---

### Step 7: Generate Timetable

**Screen**: Screen 11 (Timetable Generator)  
**Prerequisite**: Step 6 complete for the target division

**What the user does**:
1. Navigate to Timetable Generator (via Division page or direct navigation).
2. Select the division to generate for.
3. Optionally enable **Adjacency Constraint** (off by default):
   - When ON: if a subject appears more than once on the same day, those periods are placed consecutively.
4. Click "Generate Timetable".
   - If a timetable already exists: confirmation dialog warns manual edits will be overwritten.
5. Wait for generation to complete (up to ~5 minutes).
   - Progress shown via pulsing overlay.
   - Real-time status via WebSocket (with polling fallback).
6. On completion:
   - **Success**: Status changes to "Generated", "View/Edit" button becomes available.
   - **Failure**: Error details shown (which constraints couldn't be satisfied).

**Rules**:
- Generation uses a genetic algorithm engine (Python on Fargate).
- All hard constraints must be satisfied or generation fails.
- Soft constraint violations appear as warnings.
- Teacher `maxPeriodsPerWeek` is a soft constraint (warning if exceeded).

**Completion criteria**: Timetable is generated (status = GENERATED).

---

### Step 8: Review & Edit Timetable

**Screen**: Screen 12 (Timetable Editor)  
**Prerequisite**: Step 7 complete (timetable generated)

**What the user does**:
1. View the weekly timetable grid:
   - Rows = Working days (as defined in the division's period structure).
   - Columns = Period and break slots in chronological order.
   - Each cell shows: Subject + Teacher + Assistant Teacher (if any).
   - Break columns are shaded and non-editable.
   - Elective group slots show stacked/split cells with all parallel subjects.
2. **Drag and drop** to rearrange:
   - Drag a subject cell to another period cell to swap.
   - Real-time conflict detection:
     - **Teacher Clash** (red): Teacher already scheduled elsewhere at that time.
     - **Weightage Deviation** (amber): Move changes the weekly period count.
     - **Adjacency Violation** (amber): Breaks the adjacent-period rule.
   - Hard conflicts revert the move automatically.
   - Soft conflicts apply the move with a warning in the conflict panel.
3. **Save** changes or **Discard** to revert.

**Rules**:
- Editing is desktop-only (mobile shows read-only grid with horizontal scroll).
- Elective group subjects move together as a unit.
- The conflict panel updates in real time.

---

### Step 9: Export / Print Timetables

**Screens**: Screen 12 (Division Timetable) and Screen 14 (Teacher Timetable)  
**Prerequisite**: Timetable(s) generated

**Available export combinations**:

| Export Type | Description | Format |
|------------|-------------|--------|
| **Per Division** | Single division's weekly timetable | PDF, Excel |
| **Per Class** | All divisions of a class combined on one sheet/document | PDF, Excel |
| **Per Teacher** | Single teacher's weekly schedule across all assigned divisions | PDF, Excel |
| **All Teachers** | Combined document with every teacher's timetable | PDF, Excel |
| **Group of Teachers** | User selects specific teachers to include | PDF, Excel |

**What the user does**:
1. Navigate to the timetable view (division or teacher).
2. Click the **Export** button.
3. Select the export scope (division / class / teacher / all teachers / custom group).
4. Select format (PDF or Excel).
5. Download starts automatically (pre-signed URL, expires in 15 minutes).

---

## Ongoing Operations (Post-Setup)

These happen continuously after the initial setup, not as sequential steps:

### Timetable Invalidation & Notifications
- When any data changes after timetable generation (teacher deleted, subject removed, assignment modified, period structure changed, availability updated), affected timetables are automatically flagged as **OUTDATED**.
- A notification appears in the **Conflict Panel** (Screen 13) and as a badge on the sidebar.
- Each notification shows: affected division, conflict type, description, and a link to edit the timetable.
- User can dismiss resolved notifications individually or in bulk.

### Academic Year Archival
- When a new academic year is activated, the previous year is archived.
- Archived year data is accessible in read-only mode.
- Switching to an archived year disables all edit actions with a persistent banner.

### Data Modifications
- Classes, divisions, subjects, teachers, and assignments can be modified at any time.
- Modifications after timetable generation trigger the invalidation flow above.
- The user can regenerate timetables for affected divisions at any time.

---

## Guided Setup Wizard — Specification

### Purpose
Guide first-time users through the complete setup flow (Steps 1–7) in a structured, step-by-step experience. Prevents users from getting lost or missing prerequisites.

### When It Appears
- **Automatically** on first login after account creation (no data exists yet).
- **Manually** accessible via a "Setup Guide" button on the Dashboard at any time.
- **Resumable** — the wizard tracks progress and picks up where the user left off.

### UI Design

The setup wizard has **two touchpoints** in the UI: a Floating Action Button (FAB) visible on every page, and setup step cards on the Dashboard.

---

#### A. Floating Action Button (FAB) + Popover Panel

A persistent floating button fixed to the **bottom-right corner** of the viewport, visible on every page (except Login/Register). This single button serves **dual purpose** across the app lifecycle:

- **During setup** (incomplete steps): Shows setup progress
- **After setup** (conflicts exist): Shows conflict/notification summary
- **All clear** (setup done, no conflicts): Button hides or shrinks to a small green checkmark

**FAB Appearance**:

```
During setup:                  After setup (conflicts):        All clear:
┌─────────┐                    ┌─────────┐                     ┌───┐
│  ◔ 4/7  │  ← Blue ring      │  ⚠  3   │  ← Amber badge     │ ✓ │  ← Green, subtle
└─────────┘                    └─────────┘                     └───┘
```

- **Position**: Bottom-right, 24px from edges. `z-index` above all content.
- **Pulse animation**: Subtle pulse when a new step becomes completable or a new conflict arrives.
- **Auto-open on first login**: Panel opens automatically once to introduce the setup flow, then stays as a quiet FAB.

**Popover Panel — Setup Mode** (clicked during setup):

```
┌─────────────────────────────────┐
│  Setup Progress            4/7  │
│ ─────────────────────────────── │
│  ✓  Academic Year               │
│  ✓  Classes & Divisions         │
│  ✓  Period Structures           │
│  ✓  Subjects & Electives        │
│  ●  Teachers → [Continue]       │  ← Clickable, navigates to Screen 7
│  🔒 Assignments                  │  ← Locked, tooltip: "Complete Teachers first"
│  🔒 Generate Timetable          │
│ ─────────────────────────────── │
│  [Dismiss Guide]                │
└─────────────────────────────────┘
```

**Popover Panel — Conflict Mode** (clicked after setup, when conflicts exist):

```
┌──────────────────────────────────────┐
│  Notifications                  3 ⚠  │
│ ──────────────────────────────────── │
│  ⚠ Class XII-A — Teacher removed     │
│    Soumya was deleted    [Edit TT →] │
│                                       │
│  ⚠ Class X-B — Weightage changed     │
│    Physics: 7→6 periods  [Edit TT →] │
│                                       │
│  ⚠ Class VII-A — Structure changed   │
│    Period structure modified [Edit →] │
│ ──────────────────────────────────── │
│  [View All]        [Dismiss All]     │
└──────────────────────────────────────┘
```

**FAB Behaviors**:
- Each setup step is **clickable** — navigates directly to that step's screen and closes the panel.
- **Current step** (●) shows a "Continue" button inline.
- **Completed steps** (✓) show a green checkmark, remain clickable for review.
- **Pending steps** (○) are grey. Clickable if prerequisites are met.
- **Locked steps** (🔒) show a lock icon and tooltip on hover: "Complete [prerequisite step] first".
- The **"4/7" counter** on the FAB updates live as steps are completed.
- **"Dismiss Guide"** link at the bottom of the panel hides the wizard permanently (with confirmation). Can be re-enabled from Dashboard settings.
- In conflict mode, **"View All"** navigates to the full Notifications page (Screen 13).
- In conflict mode, each conflict's **"Edit TT →"** navigates to the affected timetable editor.
- Panel dismisses on outside click or Escape key.

**Responsive behavior**:
- Desktop/Tablet: FAB is a rounded rectangle with icon + text (e.g., "◔ 4/7").
- Mobile: FAB is a smaller circular button with just the icon. Panel opens as a **bottom sheet** instead of a popover.

**Transition after setup completion**:
- When all 7 steps complete: FAB briefly shows "Setup Complete ✓" with a celebration animation, then transitions to conflict mode (if conflicts exist) or hides (if all clear).
- If new conflicts appear later, the FAB reappears with the amber conflict badge.

---

#### B. Dashboard Setup Cards

When setup is incomplete, the Dashboard (Screen 1) shows **Setup Step Cards** above the regular summary cards. These provide a more detailed view than the FAB panel.

Each card shows:
- Step number and title
- Brief description of what to do
- Current status (e.g., "3 classes created, 5 divisions added")
- **Action button**: "Continue" (goes to the relevant screen) or "Review" (if complete)
- Locked indicator if prerequisites aren't met

**Responsive layout**:
- Desktop (xl): 4 cards per row
- Laptop (lg): 3 cards per row
- Tablet (md): 2 cards per row
- Mobile (sm): 1 card, vertical stack

After setup completes, the cards are replaced by the normal summary cards. The Dashboard continues to show the **Conflict Banner** when outdated timetables exist (linking to Screen 13).

#### Completion Detection Logic

| Step | Complete When |
|------|--------------|
| 1. Academic Year | At least one active academic year exists |
| 2. Classes & Divisions | At least one class with at least one division exists |
| 3. Period Structures | All divisions have a period structure assigned |
| 4. Subjects | At least one subject exists |
| 5. Teachers | At least one teacher exists with at least one qualified subject |
| 6. Assignments | At least one division has at least one assignment |
| 7. Generate | At least one timetable has been generated |

#### Dismissal
- After Step 7 completes, show a **"Setup Complete!"** celebration card on the Dashboard.
- User can dismiss the wizard permanently via "Don't show again".
- The wizard state persists in the backend (per school, per academic year).

### Data Model Addition

```
setup_wizard_state (new table or field on schools table):
  - school_id (FK)
  - academic_year_id (FK)
  - current_step (1-7)
  - completed_steps (JSON array: [1, 2, 3])
  - dismissed (boolean, default false)
  - dismissed_at (timestamp, nullable)
```

### API Addition

```
GET  /setup-wizard          → returns current wizard state
PUT  /setup-wizard/dismiss  → dismisses the wizard
```

Step completion is **auto-detected** from existing data — no explicit "mark complete" API needed. The GET endpoint queries each completion condition and returns the full status.

---

## Navigation Flow Diagram

```
Login (Screen 0)
  │
  ▼
Dashboard (Screen 1)
  │
  ├── [FAB visible on every page — bottom-right corner]
  │     │
  │     ├── During setup (popover panel):
  │     │     ├── Step 1 → Academic Years (Screen 2)
  │     │     ├── Step 2 → Classes (Screen 8) → Class Detail (Screen 9)
  │     │     ├── Step 3 → Period Structures (Screen 3) → Editor (Screen 3A)
  │     │     ├── Step 4 → Subjects (Screen 4/5) → Elective Groups (Screen 15)
  │     │     ├── Step 5 → Teachers (Screen 6/7)
  │     │     ├── Step 6 → Class → Division → Assignments (Screen 10)
  │     │     └── Step 7 → Timetable Generator (Screen 11)
  │     │
  │     └── After setup (conflict panel):
  │           ├── View All → Notifications (Screen 13)
  │           └── Edit TT → Timetable Editor (Screen 12)
  │
  ├── [Dashboard setup cards visible if incomplete]
  │
  ├── [Regular navigation via sidebar]
  │     ├── View/Edit Timetable (Screen 12)
  │     ├── Teacher Timetable (Screen 14)
  │     ├── Notifications (Screen 13)
  │     └── Export (from Screen 12 or 14)
  │
  └── [Dashboard: Conflict banner links to Screen 13]
```
