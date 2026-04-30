# Enhancement 12: Dashboard Redesign -- Role-Based

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 30, 2026
> Depends on: Enhancement 3 (Status Flags), Enhancement 7 (Role-Based Access)

## Overview

Redesign the dashboard to render role-specific content. Remove the setup wizard entirely. SCHOOL_ADMIN/VIEWER see school-wide stats, timetable health, and teacher load charts. TEACHER sees their own schedule, personal stats, and class teacher info. SUPER_ADMIN dashboard is deferred to Enhancement 13.

## Decisions Made

| Decision | Answer |
|----------|--------|
| Routing | Single `/` route, conditional rendering based on `userRole` from auth state |
| Setup wizard | Removed entirely |
| Quick action buttons | Removed -- separate pages handle actions |
| Charts library | `recharts` (modern, React-native, composable, tree-shakeable) |
| Auto-refresh | No -- manual refresh on page load only |
| SUPER_ADMIN dashboard | Redirects to Enhancement 13 admin portal (or shows placeholder) |
| VIEWER dashboard | Same as SCHOOL_ADMIN, read-only (no links to edit pages) |
| Teacher "today" | Shows one-row mini timetable grid for today's day of week |
| Teacher class teacher | Shows class stats card if teacher is class teacher of a division |
| Teacher load chart | Bar chart: assigned vs max (default 30 if max not set) per teacher |
| Timetable health | Both: simplified summary + per-flag breakdown |

---

## Dashboard Layouts by Role

### SCHOOL_ADMIN / VIEWER Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                         2026-27 Active │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 12       │ │ 35       │ │ 60       │ │ 18       │           │
│  │ Classes  │ │ Divisions│ │ Teachers │ │ Subjects │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Timetable Health                                        │   │
│  │  ┌────────┐ ┌────────────┐ ┌──────────────┐              │   │
│  │  │ 7 Valid│ │ 5 With     │ │ 23 Not       │              │   │
│  │  │   ✓   │ │ Issues ⚠  │ │ Generated ○  │              │   │
│  │  └────────┘ └────────────┘ └──────────────┘              │   │
│  │                                                           │   │
│  │  Issue Breakdown:                                         │   │
│  │  ● 3 Empty Slots  ● 2 Teacher Conflict  ● 1 Excess Assgn│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Teacher Load Distribution                    [bar chart] │   │
│  │  ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐             │   │
│  │  │█│ │█│ │█│ │█│ │█│ │█│ │█│ │█│ │█│ │█│  ...           │   │
│  │  │█│ │░│ │█│ │█│ │░│ │█│ │█│ │░│ │█│ │█│                │   │
│  │  └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘              │   │
│  │   A    B    C    D    E    F    G    H    I    J           │   │
│  │  █ Assigned  ░ Max capacity                               │   │
│  │  Summary: 5 overloaded · 40 optimal · 15 underloaded     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │  Assignment Coverage │  │  Recent Activity              │     │
│  │                      │  │                                │     │
│  │  ██████████░░ 85%    │  │  • Timetable generated for    │     │
│  │  30/35 divisions     │  │    Class I Div A               │     │
│  │  have complete       │  │  • Teacher Akash updated       │     │
│  │  assignments         │  │  • Subject added: STEAM        │     │
│  │                      │  │  • ...                          │     │
│  └──────────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### TEACHER Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                         2026-27 Active │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Welcome, Sreethu!                                              │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 24       │ │ 6        │ │ 3        │ │ 2        │           │
│  │ Periods/ │ │ Periods  │ │ Free     │ │ Classes  │           │
│  │ Week     │ │ Today    │ │ Today    │ │ Teaching │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Today's Schedule -- Wednesday                            │   │
│  │  ┌─────┬─────────┬──────────────┬────────────────────┐   │   │
│  │  │ P1  │ 08:30   │ Hindi        │ Class II - Div A   │   │   │
│  │  │ P2  │ 09:10   │ Hindi        │ Class III - Div B  │   │   │
│  │  │ P3  │ 09:50   │ --           │ Free               │   │   │
│  │  │ --- │ 10:30   │ INTERVAL     │                    │   │   │
│  │  │ P4  │ 10:45   │ Hindi        │ Class I - Div C    │   │   │
│  │  │ P5  │ 11:25   │ Malayalam    │ Class V - Div A    │   │   │
│  │  │ --- │ 12:05   │ LUNCH        │                    │   │   │
│  │  │ P6  │ 12:50   │ Hindi        │ Class IV - Div A   │   │   │
│  │  │ P7  │ 13:30   │ --           │ Free               │   │   │
│  │  │ P8  │ 14:10   │ --           │ Free               │   │   │
│  │  └─────┴─────────┴──────────────┴────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🎓 Class Teacher: Class V -- Division A                  │   │
│  │                                                           │   │
│  │  16 subjects assigned · 40 periods/week                   │   │
│  │  Timetable: Generated ✓                                   │   │
│  │  6 periods today · 2 free periods today                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Backend -- New Dashboard Endpoints

