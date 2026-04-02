# School Timetable Management System
## Requirements Document

**Version**: 1.0  
**Date**: March 11, 2026  
**Status**: Approved

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (hosted on S3 + CloudFront) |
| Backend | Node.js on AWS Lambda (Serverless Framework) |
| Database | PostgreSQL 16 (AWS RDS) |
| Auth | AWS Cognito (JWT) |
| Timetable Engine | Python on AWS ECS Fargate |
| **Deployment Region** | **`ap-south-1` (Mumbai, India)** |

---

## Section 1 — Business Requirements

---

### BR-1 · Class Structure

1. Classes are **user-defined** — the school can create any number of classes with any naming convention (e.g., "KG", "Nursery", "Class I", "Grade 10"). Classes are **not** limited to a fixed set.
2. Each class has a user-defined **display order** (`sort_order`) that controls how classes are listed throughout the system. The order can be changed at any time via drag-and-drop reordering.
3. Each class has an optional **`requires_stream`** flag. When enabled, divisions within that class must carry a stream/group label.
   - Example without stream: `CLASS II B`, `CLASS X A`
   - Example with stream: `CLASS XI B SCIENCE`, `CLASS XII A COMMERCE`
4. Stream names (e.g., Science, Commerce, Humanities) shall be user-defined and not limited to a fixed set.

---

### BR-2 · Period Structures

1. Users shall be able to define **multiple named Period Structures**. Each Period Structure captures the complete daily schedule configuration for an assigned set of classes.
2. Each Period Structure specifies:
   - A user-defined **name** (e.g., "Primary Block", "Senior Block").
   - A configurable **set of working days** — any combination of the seven days of the week (e.g., Mon–Fri, Mon–Sat). Working days are not fixed to any default set.
   - An **assigned classes** list — each class is linked to exactly one Period Structure at a time.
   - A **day-wise slot configuration**: each working day has its own independent ordered sequence of slots. Different days within the same structure may have a completely different number, type, ordering, and timing of slots.
3. Each **slot** within a day's configuration has:
   - A **type**: Period, Interval, or Lunch Break.
   - A **start time** and **end time** (both configurable).
   - Period-type slots are auto-numbered in sequence within each day.
4. On new account creation, a **default Period Structure** is provisioned (Mon–Fri, 8 periods, 3 standard breaks) which the user may freely edit, reassign, or delete.
5. A class that has no Period Structure assigned shall be excluded from timetable generation until one is linked.
6. All slot management operations — add, remove, reorder, and edit timings — are performed per-day within a structure via Screen 3A.

---

### BR-3 · Slot Configuration Validation

1. System validation shall warn the user when configuring any day's slot sequence if:
   - A slot's end time is less than or equal to its start time.
   - A gap or overlap exists between consecutive slots in the same day.
2. Removing a slot that is referenced by any generated timetable triggers a **confirmation warning** listing all affected timetables before proceeding.
3. Slot numbers (for Period-type slots) recalculate automatically after every reorder within a day.
4. Users may **Reset to Default** a Period Structure at any time, restoring it to Mon–Fri, 8 periods, and standard break positions.

---

### BR-4 · Academic Year Scoping

1. All data — classes, divisions, assignments, timings, and timetables — shall be scoped to an **academic year**.
2. Users shall be able to create a new academic year (with a label and date range) and set it as the **active year**.
3. Previous academic years shall be **archived** and accessible in read-only mode.
4. Only one year is active at a time.

---

### BR-5 · Subject Management

1. Authorised users shall be able to **create, edit, and delete** subjects.
2. Each subject shall have a unique name.
3. Deletion of a subject that is actively assigned to one or more divisions shall trigger a warning listing all affected divisions and timetables. The user must confirm before proceeding.
4. Upon confirmed deletion, any timetable slots referencing the deleted subject shall become **empty slots**. Affected timetables shall be flagged as `OUTDATED` and a conflict notification of type `SUBJECT_DELETED` (with details of the missing slots) shall be created for each affected timetable.

---

### BR-6 · Teacher Management

