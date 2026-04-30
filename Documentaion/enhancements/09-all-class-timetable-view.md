# Enhancement 9: All-Class Timetable View

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 28, 2026

## Overview

Add a "View All" page that shows all division timetables stacked vertically on a single page. Each division renders the same interactive grid as the existing `TimetableViewPage` (with DnD, click-to-edit, elective modal, etc.). Filters allow narrowing by class, teacher, subject, and status.

## Decisions Made

| Decision | Answer |
|----------|--------|
| Layout | Stacked vertically -- each division renders the same grid as TimetableViewPage |
| Navigation | "View All" button on TimetablesOverviewPage → `/timetables/view-all` |
| Interactivity | Full DnD + click-to-edit for admins (same as TimetableViewPage) |
| Read-only for teacher/viewer | Yes (per Enhancement 7 permissions) |
| Period structure differences | Not an issue -- each division renders its own grid independently |
| Performance | Lazy-load grids as user scrolls into viewport |
| Filters | Class (multi-select), Teacher (multi-select), Subject, Status |
| Filter behavior | All filters hide non-matching divisions (not highlight) |
| Teacher filter | Show only timetables of classes where the selected teacher teaches |
| Collapse/expand | Each division collapsible. All open by default. "Collapse All" / "Expand All" buttons |
| Export | Same as class timetable page -- per-division export buttons on each grid |
| Per-division header | Class name, division label, stream name, status badge |
| Summary header | Not needed |

---

## Implementation Phases

### Phase 1: Route & Page Shell

#### 1.1 Add route

**File:** `apps/frontend/src/app/router.tsx`

Add route: `/timetables/view-all` → `AllTimetablesViewPage`

#### 1.2 Add "View All" button

**File:** `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx`

Add button next to "Export All": "View All" → navigates to `/timetables/view-all`

#### 1.3 Create page shell

**File:** `apps/frontend/src/features/timetable/AllTimetablesViewPage.tsx` (NEW)

Page structure:
```
┌─────────────────────────────────────────────────┐
│ Page Header: "All Timetables"   [← Back]        │
│                                                  │
│ Filter Bar:                                      │
│ [Class ▼] [Teacher ▼] [Subject ▼] [Status ▼]   │
│                              [Collapse All] [Expand All] │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ▼ Class I -- Division A        [VALID ✓]    │ │
│ │   ┌─────────────────────────────────────┐   │ │
│ │   │ Full timetable grid (same as        │   │ │
│ │   │ TimetableViewPage grid component)   │   │ │
│ │   └─────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ▼ Class I -- Division B        [VALID ✓]    │ │
│ │   ┌─────────────────────────────────────┐   │ │
│ │   │ Full timetable grid                 │   │ │
│ │   └─────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ... (more divisions, lazy-loaded)                │
└─────────────────────────────────────────────────┘
```

---

### Phase 2: Data Loading & Filtering

#### 2.1 Fetch all divisions with timetable status

Reuse `useGetClassesQuery()` to get all classes → divisions → timetable status. This is the same data the TimetablesOverviewPage uses.

#### 2.2 Filter state

```typescript
const [classFilter, setClassFilter] = useState<string[]>([]);      // class IDs, multi-select
const [teacherFilter, setTeacherFilter] = useState<string[]>([]);   // teacher IDs, multi-select
const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
const [statusFilter, setStatusFilter] = useState<string | null>(null);
```

#### 2.3 Filter logic

- **Class filter**: Show only divisions whose `classId` is in the selected set
- **Teacher filter**: Need to know which divisions each teacher teaches in. Use `useGetTeachersLoadQuery()` + assignments data to build a teacher→divisionIds map. Show only matching divisions.
- **Subject filter**: Similar -- build subject→divisionIds map from assignments. Show only matching.
- **Status filter**: Filter divisions by `timetable.statusJson.statuses` containing the selected status tag (from Enhancement 3)

#### 2.4 Teacher/subject data for filtering

**Backend:** May need a lightweight endpoint that returns teacher→division mappings and subject→division mappings for efficient filtering. Or compute on frontend from existing data.

**Option A:** Frontend computes from assignments data (already available from `useGetAssignmentsQuery` per division -- but this means N queries for N divisions).

**Option B:** Add a new endpoint `GET /api/timetables/filter-data` that returns:
```typescript
{
  teacherDivisions: Record<string, string[]>;  // teacherId → divisionIds[]
  subjectDivisions: Record<string, string[]>;  // subjectId → divisionIds[]
}
```

Option B is more efficient. **Use Option B.**

---

### Phase 3: Lazy-Loading Timetable Grids

#### 3.1 Intersection Observer for lazy loading

Each division section uses `IntersectionObserver` to detect when it scrolls into view. Only then does it fetch and render the timetable grid.

```typescript
function LazyTimetableSection({ divisionId, classId, ... }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { rootMargin: '200px' }  // pre-load 200px before visible
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {isVisible ? <TimetableGridSection divisionId={divisionId} classId={classId} /> : <Skeleton />}
    </div>
  );
}
```