#### 1.1 Refactor `getStats()` for admin dashboard

**File:** `services/dashboard/src/service.ts`

Rename existing `getStats()` to `getAdminStats()`. Enhance with:

```typescript
interface AdminDashboardStats {
  counts: {
    classes: number;
    divisions: number;
    teachers: number;
    subjects: number;
  };
  timetableHealth: {
    valid: number;           // divisions with timetable, all flags clear
    withIssues: number;      // divisions with timetable but has flags
    notGenerated: number;    // divisions without timetable
    flagBreakdown: Record<string, number>; // per Enhancement 3 flag counts
    // e.g., { EMPTY_SLOTS: 3, TEACHER_CONFLICT: 2, EXCESS_ASSIGNMENTS: 1 }
  };
  teacherLoad: {
    teachers: Array<{
      id: string;
      name: string;
      assignedPeriods: number;
      maxPeriodsPerWeek: number; // default 30 if null
    }>;
    summary: {
      overloaded: number;    // assigned > max
      optimal: number;       // assigned <= max && assigned > 0
      underloaded: number;   // assigned === 0
    };
  };
  assignmentCoverage: {
    totalDivisions: number;
    completelyAssigned: number; // divisions where all slots have assignments
    percentage: number;
  };
}
```

**Queries needed:**
- Existing counts (classes, divisions, teachers, subjects)
- Timetable health: query timetables with Enhancement 3 `statusJson` field, group by flags
- Teacher load: query all teachers with `assignedPeriods` from teacher load endpoint logic
- Assignment coverage: for each division, check if total P/W >= total PERIOD slots

#### 1.2 New `getTeacherDashboard()` method

**File:** `services/dashboard/src/service.ts`

New method that takes `teacherId` (resolved from the logged-in teacher's user account via Enhancement 7's teacher-user linking).

```typescript
interface TeacherDashboardStats {
  teacher: {
    id: string;
    name: string;
    totalPeriodsPerWeek: number;  // sum of all assignment weightages
    maxPeriodsPerWeek: number | null;
  };
  todaySchedule: {
    dayOfWeek: number;
    dayLabel: string;
    slots: Array<{
      slotType: 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK';
      slotNumber: number | null;
      startTime: string;
      endTime: string;
      assignment: {
        subjectName: string;
        className: string;
        divisionLabel: string;
      } | null;  // null = free period
    }>;
  } | null;  // null if today is not a working day
  todaySummary: {
    periodsToday: number;
    freePeriodsToday: number;
  };
  classesTeaching: number;  // distinct division count
  classTeacherOf: {
    divisionId: string;
    className: string;
    divisionLabel: string;
    subjectsAssigned: number;
    totalPeriodsPerWeek: number;
    timetableStatus: string | null;  // 'GENERATED' | 'OUTDATED' | null
    periodsToday: number;
    freePeriodsToday: number;
  } | null;  // null if not a class teacher
}
```