1. Authorised users shall be able to **create, edit, and delete** teacher records.
2. A teacher record shall capture: name, optional contact details, and the list of subjects the teacher is qualified to teach.
3. Deletion of a teacher who is actively assigned to one or more divisions shall trigger a warning. The user must confirm before proceeding.

---

### BR-7 · Teacher Availability

1. Each teacher shall be able to have specific **days and/or periods marked as unavailable** within an academic year.
2. Availability is scoped per academic year.
3. The timetable auto-generation engine shall respect teacher unavailability; unavailable slots shall not be assigned to that teacher.

---

### BR-8 · Class & Division Management

1. Each class may have **zero or more divisions** at any given time. Divisions are optional.
2. Divisions may be **created or removed at any time** by the user.
3. A division may be created by **copying all subject–teacher–weightage assignments** (including scheduling preferences — see BR-17) from an existing division (from the same class or a different class). Copying does not pre-generate a timetable for the new division. The copied preferences can be edited independently after copying.

---

### BR-9 · Subject–Teacher–Weightage Assignment (per Division)

1. Subjects and their corresponding teachers are assigned at the **division level**.
2. The **same subject may be assigned to a division more than once**, each time with a **different teacher** and an **independent weightage** (e.g., English in VII-A: Teacher X — 3 periods/week, Teacher Y — 2 periods/week). The same subject + same teacher combination may not appear twice.
3. Each subject–teacher assignment carries a **weightage**, defined as the number of periods per week that specific teacher should teach that subject to the division. The sum of all teacher weightages for the same subject in a division represents the total periods per week for that subject.
4. When the same subject has **adjacent/clubbed periods** on the same day (i.e., scheduled back-to-back), all adjacent periods must be assigned to the **same teacher**. The timetable engine shall enforce this as a hard constraint.
5. Each subject–teacher assignment may optionally have an **assistant teacher** co-assigned (BR-16). The assistant teacher shares the same period slots as the primary teacher for that assignment and carries no independent weightage.
6. The assistant teacher co-assignment may be added, changed, or removed independently at any time without altering the primary assignment or regenerating the timetable.
7. Each assignment may optionally have **scheduling preferences** (BR-17) that influence when the subject is placed in the timetable.

---

### BR-10 · Timetable Auto-Generation

1. The system shall auto-generate a **weekly timetable per division** taking into account:
   - Subject–teacher–weightage assignments for that division.
   - Teacher availability (BR-7).
   - The applicable period structure assigned to the division's class (BR-2).
   - Assistant teacher co-assignments (BR-9.4).
2. **Adjacency Constraint (optional toggle)**: If enabled at generation time via Screen 11, when the same subject is scheduled more than once on the same day for a division, those two periods must be **adjacent** — no other subject period, interval, or lunch break may be placed between them. This constraint is off by default and can be toggled per generation run.
3. When an assistant teacher is co-assigned, the generator shall additionally validate that the assistant teacher is not simultaneously scheduled in another division at the same period and day.

---

### BR-11 · Timetable Editing

1. Generated timetables shall be editable via a **drag-and-drop interface**.
2. The timetable grid shall follow the layout:
   - **Rows** = Working days as defined in the division's Period Structure (not fixed to Monday–Friday)
   - **Columns** = Period and break slots in chronological (left-to-right) order. Since each day may have a different slot sequence, columns adapt per row; days with fewer slots display empty trailing cells.
   - Column headers display the slot label and configured time range (e.g., `Period 1 | 9:00 – 10:00`)
3. Break columns (Interval, Lunch Break) shall be **visually distinct** (shaded) and **non-droppable** — subject cells cannot be placed in them.
4. The system shall display **real-time conflict warnings** during a drag or on a drop, including:
   - **Teacher Clash**: the assigned teacher is already scheduled in another division at the same period and day.
   - **Weightage Deviation**: the change causes a subject's weekly period count to under-run or over-run its assigned weightage.
   - **Adjacency Violation** (when the adjacency constraint was enabled at generation time): the move breaks the adjacent-period rule for a repeated subject.
   - Any other detectable scheduling conflict.