#### 3.2 Grid section component

Each section wraps the timetable grid with:
- Collapsible header (class name, division label, status badge, collapse toggle)
- The full `TimetableViewPage` grid internals (extracted into a reusable component)

---

### Phase 4: Extract Reusable Timetable Grid

#### 4.1 Extract grid from TimetableViewPage

Currently `TimetableViewPage` is a single large component (~1200 lines) that includes the grid, DnD context, cell editor sheet, conflict dialogs, etc.

**Extract into a reusable component:**

**File:** `apps/frontend/src/features/timetable/TimetableGrid.tsx` (NEW -- or refactor existing)

Props:
```typescript
interface TimetableGridProps {
  divisionId: string;
  classId: string;
  // Optional: compact mode, read-only mode
  readOnly?: boolean;
}
```

This component handles:
- Fetching timetable data (`useGetDivisionTimetableQuery`)
- DnD context (DndContext, sensors, drag handlers)
- Cell rendering (regular + elective)
- Click-to-edit sheet
- Conflict dialogs
- Swap execution
- Elective modal

#### 4.2 Refactor TimetableViewPage

`TimetableViewPage` becomes a thin wrapper:
```typescript
export function Component() {
  const { classId, divisionId } = useParams();
  return (
    <div>
      <PageHeader ... />
      <TimetableGrid divisionId={divisionId} classId={classId} />
    </div>
  );
}
```

#### 4.3 Use in AllTimetablesViewPage

Each lazy-loaded section renders:
```typescript
<TimetableGrid divisionId={div.id} classId={div.classId} />
```

---

### Phase 5: Collapse/Expand

#### 5.1 Collapse state

```typescript
const [collapsed, setCollapsed] = useState<Set<string>>(new Set());  // divisionIds

function toggleCollapse(divisionId: string) {
  setCollapsed(prev => {
    const next = new Set(prev);
    next.has(divisionId) ? next.delete(divisionId) : next.add(divisionId);
    return next;
  });
}

function collapseAll() {
  setCollapsed(new Set(allDivisionIds));
}

function expandAll() {
  setCollapsed(new Set());
}
```

#### 5.2 Section header

```typescript
<div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => toggleCollapse(div.id)}>
  <div className="flex items-center gap-2">
    <ChevronDown className={cn('size-4 transition-transform', collapsed.has(div.id) && '-rotate-90')} />
    <span className="font-semibold">{className} -- Division {divLabel}</span>
    {streamName && <span className="text-muted-foreground">({streamName})</span>}
    <TimetableStatusBadge statusJson={div.timetable?.statusJson} />
  </div>
</div>
{!collapsed.has(div.id) && <TimetableGrid divisionId={div.id} classId={div.classId} />}
```

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `apps/frontend/src/app/router.tsx` | Add `/timetables/view-all` route | 1 |
| `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx` | Add "View All" button | 1 |
| `apps/frontend/src/features/timetable/AllTimetablesViewPage.tsx` | NEW -- page with filters, lazy-loading, collapse/expand | 1, 2, 3, 5 |
| `services/timetable/src/service.ts` | New `getFilterData()` for teacher/subject→division mappings | 2 |
| `services/timetable/src/router.ts` | New route for filter-data | 2 |
| `apps/frontend/src/features/timetable/timetableApi.ts` | New endpoint for filter data | 2 |
| `apps/frontend/src/features/timetable/TimetableGrid.tsx` | NEW -- extracted reusable grid component from TimetableViewPage | 4 |
| `apps/frontend/src/features/timetable/TimetableViewPage.tsx` | Refactor to use TimetableGrid | 4 |

---

## Appendix: Current Code Inventory

### TimetableViewPage (to be refactored)

- **File:** `apps/frontend/src/features/timetable/TimetableViewPage.tsx` (~1200 lines)
- Contains: grid rendering, DnD context, drag handlers, swap execution, cell editor sheet, conflict dialogs, elective info sheet (being replaced by modal in Enh 5), export buttons
- This monolith needs to be split into `TimetableGrid` (reusable) + `TimetableViewPage` (thin wrapper with PageHeader)

### TimetablesOverviewPage

- **File:** `apps/frontend/src/features/timetable/TimetablesOverviewPage.tsx`
- Shows division list with status badges, export buttons, generate buttons
- "View All" button will be added alongside existing "Export All" button

### Class/Division Data

- `useGetClassesQuery()` returns all classes with divisions, each division has `timetable?.status`
- After Enhancement 3: `timetable?.statusJson` with multi-status array

## Implementation Order

```
Phase 1: Route + page shell + "View All" button
Phase 2: Data loading + filter bar + filter-data endpoint
Phase 3: Lazy-loading with IntersectionObserver
Phase 4: Extract TimetableGrid reusable component (biggest phase)
Phase 5: Collapse/expand functionality
```