**Logic:**
1. Find teacher by ID
2. Get all division assignments for this teacher → compute total P/W, distinct divisions count
3. Get today's day of week (server-side, IST timezone)
4. Find all timetable_slots for this teacher on today's dayOfWeek across all divisions
5. Build today's schedule from the teacher's primary period structure (or first division's structure)
6. Check if teacher is `classTeacherId` on any division → load that division's stats
7. For class teacher division: count subjects, total P/W, timetable status, today's schedule for that division

**Period structure for today's grid:**
The teacher may teach across multiple period structures. Use the teacher's most common structure (the one used by the most divisions they teach in) to build the grid rows. Slots from other structures that overlap in time are merged.

**Simpler approach:** Since most schools have one period structure, use the first division's structure. If multiple structures exist, show all periods merged by time.

#### 1.3 Resolve teacher from logged-in user

**File:** `services/dashboard/src/service.ts`

Enhancement 7 links teachers to user accounts via `Teacher.schoolUserId`. The `getTeacherDashboard()` needs the teacher ID from the logged-in user.

**Flow:**
1. Auth middleware provides `userId` (SchoolUser ID)
2. Query `Teacher` where `schoolUserId = userId` and `deletedAt: null`
3. If no teacher linked → return null (show "account not linked" message)
4. Use teacher's ID for all queries

#### 1.4 New endpoints

**File:** `services/dashboard/src/router.ts`, `services/dashboard/src/controller.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/dashboard/admin-stats` | GET | Admin/viewer dashboard stats (replaces `/stats`) |
| `GET /api/dashboard/teacher-stats` | GET | Teacher dashboard stats |

Keep existing `/api/dashboard/stats` for backward compatibility but have it call `getAdminStats()`.

**File:** `services/dashboard/serverless.yml`

Add new httpApi events for the two endpoints.

---

### Phase 2: Frontend -- Admin Dashboard Components

#### 2.1 Summary stat cards

**File:** `apps/frontend/src/features/dashboard/AdminDashboard.tsx` (NEW)

Four glassmorphism stat cards in a responsive grid:

```typescript
const statCards = [
  { label: 'Classes', value: stats.counts.classes, icon: School, color: 'text-blue-500', link: '/classes' },
  { label: 'Divisions', value: stats.counts.divisions, icon: Layers, color: 'text-teal-500', link: '/classes' },
  { label: 'Teachers', value: stats.counts.teachers, icon: Users, color: 'text-amber-500', link: '/teachers' },
  { label: 'Subjects', value: stats.counts.subjects, icon: BookOpen, color: 'text-purple-500', link: '/subjects' },
];
```

Grid: `grid-cols-2 sm:grid-cols-4` -- 2 columns on mobile, 4 on desktop.

Each card: `rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4` with icon, large number, and label.

VIEWER: cards are not clickable (no links).

#### 2.2 Timetable Health widget

**File:** `apps/frontend/src/features/dashboard/TimetableHealthCard.tsx` (NEW)

```typescript
// Summary row: 3 colored badges
<div className="flex gap-3">
  <Badge variant="success">7 Valid</Badge>
  <Badge variant="warning">5 With Issues</Badge>
  <Badge variant="outline">23 Not Generated</Badge>
</div>

// Flag breakdown (only shown if withIssues > 0)
<div className="mt-3 space-y-1">
  {Object.entries(flagBreakdown).map(([flag, count]) => (
    <div className="flex items-center justify-between text-sm">
      <span>{formatFlagLabel(flag)}</span>
      <Badge variant="outline">{count}</Badge>
    </div>
  ))}
</div>
```

`formatFlagLabel()` maps flag keys to readable labels:
- `EMPTY_SLOTS` → "Empty Slots"
- `TEACHER_CONFLICT` → "Teacher Conflicts"
- `EXCESS_ASSIGNMENTS` → "Excess Assignments"
- etc. (from Enhancement 3 status flags)

#### 2.3 Teacher Load Distribution chart

**File:** `apps/frontend/src/features/dashboard/TeacherLoadChart.tsx` (NEW)

Uses `recharts` `BarChart`:

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const data = stats.teacherLoad.teachers.map(t => ({
  name: t.name.split(' ')[0],  // first name only for X axis
  assigned: t.assignedPeriods,
  max: t.maxPeriodsPerWeek,
}));

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
    <YAxis />
    <Tooltip />
    <Bar dataKey="assigned" fill="#F59E0B" radius={[4, 4, 0, 0]} />
    <Bar dataKey="max" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

Below chart: summary badges:
```
● 5 Overloaded  ● 40 Optimal  ● 15 Underloaded
```

Overloaded teachers' bars shown in red (`#EF4444`), optimal in amber (`#F59E0B`), underloaded in gray.

If more than 30 teachers: show scrollable horizontal chart or paginate.

#### 2.4 Assignment Coverage widget

**File:** `apps/frontend/src/features/dashboard/AssignmentCoverageCard.tsx` (NEW)

Progress bar + fraction:

```
┌──────────────────────────────────┐
│  Assignment Coverage             │
│                                   │
│  ██████████████░░░░░  30/35      │
│  85% of divisions have           │
│  complete assignments             │
└──────────────────────────────────┘
```

Uses a simple CSS/Tailwind progress bar, no chart library needed.

#### 2.5 Recent Activity feed

**File:** `apps/frontend/src/features/dashboard/RecentActivityCard.tsx` (NEW)

Reuses `getRecentActivity()` endpoint (already exists).

Compact list of recent notifications:
- Icon per type (timetable generated, teacher updated, subject added, etc.)
- Timestamp (relative: "2 hours ago")
- Description text
- Max 10 items, scrollable

---

### Phase 3: Frontend -- Teacher Dashboard Components

#### 3.1 Welcome header

**File:** `apps/frontend/src/features/dashboard/TeacherDashboard.tsx` (NEW)

```typescript
<h2 className="text-xl font-bold">Welcome, {stats.teacher.name}!</h2>
```

#### 3.2 Teacher stat cards

Four stat cards in responsive grid:

```typescript
const statCards = [
  { label: 'Periods/Week', value: stats.teacher.totalPeriodsPerWeek, icon: CalendarDays, color: 'text-amber-500' },
  { label: 'Periods Today', value: stats.todaySummary.periodsToday, icon: Clock, color: 'text-blue-500' },
  { label: 'Free Today', value: stats.todaySummary.freePeriodsToday, icon: Coffee, color: 'text-emerald-500' },
  { label: 'Classes', value: stats.classesTeaching, icon: School, color: 'text-purple-500' },
];
```

Same glassmorphism card style as admin cards. Not clickable.

#### 3.3 Today's Schedule grid

**File:** `apps/frontend/src/features/dashboard/TodayScheduleCard.tsx` (NEW)

Single-column timetable grid for today:

```
┌─────────────────────────────────────────────────┐
│  Today's Schedule -- Wednesday                   │
│                                                   │
│  ┌───────┬─────────┬─────────────┬─────────────┐ │
│  │ P1    │ 08:30   │ Hindi       │ II - A      │ │
│  ├───────┼─────────┼─────────────┼─────────────┤ │
│  │ P2    │ 09:10   │ Hindi       │ III - B     │ │
│  ├───────┼─────────┼─────────────┼─────────────┤ │
│  │ P3    │ 09:50   │ --          │ Free        │ │
│  ├───────┼─────────┼─────────────┼─────────────┤ │
│  │       │ 10:30   │ ☕ Interval │             │ │
│  ├───────┼─────────┼─────────────┼─────────────┤ │
│  │ P4    │ 10:45   │ Hindi       │ I - C       │ │
│  ├───────┼─────────┼─────────────┼─────────────┤ │
│  │ ...   │         │             │             │ │
│  └───────┴─────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────┘
```

- Period column: period number or blank for intervals/lunch
- Time column: start time
- Subject column: subject name, or break label, or "Free" with muted styling
- Class column: className - divisionLabel, or blank for breaks
- Free periods: muted row with dashed border
- Intervals/Lunch: gray background, coffee/utensils icon
- Current period (based on current time): amber left border highlight

**If today is not a working day:** Show message "No classes today" with a relaxed illustration.

**If no timetable data:** Show message "No timetable generated yet."

#### 3.4 Class Teacher card

**File:** `apps/frontend/src/features/dashboard/ClassTeacherCard.tsx` (NEW)

Only rendered if `stats.classTeacherOf` is not null.

```
┌──────────────────────────────────────────────────┐
│  🎓 Class Teacher                                 │
│  Class V -- Division A                            │
│                                                    │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐│
│  │ 16      │ │ 40      │ │ 6        │ │ 2      ││
│  │ Subjects│ │ P/Week  │ │ Today    │ │ Free   ││
│  └─────────┘ └─────────┘ └──────────┘ └────────┘│
│                                                    │
│  Timetable: Generated ✓                           │
└──────────────────────────────────────────────────┘
```

---

### Phase 4: Frontend -- Dashboard Page Orchestrator

#### 4.1 Refactor DashboardPage

**File:** `apps/frontend/src/features/dashboard/DashboardPage.tsx` (REWRITE)

```typescript
export function Component() {
  const userRole = useAppSelector((s) => s.auth.userRole);

  if (userRole === 'TEACHER') {
    return <TeacherDashboard />;
  }

  // SCHOOL_ADMIN, VIEWER, or null (default to admin view)
  return <AdminDashboard isReadOnly={userRole === 'VIEWER'} />;
}
```

No routing changes needed -- same `/` route, conditional rendering.

#### 4.2 Remove setup wizard

**Files to modify:**
- `apps/frontend/src/features/dashboard/DashboardPage.tsx` -- remove SetupWizard import and rendering
- `apps/frontend/src/features/dashboard/dashboardApi.ts` -- remove `getSetupWizard` and `dismissSetupWizard` endpoints (or keep for backward compat but don't use)

**Files to delete (optional):**
- Setup wizard component files (if they exist as separate components)

**Backend:** Keep `getSetupWizard()` and `dismissSetupWizard()` endpoints for now (no harm), but they won't be called by the frontend.

#### 4.3 Update dashboardApi.ts

**File:** `apps/frontend/src/features/dashboard/dashboardApi.ts`

```typescript
// New interfaces
interface AdminDashboardStats { ... }
interface TeacherDashboardStats { ... }

// New endpoints
getAdminStats: builder.query<AdminDashboardStats, void>({
  query: () => 'dashboard/admin-stats',
  providesTags: ['DashboardStats'],
}),
getTeacherStats: builder.query<TeacherDashboardStats, void>({
  query: () => 'dashboard/teacher-stats',
  providesTags: ['DashboardStats'],
}),
```

---

### Phase 5: Install recharts + Chart Styling

#### 5.1 Install recharts

```bash
npm install recharts
```

No additional types package needed -- recharts includes TypeScript definitions.

#### 5.2 Chart theme customization

Create a shared chart config for consistent styling:

**File:** `apps/frontend/src/lib/chartTheme.ts` (NEW)

```typescript
export const CHART_COLORS = {
  primary: '#F59E0B',      // amber-500
  danger: '#EF4444',       // red-500
  success: '#10B981',      // emerald-500
  muted: '#D1D5DB',        // gray-300
  background: '#1C1917',   // stone-900 (for dark mode)
};

export const CHART_FONT = {
  fontSize: 11,
  fontFamily: 'inherit',
};
```

#### 5.3 Chart responsiveness

All charts use `<ResponsiveContainer>` from recharts for responsive sizing. On mobile, charts stack vertically. Bar chart scrolls horizontally if too many teachers.

---

### Phase 6: Mobile Responsiveness

#### 6.1 Admin dashboard mobile layout

- Stat cards: `grid-cols-2` (2×2 grid)
- Timetable Health: full width card, stacked vertically
- Teacher Load chart: full width, horizontal scroll for chart
- Assignment Coverage + Recent Activity: full width, stacked

#### 6.2 Teacher dashboard mobile layout

- Stat cards: `grid-cols-2` (2×2 grid)
- Today's Schedule: full width card, compact table
- Class Teacher card: full width, stat cards inside as `grid-cols-2`

#### 6.3 Card component reuse

All dashboard cards use the same wrapper:

```typescript
function DashboardCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-5 shadow-sm', className)}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
```

---

## File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `services/dashboard/src/service.ts` | Refactor `getStats()` → `getAdminStats()` with timetable health, teacher load, assignment coverage. New `getTeacherDashboard()`. | 1 |
| `services/dashboard/src/controller.ts` | New controllers for admin-stats, teacher-stats. Resolve teacher from user. | 1 |
| `services/dashboard/src/router.ts` | New routes: `/admin-stats`, `/teacher-stats` | 1 |
| `services/dashboard/serverless.yml` | New httpApi events | 1 |
| `apps/frontend/src/features/dashboard/AdminDashboard.tsx` | NEW -- orchestrates admin widgets | 2 |
| `apps/frontend/src/features/dashboard/TimetableHealthCard.tsx` | NEW -- summary + flag breakdown | 2 |
| `apps/frontend/src/features/dashboard/TeacherLoadChart.tsx` | NEW -- recharts bar chart | 2 |
| `apps/frontend/src/features/dashboard/AssignmentCoverageCard.tsx` | NEW -- progress bar widget | 2 |
| `apps/frontend/src/features/dashboard/RecentActivityCard.tsx` | NEW -- activity feed | 2 |
| `apps/frontend/src/features/dashboard/TeacherDashboard.tsx` | NEW -- orchestrates teacher widgets | 3 |
| `apps/frontend/src/features/dashboard/TodayScheduleCard.tsx` | NEW -- single-day timetable grid | 3 |
| `apps/frontend/src/features/dashboard/ClassTeacherCard.tsx` | NEW -- class teacher stats | 3 |
| `apps/frontend/src/features/dashboard/DashboardPage.tsx` | REWRITE -- role-based conditional rendering, remove setup wizard | 4 |
| `apps/frontend/src/features/dashboard/dashboardApi.ts` | Add admin-stats, teacher-stats endpoints. Remove setup wizard usage. | 4 |
| `apps/frontend/src/lib/chartTheme.ts` | NEW -- shared chart colors/fonts | 5 |
| `package.json` | Add `recharts` dependency | 5 |

---

## Backend Data Queries

### Admin Stats Queries (all in parallel via Promise.all)

| Query | Purpose |
|-------|---------|
| `prisma.class.count(...)` | Class count |
| `prisma.division.count(...)` | Division count |
| `prisma.teacher.count(...)` | Teacher count |
| `prisma.subject.count(...)` | Subject count |
| `prisma.timetable.findMany(...)` with `statusJson` | Timetable health: group by flags |
| `prisma.divisionAssignment.groupBy(...)` | Teacher load: sum weightage per teacher |
| `prisma.teacher.findMany(...)` | Teacher names + maxPeriodsPerWeek |
| `prisma.division.findMany(...)` with assignments + structure | Assignment coverage |

### Teacher Stats Queries

| Query | Purpose |
|-------|---------|
| `prisma.teacher.findUnique(...)` where `schoolUserId` | Find teacher for logged-in user |
| `prisma.divisionAssignment.findMany(...)` for teacher | All assignments → total P/W, division count |
| `prisma.timetableSlot.findMany(...)` for teacher + today's dayOfWeek | Today's schedule |
| `prisma.division.findFirst(...)` where `classTeacherId` | Class teacher check |
| Division's period structure → slots | Build today's grid rows |

---

## Implementation Order

```
Phase 1: Backend endpoints (admin-stats, teacher-stats)
Phase 2: Admin dashboard components (stat cards, health, chart, coverage, activity)
Phase 3: Teacher dashboard components (stats, today's schedule, class teacher)
Phase 4: Dashboard page orchestrator (role-based, remove wizard)
Phase 5: Install recharts + chart styling
Phase 6: Mobile responsiveness
```

**Prerequisites:**
- Enhancement 3 (Status Flags) -- for timetable health flag breakdown
- Enhancement 7 (RBAC) -- for `userRole` in auth state, teacher-user linking

---

## Appendix: Current Code Inventory

### Dashboard Service
- **File:** `services/dashboard/src/service.ts` (~192 lines)
- `getStats()` -- counts + timetable status + unresolved conflicts
- `getSetupWizard()` -- 7-step completion check
- `getRecentActivity()` -- notifications + generation jobs
- `dismissSetupWizard()` -- saves dismissal state

### Dashboard Frontend
- **File:** `apps/frontend/src/features/dashboard/DashboardPage.tsx` (~99 lines)
- 6 stat cards, conflict banner, setup wizard stepper, quick links
- Uses `useGetDashboardStatsQuery()` and `useGetSetupWizardQuery()`

### Auth State
- **File:** `apps/frontend/src/features/auth/authSlice.ts`
- `userRole`: `'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER' | null`
- After Enhancement 7: will include `'TEACHER'` role
- `userId`: SchoolUser ID (used to resolve teacher)

### Teacher Timetable Data
- **File:** `services/timetable/src/service.ts`
- `getTeacherTimetable()` (~line 1326) -- returns full teacher grid
- Can be partially reused for today's schedule, but dashboard service should have its own lightweight query
