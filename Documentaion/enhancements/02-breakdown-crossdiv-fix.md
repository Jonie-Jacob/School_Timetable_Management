# Enhancement 2: Assignment Breakdown -- Cross-Div Elective Bug

> Status: FIXED -- deployed April 27, 2026

## Problem

In the teacher timetable detail page, the Assignment Breakdown table shows cross-division elective assignments as "(deleted assignment)" orphan rows with red timetable badges. This likely happens when:
- Elective groups are edited via the bulk save operation (which soft-deletes old assignments and creates new ones)
- The timetable is not regenerated after the edit
- The orphan detection code finds timetable slots pointing to the soft-deleted assignments

## Root Cause (Identified)

Multiple timetable slot queries across 3 services were missing `deletedAt: null` on the `divisionAssignment` filter. This caused slots pointing to soft-deleted assignments (e.g., after editing an elective group via `bulkSaveElectiveGroup`) to appear in query results, creating false orphan rows in the breakdown and stale data in other views.

## Fix Applied (Two bugs found)

### Bug 1: Missing `deletedAt: null` filter (preventive fix)

Added `deletedAt: null` to the `divisionAssignment` filter in 5 queries across 3 services:

| Service | Method |
|---------|--------|
| `timetable` | `findTeacherTimeConflict()` |
| `timetable` | `getTeacherTimetable()` |
| `export` | `getTeacherGrid()` |
| `teacher` | `getTeacherBreakdown()` |
| `teacher` | `getSlotConflicts()` |

### Bug 2: `break` in cross-div dedup loop (root cause)

**Root cause of the visible bug.** In `getTeacherBreakdown()`, the cross-div dedup loop combined `assignmentIdsUsed.add(ra.id)` with a timetable count lookup that used `break` after finding the first match:

```typescript
// BEFORE (broken):
for (const ra of relatedAssignments) {
  assignmentIdsUsed.add(ra.id);       // Only ran for FIRST assignment
  const c = ttCountByAssignment.get(ra.id);
  if (c) { ttCount = c.size; break; } // break skipped remaining IDs!
}

// AFTER (fixed):
for (const ra of relatedAssignments) {
  assignmentIdsUsed.add(ra.id);       // ALL IDs added first
}
for (const ra of relatedAssignments) {
  const c = ttCountByAssignment.get(ra.id);
  if (c) { ttCount = c.size; break; } // break only affects count lookup
}
```

The `break` caused remaining related assignment IDs (e.g., XI C, XI D after XI B was found) to never be added to `assignmentIdsUsed`. The orphan detection then picked them up as "deleted assignments" even though they were active.
