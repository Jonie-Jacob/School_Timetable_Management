# New Features Implementation Plan

**Version**: 1.0  
**Date**: April 8, 2026  
**Features**: Class Teacher Assignment, Export Integration, Unassigned Teacher Subjects  
**Status**: Planning

---

## Table of Contents

1. [Feature 1 — Class Teacher Assignment](#feature-1--class-teacher-assignment)
2. [Feature 2 — Export Integration](#feature-2--export-integration)
3. [Feature 3 — Unassigned Teacher Subjects](#feature-3--unassigned-teacher-subjects)
4. [Database Changes](#database-changes)
5. [Implementation Order](#implementation-order)

---

## Feature 1 — Class Teacher Assignment (with Swap Logic)

### Overview
Allow schools to designate a **class teacher** for each division. A class teacher can be **any teacher** — if they don't currently teach in the target division, the system offers a **swap** to bring them in by exchanging assignments with the teacher who currently holds that subject slot.

### Business Rules
- **One class teacher per division** (optional — can be null)
- **One teacher can be class teacher of multiple divisions**
- **Any teacher can be selected** — not limited to teachers already in the division
- **No scheduling priority** impact — class teacher assignment is administrative only, does not affect timetable generation
- **Per academic year** — like all other entities

### Assignment Flow (3 Cases)

#### Case A — Teacher already teaches in this division
**Trigger**: User picks a teacher who already has at least one subject assignment in this division.
**Action**: Set as class teacher directly. No swap needed.

**Example**: Mrs. Sharma teaches English in Div A → select her → done.

#### Case B — Teacher teaches in OTHER divisions only (Swap)
**Trigger**: User picks a teacher who teaches subjects in other divisions but NOT in this division.
**Action**: Multi-step swap flow:

1. **Subject picker**: Show which subjects the teacher teaches (across all divisions). User picks which subject to swap into this division.
2. **Swap analysis**: Find who currently teaches that subject in the target division.
3. **Swap confirmation**: Show swap details:
   - "Move Mrs. Sharma (English) from Div B → Div A"
   - "Move Mr. Patel (English) from Div A → Div B"
   - If Mr. Patel was class teacher of Div B → additional warning: "This will also affect Mr. Patel's class teacher status in Div B"
4. **Execute**: Swap the two division assignments (update `teacherId` on both) in a transaction + set class teacher.
5. **Timetable impact**: If either division has a generated timetable, flag as OUTDATED and show option to regenerate.

**Example**:
- Division A: Mr. Patel teaches English (class teacher = none)
- Division B: Mrs. Sharma teaches English (class teacher = Mr. Patel)
- User wants Mrs. Sharma as class teacher of Div A
- System offers swap: Mrs. Sharma ↔ Mr. Patel for English
- Warning: "Mr. Patel is currently class teacher of Div B. This swap will displace him."
- User confirms → assignments swapped, Mrs. Sharma set as Div A class teacher

#### Case C — Teacher's subjects don't exist in this division
**Trigger**: User picks a teacher whose subjects (from `teacher_subjects`) have no matching assignment in this division.
**Action**: Show warning "This teacher doesn't teach any subject assigned to this division" → allow setting as class teacher anyway (no swap, just administrative assignment). Show warning badge on the division card.

### Database Changes (already implemented)

`divisions.class_teacher_id` — nullable FK to `teachers` table. Already migrated.

### Backend Changes

**Service: `class` (services/class/)**

**Existing endpoints** (already implemented):
| Method | Path | Description |
|--------|------|-------------|
| `PUT` | `/api/classes/:classId/divisions/:divisionId/class-teacher` | Set class teacher |
| `DELETE` | `/api/classes/:classId/divisions/:divisionId/class-teacher` | Remove class teacher |
| `PUT` | `/api/classes/bulk-class-teacher` | Bulk assign class teachers |

**New endpoint for swap**:
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/classes/:classId/divisions/:divisionId/class-teacher-analyze` | Analyze swap options for a teacher |
| `POST` | `/api/classes/:classId/divisions/:divisionId/class-teacher-swap` | Execute a teacher swap + set as class teacher |

**POST `/api/classes/:classId/divisions/:divisionId/class-teacher-analyze`**
- Body: `{ "teacherId": "uuid" }`
- Returns:
```json
{
  "case": "A" | "B" | "C",
  "teacher": { "id": "...", "name": "..." },
  "alreadyInDivision": true/false,
  "swapOptions": [
    {
      "subjectId": "...",
      "subjectName": "English",
      "fromDivision": { "id": "...", "label": "B", "className": "Class I" },
      "currentTeacherInTarget": { "id": "...", "name": "Mr. Patel" },
      "currentTeacherIsClassTeacher": false,
      "currentTeacherIsClassTeacherOf": null | { "divisionId": "...", "label": "B" }
    }
  ],
  "warning": null | "This teacher doesn't teach any subject assigned to this division"
}
```

**POST `/api/classes/:classId/divisions/:divisionId/class-teacher-swap`**
- Body: `{ "teacherId": "uuid", "subjectId": "uuid", "swapAssignmentId": "uuid" }`
- In a transaction:
  1. Swap `teacherId` on both division assignments
  2. Set `classTeacherId` on the target division
  3. If displaced teacher was class teacher of the source division, unset it
  4. Flag affected timetables as OUTDATED if they exist
  5. Create notifications for timetable conflicts
- Returns: `{ "swapped": true, "affectedTimetables": [...], "warnings": [...] }`

### Frontend Changes

**ClassDetailPage — Class Teacher Field (replace simple dropdown)**

Replace the current `<Select>` dropdown with a teacher selector that opens a **multi-step modal**:

1. **Step 1 — Pick Teacher**: Searchable list of ALL teachers. Shows a badge for teachers already in this division.
2. **Step 2 — Analysis result**:
   - **Case A**: "Mrs. Sharma already teaches in this division. Set as class teacher?" → [Confirm]
   - **Case B**: "Mrs. Sharma teaches English in Div B. To bring her here, swap with Mr. Patel (English, Div A)?" 
     - If multiple subjects: radio buttons to pick which subject
     - If displaced teacher is class teacher: warning banner
     - → [Confirm Swap] / [Cancel]
   - **Case C**: Warning: "Mrs. Sharma doesn't teach any subject in this division. Set as class teacher anyway?" → [Confirm] / [Cancel]
3. **Step 3 — Result**: Success toast + if timetables affected: "2 timetable(s) flagged as outdated. [Regenerate]"

**Timetable impact UI**:
- After swap, if timetables are OUTDATED, show a toast with "Regenerate" action button
- Division cards already show OUTDATED badge

---

## Feature 2 — Export Integration

### Overview
Connect the frontend to the **existing backend export API** (services/export/). The backend already supports PDF (as HTML for local dev) and Excel exports for divisions, classes, teachers, and multi-teacher combinations.

### Export Scopes & Formats

| Scope | PDF | Excel | Notes |
|-------|-----|-------|-------|
| Single division | 1 page | 1 sheet | Per division timetable |
| Single class (all divisions) | Combined PDF, 1 page per division | Multi-sheet workbook | No TOC needed |
| Multiple classes | Single PDF, page-per-division | Multi-sheet workbook | No TOC needed |
| Single teacher | 1 page | 1 sheet | Teacher's schedule across divisions |
| Multiple teachers | Single PDF, page-per-teacher | Multi-sheet workbook | No TOC needed |

### Export Button Placement

| Location | What it exports | Format options |
|----------|----------------|----------------|
| **Timetables Overview Page** | Selected divisions/classes or all | PDF, Excel |
| **Individual Timetable View** (grid view) | That division's timetable | PDF, Excel |
| **Teacher Timetable View** | Selected teacher(s) | PDF, Excel |

No dedicated "Export" page in the sidebar.

### Optional Features
- **Watermark / School Logo**: Optional setting (school can upload logo in Settings page). If no logo, export renders without one.
- **No contact info** in exports

### Backend (Already Exists)

Existing routes in `services/export/`:
```
POST /api/export/division/pdf     — { divisionId }
POST /api/export/division/excel   — { divisionId }
POST /api/export/class/pdf        — { classId }
POST /api/export/class/excel      — { classId }
POST /api/export/teacher/pdf      — { teacherId }
POST /api/export/teacher/excel    — { teacherId }
POST /api/export/teachers/pdf     — { teacherIds: [] }
POST /api/export/teachers/excel   — { teacherIds: [] }
```

**Backend enhancement needed:**
- Add multi-class PDF export endpoint: `POST /api/export/classes/pdf` — `{ classIds: [] }`
- Add multi-class Excel export endpoint: `POST /api/export/classes/excel` — `{ classIds: [] }`
- Modify response to return HTML content directly (for frontend to render/download) instead of writing to filesystem
- In production: render PDF via Chromium/Puppeteer Lambda layer or return HTML for client-side PDF generation

### Frontend Changes

**New RTK Query API slice: `exportApi.ts`**
```typescript
// Endpoints:
exportDivisionPdf, exportDivisionExcel,
exportClassPdf, exportClassExcel,
exportTeacherPdf, exportTeacherExcel,
exportTeachersPdf, exportTeachersExcel,
exportClassesPdf, exportClassesExcel
```

**Timetables Overview Page (`TimetablesOverviewPage.tsx`)**
- Add "Export" dropdown button in the page header
- Options: "Export Selected as PDF", "Export Selected as Excel", "Export All as PDF", "Export All as Excel"
- When divisions/classes are selected via checkboxes, export those
- When none selected, export all

**Timetable Grid View (individual division)**
- Add export button in the grid toolbar
- Dropdown: "Download PDF", "Download Excel"

**Teacher Timetable View (`TeacherTimetablePage.tsx`)**
- Add export button next to teacher selector
- Dropdown: "Download PDF", "Download Excel"
- Option to export multiple teachers (select from list)

**Export Component (`shared/ExportButton.tsx`)**
- Reusable dropdown button component
- Shows loading spinner during export
- Downloads file via blob URL

---

## Feature 3 — Unassigned Teacher Subjects

### Overview
A view showing **teacher-subject combinations** (from `teacher_subjects`) that have **no corresponding division assignment** (in `division_assignments`) across the entire school. Allows inline assignment directly from this view.

### Scope
- **Across entire school** — all classes and divisions for the active academic year
- Works for both **new assignments** and **reassignment** (moving a teacher-subject to a different division)
- Optional filters: by class, by subject, by teacher

### Business Rules
- Show each teacher-subject pair that has **zero** active division assignments
- User can click "+" to assign that teacher-subject to a division
- When assigning:
  - Show a dropdown of all divisions
  - If the teacher has a **scheduling conflict** (already teaching at the same time in another division), show a **"Conflict"** tag in the dropdown
  - Allow assignment even with conflict → create a **notification** for the user to resolve
  - Require `weightage` input when assigning
- **Visual distinction**: Unassigned teacher-subjects shown with a distinct color and "+" icon

### Database Changes

**No materialized view needed** — the data volume is small (typically 50-100 teachers, 20-30 subjects per school). A regular query performs well. However, we'll create a **database view** for clean querying:

```sql
CREATE VIEW unassigned_teacher_subjects AS
SELECT 
  ts.id as teacher_subject_id,
  ts.school_id,
  ts.teacher_id,
  ts.subject_id,
  t.name as teacher_name,
  t.academic_year_id,
  s.name as subject_name
FROM teacher_subjects ts
JOIN teachers t ON ts.teacher_id = t.id AND t.deleted_at IS NULL
JOIN subjects s ON ts.subject_id = s.id AND s.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM division_assignments da 
  WHERE da.teacher_id = ts.teacher_id 
  AND da.subject_id = ts.subject_id 
  AND da.deleted_at IS NULL
);
```

Prisma schema (view support):
```prisma
view UnassignedTeacherSubject {
  teacherSubjectId String @map("teacher_subject_id")
  schoolId         String @map("school_id")
  teacherId        String @map("teacher_id")
  subjectId        String @map("subject_id")
  teacherName      String @map("teacher_name")
  academicYearId   String @map("academic_year_id")
  subjectName      String @map("subject_name")

  @@id([teacherSubjectId])
  @@map("unassigned_teacher_subjects")
}
```

> **Note on materialized views**: PostgreSQL materialized views would be premature optimization here. The underlying tables have <1000 rows per school. If performance becomes an issue later, we can convert to `MATERIALIZED VIEW` with `REFRESH` triggers. For now, a regular view keeps the data always fresh without maintenance overhead.

### Backend Changes

**Service: `division-assignment` (services/division-assignment/)**

New endpoints:
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/assignments/unassigned` | List unassigned teacher-subject pairs |
| `POST` | `/api/assignments/quick-assign` | Assign a teacher-subject to a division with conflict detection |

**GET `/api/assignments/unassigned`**
- Query params: `?classId=`, `?subjectId=`, `?teacherId=` (all optional filters)
- Returns: `{ data: [{ teacherSubjectId, teacherId, teacherName, subjectId, subjectName }] }`
- Filters by school and active academic year

**POST `/api/assignments/quick-assign`**
- Body: `{ teacherId, subjectId, divisionId, weightage, schedulingPreferences? }`
- Validates teacher-subject exists in `teacher_subjects`
- Checks for scheduling conflicts:
  - Query existing timetable slots where this teacher is already assigned
  - If any overlap with the target division's timetable slots, return `conflicts: [...]`
- Creates the division assignment regardless (conflicts are warnings, not blockers)
- If conflicts exist, creates a `TimetableNotification` for each conflict
- Returns: `{ data: { assignment, conflicts: [...] } }`

### Frontend Changes

**New Page: `UnassignedSubjectsPage.tsx`**
- Route: `/unassigned-subjects`
- Sidebar item: "Unassigned Subjects" with a distinct icon (e.g., `UserPlus` or similar)
- Sidebar icon color: unique color (e.g., rose/pink to stand out)

**Page Layout:**
- **Header**: "Unassigned Teacher Subjects" with count badge
- **Filters bar**: Optional dropdowns for Class, Subject, Teacher
- **Card/Table view** showing unassigned teacher-subject pairs:
  - Each row: Teacher name | Subject name | "+" assign button
  - Distinct background color (e.g., light rose/amber tint) to visually differentiate
  - "+" icon button on each row

**Assign Flow (inline):**
1. Click "+" on a teacher-subject row
2. Opens an inline expand or small modal:
   - Division dropdown (grouped by class): "Class X - Division A", "Class X - Division B", etc.
   - Divisions with **conflicts** show a red "Conflict" tag
   - Weightage input (number)
3. User selects division and weightage
4. If conflict exists, show warning: "This teacher has a scheduling conflict in [Division]. A notification will be created."
5. Click "Assign" → API call → row disappears from unassigned list
6. Toast: "Assignment created" or "Assignment created with conflicts — check notifications"

**RTK Query API slice: `assignmentApi.ts` (extend existing)**
- Add `getUnassignedSubjects` query endpoint
- Add `quickAssign` mutation endpoint

---

## Database Changes Summary

### Migration 1: Add class_teacher_id to divisions

```sql
-- Migration: add_class_teacher_to_divisions
ALTER TABLE divisions ADD COLUMN class_teacher_id UUID;
ALTER TABLE divisions ADD CONSTRAINT fk_divisions_class_teacher 
  FOREIGN KEY (class_teacher_id) REFERENCES teachers(id);
CREATE INDEX idx_divisions_class_teacher ON divisions(class_teacher_id);
```

### Migration 2: Create unassigned_teacher_subjects view

```sql
-- Migration: create_unassigned_teacher_subjects_view
CREATE OR REPLACE VIEW unassigned_teacher_subjects AS
SELECT 
  ts.id as teacher_subject_id,
  ts.school_id,
  ts.teacher_id,
  ts.subject_id,
  t.name as teacher_name,
  t.academic_year_id,
  s.name as subject_name
FROM teacher_subjects ts
JOIN teachers t ON ts.teacher_id = t.id AND t.deleted_at IS NULL
JOIN subjects s ON ts.subject_id = s.id AND s.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM division_assignments da 
  WHERE da.teacher_id = ts.teacher_id 
  AND da.subject_id = ts.subject_id 
  AND da.deleted_at IS NULL
);
```

### No Materialized View
A regular SQL view is used instead of a materialized view because:
1. Data volume is small (<1000 rows per school)
2. Data changes frequently (assignments are created/deleted regularly)
3. A materialized view would need manual refresh triggers, adding complexity
4. The regular view always returns fresh data
5. If needed later, converting to `MATERIALIZED VIEW` is a one-line change

---

## Implementation Order

### Phase 0: Bug Fix (MUST DO FIRST)
- [ ] Fix RTK Query double-slash bug — remove leading `/` from all query URLs in all API slices
- [ ] Rebuild and deploy frontend

### Phase 1: Database & Schema Changes
- [ ] Add `class_teacher_id` to divisions (Prisma migration)
- [ ] Create `unassigned_teacher_subjects` view (SQL migration)
- [ ] Update Prisma schema with new fields and view model
- [ ] Regenerate Prisma client
- [ ] Update and redeploy Lambda layer

### Phase 2: Class Teacher Assignment
- [ ] Backend: Add class teacher endpoints to class service
- [ ] Backend: Add warning logic to division assignment deletion
- [ ] Frontend: Add class teacher column to ClassDetailPage
- [ ] Frontend: Add inline teacher selector dropdown
- [ ] Frontend: Add bulk assign modal
- [ ] Frontend: Add warning toast on last assignment deletion

### Phase 3: Export Integration
- [ ] Backend: Add multi-class export endpoints
- [ ] Backend: Modify export responses to return content (not filesystem)
- [ ] Frontend: Create `ExportButton` shared component
- [ ] Frontend: Create `exportApi.ts` RTK Query slice
- [ ] Frontend: Add export to Timetables Overview page
- [ ] Frontend: Add export to individual timetable grid view
- [ ] Frontend: Add export to Teacher Timetable view

### Phase 4: Unassigned Teacher Subjects
- [ ] Backend: Add `/assignments/unassigned` endpoint
- [ ] Backend: Add `/assignments/quick-assign` endpoint with conflict detection
- [ ] Frontend: Create `UnassignedSubjectsPage.tsx`
- [ ] Frontend: Add sidebar navigation item
- [ ] Frontend: Implement filter bar (class, subject, teacher)
- [ ] Frontend: Implement inline assign flow with conflict tags
- [ ] Frontend: Connect to notifications for conflicts

### Phase 5: Documentation & Deployment
- [ ] Update SRS.md with new features
- [ ] Update Frontend_Implementation_Plan.md
- [ ] Update Implementation_Plan.md
- [ ] Deploy backend changes (Lambda layer + services)
- [ ] Deploy frontend changes

---

## Files to Create/Modify

### New Files
| File | Description |
|------|-------------|
| `apps/frontend/src/features/export/exportApi.ts` | RTK Query export API slice |
| `apps/frontend/src/components/shared/ExportButton.tsx` | Reusable export dropdown button |
| `apps/frontend/src/features/unassigned/UnassignedSubjectsPage.tsx` | Unassigned teacher subjects page |
| `apps/frontend/src/features/unassigned/unassignedApi.ts` | RTK Query unassigned subjects API (or extend assignmentApi) |

### Modified Files
| File | Changes |
|------|---------|
| `packages/shared/prisma/schema.prisma` | Add `classTeacherId` to Division, add `classTeacherDivisions` to Teacher, add view |
| `services/class/src/service.ts` | Add class teacher CRUD methods |
| `services/class/src/controller.ts` | Add class teacher endpoints |
| `services/class/src/router.ts` | Add class teacher routes |
| `services/division-assignment/src/service.ts` | Add unassigned query + quick-assign |
| `services/division-assignment/src/controller.ts` | Add unassigned + quick-assign endpoints |
| `services/division-assignment/src/router.ts` | Add new routes |
| `services/export/src/service.ts` | Add multi-class exports, return content |
| `services/export/src/controller.ts` | Add multi-class endpoints |
| `services/export/src/router.ts` | Add multi-class routes |
| `apps/frontend/src/features/classes/ClassDetailPage.tsx` | Add class teacher column + selector |
| `apps/frontend/src/features/classes/classApi.ts` | Add class teacher mutations |
| `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx` | Add export button |
| `apps/frontend/src/features/timetable/TimetableGridView.tsx` | Add export button |
| `apps/frontend/src/features/teacher-timetable/TeacherTimetablePage.tsx` | Add export button |
| `apps/frontend/src/app/AuthenticatedLayout.tsx` | Add sidebar item for unassigned subjects |
| `apps/frontend/src/app/store.ts` | Register new API slices |
| All `*Api.ts` files | Fix double-slash bug (Phase 0) |
