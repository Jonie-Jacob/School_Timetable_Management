# Enhancements -- Index

> Tracks planned UI/UX enhancements beyond the core timetable generation system.
> Each enhancement has its own detailed plan file.
> All enhancements will be implemented and deployed together.

| # | Enhancement | Status | Plan File |
|---|-------------|--------|-----------|
| 1 | [Teacher Timetable DnD](./01-teacher-timetable-dnd.md) | Plan complete | Cross-division drag-and-drop + class timetable resolution table upgrade |
| 2 | [Assignment Breakdown -- Cross-Div Elective Bug](./02-breakdown-crossdiv-fix.md) | Fixed | `break` bug in cross-div dedup loop + missing `deletedAt` filters |
| 3 | [Timetable Status Flags Redesign](./03-timetable-status-flags.md) | Plan complete | Replace GENERATED/OUTDATED with multi-status JSON + per-slot violations |
| 4 | [Timetable-Aware Assignment Editing](./04-timetable-aware-assignments.md) | Plan complete | Unified resolution wizard + P/W balancer + slot picker + generation restriction |
| 5 | [Elective Edit Modal from Timetable View](./05-elective-edit-from-timetable.md) | Plan complete | Replace info sheet with editor modal + auto-create/redistribute slots + resolution wizard |
| 6 | [Audit Log UI](./06-audit-log-ui.md) | Plan complete | DynamoDB audit logs, instrument all services, dedicated page, remove notifications |
| 7 | [Role-Based Access Control](./07-role-based-access.md) | Plan complete | Feature-based permissions, user management, teacher login, profile, OTP, access denied page |
| 8 | [UI Bug Fixes & UX Improvements](./08-ui-bug-fixes-ux.md) | In progress | 5 items: gen result dismiss, view button, cell editor restyle+asst teacher, elective modal redesign |
| 9 | [All-Class Timetable View](./09-all-class-timetable-view.md) | Plan complete | Stacked timetable grids, lazy-loading, filters, collapse/expand, extracted reusable grid |
| 10 | [Mobile Responsive View](./10-mobile-responsive.md) | Parked | Optimize grids and tables for small screens |
| 11 | [Period Structure Changes -- Timetable-Aware](./11-period-structure-timetable-impact.md) | Plan complete | Reuses Resolution Wizard (Enh 4) for SLOT_FILL + PW_BALANCE after period/day changes |
| 12 | [Dashboard Redesign](./12-dashboard-redesign.md) | Plan complete | Role-based dashboard: admin stats/charts + teacher schedule/class teacher widget |
| 13 | [Super Admin Portal](./13-super-admin-portal.md) | Plan complete | Separate app: school CRUD, subscription tiers, payments, revenue dashboard, upgrade requests |
| 14 | [Shared Service Helpers](./14-shared-service-helpers.md) | Plan complete | 13 shared helpers: conflict detection, flagging, teacher load, elective groups, permissions, audit log, status, impact, email, subscription |

## Implementation Order

```
Enhancement 3 (Status Flags) -- foundation, changes status model everywhere
     |
Enhancement 4 (Timetable-Aware Assignments) -- resolution wizard pattern
     |
Enhancement 5 (Elective Edit Modal) -- applies pattern to electives
     |
Enhancement 11 (Period Structure Changes) -- reuses resolution wizard for structure changes
     |
Enhancement 6 (Audit Log UI) -- repurpose notifications after status flags
     |
Enhancement 7 (Role-Based Access) -- independent, can be parallel
     |
Enhancement 9 (All-Class View) -- independent
     |
Enhancement 8 (UI Fixes) -- throughout
     |
Enhancement 10 (Mobile Responsive) -- throughout

Enhancement 1 (Teacher Timetable DnD) is independent and can be implemented in parallel with 3-5.
```

Enhancement 2 is already fixed and deployed.