---

### BR-12 · Timetable Invalidation & Conflict Notification

1. When subject, teacher, or assignment data is modified after a timetable has been generated, the existing timetable shall **not** be automatically deleted or modified.
2. The system shall run a **validation pass** across all division timetables that may be affected by the change.
3. A **notification report** shall be surfaced to the user, listing all division timetables that are now outdated or in conflict, the nature of each conflict, and a direct link to edit each affected timetable.
4. Items in the report may be individually dismissed once resolved.

---

### BR-13 · Teacher Timetable View

1. The system shall provide a **read-only weekly timetable view per teacher**, displaying all classes and divisions assigned to that teacher across the week.
2. The grid uses the same layout as the timetable editor: rows = all working days across any Period Structure the teacher is assigned to; columns per row = the slot sequence for that day in the relevant structure.
3. Each period cell displays: Class + Division + Subject. If the teacher is serving as **assistant teacher** for that assignment, the cell is additionally labelled *(Assistant)*.

---

### BR-14 · Export

1. Both **division timetables** and **teacher timetables** shall be exportable.
2. Supported export formats: **PDF** and **Excel (.xlsx)**.

---

### BR-15 · Authentication & Multi-Tenancy

1. The system shall require users to **log in** before accessing any screen or data.
2. Each account represents a **single school**. All data — classes, divisions, teachers, subjects, timetables, and academic years — is strictly scoped to that school's account.
3. Users shall be able to **register** a new school account providing: School Name, Administrator Email, and Password.
4. Authenticated sessions shall be managed via **JWT tokens** with appropriate expiry; refresh tokens shall be supported.
5. No data from one school account shall be visible to, or accessible by, any other school account at any level.
6. **Password reset** via email shall be supported.

---

### BR-16 · Assistant Teacher (Co-teaching)

1. Any subject–teacher–weightage assignment (BR-9) may optionally have an **assistant teacher** designated as a co-teacher for that specific division assignment.
2. The assistant teacher is **permanently paired** with the primary teacher for that division–subject assignment; this is not a day-to-day substitution.
3. An assistant teacher is a standard teacher record (BR-6) — no separate record type is required.
4. In all timetable views and exports, the assistant teacher's name shall appear alongside the primary teacher's name for the relevant period cells.
5. Conflict detection (BR-10, BR-11, BR-12) shall apply to assistant teachers identically to primary teachers — an assistant teacher shall not be double-booked across divisions at the same period and day.
6. The co-assignment is **optional**; most assignments will have only a primary teacher.

---

### BR-17 · Scheduling Preferences (per Assignment)

1. Each subject–teacher–weightage assignment (BR-9) may optionally carry **scheduling preferences** that guide the timetable auto-generation engine on when to place the subject.
2. The following preferences shall be supported:

   | Preference | Description |
   |-----------|-------------|
   | **Preferred days** | A list of days of the week the subject should preferably be scheduled on. |
   | **Excluded days** | A list of days the subject must/should not be scheduled on. |
   | **Preferred period range** | A range of period slot numbers the subject should preferably be placed in (e.g., Period 1–3). |
   | **Excluded period range** | A range of period slot numbers the subject must/should not be placed in (e.g., Period 7–8). |
   | **Prefer adjacent periods** | When the subject has more than one period on the same day, prefer placing them in consecutive slots with no gap. |
   | **Max periods per day** | The maximum number of periods of this subject that may appear on a single day. |
   | **Min periods per day** | When the subject is scheduled on a day, it must appear at least this many times. |

3. Each assignment's preferences shall have a **constraint type**: **Hard** or **Soft**.
   - **Hard**: The timetable engine must respect the preference. Generation fails if the preference cannot be satisfied.
   - **Soft**: The engine attempts to honour the preference but may relax it if necessary. Violations appear as warnings in the conflict panel.
