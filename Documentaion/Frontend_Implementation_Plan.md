# School Timetable Management System
## Frontend Implementation Plan

**Version**: 1.0  
**Date**: March 17, 2026  
**Scope**: Frontend only (React SPA in `apps/frontend/`)  
**Strategy**: Phase-by-phase, one screen at a time, responsive from the start  
**Pairs With**: Backend Implementation Plan (all 16 backend phases complete)

---

## Table of Contents

1. [Implementation Principles](#1-implementation-principles)
2. [Technology Stack & Library Compatibility](#2-technology-stack--library-compatibility)
3. [Color Palette & Design Tokens](#3-color-palette--design-tokens)
4. [Responsive Strategy](#4-responsive-strategy)
5. [Mobile Layout Decisions](#5-mobile-layout-decisions)
6. [Phase Overview](#6-phase-overview)
7. [Phase 0 — Project Scaffolding](#7-phase-0--project-scaffolding)
8. [Phase 1 — Design System & Shared UI Components](#8-phase-1--design-system--shared-ui-components)
9. [Phase 2 — App Shell & Layout](#9-phase-2--app-shell--layout)
10. [Phase 3 — Auth Pages (Screen 0)](#10-phase-3--auth-pages-screen-0)
11. [Phase 4 — Dashboard + Setup Wizard + FAB (Screen 1)](#11-phase-4--dashboard-screen-1)
12. [Phase 5 — Academic Year Management (Screen 2)](#12-phase-5--academic-year-management-screen-2)
13. [Phase 6 — Period Structures (Screens 3 & 3A)](#13-phase-6--period-structures-screens-3--3a)
14. [Phase 7 — Subjects (Screens 4 & 5)](#14-phase-7--subjects-screens-4--5)
15. [Phase 8 — Teachers (Screens 6 & 7)](#15-phase-8--teachers-screens-6--7)
16. [Phase 9 — Classes & Divisions (Screens 8 & 9)](#16-phase-9--classes--divisions-screens-8--9)
17. [Phase 10 — Division Assignments Editor (Screen 10)](#17-phase-10--division-assignments-editor-screen-10)
18. [Phase 11 — Elective Groups Management](#18-phase-11--elective-groups-management)
19. [Phase 12 — Timetable Generator (Screen 11)](#19-phase-12--timetable-generator-screen-11)
20. [Phase 13 — Timetable Editor (Screen 12)](#20-phase-13--timetable-editor-screen-12)
21. [Phase 14 — Notifications (Screen 13)](#21-phase-14--notifications-screen-13)
22. [Phase 15 — Teacher Timetable View (Screen 14)](#22-phase-15--teacher-timetable-view-screen-14)
23. [Phase 16 — WebSocket Integration](#23-phase-16--websocket-integration)
24. [Phase 17 — i18n Setup](#24-phase-17--i18n-setup)
25. [Phase 18 — Final Responsive Polish & QA](#25-phase-18--final-responsive-polish--qa)
26. [RTK Query API Slices Summary](#26-rtk-query-api-slices-summary)
27. [Frontend Route Map](#27-frontend-route-map)
28. [Phase Dependency Map](#28-phase-dependency-map)

---

## 1. Implementation Principles

| Principle | Detail |
|-----------|--------|
| **One screen at a time** | Complete each screen fully (desktop + mobile layouts, all states, all interactions) before starting the next. |
| **Responsive from day one** | Every component built with all breakpoints considered. No "add responsive later" passes. |
| **Separate layouts where needed** | Desktop and mobile may have fundamentally different layouts. Complex desktop single-page views may split into multiple mobile screens. |
| **Mock auth first** | A dev-only mock auth layer (hardcoded token, school_id, user_id) bypasses Cognito entirely for local development. Matches backend mock auth approach. |
| **shadcn/ui as component foundation** | All UI primitives come from shadcn/ui (Radix-based). Customized with the brand color palette. Extend only when needed. |
| **RTK Query for all server state** | Every API call goes through RTK Query API slices. No raw `fetch`/`axios`. Cache invalidation tags keep data fresh. |
| **Skeleton loading everywhere** | All data-dependent components show skeleton placeholders while loading. No blank screens or spinners unless explicitly noted. |
| **i18n-ready structure** | All user-facing strings go through `react-i18next` translation keys from the start. English-only initially, but the architecture supports future languages. |
| **No automated tests** | Manual testing only, consistent with the backend approach. |
| **Custom error boundaries** | Global and per-feature error boundaries catch React errors and show a branded fallback UI. |
| **Feature-folder architecture** | Each screen lives in `src/features/<feature>/`. Colocated components, API slices, and types. |

---

## 2. Technology Stack & Library Compatibility

### 2.1 Core Stack

| Library | Version | React 19 Compatible | Purpose |
|---------|---------|---------------------|---------|
| React | 19.x | ✅ (native) | UI framework |
| React DOM | 19.x | ✅ (native) | DOM rendering |
| Vite | 6.x | ✅ | Build tooling + HMR |
| TypeScript | 5.x (strict) | ✅ | Type safety |
| Tailwind CSS | 4.x | ✅ | Utility-first styling |

### 2.2 State & Routing

| Library | Version | React 19 Compatible | Purpose |
|---------|---------|---------------------|---------|
| @reduxjs/toolkit | 2.x | ✅ | Global state + RTK Query |
| react-redux | 9.x | ✅ | React bindings for Redux |
| react-router | 7.13.x | ✅ | Client-side routing |

### 2.3 UI Components

| Library | Version | React 19 Compatible | Purpose |
|---------|---------|---------------------|---------|
| shadcn/ui | latest | ✅ (Radix 1.1.x) | Component primitives |
| @radix-ui/* | 1.1.x | ✅ | Accessible headless primitives |
| @tanstack/react-table | 8.21.x | ✅ | Data tables |
| @dnd-kit/core | 6.3.x | ✅ | Drag and drop |
| @dnd-kit/sortable | 8.x | ✅ | Sortable lists |
| sonner | 2.x | ✅ | Toast notifications |
| lucide-react | latest | ✅ | Primary icon library |
| @tabler/icons-react | latest | ✅ | Secondary icons (mixed for best coverage) |

### 2.4 Forms & Validation

| Library | Version | React 19 Compatible | Purpose |
|---------|---------|---------------------|---------|
| react-hook-form | 7.71.x | ✅ | Form state management |
| @hookform/resolvers | 3.x | ✅ | Zod resolver for RHF |
| zod | 3.x | ✅ (no React dep) | Schema validation |

### 2.5 Utilities

| Library | Version | React 19 Compatible | Purpose |
|---------|---------|---------------------|---------|
| dayjs | 1.x | ✅ (no React dep) | Date/time formatting |
| clsx | 2.x | ✅ (no React dep) | Conditional class names |
| tailwind-merge | 2.x | ✅ (no React dep) | Merge Tailwind classes |
| react-i18next | 15.x | ✅ | Internationalization |
| i18next | 24.x | ✅ (no React dep) | i18n core |
| amazon-cognito-identity-js | 6.x | ✅ (no React dep) | Cognito auth SDK |

**Compatibility verdict**: All libraries are confirmed compatible with React 19. No fallback to React 18 required.

---

## 3. Color Palette & Design Tokens

### 3.1 Brand Colors

| Token Name | Hex | CSS Variable | Role |
|------------|-----|-------------|------|
| `primary` | `#6A0DAD` | `--primary` | Deep Purple — buttons, headings, highlights, hover effects |
| `secondary` | `#0047AB` | `--secondary` | Ceylon Blue — links, secondary elements, gradients |
| `accent` | `#F7E7CE` | `--accent` | Champagne — text accents, dividers, subtle emphasis |
| `background-dark` | `#1A1A2E` | `--background` (dark) | Dark Charcoal — primary dark mode background |
| `background-deep` | `#0F0F1A` | `--background-deep` | Near Black — footer, alternate sections |
| `background-light` | `#FFFFFF` | `--background` (light) | White — light mode background |
| `surface-light` | `#F8F9FA` | `--surface` (light) | Light Gray — card backgrounds, table rows |
| `surface-dark` | `#16213E` | `--surface` (dark) | Deep Navy — card backgrounds in dark mode |

### 3.2 Gradients

| Token | Value | Usage |
|-------|-------|-------|
| `gradient-brand` | `linear-gradient(135deg, #0047AB, #00B4D8)` | Teal-to-Blue — backgrounds, hero sections, cards |
| `gradient-feature` | `linear-gradient(135deg, #6A0DAD, #0047AB)` | Purple-to-Blue — section transitions, overlays, sidebar |

### 3.3 Semantic Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `success` | `#16A34A` | `#22C55E` | Green — success states, balanced indicators |
| `warning` | `#D97706` | `#F59E0B` | Amber — warnings, outdated states |
| `destructive` | `#DC2626` | `#EF4444` | Red — errors, delete actions, hard conflicts |
| `info` | `#0047AB` | `#3B82F6` | Blue — info toasts, links |
| `muted` | `#6B7280` | `#9CA3AF` | Gray — secondary text, disabled states |

### 3.4 Tailwind Configuration

These colors will be registered in the Tailwind CSS v4 configuration using CSS custom properties. shadcn/ui's theming system will be customized to use these tokens.

---

## 4. Responsive Strategy

### 4.1 Breakpoints

| Name | Min Width | Target Devices |
|------|-----------|---------------|
| `sm` | < 640px | Mobile phones (portrait) |
| `md` | 640–1023px | Tablets, large phones (landscape) |
| `lg` | 1024–1439px | Small laptops, tablets (landscape) |
| `xl` | ≥ 1440px | Desktops, large laptops |

### 4.2 Layout Strategy Per Breakpoint

| Breakpoint | Sidebar | Navigation | Tables | Timetable Grid |
|------------|---------|------------|--------|----------------|
| `xl` | Visible (240px expanded) | Sidebar links | Full table layout | Full grid |
| `lg` | Icon-only (64px), expand on hover | Sidebar icons | Full table, compact columns | Full grid, smaller cells |
| `md` | Hidden | Bottom tab bar + hamburger for overflow | Card layout | Horizontal scroll |
| `sm` | Hidden | Bottom tab bar + hamburger for overflow | Card layout | Horizontal scroll, reduced info |

### 4.3 Approach

- **Desktop-first** for admin dashboard screens (the primary use case is desktop)
- **Separate mobile layouts** where desktop content doesn't fit mobile patterns
- Each phase specifies **exactly** which breakpoints have different layouts

---

## 5. Mobile Layout Decisions

Complex desktop single-page views that split into multiple screens or fundamentally different layouts on mobile:

| Desktop Screen | Mobile Adaptation | Rationale |
|----------------|-------------------|-----------|
| **Screen 3A** (Period Structure Editor) | Day tabs become a dropdown selector. Slot table becomes a vertical card list. Drag-and-drop uses long-press gesture. | The multi-column slot table doesn't fit on mobile. |
| **Screen 7** (Add/Edit Teacher — Availability Grid) | Availability grid becomes a day-by-day vertical list with toggle switches per period. | The 2D grid is too wide for mobile. |
| **Screen 9** (Class Detail + Divisions) | Division cards stack vertically. Action buttons become a bottom sheet menu. | Cards already stack naturally. |
| **Screen 10** (Division Assignments Editor) | Assignment table becomes card list. Add assignment opens a full-screen form instead of a modal. | Table rows too wide for mobile. |
| **Screen 12** (Timetable Editor) | Grid is view-only on mobile with horizontal scroll. Edit mode requires landscape or desktop. A "View on desktop for editing" banner shown on mobile. | Drag-and-drop on a complex grid is not usable on small screens. |
| **Screen 14** (Teacher Timetable View) | Same as Screen 12 — horizontal scroll, view-only, landscape encouraged. | Read-only grid is acceptable with scroll. |
| **Bottom Tab Bar** (mobile nav) | 5 primary tabs: Dashboard, Classes, Timetable, Notifications, More. "More" opens a bottom sheet with remaining nav items. | Keeps the most-used actions accessible with one tap. |

---

## 6. Phase Overview

> **Progress Legend**: ✅ = Fully Complete | 🟡 = Partially Complete | ⬜ = Not Started
>
> **Last Updated**: April 5, 2026

| Phase | Name | Screen(s) | Complexity | Est. Sub-parts | Status |
|-------|------|-----------|------------|----------------|--------|
| 0 | Project Scaffolding | — | Low | 1 | ✅ Complete |
| 1 | Design System & Shared Components | — | Medium | 3 (A, B, C) | ✅ Complete |
| 2 | App Shell & Layout | Global Shell | Medium | 3 (A, B, C) | ✅ Complete |
| 3 | Auth Pages | Screen 0 | Medium | 2 (A, B) | ✅ Complete |
| 4 | Dashboard | Screen 1 | Low–Medium | 1 | ✅ Complete |
| 5 | Academic Year Management | Screen 2 | Low | 1 | ✅ Complete |
| 6 | Period Structures | Screens 3 & 3A | High | 3 (A, B, C) | ✅ Complete |
| 7 | Subjects | Screens 4 & 5 | Low | 1 | ✅ Complete |
| 8 | Teachers | Screens 6 & 7 | High | 2 (A, B) | ✅ Complete |
| 9 | Classes & Divisions | Screens 8 & 9 | Medium | 2 (A, B) | ✅ Complete |
| 10 | Division Assignments Editor | Screen 10 | High | 2 (A, B) | ⬜ Not Started |
| 11 | Elective Groups | Elective Screen | Medium | 1 | ⬜ Not Started |
| 12 | Timetable Generator | Screen 11 | Medium | 1 | ⬜ Not Started |
| 13 | Timetable Editor (DnD) | Screen 12 | Very High | 3 (A, B, C) | ⬜ Not Started |
| 14 | Notifications | Screen 13 | Low–Medium | 1 | ⬜ Not Started |
| 15 | Teacher Timetable View | Screen 14 | Medium | 1 | ⬜ Not Started |
| 16 | WebSocket Integration | — | Medium | 1 | ✅ Complete |
| 17 | i18n Setup | — | Low | 1 | ✅ Complete |
| 18 | Final Responsive Polish & QA | All | Medium | 1 | ⬜ Not Started |

**Total Phases**: 19 (with sub-parts: ~29 deliverables)
**Completed**: 12/19 | **Partially Complete**: 0/19 | **Not Started**: 7/19

### Detailed Phase Completion Notes

#### ✅ Phase 0 — Project Scaffolding
All tasks complete: Vite + React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, Redux Toolkit, React Router v7, i18n skeleton, custom color palette, directory structure, Redux store, RTK Query base config, router skeleton.

#### ✅ Phase 1 — Design System & Shared Components
- **1A Core Primitives** ✅ — 28+ shadcn/ui components installed (button, input, dialog, form, card, tabs, accordion, etc.)
- **1B Composite Components** ✅ — DataTable (with resizable columns, page size selector, inline quick-edit, column size persistence via localStorage, total/filtered entry counts), DataTableCardView, PageHeader (dark gradient background), SearchInput (with dark variant for dark containers), EmptyState, ConfirmDialog, StatusBadge, PageSkeleton, GlobalErrorBoundary, FeatureErrorBoundary all implemented
- **1C Form Components** ✅ — DatePicker, TimePicker, MultiSelect, PasswordInput, PasswordStrength all implemented

**UI Redesign (April 2026)** — Complete visual overhaul:
- **Color Palette**: Replaced purple/blue (#6A0DAD/#0047AB) with Warm Amber (#F59E0B) primary + Stone neutral palette. Dark mode uses Stone 950 with Amber 400 accents.
- **Glassmorphism**: Frosted glass cards (`bg-card backdrop-blur-sm`), glass inputs (`bg-white/60 backdrop-blur-sm`), glass buttons (outline variant). All components use `transition-all duration-200`.
- **Glossy Buttons**: Top-down gradients with specular highlights (`from-amber-400 via-primary to-amber-600`), `hover:scale-[1.02]` on all variants, `active:scale-[0.98]` press feedback.
- **Warm Gradient Background**: Main content area uses `linear-gradient(135deg, #FFFBEB → #FEF3C7 → #FAFAF9 → #FFF7ED)` in light mode with 3 animated floating orbs (blur 80px, staggered 20-26s animations). Dark mode: orbs at 5% opacity.
- **Dark UI Elements**: Table headers, pagination bars, page headers, and Setup Guide stepper all use `bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800` with white text.
- **Colorful Icons**: Sidebar nav items each have distinct icon colors (amber, sky, violet, teal, rose, emerald, orange, yellow, cyan, stone). Active state: amber left border + amber text.
- **DataTable Modernization**: Resizable columns (persisted per-page in localStorage), customizable page size (10/25/50), inline quick-edit (click cell → input with save/cancel), entries count (`1-10 of 54`), page controls grouped right, dark header/footer bars, alternating row backgrounds, high-contrast hover with 300ms ease transition.

#### ✅ Phase 2 — App Shell & Layout
- **2A Desktop Layout** ✅ — AppShell with warm gradient background + animated orbs, Sidebar (dark solid `#1C1917`, collapsible, colorful per-item icons, amber active state with left border), TopBar (frosted glass `backdrop-blur-xl`), AcademicYearSelector, ThemeToggle, UserMenu (amber avatar tint), Breadcrumb (UUID-aware, skips raw IDs), ReadOnlyBanner, SidebarLink (colorful icons, amber active indicator)
- **2B Mobile Layout** ✅ — BottomTabBar (frosted glass, amber dot active indicator), MobileHeader (frosted glass), MobileDrawer, MoreSheet all implemented
- **2C Auth Guard & Error Boundaries** ✅ — AuthenticatedLayout (auth guard + WebSocket init), GlobalErrorBoundary, FeatureErrorBoundary, mock-auth all implemented
- **FAB** ✅ — FloatingActionButton with amber glow shadow, dark gradient popover (`from-stone-800 via-stone-700 to-stone-800`), SetupPopoverPanel with emerald checks/amber current/white locked step icons, ConflictPopoverPanel. Desktop uses Popover, mobile uses bottom Sheet.

#### ✅ Phase 3 — Auth Pages
- **3A Login Page** ✅ — LoginPage with split layout (desktop) / single-column (mobile), LoginForm with email/password/remember-me, AuthLayout, authSlice with full state management
- **3B Registration & Forgot Password** ✅ — RegisterForm with password strength, ForgotPasswordForm, ResetPasswordForm with verification code flow

#### ✅ Phase 4 — Dashboard
- **Summary Cards** ✅ — 6 SummaryCard components in 6-column grid (xl) with unique colorful icon per metric (violet classes, sky divisions, emerald teachers, rose subjects, teal generated, amber pending). Glass cards with hover lift + amber shadow.
- **Conflict Banner** ✅ — ConflictBanner with link to notifications
- **Quick Links** ✅ — QuickLinks with colorful icons (violet, teal, cyan) and hover-reveal arrows
- **Welcome/Empty State** ✅ — WelcomeState with amber gradient CTA button
- **Setup Wizard** ✅ — Compact horizontal SetupStepper (replaces large card grid). Dark gradient bar (`from-stone-800 via-stone-700 to-stone-800`) with glass border. Steps connected by gradient lines (emerald for complete transitions). Circle indicators: emerald check (done), amber pulse with ring (current), white/10 lock (locked). Labels below circles with "Continue" link on current step. Progress pill badge with amber dot. dashboardApi extended with `useGetSetupWizardQuery` and `useDismissSetupWizardMutation`.

#### ✅ Phase 5 — Academic Year Management
All tasks complete: AcademicYearsPage with DataTable (table + card views), AcademicYearForm dialog with date validation, academicYearApi with list/create/activate endpoints, status badges, pagination, i18n strings.

#### ✅ Phase 6 — Period Structures
- **6A List Page** ✅ — PeriodStructuresPage with DataTable, configApi with full CRUD
- **6B Editor** ✅ — PeriodStructureEditor with name, working days, division assignment (MultiSelect), day tabs (desktop) / dropdown (mobile), slot management
- **6C DnD & Interactions** ✅ — DaySlotList with @dnd-kit sortable, SlotRow (desktop), SlotCard (mobile), add/remove/reorder slots, copy between days, reset to defaults, all slot types (Period/Interval/Lunch Break)

#### ✅ Phase 7 — Subjects
All tasks complete: SubjectsPage with DataTable (storageKey="subjects", inline quick-edit on name, compact search in dark PageHeader, totalCount in pagination), SubjectForm (create/edit dialog), subjectApi with full CRUD + cascade delete check, read-only mode support, i18n strings.

#### ✅ Phase 8 — Teachers
- **8A Teachers List** ✅ — TeachersPage with DataTable (storageKey="teachers", inline quick-edit on name, all subjects visible with flex-wrap — no overflow chips, compact search in dark PageHeader, totalCount in pagination, compact 80px actions column). Delete with cascade confirmation.
- **8B Teacher Form + Availability** ✅ — TeacherFormPage (full page at `/teachers/new` and `/teachers/:id/edit`) with name, contact, maxPeriodsPerWeek, qualified subjects MultiSelect, and AvailabilityGrid. AvailabilityGrid fetches individual period structure details to get working days with slots, renders desktop 2D click-toggle grid and mobile day-by-day accordion with switches. teacherApi RTK Query slice with full CRUD + setSubjects + setAvailability endpoints. i18n strings added. Vite proxy fixed with bypass for HTML requests to prevent route conflicts.

#### ✅ Phase 9 — Classes & Divisions
- **9A Classes List** ✅ — ClassesPage with glass card grid (not table — card-based layout per class), create class dialog with name + requiresStream toggle, delete with confirmation, division count + timetable status badges per card. classApi RTK Query with full CRUD + division CRUD. i18n strings for classes namespace.
- **9B Class Detail + Divisions** ✅ — ClassDetailPage at `/classes/:id` with division card grid. Add division dialog with label + optional stream name. Division cards show period structure badge, assignment count, timetable status (Generated/Outdated/Pending). Delete division with confirmation. Action buttons for Assignments and Generate (placeholder routes for Phase 10/12).

#### ⬜ Phase 10 — Division Assignments Editor
Not started. No AssignmentEditorPage, no assignmentApi.

#### ⬜ Phase 11 — Elective Groups
ElectiveGroupsPage is placeholder only. No CRUD, no API.

#### ⬜ Phase 12 — Timetable Generator
Not started. No GeneratorPage, no timetableApi.

#### ⬜ Phase 13 — Timetable Editor (DnD)
- **13A Grid Layout** ⬜ — Not started
- **13B Drag-and-Drop & Conflicts** ⬜ — Not started
- **13C Export Integration** ⬜ — Not started

#### ⬜ Phase 14 — Notifications
NotificationsPage is placeholder only. No notification list, no notificationApi (beyond conflict banner in dashboard).

#### ⬜ Phase 15 — Teacher Timetable View
TeacherTimetablePage is placeholder only. No grid, no teacherTimetableApi.

#### ✅ Phase 16 — WebSocket Integration
- **Redux Slice** ✅ — wsSlice with `connected` state and `setWsConnected` action
- **useWebSocket Hook** ✅ — Full WebSocket client with token-based authentication, exponential backoff reconnection (max 5 retries, up to 30s delay), message handling for GENERATION_COMPLETE/GENERATION_FAILED/TIMETABLE_OUTDATED events, RTK Query cache invalidation on events, toast notifications
- **Integration** ✅ — Hook initialized in AuthenticatedLayout (runs once per authenticated session), notificationApi registered in Redux store with 60s polling for notification count as fallback

#### ✅ Phase 17 — i18n Setup
All tasks complete: i18next configured with LanguageDetector, 7 namespace files (common, auth, dashboard, academic-years, period-structures, subjects, teachers), `useTranslation()` used throughout implemented features.

#### ⬜ Phase 18 — Final Responsive Polish & QA
Not started. Depends on all other phases being complete first.

---

## 7. Phase 0 — Project Scaffolding

### 7.1 Goal

Initialize the `apps/frontend/` project with Vite, React 19, TypeScript strict mode, Tailwind CSS v4, shadcn/ui, Redux Toolkit, React Router v7, i18next skeleton, and the custom color palette.

### 7.2 Tasks

#### 7.2.1 Initialize Vite + React 19

```bash
cd apps/
npm create vite@latest frontend -- --template react-ts
cd frontend
```

Update `package.json` to ensure React 19:
```json
{
  "name": "@timetable/frontend",
  "private": true,
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

#### 7.2.2 TypeScript Strict Mode

Create `tsconfig.json` extending the base with frontend-specific settings:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

#### 7.2.3 Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/auth': 'http://localhost:4001',
      '/api/academic-years': 'http://localhost:4002',
      '/api/config': 'http://localhost:4003',
      '/api/subjects': 'http://localhost:4004',
      '/api/teachers': 'http://localhost:4005',
      '/api/classes': 'http://localhost:4006',
      '/api/assignments': 'http://localhost:4007',
      '/api/timetables': 'http://localhost:4008',
      '/api/dashboard': 'http://localhost:4009',
      '/api/export': 'http://localhost:4010',
    },
  },
});
```

#### 7.2.4 Install Core Dependencies

```bash
# Core
npm install @reduxjs/toolkit react-redux react-router

# UI / Styling
npm install tailwindcss @tailwindcss/forms clsx tailwind-merge
npm install lucide-react @tabler/icons-react
npm install sonner

# Forms
npm install react-hook-form @hookform/resolvers zod

# Tables
npm install @tanstack/react-table

# DnD (installed now, used in Phase 6+)
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Auth
npm install amazon-cognito-identity-js

# Date
npm install dayjs

# i18n
npm install react-i18next i18next i18next-browser-languagedetector
```

#### 7.2.5 Initialize shadcn/ui

```bash
npx shadcn@latest init
```

Configuration choices:
- Style: **New York**
- Base color: **Custom** (Deep Purple palette)
- CSS variables: **Yes**
- Tailwind CSS: **v4**
- Path aliases: `@/components`, `@/lib`

Customize `components.json` to use the brand palette.

#### 7.2.6 Tailwind CSS v4 Configuration

Create `src/index.css` with custom theme tokens:

```css
@import "tailwindcss";

@theme {
  /* Brand Colors */
  --color-primary: #6A0DAD;
  --color-primary-foreground: #FFFFFF;
  --color-secondary: #0047AB;
  --color-secondary-foreground: #FFFFFF;
  --color-accent: #F7E7CE;
  --color-accent-foreground: #1A1A2E;

  /* Semantic */
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-destructive: #DC2626;
  --color-destructive-foreground: #FFFFFF;
  --color-info: #0047AB;

  /* Surfaces — Light */
  --color-background: #FFFFFF;
  --color-surface: #F8F9FA;
  --color-foreground: #1A1A2E;
  --color-muted: #6B7280;
  --color-muted-foreground: #6B7280;
  --color-border: #E5E7EB;

  /* Gradients */
  --gradient-brand: linear-gradient(135deg, #0047AB, #00B4D8);
  --gradient-feature: linear-gradient(135deg, #6A0DAD, #0047AB);

  /* Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  /* Breakpoints */
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1440px;
}

/* Dark mode overrides */
.dark {
  --color-background: #1A1A2E;
  --color-background-deep: #0F0F1A;
  --color-surface: #16213E;
  --color-foreground: #F8F9FA;
  --color-muted: #9CA3AF;
  --color-muted-foreground: #9CA3AF;
  --color-border: #374151;
  --color-success: #22C55E;
  --color-warning: #F59E0B;
  --color-destructive: #EF4444;
  --color-info: #3B82F6;
}
```

#### 7.2.7 Directory Structure

```
apps/frontend/src/
├── app/
│   ├── store.ts                 # Redux store
│   └── router.tsx               # React Router v7 route definitions
├── components/
│   ├── ui/                      # shadcn/ui primitives (Button, Input, Dialog, etc.)
│   ├── layout/                  # Shell, Sidebar, TopBar, BottomTabBar, Breadcrumb
│   └── shared/                  # ConfirmDialog, ErrorBoundary, Skeleton wrappers, EmptyState
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── academic-years/
│   ├── period-structures/
│   ├── subjects/
│   ├── teachers/
│   ├── classes/
│   ├── assignments/
│   ├── elective-groups/
│   ├── timetable/
│   ├── notifications/
│   ├── teacher-timetable/
│   └── export/
├── hooks/
│   ├── useWebSocket.ts
│   ├── useTheme.ts
│   ├── useAuth.ts
│   ├── useBreakpoint.ts         # Screen size detection
│   └── useReadOnly.ts           # Archived year → read-only mode
├── slices/
│   └── wsSlice.ts
├── guards/
│   └── AuthGuard.tsx
├── i18n/
│   ├── index.ts                 # i18next config
│   └── locales/
│       └── en/
│           ├── common.json
│           ├── auth.json
│           ├── dashboard.json
│           └── ... (one file per feature)
├── lib/
│   ├── cn.ts                    # clsx + tailwind-merge helper
│   ├── api.ts                   # RTK Query base query config
│   └── mock-auth.ts             # Mock auth for local dev
├── types/
│   └── index.ts
├── App.tsx
├── main.tsx
└── index.css
```

#### 7.2.8 Redux Store Setup

```typescript
// app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer from '@/features/auth/authSlice';
import wsReducer from '@/slices/wsSlice';
// API slices will be added incrementally as features are built

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ws: wsReducer,
    // [academicYearApi.reducerPath]: academicYearApi.reducer, // added in Phase 5
    // ... more API slices added per phase
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
    // .concat(academicYearApi.middleware) // added per phase
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

#### 7.2.9 RTK Query Base Configuration

```typescript
// lib/api.ts
import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '@/app/store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Academic year header — injected on every request
    const academicYearId = (getState() as RootState).auth.activeAcademicYearId;
    if (academicYearId) {
      headers.set('X-Academic-Year-Id', academicYearId);
    }
    return headers;
  },
});
```

#### 7.2.10 i18n Skeleton

```typescript
// i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en_common from './locales/en/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en_common },
    },
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
```

#### 7.2.11 Router Skeleton

```typescript
// app/router.tsx
import { createBrowserRouter } from 'react-router';

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('@/features/auth/LoginPage'),
  },
  {
    // Protected routes — wrapped in AuthGuard layout
    lazy: () => import('@/guards/AuthGuard'),
    children: [
      { path: '/', lazy: () => import('@/features/dashboard/DashboardPage') },
      // Routes added incrementally per phase
    ],
  },
]);
```

### 7.3 Verification

- `npm run dev` starts Vite on `http://localhost:3000`
- A blank page with the correct Tailwind theme loads
- Redux DevTools shows the store with `auth` and `ws` slices
- TypeScript strict mode compiles clean (`npx tsc --noEmit`)
- `@/` path alias resolves correctly

---

## 8. Phase 1 — Design System & Shared UI Components

This phase builds the reusable component library that all screens will consume. Split into 3 sub-parts.

### Phase 1A — Core Primitives

**Goal**: Install and customize all shadcn/ui primitives needed across the app.

#### Components to install via shadcn/ui CLI:

```bash
npx shadcn@latest add button input label textarea select checkbox switch
npx shadcn@latest add badge separator skeleton avatar
npx shadcn@latest add dialog sheet dropdown-menu popover tooltip
npx shadcn@latest add card tabs scroll-area
npx shadcn@latest add form        # React Hook Form integration
npx shadcn@latest add sonner      # Toast integration
npx shadcn@latest add calendar    # Date picker base
npx shadcn@latest add command     # Combobox / searchable select
npx shadcn@latest add toggle toggle-group
npx shadcn@latest add table
```

#### Customizations:

| Component | Customization |
|-----------|--------------|
| `Button` | Add `gradient` variant using `gradient-feature`. Add `loading` prop that shows spinner and disables interaction. |
| `Badge` | Add `success`, `warning`, `destructive`, `info`, `outline` variants with brand colors. |
| `Skeleton` | Default to brand-appropriate shimmer animation. Used in all loading states. |
| `Dialog` | Ensure dark mode styling. Add max-width responsive adjustments. |

#### Files created:

```
src/components/ui/
├── button.tsx           # shadcn + gradient variant + loading state
├── input.tsx            # shadcn default
├── label.tsx            # shadcn default
├── textarea.tsx         # shadcn default
├── select.tsx           # shadcn default
├── checkbox.tsx         # shadcn default
├── switch.tsx           # shadcn default
├── badge.tsx            # shadcn + custom variants
├── separator.tsx        # shadcn default
├── skeleton.tsx         # shadcn default
├── avatar.tsx           # shadcn default
├── dialog.tsx           # shadcn default
├── sheet.tsx            # shadcn (mobile drawers)
├── dropdown-menu.tsx    # shadcn default
├── popover.tsx          # shadcn default
├── tooltip.tsx          # shadcn default
├── card.tsx             # shadcn default
├── tabs.tsx             # shadcn default
├── scroll-area.tsx      # shadcn default
├── form.tsx             # shadcn RHF integration
├── sonner.tsx           # shadcn toast wrapper
├── calendar.tsx         # shadcn date calendar
├── command.tsx          # shadcn combobox
├── toggle.tsx           # shadcn default
├── toggle-group.tsx     # shadcn default
└── table.tsx            # shadcn table primitives
```

#### Verification:

- Render a playground page (`/dev/components`) showing all primitives in light and dark mode
- All components respect the brand color palette
- All components are keyboard accessible

---

### Phase 1B — Composite Components

**Goal**: Build higher-level shared components used across multiple screens.

#### Components:

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| `ConfirmDialog` | `shared/ConfirmDialog.tsx` | `open`, `title`, `description`, `confirmLabel`, `variant` (`destructive` / `primary`), `onConfirm`, `onCancel`, `loading` | Reusable confirmation modal. Red "Confirm" for deletes, blue for other actions. |
| `EmptyState` | `shared/EmptyState.tsx` | `icon`, `title`, `description`, `actionLabel`, `onAction` | Illustrated placeholder with a call-to-action button. |
| `PageHeader` | `shared/PageHeader.tsx` | `title`, `description`, `actions` (ReactNode for top-right buttons) | Consistent page header with title, optional description, and action buttons. |
| `SearchInput` | `shared/SearchInput.tsx` | `value`, `onChange`, `placeholder`, `debounceMs` (default 300) | Debounced search with magnifying glass icon and clear button. |
| `DataTable` | `shared/DataTable.tsx` | `columns`, `data`, `isLoading`, `emptyMessage`, `pagination`, `onPaginationChange` | Wraps TanStack Table + shadcn table primitives. Shows skeleton rows when loading. Shows `EmptyState` when no data. Responsive: switches to card layout on sm/md. |
| `DataTableCardView` | `shared/DataTableCardView.tsx` | `data`, `renderCard` | Mobile card representation of table data. |
| `ErrorBoundary` | `shared/ErrorBoundary.tsx` | `fallback` | Custom error boundary with branded error page. "Something went wrong" + Retry button. |
| `PageSkeleton` | `shared/PageSkeleton.tsx` | `variant` (`table` / `form` / `cards` / `grid`) | Full-page skeleton layouts for each page type. |
| `StatusBadge` | `shared/StatusBadge.tsx` | `status` (`active` / `inactive` / `archived` / `generated` / `outdated` / `pending`) | Consistent color-coded status badges used across all list views. |

#### DataTable — Responsive Behavior:

```
Desktop (lg, xl):
┌──────────────────────────────────────────────────┐
│  Column A  │  Column B  │  Column C  │  Actions  │
├────────────┼────────────┼────────────┼───────────┤
│  data      │  data      │  data      │  ✎  🗑    │
└────────────┴────────────┴────────────┴───────────┘

Mobile (sm, md):
┌──────────────────────────────────────────────────┐
│  ┌───────────────────────────────────┐           │
│  │  Column A: data                   │           │
│  │  Column B: data                   │           │
│  │  Column C: data                   │           │
│  │  ──────────────────────           │           │
│  │  [Edit]  [Delete]                 │           │
│  └───────────────────────────────────┘           │
│                                                   │
│  ┌───────────────────────────────────┐           │
│  │  (next card)                      │           │
│  └───────────────────────────────────┘           │
└──────────────────────────────────────────────────┘
```

#### Verification:

- All composite components render correctly in light/dark mode
- DataTable shows skeleton when `isLoading=true`
- DataTable switches to card view at sm/md breakpoints
- ConfirmDialog handles destructive and primary variants

---

### Phase 1C — Form Components

**Goal**: Build form-specific components that use React Hook Form + Zod.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `FormField` | `shared/FormField.tsx` | Wraps shadcn `FormItem` + `FormLabel` + `FormControl` + `FormMessage`. Auto-displays inline validation errors from Zod. |
| `DatePicker` | `shared/DatePicker.tsx` | shadcn date picker (Calendar + Popover). Formatted with dayjs. |
| `MultiSelect` | `shared/MultiSelect.tsx` | Searchable multi-select with pill-style selected items and ✕ to remove. Uses shadcn Command (Combobox). |
| `TimePicker` | `shared/TimePicker.tsx` | `<input type="time">` styled with Tailwind. |
| `PasswordInput` | `shared/PasswordInput.tsx` | Input with show/hide toggle (eye icon). |
| `PasswordStrength` | `shared/PasswordStrength.tsx` | Red/amber/green strength bar below password inputs. |

#### MultiSelect — Responsive Behavior:

```
Desktop:
┌──────────────────────────────────────────────────┐
│  [English ✕] [Hindi ✕] [Physics ✕]  [+ 2 more]  │
│  ┌──────────────────────────────────┐            │
│  │  🔍 Search subjects...           │            │
│  │  ☐ Mathematics                   │            │
│  │  ☐ Chemistry                     │            │
│  │  ☐ Biology                       │            │
│  └──────────────────────────────────┘            │
└──────────────────────────────────────────────────┘

Mobile:
Same component but the popover is full-width.
Selected pills wrap to multiple lines.
```

#### Verification:

- All form components integrate with React Hook Form
- Zod validation errors appear inline below fields
- MultiSelect supports search, add, and remove
- DatePicker shows calendar popover, formatted with dayjs
- PasswordStrength shows correct bar color

---

## 9. Phase 2 — App Shell & Layout

The global application shell that wraps all authenticated pages. Split into 3 sub-parts.

### Phase 2A — Desktop Layout

**Goal**: Build the desktop shell with sidebar, top bar, breadcrumb, academic year selector, and theme toggle.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `AppShell` | `layout/AppShell.tsx` | Root layout wrapper. Renders Sidebar + TopBar + content area + FAB. Provides theme and academic year context. |
| `Sidebar` | `layout/Sidebar.tsx` | Left sidebar. Full (240px) at xl, icon-only (64px) at lg with hover expand. Hidden at md/sm. |
| `SidebarLink` | `layout/SidebarLink.tsx` | Individual nav link. Active route highlighted with primary color. Badge support for notifications count. |
| `FloatingActionButton` | `layout/FloatingActionButton.tsx` | Persistent FAB fixed to bottom-right corner (24px from edges). Dual-purpose: setup progress ring ("4/7") during setup, amber conflict badge after setup. Hidden on Login/Register. Smaller circular variant on mobile. Pulse animation on state change. |
| `SetupPopoverPanel` | `layout/SetupPopoverPanel.tsx` | Popover (desktop) or bottom sheet (mobile) opened by FAB during setup. Shows 7 steps with status icons (✓/●/○/🔒), clickable step names with "Continue" on current step, and "Dismiss Guide" link. |
| `ConflictPopoverPanel` | `layout/ConflictPopoverPanel.tsx` | Popover (desktop) or bottom sheet (mobile) opened by FAB after setup when conflicts exist. Shows summary of up to 5 recent conflicts with "Edit TT →" links, plus "View All" and "Dismiss All" buttons. |
| `TopBar` | `layout/TopBar.tsx` | Fixed top bar. Shows: App logo/name (left), Academic Year selector (center-right), Theme toggle (right), User menu (far right). |
| `AcademicYearSelector` | `layout/AcademicYearSelector.tsx` | Dropdown showing all academic years. Active year has a green badge. Archived years have a grey badge. Changing year reloads all data and sets read-only mode if archived. |
| `ThemeToggle` | `layout/ThemeToggle.tsx` | Sun/moon icon button. Toggles `dark` class on `<html>`. Saves to localStorage. System preference as default. |
| `UserMenu` | `layout/UserMenu.tsx` | Dropdown: School name (display), Logout button. |
| `Breadcrumb` | `layout/Breadcrumb.tsx` | Auto-generated from React Router location. Clickable segments. Hidden on top-level pages. |

#### Desktop Layout (xl):

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOPBAR: ⟐ Logo    │    AY: [2026-27 ▾]    │  🌙  │  Admin ▾      │
├──────────┬───────────────────────────────────────────────────────────┤
│ SIDEBAR  │  Breadcrumb: Classes > Class VII > Division A             │
│ 240px    │ ─────────────────────────────────────────────────────────  │
│          │                                                           │
│ Dashboard│               CONTENT AREA                                │
│ Academic │               (React Router <Outlet />)                   │
│  Years   │                                                           │
│ Classes  │                                                           │
│ Subjects │                                                           │
│ Teachers │                                                           │
│ Elective │                                                           │
│  Groups  │                                                           │
│ Notifi-  │                                                           │
│  cations │                                                           │
│ Teacher  │                                                           │
│  View    │                                            ┌─────────┐   │
│ Settings │                                            │  ◔ 4/7  │   │
│          │                                            └─────────┘   │
└──────────┴─────────────────────────────────── FAB (bottom-right) ───┘
```

#### Desktop Layout (lg — collapsed sidebar):

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOPBAR: ⟐ Logo    │    AY: [2026-27 ▾]    │  🌙  │  Admin ▾      │
├────┬─────────────────────────────────────────────────────────────────┤
│ 64 │  Breadcrumb: Classes > Class VII                                │
│ px │ ────────────────────────────────────────────────────────────── │
│    │                                                                 │
│ 📊 │                CONTENT AREA                                     │
│ 📅 │                                                                 │
│ 🏫 │                                                                 │
│ 📚 │                                                                 │
│ 👩‍🏫 │                                                                 │
│ 🔗 │                                                                 │
│ 🔔 │                                                                 │
│ 👀 │                                            ┌─────────┐         │
│ ⚙  │                                            │  ◔ 4/7  │         │
│    │                                            └─────────┘         │
└────┴─────────────────────────────────── FAB (bottom-right) ─────────┘
```

#### Sidebar — Gradient Background:

The sidebar uses `gradient-feature` (Purple-to-Blue) as background in light mode. In dark mode, it uses `background-deep` (#0F0F1A) with a subtle border.

#### Read-Only Mode:

When an archived academic year is selected:
- A persistent amber banner appears below the TopBar: "You are viewing archived data (2025-26). Changes are disabled."
- All mutation buttons (Add, Edit, Delete, Generate) are disabled with `opacity-50 cursor-not-allowed`
- A `useReadOnly()` hook returns `true` when the selected AY is archived

#### Verification:

- Sidebar expands/collapses correctly at xl vs lg breakpoints
- **FAB** appears in bottom-right on all pages except Login/Register
- FAB shows setup progress ring during setup, conflict badge after setup
- Clicking FAB opens popover panel (desktop) or bottom sheet (mobile)
- Setup steps in panel are clickable and navigate to correct screens
- FAB auto-opens on first login to introduce setup flow
- FAB hides or shows green checkmark when setup complete and no conflicts
- Theme toggle persists across page reloads
- Academic Year selector changes the header and triggers data reload
- Selecting an archived year shows read-only banner and disables mutation buttons
- Breadcrumb auto-generates from the current route

---

### Phase 2B — Mobile Layout

**Goal**: Build the mobile navigation with bottom tab bar and hamburger-triggered drawer.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `BottomTabBar` | `layout/BottomTabBar.tsx` | Fixed bottom tab bar (visible at sm/md). 5 tabs: Dashboard, Classes, Timetable, Notifications, More. |
| `BottomTabItem` | `layout/BottomTabItem.tsx` | Individual tab with icon + label. Active tab uses primary color. Notifications tab shows count badge. |
| `MobileHeader` | `layout/MobileHeader.tsx` | Simplified top bar for mobile. Shows: hamburger menu (left), page title (center), AY badge + theme toggle (right). |
| `MobileDrawer` | `layout/MobileDrawer.tsx` | Sheet (slide from left) with full navigation. All sidebar links + user info + logout. Triggered by hamburger icon. |
| `MoreSheet` | `layout/MoreSheet.tsx` | Bottom sheet triggered by "More" tab. Shows remaining nav items not in the bottom tab bar: Academic Years, Subjects, Teachers, Elective Groups, Teacher View, Settings. |

#### Mobile Layout (sm/md):

```
┌──────────────────────────────────────────────────┐
│ MOBILE HEADER: ☰  │  Dashboard  │  🌙  AY badge │
├──────────────────────────────────────────────────┤
│                                                   │
│                                                   │
│                CONTENT AREA                        │
│                (scrollable)                        │
│                                                   │
│                                                   │
│                                                   │
├──────────────────────────────────────────────────┤
│  📊        🏫        📅        🔔       ⋯       │
│ Dashboard  Classes  Timetable  Notif.   More      │
└──────────────────────────────────────────────────┘
```

#### Bottom Tab Bar Items:

| Tab | Icon | Route | Badge |
|-----|------|-------|-------|
| Dashboard | `LayoutDashboard` | `/` | — |
| Classes | `School` | `/classes` | — |
| Timetable | `CalendarDays` | `/teacher-timetable` | — |
| Notifications | `Bell` | `/notifications` | Count badge (from RTK Query polling) |
| More | `MoreHorizontal` | Opens MoreSheet | — |

#### Verification:

- Bottom tab bar visible only at sm/md breakpoints
- Sidebar hidden at sm/md
- MobileHeader shows instead of desktop TopBar at sm/md
- MoreSheet slides up with remaining nav items
- MobileDrawer slides from left on hamburger tap

---

### Phase 2C — Auth Guard & Error Boundaries

**Goal**: Implement route protection and global error handling.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `AuthGuard` | `guards/AuthGuard.tsx` | Layout route component. Checks for valid token on mount. If no token → redirect to `/login`. While checking → full-page skeleton. If valid → render `<Outlet />` wrapped in `AppShell`. |
| `GlobalErrorBoundary` | `shared/GlobalErrorBoundary.tsx` | Wraps the entire app. Shows branded "Something went wrong" page with Retry and Go Home buttons. Logs error to console. |
| `FeatureErrorBoundary` | `shared/FeatureErrorBoundary.tsx` | Wraps individual feature routes. Shows inline error panel within the shell (not full-page). "This section encountered an error. Retry" |

#### Auth Flow (Mock — Local Dev):

```typescript
// lib/mock-auth.ts
const MOCK_USER = {
  token: 'mock-jwt-token-local-dev',
  email: 'admin@school.test',
  schoolId: '400d3d09-af01-44ea-a35e-eea095c9efe4',  // matches seeded school
  userId: 'mock-user-001',
  schoolName: 'Demo School',
};

export function mockLogin(email: string, password: string) {
  // Accept any credentials in dev mode
  return Promise.resolve(MOCK_USER);
}

export function mockGetSession() {
  const stored = localStorage.getItem('mock-auth');
  if (stored) return Promise.resolve(JSON.parse(stored));
  return Promise.reject(new Error('No session'));
}
```

When `VITE_AUTH_MODE=mock` (the default for local dev), the auth layer uses `mock-auth.ts`. When `VITE_AUTH_MODE=cognito`, it uses `amazon-cognito-identity-js`.

#### Verification:

- Unauthenticated user accessing `/` is redirected to `/login`
- After mock login, user is redirected to `/`
- AuthGuard shows skeleton while checking session
- GlobalErrorBoundary catches errors and shows fallback
- FeatureErrorBoundary catches errors within a feature without breaking the shell

---

## 10. Phase 3 — Auth Pages (Screen 0)

### Phase 3A — Login Page

**Route**: `/login`  
**Auth**: Public (no AuthGuard)

#### Desktop Layout (lg, xl):

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐│
│  │                         │  │                                ││
│  │   ⟐ School Timetable   │  │   Welcome Back                 ││
│  │      Manager            │  │                                ││
│  │                         │  │   Email                        ││
│  │   [gradient-brand       │  │   [________________________]   ││
│  │    background with      │  │                                ││
│  │    illustration or      │  │   Password                     ││
│  │    branding text]       │  │   [________________________]👁  ││
│  │                         │  │                                ││
│  │                         │  │   ☐ Remember me                ││
│  │                         │  │                                ││
│  │                         │  │   [ Login ─────────────── ]    ││
│  │                         │  │                                ││
│  │                         │  │   Forgot Password?             ││
│  │                         │  │   Register New School →        ││
│  │                         │  │                                ││
│  └─────────────────────────┘  └────────────────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Split layout: left panel (gradient branding), right panel (form). 50/50 width at xl, hidden left panel at md.

#### Mobile Layout (sm, md):

```
┌──────────────────────────────────────────────────┐
│                                                   │
│           ⟐ School Timetable Manager              │
│                                                   │
│    ┌──────────────────────────────────────┐       │
│    │  Welcome Back                        │       │
│    │                                      │       │
│    │  Email                               │       │
│    │  [______________________________]    │       │
│    │                                      │       │
│    │  Password                            │       │
│    │  [______________________________]👁   │       │
│    │                                      │       │
│    │  ☐ Remember me                       │       │
│    │                                      │       │
│    │  [ Login ─────────────────────── ]   │       │
│    │                                      │       │
│    │  Forgot Password?                    │       │
│    │  Register New School →               │       │
│    └──────────────────────────────────────┘       │
│                                                   │
└──────────────────────────────────────────────────┘
```

Full-width centered card, no left branding panel. Logo/title above the card.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `LoginPage` | `features/auth/LoginPage.tsx` | Page with login form, layout split on desktop, single-column on mobile. |
| `LoginForm` | `features/auth/LoginForm.tsx` | React Hook Form with Zod. Fields: email, password, remember me. Submits to mock-auth or Cognito based on env. |
| `AuthLayout` | `features/auth/AuthLayout.tsx` | Shared layout for Login / Register / Forgot Password. Gradient left panel (desktop only) + form right panel. |
| `authSlice` | `features/auth/authSlice.ts` | Redux slice: `isAuthenticated`, `user`, `token`, `activeAcademicYearId`, `isLoading`. Actions: `loggedIn`, `loggedOut`, `authChecked`, `setActiveAcademicYear`. |
| `authApi` | `features/auth/authApi.ts` | RTK Query endpoints: `login`, `register`, `forgotPassword`, `confirmResetPassword`. |

#### Zod Validation (Login):

```typescript
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});
```

#### i18n Keys (en/auth.json):

```json
{
  "login": {
    "title": "Welcome Back",
    "email": "Email",
    "password": "Password",
    "rememberMe": "Remember me",
    "submit": "Login",
    "forgotPassword": "Forgot Password?",
    "registerLink": "Register New School →",
    "errors": {
      "invalidCredentials": "Invalid email or password.",
      "networkError": "Unable to connect. Please check your internet connection."
    }
  }
}
```

#### Verification:

- Login form validates email format and non-empty password
- On successful mock login, redirects to `/`
- Remember me toggles localStorage vs sessionStorage
- Responsive: split layout on desktop, single-column on mobile
- Dark mode works on the login page

---

### Phase 3B — Registration & Forgot Password

#### Registration Form:

Inline swap from login form (same page, toggle with "Register New School →" link).

| Field | Validation |
|-------|-----------|
| School Name | Required, min 2 chars |
| Admin Email | Required, valid email |
| Password | Required, min 8 chars, mixed case + number |
| Confirm Password | Must match password |

- Password strength indicator (red/amber/green bar) below password field
- On submit: Cognito `signUp` (or mock) → auto-login → redirect to `/`

#### Forgot Password Flow:

1. User clicks "Forgot Password?" → form swaps to email-only input
2. Submit → Cognito `forgotPassword` (or mock) → shows "Check your email" message
3. Below the message, a "Enter Code" link appears → form shows: Verification Code + New Password + Confirm Password
4. Submit → Cognito `confirmForgotPassword` → shows success message → back to login

#### Components:

| Component | File |
|-----------|------|
| `RegisterForm` | `features/auth/RegisterForm.tsx` |
| `ForgotPasswordForm` | `features/auth/ForgotPasswordForm.tsx` |
| `ResetPasswordForm` | `features/auth/ResetPasswordForm.tsx` |

#### Verification:

- Registration validates all fields including password strength and confirm match
- Forgot password flow completes end-to-end
- Responsive on all breakpoints
- All validation errors appear inline

---

## 11. Phase 4 — Dashboard (Screen 1)

**Route**: `/` (protected)

### Desktop Layout (lg, xl):

```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard                                          AY: 2026-27 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Classes  │ │Divisions │ │ Teachers │ │ Subjects │           │
│  │    12    │ │    32    │ │    54    │ │    31    │           │
│  │ ───────  │ │ ───────  │ │ ───────  │ │ ───────  │           │
│  │ icon     │ │ icon     │ │ icon     │ │ icon     │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌──────────┐ ┌──────────┐                                      │
│  │Generated │ │ Pending  │                                      │
│  │   28     │ │    4     │                                      │
│  └──────────┘ └──────────┘                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ⚠ 3 timetables have conflicts.  View Notifications →   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Quick Links                                                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Manage Classes  │ │ Generate TT     │ │ Teacher View    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Summary cards in a 4-column grid at xl, 3-column at lg. Clickable — navigate to respective list pages.

### Mobile Layout (sm, md):

```
┌──────────────────────────────────────────────────┐
│  Dashboard                           AY: 2026-27 │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────────┐ ┌──────────────────┐       │
│  │ Classes    12    │ │ Divisions  32    │       │
│  └──────────────────┘ └──────────────────┘       │
│  ┌──────────────────┐ ┌──────────────────┐       │
│  │ Teachers   54    │ │ Subjects   31    │       │
│  └──────────────────┘ └──────────────────┘       │
│  ┌──────────────────┐ ┌──────────────────┐       │
│  │ Generated  28    │ │ Pending     4    │       │
│  └──────────────────┘ └──────────────────┘       │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  ⚠ 3 timetables have conflicts.         │    │
│  │  View Notifications →                     │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  Quick Links                                      │
│  [Manage Classes & Divisions]                     │
│  [Generate Timetables]                            │
│  [View Teacher Timetable]                         │
│                                                   │
└──────────────────────────────────────────────────┘
```

2-column grid for cards on mobile. Quick links become full-width buttons.

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `DashboardPage` | `features/dashboard/DashboardPage.tsx` | Main page. Fetches summary data + setup wizard state. Shows skeleton on load. Shows setup wizard when incomplete. |
| `SummaryCard` | `features/dashboard/SummaryCard.tsx` | Card with icon, label, count, subtle gradient border. Clickable → navigates. |
| `ConflictBanner` | `features/dashboard/ConflictBanner.tsx` | Amber/warning banner. "X timetables have conflicts. View Notifications →" link. Only shown if `outdatedTimetableCount > 0`. |
| `QuickLinks` | `features/dashboard/QuickLinks.tsx` | Grid of shortcut cards/buttons to key pages. |
| `SetupStepCard` | `features/dashboard/SetupStepCard.tsx` | Card per setup step: step number, title, description, current status summary (e.g., "3 classes, 5 divisions"), action button ("Continue" / "Review"). Locked if prerequisites unmet. |
| `dashboardApi` | `features/dashboard/dashboardApi.ts` | RTK Query: `useGetDashboardSummaryQuery()`, `useGetSetupWizardQuery()`, `useDismissSetupWizardMutation()`. Endpoints: `GET /dashboard/summary`, `GET /dashboard/setup-wizard`, `PUT /dashboard/setup-wizard/dismiss`. Tags: `DashboardSummary`, `SetupWizard`. |

### Setup Wizard on Dashboard:

When `setupWizard.dismissed === false` and `setupWizard.totalComplete < 7`:
1. **SetupStepCards** are shown above the summary cards in a responsive grid (4 cols xl, 3 cols lg, 2 cols md, 1 col sm).
2. Each card shows live status pulled from `GET /dashboard/setup-wizard` response.
3. After all 7 steps complete: the step cards are replaced by normal summary cards. The **FAB** briefly shows a "Setup Complete!" celebration, then transitions to conflict mode or hides.
4. "Dismiss Guide" can be triggered from the FAB popover panel → `PUT /dashboard/setup-wizard/dismiss` → hides both dashboard cards and FAB setup mode permanently.

### FAB Integration (rendered in AppShell, visible on all pages):

The `FloatingActionButton` component is rendered in `AppShell.tsx` (not per-page). It:
1. Fetches `GET /dashboard/setup-wizard` on mount and caches via RTK Query (`SetupWizard` tag).
2. Fetches `GET /notifications/count` for conflict badge (reuses existing `NotificationCount` tag).
3. Determines mode: **setup** (incomplete steps) → **conflict** (has notifications) → **hidden** (all clear).
4. Renders the appropriate popover panel on click (`SetupPopoverPanel` or `ConflictPopoverPanel`).

### Loading State:

All 6 summary cards show skeleton shimmer. Conflict banner area shows a thin skeleton bar. Setup wizard shows skeleton cards during load.

### Empty State:

When `totalClasses === 0` and wizard is not dismissed → Setup wizard is the primary content (summary cards still visible but show zeros). The wizard guides the user to create their first academic year.

### Verification:

- Summary cards render correct counts from API
- Clicking a card navigates to the correct list page
- Conflict banner appears only when conflicts exist
- Setup step cards appear on dashboard for new users, show correct step completion
- Clicking a step card navigates to the correct screen
- FAB shows setup progress ring during setup, conflict badge after setup
- FAB popover panel shows steps with correct status, clickable navigation
- Dismiss wizard from FAB panel hides both dashboard cards and FAB setup mode
- Responsive grid: 4 cols (xl) → 3 cols (lg) → 2 cols (sm/md)
- Dark mode correct

---

## 12. Phase 5 — Academic Year Management (Screen 2)

**Route**: `/academic-years`

### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Academic Years                            [ + Create New Year ] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┬────────────┬────────────┬──────────┬──────────┐ │
│  │  Label     │  Start     │  End       │  Status  │  Actions │ │
│  ├────────────┼────────────┼────────────┼──────────┼──────────┤ │
│  │  2026-27   │ 01 May '26 │ 31 Mar '27 │ ● Active │ Set Active│
│  │  2025-26   │ 01 May '25 │ 31 Mar '26 │ Archived │ View     │ │
│  └────────────┴────────────┴────────────┴──────────┴──────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile Layout:

Table switches to card layout via `DataTable`'s responsive mode:

```
┌──────────────────────────────────────────────────┐
│  Academic Years                     [ + Create ] │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  2026-27                        ● Active │    │
│  │  May 2026 — Mar 2027                     │    │
│  │  ─────────────────────────────────        │    │
│  │  [Set Active]                             │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  2025-26                       Archived  │    │
│  │  May 2025 — Mar 2026                     │    │
│  │  ─────────────────────────────────        │    │
│  │  [View]                                   │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `AcademicYearListPage` | `features/academic-years/AcademicYearListPage.tsx` | List page with DataTable. |
| `AcademicYearForm` | `features/academic-years/AcademicYearForm.tsx` | Dialog form for creating a new year. Fields: Label, Start Date (DatePicker), End Date (DatePicker). |
| `academicYearApi` | `features/academic-years/academicYearApi.ts` | RTK Query: `useGetAcademicYearsQuery`, `useCreateAcademicYearMutation`, `useActivateAcademicYearMutation`. Tags: `AcademicYear`. |

### Create Form — Zod:

```typescript
const createAcademicYearSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
}).refine(data => new Date(data.endDate) > new Date(data.startDate), {
  message: 'End date must be after start date',
  path: ['endDate'],
});
```

### Interactions:

| Action | Behavior |
|--------|----------|
| **Create** | Opens Dialog with form. On save: `POST /academic-years`. Toast on success. |
| **Set as Active** | ConfirmDialog: "This will archive the current active year." On confirm: `PATCH /academic-years/:id/activate`. Updates auth slice `activeAcademicYearId`. |
| **View (archived)** | Sets the selected AY in TopBar selector. App enters read-only mode. |

### Verification:

- CRUD operations work end-to-end
- Set Active shows confirmation and updates the TopBar selector
- Table shows correct status badges (Active green, Archived grey)
- Responsive: table to cards on mobile
- Skeleton loading on initial load

---

## 13. Phase 6 — Period Structures (Screens 3 & 3A)

This is a complex feature. Split into 3 sub-parts.

### Phase 6A — Period Structures List (Screen 3)

**Route**: `/settings/period-structures`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings > Period Structures              [ + Add Structure ]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┬──────────────┬────────────────┬──────────┐│
│  │  Name            │ Working Days │ Classes        │ Actions  ││
│  ├──────────────────┼──────────────┼────────────────┼──────────┤│
│  │  Senior Block    │ Mon–Fri      │ X, XI, XII     │ Edit  🗑 ││
│  │  Primary Block   │ Mon–Fri      │ I, II, III, IV │ Edit  🗑 ││
│  │  Middle Block    │ Mon–Sat      │ V, VI, VII,    │ Edit  🗑 ││
│  │                  │              │ VIII, IX       │          ││
│  └──────────────────┴──────────────┴────────────────┴──────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

Card layout. Classes shown as pills. Edit navigates to editor page. Delete opens confirmation sheet.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `PeriodStructureListPage` | `features/period-structures/PeriodStructureListPage.tsx` | List with DataTable. |
| `configApi` | `features/period-structures/configApi.ts` | RTK Query: `useGetPeriodStructuresQuery`, `useDeletePeriodStructureMutation`. Tags: `PeriodStructure`. |

#### Interactions:

| Action | Behavior |
|--------|----------|
| **Add** | Navigates to `/settings/period-structures/new` (Screen 3A) |
| **Edit** | Navigates to `/settings/period-structures/:id` (Screen 3A) |
| **Delete** | ConfirmDialog warning if classes are linked. On confirm: `DELETE /config/period-structures/:id`. |

---

### Phase 6B — Period Structure Editor — Form & Day Tabs (Screen 3A)

**Route**: `/settings/period-structures/:id` or `/settings/period-structures/new`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings > Period Structures > Senior Block                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Structure Name: [Senior Block___________]                       │
│                                                                  │
│  Working Days:  ☑ Mon  ☑ Tue  ☑ Wed  ☑ Thu  ☑ Fri  ☐ Sat ☐ Sun│
│                                                                  │
│  Assigned Divisions: [Multi-select grouped by class]             │
│                                                                  │
│  ─── Day-wise Slot Configuration ─────────────────────────────── │
│  ┌─────┬─────┬─────┬─────┬─────┐                                │
│  │ Mon │ Tue │ Wed │ Thu │ Fri │   Tabs (shadcn Tabs)           │
│  └─────┴─────┴─────┴─────┴─────┘                                │
│                                                                  │
│  Monday Slots:                     Copy from: [Select Day ▾]     │
│  ┌────┬─────┬───────────┬───────────┬──────────┬────────┬──────┐│
│  │ ≡  │ #   │ Type      │ Start     │ End      │ Dur.   │  🗑  ││
│  ├────┼─────┼───────────┼───────────┼──────────┼────────┼──────┤│
│  │ ≡  │ 1   │ Period    │ 09:00     │ 09:45    │ 45m    │  🗑  ││
│  │ ≡  │ 2   │ Period    │ 09:45     │ 10:30    │ 45m    │  🗑  ││
│  │ ≡  │ —   │ Interval  │ 10:30     │ 10:45    │ 15m    │  🗑  ││
│  │ ≡  │ 3   │ Period    │ 10:45     │ 11:30    │ 45m    │  🗑  ││
│  │ ≡  │ 4   │ Period    │ 11:30     │ 12:15    │ 45m    │  🗑  ││
│  │ ≡  │ —   │ Lunch     │ 12:15     │ 12:45    │ 30m    │  🗑  ││
│  │ ≡  │ 5   │ Period    │ 12:45     │ 13:30    │ 45m    │  🗑  ││
│  │ ≡  │ 6   │ Period    │ 13:30     │ 14:15    │ 45m    │  🗑  ││
│  └────┴─────┴───────────┴───────────┴──────────┴────────┴──────┘│
│                                                                  │
│  [ + Add Slot ]                                                  │
│                                                                  │
│  [ Save ]  [ Reset to Default ]  [ Cancel ]                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

```
┌──────────────────────────────────────────────────┐
│  ← Period Structure Editor                        │
├──────────────────────────────────────────────────┤
│                                                   │
│  Name: [Senior Block______________]               │
│                                                   │
│  Working Days:                                    │
│  ☑ Mon  ☑ Tue  ☑ Wed  ☑ Thu  ☑ Fri              │
│  ☐ Sat  ☐ Sun                                    │
│                                                   │
│  Classes: [Multi-select]                          │
│                                                   │
│  Day: [ Monday ▾ ]  (dropdown instead of tabs)   │
│  Copy from: [ Select Day ▾ ]                      │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  ≡ Period 1                              │    │
│  │  Type: Period  │  09:00 — 09:45  │  45m  │    │
│  │  ─────────────────────  [🗑]              │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │  ≡ Period 2                              │    │
│  │  Type: Period  │  09:45 — 10:30  │  45m  │    │
│  │  ─────────────────────  [🗑]              │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │  ≡ Interval                              │    │
│  │  Type: Interval │ 10:30 — 10:45 │  15m  │    │
│  │  ─────────────────────  [🗑]              │    │
│  └──────────────────────────────────────────┘    │
│  ...                                              │
│                                                   │
│  [ + Add Slot ]                                   │
│                                                   │
│  ┌────────────────────────────────────────┐      │
│  │  [ Save ]  [ Reset ]  [ Cancel ]      │      │
│  └────────────────────────────────────────┘      │
│                                                   │
└──────────────────────────────────────────────────┘
```

Key mobile differences:
- Day tabs → dropdown selector (saves horizontal space)
- Slot table → vertical card list
- Each slot is a card with inline fields
- Drag handle uses long-press on mobile

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `PeriodStructureEditor` | `features/period-structures/PeriodStructureEditor.tsx` | Full editor page. Form for name, working days (checkboxes), assigned classes (MultiSelect). Day tabs/dropdown for slot management. |
| `SlotRow` | `features/period-structures/SlotRow.tsx` | Single slot row (desktop table row). Type selector, time inputs, auto-calculated duration, delete button, drag handle. |
| `SlotCard` | `features/period-structures/SlotCard.tsx` | Mobile card variant of SlotRow. |
| `DaySlotList` | `features/period-structures/DaySlotList.tsx` | Sortable list of slots for a given day. Uses `@dnd-kit/sortable`. |

---

### Phase 6C — Period Structure Editor — Drag-and-Drop & Interactions

**Goal**: Wire up the sortable DnD behavior for slot reordering, copy-from-day, add slot, reset to default, and save.

#### Drag-and-Drop Implementation:

```typescript
// DaySlotList.tsx — uses @dnd-kit/sortable
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={slots.map(s => s.id)} strategy={verticalListSortingStrategy}>
    {slots.map(slot => (
      <SortableSlotRow key={slot.id} slot={slot} />
    ))}
  </SortableContext>
</DndContext>
```

On drag end: reorder slots, auto-recalculate period numbers (only period-type slots get numbers; interval/lunch get "—").

#### Interactions:

| Action | Behavior |
|--------|----------|
| **Drag reorder** | Reorder slots. Period numbers recalculate. |
| **Change slot type** | Dropdown: Period, Interval, Lunch Break. Period numbers recalculate. |
| **Edit time** | `<input type="time">`. Validate: end > start. Warning toast if gap/overlap with adjacent slots. |
| **Copy from day** | Select a day from dropdown. ConfirmDialog: "This will overwrite Monday's slots with Tuesday's configuration." On confirm: deep-copy slot array. |
| **Add Slot** | Appends new slot. Defaults: Type=Period, Start=last slot's end, End=start+45min. |
| **Delete slot** | If referenced by timetable: warning modal listing affected timetables. Otherwise: immediate removal with confirmation. |
| **Reset to Default** | ConfirmDialog: "Reset to system default?" Restores Mon–Fri, 8 periods, 3 breaks. |
| **Save** | Validates all days. `POST /config/period-structures` (create) or `PUT /config/period-structures/:id` (update). Toast on success. Navigate back to list. |

#### Verification:

- Drag-and-drop reorders slots and recalculates period numbers
- Slot type change works, period numbers update
- Time input validation catches end ≤ start
- Copy from day overwrites slots with confirmation
- Save creates/updates correctly
- Mobile uses card layout with long-press drag
- All interactions work in both light and dark mode

---

## 14. Phase 7 — Subjects (Screens 4 & 5)

**Routes**: `/subjects` (list), `/subjects/new` (create), `/subjects/:id/edit` (edit)

### Desktop Layout — Subjects List (Screen 4):

```
┌──────────────────────────────────────────────────────────────────┐
│  Subjects                                      [ + Add Subject ] │
├──────────────────────────────────────────────────────────────────┤
│  Search: [______________]                                        │
│                                                                  │
│  ┌──────────────────┬──────────────────────┬──────────┐         │
│  │  Subject Name    │  Assigned Teachers   │  Actions │         │
│  ├──────────────────┼──────────────────────┼──────────┤         │
│  │  English         │  Soumya, Lin Maria   │  ✎  🗑   │         │
│  │  Mathematics     │  Anu, Ashitha, Swetha│  ✎  🗑   │         │
│  │  Physics         │  Divya               │  ✎  🗑   │         │
│  └──────────────────┴──────────────────────┴──────────┘         │
│                                                                  │
│  ◀ 1 2 3 ▶                                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile Layout:

Cards with subject name, teacher pills, and action icons.

### Add/Edit Subject (Screen 5):

Simple form page: single field — **Subject Name** (required, unique per school).

- **Desktop**: Dialog modal (stays on list page)
- **Mobile**: Full-page form (navigates to `/subjects/new` or `/subjects/:id/edit`)

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `SubjectListPage` | `features/subjects/SubjectListPage.tsx` | DataTable with search, pagination (10/page). |
| `SubjectForm` | `features/subjects/SubjectForm.tsx` | Single-field form. Dialog on desktop, page on mobile. |
| `subjectApi` | `features/subjects/subjectApi.ts` | RTK Query: CRUD endpoints. Tags: `Subject`. |

### Interactions:

| Action | Behavior |
|--------|----------|
| **Search** | Client-side debounced filter (300ms) by subject name. |
| **Create** | Dialog (desktop) / page (mobile). `POST /subjects`. |
| **Edit** | Same form pre-populated. `PUT /subjects/:id`. |
| **Delete** | If has active assignments: ConfirmDialog warns "This subject is assigned in X divisions. Deleting will remove those assignments and flag Y timetables as outdated." On confirm: `DELETE /subjects/:id?confirm=true`. |

### Verification:

- CRUD works
- Search filters the list
- Delete warning shows when subject has assignments
- Card view on mobile
- Skeleton loading

---

## 15. Phase 8 — Teachers (Screens 6 & 7)

Split into 2 sub-parts because the Teacher Form has a complex availability grid.

### Phase 8A — Teachers List (Screen 6)

**Route**: `/teachers`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Teachers                                      [ + Add Teacher ] │
├──────────────────────────────────────────────────────────────────┤
│  Search: [______________]                                        │
│                                                                  │
│  ┌──────────────────┬───────────────────────┬────────┬─────────┐│
│  │  Teacher Name    │  Subjects Taught      │ Assign.│ Actions ││
│  ├──────────────────┼───────────────────────┼────────┼─────────┤│
│  │  Soumya          │  English              │  5     │  ✎  🗑  ││
│  │  Anu S Nair      │  Maths, Biology       │  8     │  ✎  🗑  ││
│  │  Divya           │  Physics              │  4     │  ✎  🗑  ││
│  └──────────────────┴───────────────────────┴────────┴─────────┘│
│                                                                  │
│  ◀ 1 2 3 ▶                                                      │
└──────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

Cards with teacher name, subject pills, assignment count, and action icons.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `TeacherListPage` | `features/teachers/TeacherListPage.tsx` | DataTable with search, pagination. |
| `teacherApi` | `features/teachers/teacherApi.ts` | RTK Query: CRUD + availability endpoints. Tags: `Teacher`. |

---

### Phase 8B — Add/Edit Teacher with Availability Grid (Screen 7)

**Route**: `/teachers/new` or `/teachers/:id/edit`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Teachers > Add Teacher                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Name:            [__________________] (required)                │
│  Contact Details: [__________________] (optional)                │
│                                                                  │
│  Subjects Qualified: [Multi-select dropdown]                     │
│    [English ✕] [Hindi ✕] [+ more]                               │
│                                                                  │
│  ─── Availability ─────────────────────────────────────────────  │
│                                                                  │
│  ┌───────┬────┬────┬────┬────┬────┬────┬────┬────┐             │
│  │       │ P1 │ P2 │ P3 │ P4 │ P5 │ P6 │ P7 │ P8 │             │
│  ├───────┼────┼────┼────┼────┼────┼────┼────┼────┤             │
│  │ Mon   │ ✓  │ ✓  │ ██ │ ██ │ ✓  │ ✓  │ ✓  │ ✓  │             │
│  │ Tue   │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │             │
│  │ Wed   │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ██ │ ✓  │ ✓  │             │
│  │ Thu   │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │             │
│  │ Fri   │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │ ✓  │             │
│  └───────┴────┴────┴────┴────┴────┴────┴────┴────┘             │
│  ██ = Unavailable (click to toggle)                              │
│                                                                  │
│  [ Save ]  [ Cancel ]                                            │
└──────────────────────────────────────────────────────────────────┘
```

A 2D grid: rows = working days, columns = period-type slots (breaks excluded). Click a cell to toggle unavailable (red/dark fill) vs. available (default). If multiple period structures exist with different slot counts, separate grid sections are shown with headers.

#### Mobile Layout — Availability:

```
┌──────────────────────────────────────────────────┐
│  ← Add Teacher                                    │
├──────────────────────────────────────────────────┤
│                                                   │
│  Name: [__________________]                       │
│  Contact: [__________________]                    │
│  Subjects: [Multi-select]                         │
│                                                   │
│  ─── Availability ─────────────────────           │
│                                                   │
│  Monday                                ▾          │
│  ┌──────────────────────────────────────────┐    │
│  │  P1 (09:00–09:45)    [ ✓ Available ]    │    │
│  │  P2 (09:45–10:30)    [ ✓ Available ]    │    │
│  │  P3 (10:45–11:30)    [ ✗ Unavailable ]  │    │
│  │  P4 (11:30–12:15)    [ ✗ Unavailable ]  │    │
│  │  P5 (12:45–13:30)    [ ✓ Available ]    │    │
│  │  P6 (13:30–14:15)    [ ✓ Available ]    │    │
│  │  P7 (14:30–15:15)    [ ✓ Available ]    │    │
│  │  P8 (15:15–16:00)    [ ✓ Available ]    │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  Tuesday                               ▾          │
│  (collapsed — tap to expand)                      │
│                                                   │
│  [ Save ]  [ Cancel ]                             │
└──────────────────────────────────────────────────┘
```

Key mobile change: The 2D grid becomes a **day-by-day accordion** with toggle switches (Available/Unavailable) per period.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `TeacherForm` | `features/teachers/TeacherForm.tsx` | Full form page. Name, contact, subjects multi-select, availability grid. |
| `AvailabilityGrid` | `features/teachers/AvailabilityGrid.tsx` | Desktop: 2D click-toggle grid. |
| `AvailabilityAccordion` | `features/teachers/AvailabilityAccordion.tsx` | Mobile: day-by-day accordion with switches. |

#### Zod Validation:

```typescript
const teacherSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactDetails: z.string().optional(),
  subjectIds: z.array(z.string()).min(1, 'At least one subject required'),
});
// Availability is managed as separate state (not in the form schema)
```

#### Verification:

- Form creates and edits teachers
- MultiSelect works for subjects
- Availability grid: toggle cells on desktop, toggle switches on mobile
- Multiple period structures show separate grid sections
- Save persists availability correctly
- Responsive layout switch at md breakpoint

---

## 16. Phase 9 — Classes & Divisions (Screens 8 & 9)

### Phase 9A — Classes List (Screen 8)

**Route**: `/classes`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Classes                                         [ + Add Class ] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┬────────────┬───────────────────┬─────────────┐│
│  │  Class Name  │ Divisions  │ Timetable Status  │  Actions    ││
│  ├──────────────┼────────────┼───────────────────┼─────────────┤│
│  │  Class I     │  3         │ 3/3 Generated     │  View       ││
│  │  Class II    │  2         │ 1/2 Generated     │  View       ││
│  │  Class XI    │  4         │ 2/4 Outdated ⚠    │  View       ││
│  │  Class XII   │  4         │ 4/4 Generated     │  View       ││
│  └──────────────┴────────────┴───────────────────┴─────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

Cards. Timetable status uses StatusBadge. View navigates to class detail.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `ClassListPage` | `features/classes/ClassListPage.tsx` | DataTable with class data. |
| `AddClassModal` | `features/classes/AddClassModal.tsx` | Dialog: single field — Class Name. `POST /config/classes`. |
| `classApi` | `features/classes/classApi.ts` | RTK Query: class CRUD + division CRUD. Tags: `Class`, `Division`. |

---

### Phase 9B — Class Detail & Division Management (Screen 9)

**Route**: `/classes/:classId`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Classes > Class XI                              [ + Add Division]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Division A — Science                                     │   │
│  │  Period Structure: [Senior Block ▾]                        │   │
│  │  Subjects: 9  │ Periods: 45/45 ✓ │ Status: Generated     │   │
│  │  [ Assignments ] [ Generate ] [ View TT ] [ 🗑 ]          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Division B — Science                                     │   │
│  │  Period Structure: [Senior Block ▾]                        │   │
│  │  Subjects: 9  │ Periods: 45/45 ✓ │ Status: Pending       │   │
│  │  [ Assignments ] [ Generate ] [ Copy ] [ 🗑 ]             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

Division cards stack vertically. On mobile, action buttons are replaced with a "⋯" menu that opens a bottom sheet (Sheet component) with: Assignments, Generate, View Timetable, Copy Division, Delete.

```
┌──────────────────────────────────────────────────┐
│  ← Class XI                      [ + Division ] │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Division A — Science            ⋯      │    │
│  │  9 subjects │ 45/45 ✓ │ Generated       │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Division B — Science            ⋯      │    │
│  │  9 subjects │ 45/45 ✓ │ Pending         │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
└──────────────────────────────────────────────────┘
```

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `ClassDetailPage` | `features/classes/ClassDetailPage.tsx` | Page showing all divisions for a class. |
| `DivisionCard` | `features/classes/DivisionCard.tsx` | Card with division stats, period structure dropdown (editable inline), and actions. |
| `AddDivisionModal` | `features/classes/AddDivisionModal.tsx` | Dialog: Division letter (auto-suggested), Stream name (only if class has `requires_stream`), Period Structure dropdown (from available list), "Copy assignments from" dropdown. |
| `DivisionActionSheet` | `features/classes/DivisionActionSheet.tsx` | Mobile bottom sheet with action list. |

#### Interactions:

| Action | Behavior |
|--------|----------|
| **Add Division** | Dialog. Auto-suggest next letter. Optional stream name (if class has `requires_stream`). Period Structure dropdown (from available list). Optional "copy from" division. `POST /config/divisions`. |
| **Change Period Structure** | Inline dropdown on DivisionCard. `PUT /config/divisions/:id` to update `period_structure_id`. Triggers timetable invalidation if changed. |
| **Copy Division** | Same as Add but pre-selects current division as copy source. |
| **Delete** | ConfirmDialog: warns about timetable and assignment deletion. `DELETE /config/divisions/:id`. |
| **Assignments** | Navigate to `/classes/:classId/divisions/:divisionId/assignments` (Screen 10). |
| **Generate** | Navigate to `/classes/:classId/divisions/:divisionId/generate` (Screen 11). |
| **View Timetable** | Navigate to `/classes/:classId/divisions/:divisionId/timetable` (Screen 12). |

#### Verification:

- Division cards show correct stats
- Mismatched period count shows amber warning
- Add/Copy division works
- Mobile uses bottom sheet for actions
- Delete warns correctly

---

## 17. Phase 10 — Division Assignments Editor (Screen 10)

**Route**: `/classes/:classId/divisions/:divisionId/assignments`

Split into 2 sub-parts.

### Phase 10A — Assignment Table & Basic CRUD

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Classes > Class XII > Division A > Assignments                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [ + Add Assignment ]  [ + Add Elective Assignment ]                 │
│                                                                      │
│  ┌──────────┬───────────┬────────────────┬──────┬───────┬──────────┐│
│  │ Subject  │ Teacher   │ Asst. Teacher  │ Wt.  │ Prefs │ Actions  ││
│  ├──────────┼───────────┼────────────────┼──────┼───────┼──────────┤│
│  │ English  │ Soumya    │ —              │  3   │ —     │ ✎  🗑    ││
│  │ English  │ Lin Maria │ —              │  2   │ —     │ ✎  🗑    ││
│  │  ↳ Total: 5 periods/week                                        ││
│  │ Physics  │ Divya     │ —              │  7   │ ⚙    │ ✎  🗑    ││
│  │ Chemistry│ Lin Maria │ —              │  7   │ —     │ ✎  🗑    ││
│  ├──────────┴───────────┴────────────────┴──────┴───────┴──────────┤│
│  │ ⟐ Elective: Biology / Computer Science              Wt: 9      ││
│  │  ├─ Biology          │ Anu S Nair    │ —              │         ││
│  │  └─ Computer Science │ Swetha        │ —              │  ✎  🗑  ││
│  ├──────────┬───────────┬────────────────┬──────┬───────┬──────────┤│
│  │ Hindi    │ Lalitha   │ —              │  4   │ —     │ ✎  🗑    ││
│  │ PE       │ Shijo     │ —              │  4   │ —     │ ✎  🗑    ││
│  └──────────┴───────────┴────────────────┴──────┴───────┴──────────┘│
│                                                                      │
│  Total: 45 / 45 periods                                 Balanced ✓  │
│                                                                      │
│  [ → Generate Timetable ]                                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

```
┌──────────────────────────────────────────────────┐
│  ← Division A Assignments                         │
├──────────────────────────────────────────────────┤
│  [ + Assignment ] [ + Elective ]                  │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  English                                  │    │
│  │  Teacher: Soumya                          │    │
│  │  Weightage: 5 periods                     │    │
│  │  ────────────────  [✎] [🗑]              │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  ⟐ Elective: Biology / CS               │    │
│  │  ├─ Biology — Anu S Nair                 │    │
│  │  └─ Comp Sci — Swetha                    │    │
│  │  Weightage: 9 periods                     │    │
│  │  ────────────────  [✎] [🗑]              │    │
│  └──────────────────────────────────────────┘    │
│  ...                                              │
│                                                   │
│  Total: 45/45 ✓ Balanced                         │
│  [ → Generate Timetable ]                        │
│                                                   │
└──────────────────────────────────────────────────┘
```

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `AssignmentEditorPage` | `features/assignments/AssignmentEditorPage.tsx` | Page with assignment list, totals bar, and generate shortcut. |
| `AssignmentRow` | `features/assignments/AssignmentRow.tsx` | Desktop table row for a regular assignment. |
| `AssignmentCard` | `features/assignments/AssignmentCard.tsx` | Mobile card for a regular assignment. |
| `ElectiveGroupRow` | `features/assignments/ElectiveGroupRow.tsx` | Grouped row for elective assignments. |
| `TotalBar` | `features/assignments/TotalBar.tsx` | Bottom bar: "Total: X / Y periods. Balanced ✓ / Unbalanced ⚠" |
| `assignmentApi` | `features/assignments/assignmentApi.ts` | RTK Query: CRUD for assignments + elective assignments. Tags: `Assignment`. |
| `PreferencesSection` | `features/assignments/PreferencesSection.tsx` | Collapsible scheduling preferences form section. Used in both regular and elective assignment modals. |

---

### Phase 10B — Add/Edit Assignment Modals

#### Add Assignment Modal:

| Field | Type | Behavior |
|-------|------|----------|
| Subject | Searchable dropdown | All subjects for this school |
| Teacher | Searchable dropdown | Filtered: only teachers qualified for the selected subject |
| Assistant Teacher | Searchable dropdown (optional) | Filtered: qualified for the subject, excludes selected primary teacher |
| Weightage | Number input | Min 1. Represents periods per week. |

**Multi-teacher note**: The same subject may be assigned multiple times with different teachers. When adding a subject that already exists in this division, the Subject dropdown allows re-selection but the Teacher dropdown excludes teachers already assigned to that subject in this division. The Weightage for each teacher entry is independent.

**Scheduling Preferences** (collapsible section, all fields optional):

| Field | Type | Behavior |
|-------|------|----------|
| Constraint Type | Toggle: Hard / Soft | Determines whether preferences are enforced strictly or best-effort. Default: Soft. |
| Preferred Days | Multi-checkbox (Mon–Sun) | Only working days from the period structure are shown. |
| Excluded Days | Multi-checkbox (Mon–Sun) | Cannot overlap with Preferred Days. Validated inline. |
| Preferred Period Range | Two number inputs (min–max) | Period numbers within the structure's range. |
| Excluded Period Range | Two number inputs (min–max) | Cannot overlap with Preferred Period Range. |
| Prefer Adjacent Periods | Toggle switch | When on, the engine groups this subject's periods together on the same day. |
| Max Periods Per Day | Number input | Must be ≥ 1 and ≤ weightage. |
| Min Periods Per Day | Number input | Must be ≥ 1 and ≤ Max Periods Per Day. |

On mobile: full-screen form instead of modal.

#### Add Elective Assignment Modal:

| Field | Type | Behavior |
|-------|------|----------|
| Elective Group | Dropdown | All elective groups for this school/year |
| For each subject in group: Teacher | Searchable dropdown | Qualified teachers, no duplicate across subjects in the group |
| Weightage | Number input | Single value applied to all subjects in the group |

**Cross-division note**: When assigning an elective group that is already assigned to another division of the same class (e.g., XII B already has "Bio/Maths"), the teacher fields are **auto-filled and locked** to match the existing assignment. A notice is shown: "This elective group is shared with Division B. Teachers are synchronized across all divisions." Changing a teacher updates all linked divisions.

**Scheduling Preferences** (same as regular assignment — applies to the entire elective group):

Same fields as above. Preferences govern the time slots assigned to the entire elective group. All subjects in the group are co-scheduled, so the preference applies to the group as a whole.

#### Verification:

- Adding/editing/deleting regular and elective assignments works
- Teacher dropdown filters correctly based on selected subject
- Total bar updates in real time
- Balanced/Unbalanced status correct
- Generate shortcut navigates correctly
- Mobile uses full-screen forms
- Scheduling preferences section shows/hides in add/edit modal and persists correctly

---

## 18. Phase 11 — Elective Groups Management

**Route**: `/elective-groups`

### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Elective Groups                        [ + Add Elective Group ] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────┬────────────────────┬────────┬──────┐│
│  │  Group Name            │ Subjects           │ Used In│ Act. ││
│  ├────────────────────────┼────────────────────┼────────┼──────┤│
│  │  Biology / Comp Sci    │ Biology, Comp Sci  │ 4 div. │ ✎ 🗑 ││
│  │  Maths / IP            │ Maths, IP          │ 2 div. │ ✎ 🗑 ││
│  └────────────────────────┴────────────────────┴────────┴──────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile Layout:

Cards. Subject names shown as pills.

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `ElectiveGroupListPage` | `features/elective-groups/ElectiveGroupListPage.tsx` | DataTable with group data. |
| `ElectiveGroupModal` | `features/elective-groups/ElectiveGroupModal.tsx` | Dialog: Name + subjects multi-select (min 2). |
| `electiveGroupApi` | `features/elective-groups/electiveGroupApi.ts` | RTK Query: CRUD. Tags: `ElectiveGroup`. |

### Interactions:

| Action | Behavior |
|--------|----------|
| **Add** | Dialog: Name + MultiSelect subjects (min 2). `POST /elective-groups`. |
| **Edit** | Pre-populated dialog. Warns if assigned to divisions about cascade effects. |
| **Delete** | If in use (409): ConfirmDialog explains dissolution. On confirm: `DELETE /elective-groups/:id?confirm=true`. Affected timetables flagged OUTDATED. |

### Verification:

- CRUD works
- Min 2 subjects enforced
- Delete cascade warning
- Mobile card layout

---

## 19. Phase 12 — Timetable Generator (Screen 11)

**Route**: `/classes/:classId/divisions/:divisionId/generate`

### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Classes > Class VII > Division A > Generate Timetable           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Division: Class VII A                                           │
│  Assignments: 12 subjects, 40 periods/week                      │
│  Period Structure: Middle Block (Mon–Sat, 8 periods/day)         │
│                                                                  │
│  Status: ● Generated (March 10, 2026)                            │
│                                                                  │
│  ─── Generation Options ──────────────────────────────────────── │
│                                                                  │
│  Adjacency Constraint:  [OFF ◉──○ ON]                           │
│  When ON, repeated subjects on the same day are placed in        │
│  consecutive periods with no gaps.                               │
│                                                                  │
│  ─────────────────────────────────────────────────────────────── │
│                                                                  │
│  [ ▶ Generate Timetable ]    [ View / Edit Timetable → ]        │
│                                                                  │
│  ─── Generation History ──────────────────────────────────────── │
│  ┌───────────┬──────────┬──────────┬───────────┬───────────────┐│
│  │ Job ID    │ Started  │ Duration │ Status    │ Adjacency     ││
│  ├───────────┼──────────┼──────────┼───────────┼───────────────┤│
│  │ ...a3f2   │ 10 Mar   │ 47s      │ ✓ Done   │ OFF           ││
│  │ ...b1c8   │ 08 Mar   │ 3m 12s   │ ✗ Failed │ ON            ││
│  └───────────┴──────────┴──────────┴───────────┴───────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile Layout:

Same content, single column. Generation history table becomes cards. Status badge and adjacency toggle are full-width. 

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `GeneratorPage` | `features/timetable/GeneratorPage.tsx` | Generator page with status, options, and history. |
| `GenerationStatus` | `features/timetable/GenerationStatus.tsx` | Status badge: Not Generated (grey), Generated (green + date), Outdated (amber). |
| `GeneratingOverlay` | `features/timetable/GeneratingOverlay.tsx` | Pulsing animation + "Generating timetable… This may take up to 5 minutes." Replaces Generate button while in progress. |
| `GenerationHistory` | `features/timetable/GenerationHistory.tsx` | Table/cards of past generation jobs. |
| `timetableApi` | `features/timetable/timetableApi.ts` | RTK Query: generation trigger, job status, timetable CRUD. Tags: `Timetable`, `GenerationJob`. |

### Generating State Flow:

1. User clicks "Generate Timetable"
2. If timetable exists: ConfirmDialog "Existing timetable will be overwritten."
3. On confirm: `POST /timetables/generate` → receives `jobId`
4. UI swaps to `GeneratingOverlay` with pulsing animation
5. **Polling** (not WebSocket — per Phase 16): `GET /timetables/jobs/:jobId` every 5 seconds via RTK Query `pollingInterval: 5000`
6. On `COMPLETED`: toast success, refresh status, stop polling
7. On `FAILED`: toast error with message, refresh status, stop polling

### Verification:

- Generate triggers API call
- Confirmation dialog if existing timetable
- Generating state shows pulsing overlay
- Polling updates status on completion/failure
- History table shows past jobs
- View/Edit button appears only when timetable exists
- Adjacency toggle works

---

## 20. Phase 13 — Timetable Editor (Screen 12)

This is the most complex screen. Split into 3 sub-parts.

### Phase 13A — Grid Layout & Read-Only View

**Route**: `/classes/:classId/divisions/:divisionId/timetable`

#### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Classes > Class VII > Division A > Timetable                                │
│                                                           [ Export ▾ ] [Save]│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────┬─────────┬─────────┬─────────┬─────────┬────────┬───────────────┐│
│  │        │ P1      │ P2      │ Break   │ P3      │ P4     │ Lunch   ...   ││
│  │        │ 9:00-   │ 9:45-   │ 10:30-  │ 10:45-  │ 11:30- │ 12:15-  ...   ││
│  │        │ 9:45    │ 10:30   │ 10:45   │ 11:30   │ 12:15  │ 12:45   ...   ││
│  ├────────┼─────────┼─────────┼─────────┼─────────┼────────┼───────────────┤│
│  │ Monday │ English │ Maths   │ ░░░░░░░ │ Science │ Hindi  │ ░░░░░░░ ...   ││
│  │        │ Soumya  │ Ashitha │ ░░░░░░░ │ Roshni  │ Lalitha│ ░░░░░░░ ...   ││
│  ├────────┼─────────┼─────────┼─────────┼─────────┼────────┼───────────────┤│
│  │ Tuesday│ Science │ English │ ░░░░░░░ │ Maths   │ Hindi  │ ░░░░░░░ ...   ││
│  │        │ Roshni  │ Soumya  │ ░░░░░░░ │ Ashitha │ Lalitha│ ░░░░░░░ ...   ││
│  ├────────┼─────────┼─────────┼─────────┼─────────┼────────┼───────────────┤│
│  │  ...   │  ...    │  ...    │ ░░░░░░░ │  ...    │  ...   │ ░░░░░░░ ...   ││
│  └────────┴─────────┴─────────┴─────────┴─────────┴────────┴───────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout:

```
┌──────────────────────────────────────────────────┐
│  ← Division A Timetable             [ Export ▾ ] │
├──────────────────────────────────────────────────┤
│                                                   │
│  ⚠ Editing is available on desktop/landscape      │
│                                                   │
│  ← swipe horizontally →                          │
│  ┌────────┬─────────┬─────────┬─────────┬──────┐│
│  │        │ P1      │ P2      │ Break   │ P3   ││
│  ├────────┼─────────┼─────────┼─────────┼──────┤│
│  │ Mon    │ Eng     │ Math    │ ░░░░░░░ │ Sci  ││
│  │        │ Soumya  │ Ashitha │ ░░░░░░░ │Roshni││
│  ├────────┼─────────┼─────────┼─────────┼──────┤│
│  │ Tue    │ Sci     │ Eng     │ ░░░░░░░ │ Math ││
│  │        │ Roshni  │ Soumya  │ ░░░░░░░ │Ashi. ││
│  └────────┴─────────┴─────────┴─────────┴──────┘│
│                                                   │
│  (horizontal scroll for more columns)             │
│                                                   │
└──────────────────────────────────────────────────┘
```

Mobile: view-only grid with horizontal scroll. No drag-and-drop on mobile. A banner informs users to use desktop for editing. Export buttons are still available.

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `TimetableEditorPage` | `features/timetable/TimetableEditorPage.tsx` | Page wrapper. Loads timetable data. Shows grid + conflict panel. |
| `TimetableGrid` | `features/timetable/TimetableGrid.tsx` | The timetable grid. Rows = days, Columns = slots (periods + breaks). |
| `TimetableCell` | `features/timetable/TimetableCell.tsx` | Single period cell. Shows Subject (bold) + Teacher name. Background color derived from subject (consistent hash-based color). Assistant teacher shown on second line. |
| `BreakCell` | `features/timetable/BreakCell.tsx` | Grey hatched cell for breaks/lunch. Non-interactive. |
| `ElectiveCell` | `features/timetable/ElectiveCell.tsx` | Stacked split cell showing all subjects in an elective group. |
| `ColumnHeader` | `features/timetable/ColumnHeader.tsx` | Slot label + time range. |

#### Subject Color System:

Each subject gets a consistent background color derived from a hash of the subject name:

```typescript
function getSubjectColor(subjectName: string): string {
  const colors = [
    'bg-blue-100 dark:bg-blue-900/30',
    'bg-green-100 dark:bg-green-900/30',
    'bg-purple-100 dark:bg-purple-900/30',
    'bg-orange-100 dark:bg-orange-900/30',
    'bg-pink-100 dark:bg-pink-900/30',
    'bg-cyan-100 dark:bg-cyan-900/30',
    'bg-yellow-100 dark:bg-yellow-900/30',
    'bg-red-100 dark:bg-red-900/30',
  ];
  const hash = subjectName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
```

#### Verification:

- Grid renders correctly with all days and slots
- Break columns are non-interactive grey hatched
- Subject colors are consistent
- Elective cells show stacked subjects
- Mobile: horizontal scroll works, edit banner shown
- Skeleton loading for the grid

---

### Phase 13B — Drag-and-Drop & Conflict Panel

**Goal**: Make the timetable grid interactive with DnD swapping and real-time conflict detection.

#### Drag-and-Drop:

```typescript
// TimetableGrid.tsx — DnD context
<DndContext
  sensors={sensors}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
  onDragCancel={handleDragCancel}
>
  {/* Grid with draggable cells */}
  <DragOverlay>
    {activeDrag && <TimetableCell slot={activeDrag} isDragging />}
  </DragOverlay>
</DndContext>
```

- **Drag a cell to another**: cells swap positions (optimistic update)
- **Drag to empty**: cell moves to empty slot (optimistic update)
- On drop: `POST /timetables/:id/validate-move` to check for conflicts
- **Hard conflict**: move reverted with shake animation, error toast
- **Soft conflict**: move applied, conflict panel updates with warning

#### DnD Constraints:

| Rule | Enforcement |
|------|-------------|
| Cannot drag to break/lunch columns | Drop target disabled for break cells |
| Elective groups drag as a unit | All subjects in the group move together |
| Only works on desktop (lg+) | DnD context disabled at sm/md breakpoints |

#### Conflict Panel:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ─── Conflicts ──────────────────────────────────────────────────── │
│                                                                      │
│  🔴 Teacher conflict: Soumya is already teaching Class VII B P3     │
│     → Click to highlight affected cell                              │
│                                                                      │
│  🟡 Adjacency warning: English has non-consecutive periods on Wed   │
│     → Click to highlight affected cells                             │
│                                                                      │
│  🟡 Preference warning: Physics prefers periods 1-3, placed in P6   │
│     → Click to highlight affected cell                              │
│                                                                      │
│  🔴 Adjacent teacher conflict: English P3-P4 on Mon assigned to     │
│     different teachers (Soumya P3, Lin Maria P4). Must be same.     │
│     → Click to highlight affected cells                             │
│                                                                      │
│  ────────────────────────────────────────────────────────────────── │
│  3 conflicts (1 error, 2 warnings)                                   │
└──────────────────────────────────────────────────────────────────────┘
```

- Below the grid
- 🔴 Errors = hard conflicts (must fix)
- 🟡 Warnings = soft conflicts (can ignore)
- Clicking a conflict scrolls to and pulses the affected cell
- "No conflicts detected ✓" when clean

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `DraggableTimetableCell` | `features/timetable/DraggableTimetableCell.tsx` | Wraps TimetableCell with @dnd-kit draggable behavior. |
| `DroppableSlot` | `features/timetable/DroppableSlot.tsx` | Drop target wrapper for each grid cell. |
| `ConflictPanel` | `features/timetable/ConflictPanel.tsx` | Lists all conflicts with severity, description, and click-to-highlight. |
| `ConflictHighlight` | `features/timetable/ConflictHighlight.tsx` | Pulse animation overlay on affected cells. |

#### Save & Discard:

| Action | Behavior |
|--------|----------|
| **Save** | `PUT /timetables/:id/slots` with full slot array. Disabled when no unsaved changes. Toast on success. |
| **Discard** | ConfirmDialog if unsaved changes exist. Reverts to last saved state. |

#### Verification:

- Drag-and-drop swaps cells correctly
- Optimistic updates with rollback on hard conflict
- Shake animation on rejected move
- Conflict panel updates in real time
- Click-to-highlight works
- Save/Discard work correctly
- DnD disabled on mobile

---

### Phase 13C — Export Integration

**Goal**: Add comprehensive export capabilities for all timetable scopes: per division, per class, per teacher, all teachers, and custom teacher groups.

#### Export Dropdown (on Timetable Editor — Screen 12):

```
[ Export ▾ ]
┌────────────────────────────┐
│ 📄 Division PDF            │
│ 📊 Division Excel          │
│ ─────────────────────────  │
│ 📄 Class PDF (all divs)   │
│ 📊 Class Excel (all divs) │
└────────────────────────────┘
```

#### Export Dropdown (on Teacher Timetable — Screen 14):

```
[ Export ▾ ]
┌────────────────────────────────┐
│ 📄 This Teacher — PDF          │
│ 📊 This Teacher — Excel        │
│ ──────────────────────────────-│
│ 📄 All Teachers — PDF          │
│ 📊 All Teachers — Excel        │
│ ──────────────────────────────-│
│ 📄 Select Teachers — PDF...    │
│ 📊 Select Teachers — Excel...  │
└────────────────────────────────┘
```

"Select Teachers" opens a modal with a searchable multi-select of teachers, then exports the selected group.

**Visible only when timetable data exists** (per user requirement).

#### Export Flow:

1. User selects an export option from the dropdown
2. For "Select Teachers" options: a modal opens with teacher multi-select, then user confirms
3. Button enters loading state (spinner + "Generating...")
4. RTK Query mutation to the appropriate endpoint:
   - `POST /export/division/pdf` or `/export/division/excel` (body: `{ divisionId }`)
   - `POST /export/class/pdf` or `/export/class/excel` (body: `{ classId }`)
   - `POST /export/teacher/pdf` or `/export/teacher/excel` (body: `{ teacherId }`)
   - `POST /export/teachers/pdf` or `/export/teachers/excel` (body: `{ teacherIds: [...] }`, empty = all)
5. On success: receive `{ url }` (pre-signed S3 URL)
6. Trigger browser download: create `<a>` element, set href, click
7. Button returns to idle state
8. On error: toast with error message, button returns to idle

#### Components:

| Component | File | Description |
|-----------|------|-------------|
| `ExportDropdown` | `features/export/ExportDropdown.tsx` | Dropdown with scope-aware options (division/class on Screen 12, teacher options on Screen 14). Loading states per option. |
| `TeacherSelectModal` | `features/export/TeacherSelectModal.tsx` | Modal with searchable multi-select for choosing a group of teachers to export. |
| `exportApi` | `features/export/exportApi.ts` | RTK Query mutations: `useExportDivisionPdfMutation`, `useExportDivisionExcelMutation`, `useExportClassPdfMutation`, `useExportClassExcelMutation`, `useExportTeacherPdfMutation`, `useExportTeacherExcelMutation`, `useExportTeachersPdfMutation`, `useExportTeachersExcelMutation`. |

#### Verification:

- Export buttons only visible when timetable exists
- Loading state during export generation
- Download triggers automatically on success
- Error toast on failure
- Class-level export includes all divisions
- All-teachers export includes every teacher
- Custom group export opens teacher selection modal
- Works on both desktop and mobile

---

## 21. Phase 14 — Notifications (Screen 13)

**Route**: `/notifications`

### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  Notifications — Affected Timetables              [ Dismiss All ]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────┬────────────┬──────────────────┬────────┬────────┐│
│  │ Class     │ Division   │ Conflict Type    │ Date   │Actions ││
│  ├───────────┼────────────┼──────────────────┼────────┼────────┤│
│  │ Class VII │ Division A │ TEACHER_REMOVED  │ Mar 11 │Edit  ✕ ││
│  │           │            │ Julie was deleted│        │        ││
│  ├───────────┼────────────┼──────────────────┼────────┼────────┤│
│  │ Class XI  │ Div A Sci  │ WEIGHTAGE_CHANGED│ Mar 10 │Edit  ✕ ││
│  │           │            │ Physics: 7→6     │        │        ││
│  └───────────┴────────────┴──────────────────┴────────┴────────┘│
│                                                                  │
│  3 notifications                                                 │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile Layout:

```
┌──────────────────────────────────────────────────┐
│  Notifications                    [ Dismiss All ] │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Class VII > Division A                   │    │
│  │  TEACHER_REMOVED — Julie was deleted      │    │
│  │  March 11, 2026                           │    │
│  │  ──────────────── [Edit TT]  [✕ Dismiss] │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │  Class XI > Div A Sci                     │    │
│  │  WEIGHTAGE_CHANGED — Physics: 7→6         │    │
│  │  March 10, 2026                           │    │
│  │  ──────────────── [Edit TT]  [✕ Dismiss] │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  3 notifications                                  │
└──────────────────────────────────────────────────┘
```

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `NotificationListPage` | `features/notifications/NotificationListPage.tsx` | Page with notification table/cards. Paginated (20/page). |
| `NotificationRow` | `features/notifications/NotificationRow.tsx` | Desktop table row with conflict type badge, description, and actions. |
| `NotificationCard` | `features/notifications/NotificationCard.tsx` | Mobile card variant. |
| `notificationApi` | `features/notifications/notificationApi.ts` | RTK Query: `useGetNotificationsQuery`, `useGetNotificationCountQuery` (polling 60s), `useDismissNotificationMutation`, `useDismissAllNotificationsMutation`. Tags: `Notification`, `NotificationCount`. |

### Conflict Type Badges:

| Type | Badge Color | Description Example |
|------|------------|---------------------|
| `TEACHER_REMOVED` | Red | "Julie was deleted" |
| `TEACHER_AVAILABILITY_CHANGED` | Amber | "Soumya — Mon P3 now unavailable" |
| `SUBJECT_REMOVED` | Red | "Physics was deleted" |
| `WEIGHTAGE_CHANGED` | Amber | "Physics: 7 → 6 periods" |
| `ASSIGNMENT_REMOVED` | Red | "English assignment removed" |
| `SLOT_STRUCTURE_CHANGED` | Red | "Period structure modified" |
| `ELECTIVE_GROUP_CHANGED` | Amber | "Biology/CS group modified" |

### Interactions:

| Action | Behavior |
|--------|----------|
| **Edit** | Navigate to Screen 12 for the affected division. |
| **Dismiss (✕)** | `PATCH /notifications/:id/dismiss`. Row fades out. Timetable remains OUTDATED. |
| **Dismiss All** | ConfirmDialog → `PATCH /notifications/dismiss-all`. |

### Empty State:

"All timetables are up to date. No conflicts detected. ✓" with a checkmark illustration.

### Sidebar Badge:

The "Notifications" sidebar link shows a count badge (red circle with number) when `notificationCount > 0`. Updated via RTK Query polling every 60 seconds.

### Verification:

- Notifications load and paginate
- Dismiss works (single and all)
- Sidebar badge updates
- Conflict type badges render correctly
- Edit navigates to correct timetable
- Empty state shows when no notifications
- Responsive: table to cards

---

## 22. Phase 15 — Teacher Timetable View (Screen 14)

**Route**: `/teacher-timetable`

### Desktop Layout:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Teacher Timetable View                                        [ Export ▾ ] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Select Teacher: [ Anu S Nair ▾ ]                                           │
│                                                                              │
│  ┌────────┬────────────┬────────────┬────────┬────────────┬────────────────┐│
│  │        │ P1         │ P2         │ Break  │ P3         │ P4       ...   ││
│  │        │ 9:00-9:45  │ 9:45-10:30 │        │ 10:45-11:30│ 11:30-   ...   ││
│  ├────────┼────────────┼────────────┼────────┼────────────┼────────────────┤│
│  │ Monday │ Maths      │ Maths      │ ░░░░░░ │ Biology    │ —        ...   ││
│  │        │ Class VII A│ Class VII B│ ░░░░░░ │ XII A Sci  │          ...   ││
│  ├────────┼────────────┼────────────┼────────┼────────────┼────────────────┤│
│  │ Tuesday│ Biology    │ —          │ ░░░░░░ │ Maths      │ Maths    ...   ││
│  │        │ XII B Sci  │            │ ░░░░░░ │ Class VII A│ Class X A ...   ││
│  └────────┴────────────┴────────────┴────────┴────────────┴────────────────┘│
│                                                                              │
│  Summary: 38 periods / week across 8 divisions                               │
│  Periods with assistant role: 3 (marked with *)                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout:

Same horizontal-scroll approach as Screen 12 mobile. Teacher selector is above the grid as a full-width dropdown. Summary below the grid.

### Components:

| Component | File | Description |
|-----------|------|-------------|
| `TeacherTimetablePage` | `features/teacher-timetable/TeacherTimetablePage.tsx` | Page with teacher dropdown, read-only grid, summary, and export. |
| `TeacherTimetableGrid` | `features/teacher-timetable/TeacherTimetableGrid.tsx` | Read-only grid. Reuses `TimetableGrid` component in read-only mode. |
| `TeacherCell` | `features/teacher-timetable/TeacherCell.tsx` | Cell: Subject + Class/Division. Assistant role marked with "(Asst)" and subtle border. |
| `TeacherSummary` | `features/teacher-timetable/TeacherSummary.tsx` | Summary bar: total periods, division count, assistant count. |
| `teacherTimetableApi` | `features/teacher-timetable/teacherTimetableApi.ts` | RTK Query: `useGetTeacherTimetableQuery`. |

### Cross-Structure Display:

If a teacher teaches across divisions with different period structures, the grid shows **separate sections** with a structure-name header row:

```
─── Senior Block (Mon–Fri, 8 periods) ───
[grid for senior block divisions]

─── Primary Block (Mon–Fri, 6 periods) ───
[grid for primary block divisions]
```

### Export:

ExportDropdown (same component from Phase 13C) with teacher-specific endpoints: `POST /export/teacher/pdf` and `POST /export/teacher/excel`. **Visible only when a teacher is selected and has timetable data.**

### Verification:

- Teacher dropdown loads all teachers
- Grid renders correctly for selected teacher
- Free periods show "—"
- Assistant role marked correctly
- Cross-structure sections render when applicable
- Export works for teacher timetables
- Responsive

---

## 23. Phase 16 — WebSocket Integration

**Goal**: Add WebSocket support for real-time timetable generation progress updates. This enhances the polling-based approach from Phase 12.

### Implementation:

#### useWebSocket Hook:

```typescript
// hooks/useWebSocket.ts
const WS_URL = import.meta.env.VITE_WS_URL;

function useWebSocket() {
  const token = useSelector(selectToken);
  const dispatch = useDispatch();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const MAX_RETRIES = 5;

  const connect = useCallback(() => {
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => {
      retriesRef.current = 0;
      dispatch(setWsConnected(true));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'GENERATION_COMPLETE':
          dispatch(timetableApi.util.invalidateTags(['Timetable', 'GenerationJob']));
          toast.success('Timetable generated successfully!');
          break;
        case 'GENERATION_FAILED':
          dispatch(timetableApi.util.invalidateTags(['GenerationJob']));
          toast.error(`Generation failed: ${msg.payload.error}`);
          break;
      }
    };

    ws.onclose = () => {
      dispatch(setWsConnected(false));
      if (retriesRef.current < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retriesRef.current, 30000);
        setTimeout(connect, delay);
        retriesRef.current++;
      }
    };

    wsRef.current = ws;
  }, [token, dispatch]);

  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [connect]);
}
```

#### Redux Slice:

```typescript
// slices/wsSlice.ts
const wsSlice = createSlice({
  name: 'ws',
  initialState: { connected: false },
  reducers: {
    setWsConnected: (state, action) => { state.connected = action.payload; },
  },
});
```

#### Fallback Polling:

If `wsConnected === false` and a generation job is in-progress, the UI continues polling `GET /timetables/jobs/:jobId` every 5 seconds.

#### Integration Points:

- `useWebSocket()` hook called in `AppShell` (runs once per authenticated session)
- WebSocket status indicator in the TopBar (optional: small green/red dot)
- Generator page (Screen 11) uses WebSocket messages OR polling fallback

### Verification:

- WebSocket connects with token
- Reconnects with exponential backoff
- Generation events trigger cache invalidation and toast
- Fallback polling works when WS disconnected

---

## 24. Phase 17 — i18n Setup

**Goal**: Extract all hardcoded strings into translation files. Structure for future language support.

### Translation File Structure:

```
src/i18n/locales/en/
├── common.json         # Shared: buttons, labels, errors, navigation
├── auth.json           # Login, register, forgot password
├── dashboard.json      # Dashboard page
├── academicYears.json  # Academic years page
├── periodStructures.json
├── subjects.json
├── teachers.json
├── classes.json
├── assignments.json
├── electiveGroups.json
├── timetable.json      # Generator + editor
├── notifications.json
├── teacherTimetable.json
├── export.json
└── errors.json         # API error messages
```

### Example — common.json:

```json
{
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "create": "Create",
    "confirm": "Confirm",
    "dismiss": "Dismiss",
    "dismissAll": "Dismiss All",
    "retry": "Retry",
    "goHome": "Go Home",
    "viewAll": "View All",
    "export": "Export",
    "search": "Search..."
  },
  "status": {
    "active": "Active",
    "inactive": "Inactive",
    "archived": "Archived",
    "generated": "Generated",
    "outdated": "Outdated",
    "pending": "Pending",
    "loading": "Loading..."
  },
  "pagination": {
    "previous": "Previous",
    "next": "Next",
    "showing": "Showing {{from}} to {{to}} of {{total}}"
  },
  "errors": {
    "somethingWentWrong": "Something went wrong",
    "networkError": "Unable to connect. Please check your internet connection.",
    "notFound": "Page not found",
    "unauthorized": "Your session has expired. Please log in again."
  },
  "readOnly": {
    "banner": "You are viewing archived data ({{year}}). Changes are disabled."
  }
}
```

### Usage Pattern:

```typescript
import { useTranslation } from 'react-i18next';

function SaveButton() {
  const { t } = useTranslation();
  return <Button>{t('actions.save')}</Button>;
}
```

### Verification:

- All user-facing strings use `t()` function
- No hardcoded English text in components
- Loading the en locale works correctly
- Adding a new locale file (e.g., `hi/common.json`) is straightforward

---

## 25. Phase 18 — Final Responsive Polish & QA

**Goal**: Final pass across all screens to ensure consistent responsive behavior, dark mode correctness, and smooth interactions.

### Checklist per Screen:

| Check | Description |
|-------|-------------|
| **xl (1440px+)** | Full sidebar, full tables, all features visible |
| **lg (1024–1439px)** | Collapsed sidebar, full tables, all features visible |
| **md (640–1023px)** | Bottom tab bar, mobile header, cards instead of tables |
| **sm (<640px)** | Bottom tab bar, mobile header, cards, simplified layouts |
| **Dark mode** | All components, gradients, and charts correct in dark mode |
| **Loading states** | Skeleton placeholders for every data-dependent component |
| **Empty states** | EmptyState component shown when lists are empty |
| **Error states** | Error boundaries catch errors, toast for API failures |
| **Keyboard nav** | Tab order logical, Enter submits forms, Escape closes modals |
| **Setup wizard** | FAB visible on all pages (except login), popover panel (desktop) / bottom sheet (mobile), dashboard cards, dismiss/resume all working across breakpoints |
| **Touch targets** | All interactive elements ≥ 44px on mobile |
| **Scroll behavior** | No horizontal scroll on mobile (except timetable grid intentionally) |
| **Focus management** | Dialog opens → focus first input. Dialog closes → focus trigger. |

### Cross-Browser Testing:

| Browser | Coverage |
|---------|----------|
| Chrome (latest) | Primary |
| Firefox (latest) | Secondary |
| Safari (latest) | Secondary |
| Edge (latest) | Secondary |
| Chrome Mobile | Mobile primary |
| Safari Mobile | Mobile secondary |

### Verification:

- Complete walkthrough of all screens at each breakpoint
- Dark mode toggle on every screen
- No layout shifts or broken components
- All interactions functional

---

## 26. RTK Query API Slices Summary

Each API slice connects to a backend microservice. Created incrementally as each feature phase is completed.

| API Slice | File | Base URL | Tags | Phase |
|-----------|------|----------|------|-------|
| `authApi` | `features/auth/authApi.ts` | `/auth` | — | 3 |
| `dashboardApi` | `features/dashboard/dashboardApi.ts` | `/dashboard` | `DashboardSummary`, `SetupWizard` | 4 |
| `academicYearApi` | `features/academic-years/academicYearApi.ts` | `/academic-years` | `AcademicYear` | 5 |
| `configApi` | `features/period-structures/configApi.ts` | `/config` | `PeriodStructure`, `Class` | 6, 9 |
| `subjectApi` | `features/subjects/subjectApi.ts` | `/subjects` | `Subject` | 7 |
| `teacherApi` | `features/teachers/teacherApi.ts` | `/teachers` | `Teacher` | 8 |
| `classApi` | `features/classes/classApi.ts` | `/config` (classes + divisions) | `Class`, `Division` | 9 |
| `assignmentApi` | `features/assignments/assignmentApi.ts` | `/assignments` | `Assignment` | 10 |
| `electiveGroupApi` | `features/elective-groups/electiveGroupApi.ts` | `/elective-groups` | `ElectiveGroup` | 11 |
| `timetableApi` | `features/timetable/timetableApi.ts` | `/timetables` | `Timetable`, `GenerationJob` | 12, 13 |
| `notificationApi` | `features/notifications/notificationApi.ts` | `/notifications` | `Notification`, `NotificationCount` | 14 |
| `teacherTimetableApi` | `features/teacher-timetable/teacherTimetableApi.ts` | `/timetables` | `TeacherTimetable` | 15 |
| `exportApi` | `features/export/exportApi.ts` | `/export` | — | 13C (8 mutation endpoints: division/class/teacher/teachers × pdf/excel) |

### Cross-Slice Cache Invalidation:

When a mutation in one slice affects another, the mutation handler manually invalidates related tags:

| Mutation | Invalidates |
|----------|-------------|
| Create/Update/Delete Subject | `Subject`, `DashboardSummary`, `SetupWizard` |
| Create/Update/Delete Teacher | `Teacher`, `DashboardSummary`, `SetupWizard` |
| Delete Subject/Teacher with assignments | `Subject`/`Teacher`, `Assignment`, `NotificationCount`, `DashboardSummary`, `SetupWizard` |
| Create/Update/Delete Assignment | `Assignment`, `DashboardSummary`, `SetupWizard` |
| Create/Update/Delete Class/Division | `Class`, `Division`, `DashboardSummary`, `SetupWizard` |
| Assign Period Structure to Division | `Division`, `PeriodStructure`, `SetupWizard` |
| Regenerate Timetable | `Timetable`, `GenerationJob`, `Notification`, `NotificationCount`, `DashboardSummary`, `SetupWizard` |
| Dismiss Notification | `Notification`, `NotificationCount` |
| Dismiss Setup Wizard | `SetupWizard` |
| Activate Academic Year | `AcademicYear`, `SetupWizard`, all data tags (full refetch) |

---

## 27. Frontend Route Map

Complete route configuration, all defined in `app/router.tsx`:

```
/login                                                    → LoginPage (public)
/                                                         → Dashboard (AuthGuard)
/academic-years                                           → AcademicYearListPage
/settings/period-structures                               → PeriodStructureListPage
/settings/period-structures/new                           → PeriodStructureEditor (create)
/settings/period-structures/:id                           → PeriodStructureEditor (edit)
/subjects                                                 → SubjectListPage
/subjects/new                                             → SubjectForm (create) [mobile only route]
/subjects/:id/edit                                        → SubjectForm (edit) [mobile only route]
/teachers                                                 → TeacherListPage
/teachers/new                                             → TeacherForm (create)
/teachers/:id/edit                                        → TeacherForm (edit)
/classes                                                  → ClassListPage
/classes/:classId                                         → ClassDetailPage
/classes/:classId/divisions/:divisionId/assignments       → AssignmentEditorPage
/classes/:classId/divisions/:divisionId/generate          → GeneratorPage
/classes/:classId/divisions/:divisionId/timetable         → TimetableEditorPage
/elective-groups                                          → ElectiveGroupListPage
/notifications                                            → NotificationListPage
/teacher-timetable                                        → TeacherTimetablePage
```

---

## 28. Phase Dependency Map

```
Phase 0 (Scaffolding)
  └─→ Phase 1A (Core Primitives)
       └─→ Phase 1B (Composite Components)
            └─→ Phase 1C (Form Components)
                 └─→ Phase 2A (Desktop Layout)
                      ├─→ Phase 2B (Mobile Layout)
                      └─→ Phase 2C (Auth Guard + Error Boundaries)
                           └─→ Phase 3A (Login)
                                └─→ Phase 3B (Register + Forgot Password)
                                     └─→ Phase 4 (Dashboard)
                                          └─→ Phase 5 (Academic Years)
                                               └─→ Phase 6A (Period Structures List)
                                                    └─→ Phase 6B (Period Structure Editor)
                                                         └─→ Phase 6C (DnD + Interactions)
                                                              └─→ Phase 7 (Subjects)
                                                                   └─→ Phase 8A (Teachers List)
                                                                        └─→ Phase 8B (Teacher Form + Availability)
                                                                             └─→ Phase 9A (Classes List)
                                                                                  └─→ Phase 9B (Class Detail + Divisions)
                                                                                       └─→ Phase 10A (Assignments Table)
                                                                                            └─→ Phase 10B (Assignment Modals)
                                                                                                 └─→ Phase 11 (Elective Groups)
                                                                                                      └─→ Phase 12 (Generator)
                                                                                                           └─→ Phase 13A (TT Grid)
                                                                                                                └─→ Phase 13B (DnD + Conflicts)
                                                                                                                     └─→ Phase 13C (Export)
                                                                                                                          └─→ Phase 14 (Notifications)
                                                                                                                               └─→ Phase 15 (Teacher TT View)
                                                                                                                                    └─→ Phase 16 (WebSocket)
                                                                                                                                         └─→ Phase 17 (i18n)
                                                                                                                                              └─→ Phase 18 (Polish & QA)
```

---

*End of Frontend Implementation Plan.*