4. The constraint type is set once per assignment and applies to all preferences on that assignment.
5. Preferences are optional — assignments without preferences are scheduled freely based on weightage alone.
6. When an assignment belongs to an **elective group** (BR-18), scheduling preferences apply to the **entire elective group** as a unit (all subjects in the group share the same time slots, so the preference governs the group's placement).
7. When a division is **copied** (BR-8), all scheduling preferences are copied to the new division's assignments and may be independently edited afterwards.

---

### BR-18 · Elective Groups

1. An **elective group** is a named set of two or more subjects that are scheduled into the **same time slot(s)** for a division. Students in the division are split across the elective subjects, each taught by a different teacher in a parallel concurrent session.
2. Elective groups are school-level entities scoped to the active academic year. An elective group has a **name** and **two or more member subjects**.
3. A single subject may belong to **multiple** elective groups (e.g., "Computer Science" can appear in both "Bio/CS" and "Maths/CS" groups).
4. When an elective group is **assigned to a division** (via the Division Assignments Editor — Screen 10):
   - One division assignment row is created **per subject** in the group, all sharing the same elective group link and the same weightage.
   - Each assignment within the group must have a **different teacher** (students split into parallel sessions).
   - A single weightage value is entered and applied identically to all subjects in the group.
5. During **timetable generation** (BR-10), all assignments in an elective group are co-scheduled into the **exact same** `(day, slot)` combinations. The engine shall additionally ensure that none of the group's teachers are double-booked.
6. In the **timetable grid** (Screen 12), an elective group slot is displayed as a **stacked/split cell** showing all subjects and their respective teachers.
7. During **drag-and-drop editing** (BR-11), all subjects in an elective group **move together** as a single unit. Individual subjects cannot be dragged out of the group.
8. **Editing an elective group definition** (adding/removing subjects) after it has been assigned to divisions triggers a warning. Removing a subject deletes the corresponding assignment rows and flags affected timetables as `OUTDATED`.
9. **Deleting an elective group** that is assigned to divisions requires confirmation. On deletion, linked assignments become standalone (no longer co-scheduled) and affected timetables are flagged as `OUTDATED`.
10. Conflict detection (BR-10, BR-11, BR-12) shall apply to all teachers within an elective group — none of the group's teachers may be double-booked at the group's scheduled slots.

#### Cross-Division Elective Groups

11. The same elective group may be assigned to **multiple divisions within the same class** (e.g., XII A, XII B, and XII C all share "Bio/Maths"). This enables students from different divisions to **physically regroup** — all Bio students attend one session, all Maths students attend another — regardless of their home division.
12. Cross-division electives are limited to divisions of the **same class**. They shall not span different classes (e.g., XI and XII cannot share an elective).
13. When the same elective group is assigned to a second (or subsequent) division of the same class, the system shall **enforce the same teachers** as the first division's assignment. Since students physically regroup across divisions, each subject is taught by **one teacher** serving all combined students.
14. The timetable generation engine shall co-schedule cross-division elective slots into the **exact same** `(day, slot)` positions across **all linked divisions**. This is a hard constraint — generation fails if the slots cannot be aligned.
15. In the timetable grid, cross-division elective cells shall display a visual indicator (e.g., "⟐ Shared: XII A, B, C") showing which divisions are linked.
16. Modifying the teacher for one division's elective assignment shall automatically update all other divisions sharing the same elective group within the same class.

---

## Section 2 — UI Screens

---

### Screen 0 — Login / Registration

**Purpose**: Authenticate users and onboard new school accounts.

**Contents**:
- **Login form**: Email · Password · "Remember me" toggle · Login button.
- **Forgot Password** link → triggers a password-reset email.
- **Register New School** link → opens the registration form:
  - School Name (required).
  - Administrator Email (required).
  - Password + Confirm Password (required, with strength indicator).
  - Submit → creates the school account and logs the user in.
- On successful login, the user is redirected to Screen 1 (Dashboard).
- All data displayed after login is strictly scoped to the authenticated school's account.

---

### Screen 1 — Dashboard

**Purpose**: Entry point and at-a-glance overview of the system.

**Contents**:
- Active academic year label with a quick-switch control.
- Summary cards: Total Classes · Total Divisions · Total Teachers · Total Subjects · Timetables Generated · Timetables Pending.
- Conflict/Outdated Timetable alert banner (links to Screen 13) — shown only when affected timetables exist.
- Quick-navigation links to all major sections.

---

### Screen 2 — Academic Year Management

**Purpose**: Create and manage academic years.

**Contents**:
- List of all academic years with status badges (Active / Archived).
- "Create New Academic Year" button opens a form: year label, start date, end date.
- "Set as Active" action per year.
- Click an archived year to switch to a read-only view of that year's data.

---

### Screen 3 — Period Structures List *(Settings)*

**Purpose**: View and manage all Period Structures defined for the school.

**Contents**:
- Paginated list of Period Structures; each card shows: Structure Name · Working Days · Number of Assigned Classes.
- Action buttons per card: **Edit** (→ Screen 3A) · **Delete** (with confirmation if classes are currently assigned to this structure).
- **"Add Period Structure"** button → navigates to Screen 3A with a blank form.
- Deleting a structure that still has classes linked to it prompts the user to reassign those classes before deletion proceeds.

---

### Screen 3A — Period Structure Editor

**Purpose**: Create or edit a single Period Structure — its name, working days, assigned classes, and the per-day slot sequences.

**Contents**:
- **Structure Name** field (required, unique).
- **Working Days** multi-checkbox: all seven days of the week (Mon–Sun). At least one day must be selected.
- **Assigned Classes** multi-select: lists all Class I–XII entries. Each class may belong to only one structure; classes already linked to another structure display that structure's name as a hint.
- **Day-wise Slot Configuration**: a tab (or accordion section) per selected working day.
  - Each day tab/section contains a **Slot List (drag-and-drop)**:
    - Each row: Drag handle · Slot No. (auto-recalculated on reorder, Period type only) · Slot Type badge (Period / Interval / Lunch Break) · Start Time (editable time picker) · End Time (editable time picker) · Duration (auto-calculated, read-only) · **Delete** icon button.
    - Rows are draggable to reorder the sequence within the day. Period slot numbers recalculate automatically.
    - Inline validation per row: error if end time ≤ start time; warning if a gap or overlap with an adjacent slot exists.
    - **"Add Slot"** button: opens an inline form — Slot Type · Start Time · End Time — appended at the bottom of the list (then draggable into position).
    - Deleting a slot referenced by any generated timetable shows a confirmation warning listing the affected timetables.
  - **"Copy slots from day"** dropdown per tab: populates this day's slot list from another working day's configuration in the same structure.
- **Save** and **Reset to Default** (restores Mon–Fri, 8 periods, standard breaks) action buttons.
- **Cancel** navigates back to Screen 3 without saving.

---

### Screen 4 — Subjects List

**Purpose**: View and manage all subjects.

**Contents**:
- Searchable, paginated table: Subject Name · Assigned Teachers · Classes Assigned To.
- Action buttons per row: Edit · Delete (with active-assignment warning).
- "Add New Subject" button navigates to Screen 5.

---

### Screen 5 — Add / Edit Subject

**Purpose**: Create or update a subject.

**Contents**:
- Field: Subject Name (required, unique).
- Save / Cancel actions.

---

### Screen 6 — Teachers List

**Purpose**: View and manage all teacher records.

**Contents**:
- Searchable, paginated table: Teacher Name · Subjects They Teach · Number of Assigned Divisions.
- Action buttons per row: Edit · Delete (with active-assignment warning).
- "Add New Teacher" button navigates to Screen 7.

---

### Screen 7 — Add / Edit Teacher

**Purpose**: Create or update a teacher record and configure availability.

**Contents**:
- Fields: Name (required) · Contact Details (optional) · Subjects They Can Teach (multi-select from subject list).
- **Availability Grid**: a grid where rows = all working days across all Period Structures active in the school, and columns = the period slots defined for each day. Individual cells can be toggled as Unavailable.
- Save / Cancel actions.

---

### Screen 8 — Classes List

**Purpose**: Overview of all 12 classes.

**Contents**:
- Table listing Class I through Class XII (Roman numeral order).
- Columns: Class Name · Number of Divisions · Timetable Status summary.
- Click a class row to navigate to Screen 9 (Class Detail).

---

### Screen 9 — Class Detail & Division Management

**Purpose**: Manage divisions within a class.

**Contents**:
- Class name heading.
- Division cards, one per division:
  - **Classes I–X**: alphabet label (e.g., "Division B").
  - **Classes XI–XII**: alphabet + stream name (e.g., "B — SCIENCE").
  - Card actions: **Edit Assignments** (→ Screen 10) · **Copy Division** · **Remove Division**.
- **"Add Division"** button opens a modal:
  - Alphabet input (required).
  - Group/stream name input (required for Class XI–XII only).
  - Optional "Copy assignments from" dropdown — lists all existing divisions across all classes.

---

### Screen 10 — Division Assignments Editor

**Purpose**: Manage subject–teacher–weightage assignments for a specific division, including scheduling preferences and elective group assignments.

**Contents**:
- Breadcrumb: Class → Division.
- Assignments table: Subject · Teacher · Assistant Teacher · Periods/Week (Weightage) · Preferences (icon/summary) · Actions (Edit · Remove).
- Elective group assignments displayed as **grouped rows** — a group header with shared weightage, and indented subject rows beneath.
- A visual indicator when the same subject appears more than once (permitted, different teachers).
- **"Add Assignment"** button opens a modal:
  - Select Subject (dropdown).
  - Select Teacher (filtered to those qualified for the selected subject).
  - Select Assistant Teacher — *optional* (dropdown filtered to teachers qualified for the selected subject, excluding the primary teacher already selected).
  - Enter Weightage (number of periods per week).
  - **Scheduling Preferences** section (collapsible, optional):
    - Constraint Type: **Hard** / **Soft** toggle.
    - Preferred Days: multi-select checkboxes (Mon–Sun, filtered to working days).
    - Excluded Days: multi-select checkboxes.
    - Preferred Period Range: start/end period number inputs.
    - Excluded Period Range: start/end period number inputs.
    - Prefer Adjacent Periods: toggle switch.
    - Max Periods Per Day: number input.
    - Min Periods Per Day: number input.
  - Save / Cancel.
- **"Add Elective Assignment"** button opens a modal:
  - Select Elective Group (dropdown of groups defined for this school/year).
  - For each subject in the group: select a Teacher (qualified, no duplicates across subjects in the group).
  - Enter Weightage (single value applied to all subjects in the group).
  - **Scheduling Preferences** section (same as above — applies to the entire group).
  - Save / Cancel.
- Total weekly periods summary (sum of all weightages vs. total available periods).
- Navigation to **Timetable Generator** (Screen 11) for this division.

---

### Screen 11 — Timetable Generator

**Purpose**: Trigger timetable generation for a division and manage generation status.

**Contents**:
- Class + Division selector.
- Status badge per division: **Not Generated** / **Generated** / **Outdated** (has post-generation conflicts).
- **Generation Options** (shown before generating):
  - **Adjacency Constraint** toggle (off by default): when enabled, any subject appearing more than once on the same day will have its periods placed adjacently with no gap between them.
- **"Generate Timetable"** button.
  - If a timetable already exists: confirmation dialog warning that manual edits will be overwritten.
- **"View / Edit Timetable"** button (enabled only when a timetable exists) → navigates to Screen 12.

---

### Screen 12 — Timetable Editor (Drag & Drop)

**Purpose**: View and manually edit a division's weekly timetable.

**Contents**:
- **Timetable Grid**:
  - Rows: Working days as defined in the division's Period Structure.
  - Columns per row: period and break slots in chronological order for that day's slot configuration. Since slot sequences may differ per day, columns adapt per row; days with fewer slots display empty trailing cells.
  - Column headers: slot label + configured time range (e.g., `Period 1 | 9:00–10:00`).
  - Subject/break cells: show Subject name + Teacher name + Assistant Teacher name if assigned (or break label for break columns).
  - Break columns: shaded background, non-droppable.
  - Empty period cells are droppable targets.
- **Drag & Drop**: drag any subject cell to another period cell (same or different day) to move or swap.
- **Conflict Panel**: displayed alongside or below the grid; updates in real time on every drag action.
  - Lists each detected conflict with severity (Error / Warning) and a plain-language description.
- Action bar: **Save** · **Discard Changes** · **Back to Generator**.
- **Export** button: export this division's timetable as PDF or Excel.

---

### Screen 13 — Affected Timetables Notification

**Purpose**: Show all division timetables that have become outdated or conflicted due to recent data changes.

**Contents**:
- Accessible from the Dashboard alert banner or a top-level "Conflicts" navigation item.
- Table: Class · Division · Conflict Type(s) · Date of Change · Action link ("Edit Timetable" → Screen 12).
- Per-row **Dismiss** button (once the user has resolved the issue).
- **"Dismiss All"** bulk action.

---

### Screen 14 — Teacher Timetable View

**Purpose**: View the full weekly timetable of an individual teacher.

**Contents**:
- Dropdown: select a teacher.
- **Read-only grid**:
  - Rows: all working days across all Period Structures the teacher is assigned to.
  - Columns per row: period and break slots in chronological order for that day's slot sequence; columns adapt per row where day configurations differ.
  - Column headers: slot label + time range.
  - Period cells: Class + Division + Subject.
  - Break cells: shaded with break label.
- **Export** button: export as PDF or Excel.

---

### Screen 15 — Elective Groups Management

**Purpose**: Define and manage elective groups (sets of mutually parallel subjects).

**Contents**:
- Searchable, paginated table: Group Name · Member Subjects · Divisions Using This Group · Actions (Edit · Delete).
- **"Add Elective Group"** button opens a modal:
  - Group Name (required, unique per school/year).
  - Select Subjects: multi-select (minimum 2 subjects required).
  - Save / Cancel.
- **Edit** pre-populates the modal. If the group is assigned to divisions, a warning is shown about cascade effects.
- **Delete**: if the group is assigned to divisions, a confirmation dialog lists affected divisions and warns that linked assignments will become standalone. Affected timetables are flagged as `OUTDATED`.

---

## Appendix — Constraints & Scope Boundaries

| Topic | Decision |
|-------|----------|
| Authentication | JWT session — one school account per login (BR-15) |
| Class structure | User-defined classes with custom naming and sort order; not limited to a fixed set (BR-1) |
| Division optionality | Zero or more divisions per class (BR-8) |
| Timetable scope | Per division (not per class) |
| Period Structures | Multiple user-defined; each linked to a set of classes; per-day slot sequences; configurable working days (BR-2) |
| Break slots | Configurable per Period Structure per working day; drag-and-drop reorder supported (BR-3) |
| Adjacency constraint | Optional toggle per timetable generation run; off by default (Screen 11). Also available per-assignment via scheduling preferences (BR-17). |
| Scheduling preferences | Optional per assignment — preferred/excluded days, preferred/excluded period ranges, adjacent preference, min/max per day. Hard or Soft constraint type (BR-17). |
| Elective groups | Named groups of 2+ subjects co-scheduled in parallel. School-level entities assigned to divisions. (BR-18) |
| Teacher deletion | Warns if actively assigned; user confirms |
| Subject deletion | Warns if actively assigned; user confirms. Timetable slots become empty; affected timetables flagged OUTDATED with conflict notifications (BR-5) |
| Copy Division | Copies assignments and scheduling preferences; no timetable auto-generated (BR-8) |
| Timing uniformity | Fully configurable per working day within each Period Structure (BR-2, BR-3) |
| Timetable invalidation | Passive notification — keep, flag as outdated, user fixes |
| Timetable editing | Generated timetables are editable via drag-and-drop. No publish/draft workflow. |
| Export formats | PDF and Excel for division and teacher timetables |
| Multi-tenancy | One school account per login; data is fully isolated between schools (BR-15) |
| Assistant teacher | Optional co-teacher per division assignment; uses standard teacher record; no extra record type (BR-16) |
| i18n | English only initially. Frontend uses react-i18next infrastructure for future translation support. |