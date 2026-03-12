# School Timetable Management System
## Software Requirements Specification (SRS)

**Version**: 1.0  
**Date**: March 12, 2026  
**Status**: Draft  
**Prepared by**: Zyphr Engineering

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall System Description](#2-overall-system-description)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture](#4-system-architecture)
5. [Microservice Specifications](#5-microservice-specifications)
6. [Database Schema](#6-database-schema)
7. [API Specifications](#7-api-specifications)
8. [WebSocket Specification](#8-websocket-specification)
9. [Elective Group Model](#9-elective-group-model)
10. [Timetable Generation Engine](#10-timetable-generation-engine)
11. [UI/UX Screen Specifications](#11-uiux-screen-specifications)
12. *(Deferred — Testing Strategy)*
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Appendices](#14-appendices)
15. [Notification & Invalidation System](#15-notification--invalidation-system)
16. [Monorepo Folder Structure](#16-monorepo-folder-structure)
17. [CI/CD Pipeline](#17-cicd-pipeline)
18. [Authentication & Authorization](#18-authentication--authorization)
19. [Deployment Architecture](#19-deployment-architecture)
20. [Export Module](#20-export-module)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the complete functional, non-functional, and technical requirements for the **School Timetable Management System** — a multi-tenant, cloud-native web application that enables schools to manage classes, teachers, subjects, and automatically generate conflict-free weekly timetables.

This document serves as the single source of truth for all engineering, design, and deployment decisions. It is intended for use by:

- **Developers** — to implement backend microservices, the timetable generation engine, and the frontend application.
- **DevOps engineers** — to provision AWS infrastructure and CI/CD pipelines.
- **QA / reviewers** — to validate feature completeness and correctness.
- **Product stakeholders** — to confirm that all business requirements are captured.

### 1.2 Scope

The system covers the following functional areas:

| Area | Description |
|------|-------------|
| **Authentication** | School account registration, email-based login, password reset, JWT session management via AWS Cognito. |
| **Academic Year Management** | Create, activate, and archive academic years. All operational data is scoped to the active academic year. |
| **Class & Division Management** | User-defined classes (not limited to a fixed set). Each class may optionally have one or more divisions. Classes XI–XII-style divisions support an additional stream/group label. User-defined sort ordering for classes. |
| **Period Structure Configuration** | Multiple named period structures, each with configurable working days (any combination of Mon–Sun) and independent per-day slot sequences (periods, intervals, lunch breaks). |
| **Subject Management** | CRUD for subjects with unique names per school. Deletion warnings when actively assigned. |
| **Teacher Management** | CRUD for teacher records with qualification-to-subject mapping. Per-day/per-period availability configuration. |
| **Elective Group Management** | Define groups of subjects that share the same time slot, allowing students in a division to split into concurrent parallel sessions with different teachers and rooms. |
| **Division Assignment** | Assign subject–teacher pairs (with weightage) at the division level. Same subject may appear multiple times with different teachers. Optional assistant teacher co-assignment. Elective group assignments. |
| **Timetable Generation** | Automated weekly timetable generation per division using a genetic algorithm running on AWS Fargate. Respects all constraints: teacher availability, weightage, elective groups, optional adjacency rule, assistant teacher conflicts. |
| **Timetable Editing** | Drag-and-drop timetable editor with real-time conflict detection (teacher clashes, weightage deviations, adjacency violations). |
| **Timetable Invalidation** | Passive notification system that flags timetables affected by post-generation data changes. |
| **Teacher Timetable View** | Read-only consolidated weekly view per teacher across all assigned divisions. |
| **Export** | PDF (via Puppeteer) and Excel (via ExcelJS) export for both division and teacher timetables. |
| **Dashboard** | At-a-glance overview with summary cards and conflict alerts. |

### 1.3 Definitions, Acronyms & Glossary

| Term | Definition |
|------|-----------|
| **School Account** | A registered entity representing a single school. All data is isolated to this account (multi-tenancy via `school_id`). |
| **Academic Year** | A labelled time range (e.g., "2026–27") to which all operational data is scoped. Only one year is active at a time. |
| **Class** | A user-defined academic level (e.g., "Class I", "Class X", "KG", "Nursery"). Not limited to a fixed set — the school can create any number of classes with any naming convention. |
| **Division** | A section within a class (e.g., "A", "B"). Divisions are optional — a class may have zero or more divisions. For senior classes, a division may also carry a stream/group label (e.g., "B — Science"). |
| **Stream / Group** | An optional label attached to a division (typically for Classes XI–XII) indicating an academic stream such as Science, Commerce, or Humanities. User-defined — not restricted to a fixed set. |
| **Period Structure** | A named configuration that defines the working days and per-day slot sequences for a set of assigned classes. |
| **Slot** | A single time block within a day's schedule. Has a type (Period, Interval, or Lunch Break), a start time, and an end time. |
| **Period** | A slot of type "Period" — a teaching slot that can hold a subject–teacher assignment. Period slots are auto-numbered per day. |
| **Interval / Lunch Break** | Non-teaching slots that appear in the timetable grid but cannot hold subject assignments. |
| **Subject** | A named academic discipline (e.g., "Mathematics", "English"). Unique per school. |
| **Teacher** | A staff member record with a name, optional contact details, and a list of subjects they are qualified to teach. |
| **Teacher Availability** | Per-academic-year configuration marking specific days/periods when a teacher is unavailable for scheduling. |
| **Assignment** | A record linking a subject + teacher + weightage (periods per week) to a specific division. May optionally include an assistant teacher. |
| **Weightage** | The number of periods per week that a subject–teacher pair should be scheduled for a given division. |
| **Assistant Teacher** | A secondary teacher optionally co-assigned to an assignment. Shares the same period slots as the primary teacher. Subject to the same conflict rules. |
| **Elective Group** | A named group of two or more subjects that are scheduled into the same time slot(s) for a division. Students in the division are split across the elective subjects, each taught by their own teacher in a parallel concurrent session. |
| **Timetable** | A weekly schedule for a single division, mapping each period slot on each working day to a subject–teacher (and optionally assistant teacher) assignment. |
| **Adjacency Constraint** | An optional rule (toggled per generation run) requiring that when the same subject appears more than once on the same day, those periods must be adjacent. |
| **Conflict** | Any scheduling violation: teacher double-booked, weightage deviation, adjacency break, assistant teacher clash, or elective group overlap. |
| **Timetable Invalidation** | The state when a previously generated timetable may no longer be valid due to subsequent data changes (e.g., teacher deleted, subject renamed, assignment modified). The timetable is flagged as "Outdated" but not auto-deleted. |
| **JWT** | JSON Web Token — used for authenticated API access. Issued by AWS Cognito. |
| **Multi-tenancy** | Architectural pattern where a single system instance serves multiple schools, with strict data isolation enforced at the database row level via `school_id`. |
| **GA** | Genetic Algorithm — the metaheuristic optimization technique used for timetable auto-generation. |
| **Fargate** | AWS Fargate — serverless container compute used to run the timetable generation engine. |
| **Lambda** | AWS Lambda — serverless function compute used for all API-facing microservices. |
| **SPA** | Single Page Application — the React frontend architecture. |
| **VPC** | Virtual Private Cloud — AWS network isolation boundary. |
| **ENI** | Elastic Network Interface — used to attach Lambda and Fargate tasks to the VPC private subnet. |

### 1.4 References

| Document | Description |
|----------|-------------|
| `Plan.md` | Business requirements document (BR-1 through BR-16) and UI screen specifications (Screen 0–14). |
| `DataCollection.md` | Sample data collection guide with real school data — classes, subjects, teachers, and division assignments. |
| `HLD.drawio` | High-Level Design diagram (draw.io format) showing the full AWS architecture. |

### 1.5 Assumptions

1. The system will be deployed to a **single AWS region** (to be decided — likely `ap-south-1` Mumbai).
2. The initial deployment is a **single-school pilot**; multi-tenancy infrastructure is built in from day one but scaling optimizations (e.g., RDS Proxy, provisioned concurrency) will be added as needed.
3. All users access the system via a **modern web browser** (Chrome, Firefox, Safari, Edge — latest two major versions). No native mobile app is required.
4. The school provides **complete assignment data** (subjects, teachers, weightages) before timetable generation can proceed.
5. Internet connectivity is required — there is no offline mode.
6. Email delivery for password reset relies on **AWS SES** and requires SES domain/email verification during setup.
7. The timetable generation engine will handle typical school scales: up to **50 divisions**, **60 teachers**, **35 subjects**, and **9 periods per day** across **6 working days**.
8. Maximum concurrent users for the pilot: **15–20**.

### 1.6 Constraints

| Constraint | Detail |
|-----------|--------|
| **AWS Lambda limits** | 15-minute maximum execution time, 10 GB memory, 250 MB deployment package (unzipped). All API-facing services must respond within API Gateway's 29-second timeout. |
| **AWS Fargate** | Used exclusively for the timetable generation engine (Python). No execution time limit, configurable vCPU/memory. |
| **VPC cold starts** | Lambda functions attached to the VPC may experience cold-start latency (~1–3s). Mitigated by AWS Hyperplane ENIs; provisioned concurrency may be added later. |
| **Cognito limits** | Free tier: 50,000 MAUs. Sufficient for pilot. |
| **Single language constraint** | UI is English-only. No internationalization framework is required. |
| **No unit tests** | Automated testing is out of scope for the initial build. Manual validation will be used. |
| **Browser only** | No native mobile app. Responsive web design (mobile, tablet, laptop, desktop) via Tailwind CSS breakpoints. |

---

*End of Section 1.*

---

## 2. Overall System Description

### 2.1 Product Perspective

The School Timetable Management System is a **greenfield, cloud-native SaaS application** built on AWS. It replaces the manual or spreadsheet-based timetable creation process used by schools.

The system fits within the following ecosystem:

```
┌─────────────────────────────────────────────────────────────────┐
│                        End Users (Browser)                      │
│   School Admin · Academic Coordinator · Principal               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / WSS
┌───────────────────────────▼─────────────────────────────────────┐
│                    AWS Cloud Infrastructure                      │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │CloudFront│  │ API Gateway  │  │ API Gateway (WebSocket)   │  │
│  │  + S3    │  │ (HTTP API)   │  │ Push notifications        │  │
│  │ React SPA│  │ JWT Auth     │  │ Generation status         │  │
│  └──────────┘  └──────┬───────┘  └─────────────┬─────────────┘  │
│                       │                         │                │
│  ┌────────────────────▼─────────────────────────▼────────────┐  │
│  │              VPC — Private Subnets                         │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Lambda Microservices (Node.js 22, Prisma)          │  │  │
│  │  │  10 services: Auth · AcadYear · Config · Subject    │  │  │
│  │  │  Teacher · Division · Timetable · Notify · Dash     │  │  │
│  │  │  Export · WebSocket Handler                         │  │  │
│  │  └──────────────────────┬──────────────────────────────┘  │  │
│  │                         │                                  │  │
│  │  ┌──────────────────────▼──────────────────────────────┐  │  │
│  │  │  RDS PostgreSQL (single instance, school_id rows)   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  ECS Fargate — Timetable Generation Engine (Python) │  │  │
│  │  │  Genetic Algorithm · Constraint Solver              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │ AWS Cognito  │  │ DynamoDB     │  │ S3 (Exports)       │     │
│  │ User Pools   │  │ WS Conns     │  │ PDF / Excel files  │     │
│  └──────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  CI/CD: GitHub → CodePipeline → CodeBuild                 │  │
│  │  Terraform (infra) + Serverless Framework (Lambdas)        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

The system has **no dependency on any existing software** within the school. It is entirely self-contained — the school needs only a web browser and internet access.

### 2.2 User Roles

The pilot operates with a **single user role**: the **School Administrator**. This role has full access to all features. Future versions may introduce role-based access control (RBAC) with distinct roles (e.g., Teacher view-only, HOD limited-edit).

| Role | Description | Access Level |
|------|-------------|-------------|
| **School Administrator** | The primary user who manages all school data and generates timetables. Typically the principal, academic coordinator, or designated admin staff. | Full read-write access to all screens and features. |

> **Note**: Teachers do not log in to the system in the pilot. The Teacher Timetable View (Screen 14) is accessed by the administrator on behalf of teachers, or shared via exported PDF/Excel.

### 2.3 User Characteristics

| Characteristic | Detail |
|---------------|--------|
| **Technical proficiency** | Low to moderate. Users are school administrators, not IT professionals. The UI must be intuitive, self-explanatory, and require no training. |
| **Usage frequency** | Intensive during academic year setup (a few days); occasional during the year for edits and re-generation. |
| **Device usage** | Primarily desktop/laptop for data entry and timetable editing. Tablet/mobile for quick review and teacher timetable viewing. |
| **Concurrent users** | 15–20 maximum during pilot. Typically 1–3 simultaneous users per school. |

### 2.4 Operating Environment

| Component | Environment |
|-----------|-------------|
| **Client** | Modern web browsers: Chrome, Firefox, Safari, Edge (latest 2 major versions). JavaScript enabled. Minimum viewport: 320px (mobile). |
| **Server** | AWS Cloud — `ap-south-1` (Mumbai) region. Serverless compute (Lambda + Fargate). Managed PostgreSQL (RDS). |
| **Network** | All communication over HTTPS (TLS 1.2+). WebSocket over WSS. No VPN required. |

### 2.5 Design & Implementation Constraints

| # | Constraint | Rationale |
|---|-----------|-----------|
| 1 | All data must be scoped to `school_id` at the database level. Every query must filter by `school_id`. | Multi-tenancy data isolation — even for the pilot, the schema is built for multi-school from day one. |
| 2 | All data within a school must be scoped to `academic_year_id`. | Academic year scoping per BR-4. Archived years are read-only. |
| 3 | Lambda functions must complete API responses within **29 seconds** (API Gateway hard limit). | Long-running operations (timetable generation, PDF export) must be offloaded to async patterns. |
| 4 | The timetable generation engine must run on **Fargate** (Python), not Lambda. | Genetic algorithm may take minutes to converge. Lambda's 15-minute cap and cold-start overhead make it unsuitable. |
| 5 | The frontend must be a **Single Page Application** served from S3/CloudFront. | Decoupled from backend. No server-side rendering. |
| 6 | All infrastructure must be defined as **code** (Terraform for AWS resources, Serverless Framework for Lambdas). | Reproducible deployments, version-controlled infrastructure. |
| 7 | The monorepo must be deployable via a **single CI/CD pipeline**. | Simplicity for pilot — one pipeline orchestrates both Terraform and Serverless deployments. |
| 8 | The database schema must use **Prisma** ORM with migrations. | Consistent schema management, type-safe queries, migration history. |
| 9 | UI must support **dark mode and light mode** with a user-togglable switch. | Modern UX requirement. Theme preference persisted in local storage. |
| 10 | UI must be **responsive** across four breakpoints: mobile (< 640px), tablet (640–1024px), laptop (1024–1440px), desktop (> 1440px). | Tailwind CSS responsive utilities. |

### 2.6 Assumptions & Dependencies

#### External Dependencies

| Dependency | Service | Impact if unavailable |
|-----------|---------|----------------------|
| **AWS Cognito** | Authentication, JWT issuance, password reset | Users cannot log in or register. |
| **AWS SES** | Password reset emails | Password reset fails. Login and other features unaffected. |
| **AWS RDS (PostgreSQL)** | All data persistence | System is fully non-functional. |
| **AWS Lambda** | All API-facing microservices | API calls fail. Frontend loads but shows errors. |
| **AWS Fargate (ECS)** | Timetable generation engine | Generation unavailable. Existing timetables still accessible. |
| **AWS S3** | Static frontend hosting, export file storage | Frontend won't load (S3 hosting); exports fail (S3 storage). |
| **AWS CloudFront** | CDN for frontend | Slower asset delivery; falls back to S3 origin. |
| **AWS DynamoDB** | WebSocket connection tracking | WebSocket push notifications fail. Polling fallback not implemented. |
| **AWS CloudWatch** | Logging and monitoring | No impact on functionality; observability lost. |

#### Assumptions

1. The school's admin will use a **valid email address** for account registration (required for Cognito and SES).
2. Division assignment data is **manually entered** by the admin — there is no bulk import from spreadsheets in the pilot.
3. The genetic algorithm will **converge to a valid timetable** within 5 minutes for typical school sizes (up to 50 divisions). If it fails to converge, it returns the best-effort solution with a list of unresolved conflicts.
4. The system does **not** handle exam timetables or room/lab assignment — these are out of scope.
5. One school = one account = one set of credentials in the pilot. Multi-user accounts per school may be added later.

### 2.7 Features Not in Scope (Pilot)

The following features are explicitly **out of scope** for the initial pilot release:

| Feature | Reason |
|---------|--------|
| Role-based access control (RBAC) | Single admin role is sufficient for pilot. |
| Bulk data import (CSV/Excel upload) | Manual entry only. |
| Substitute teacher management | Deferred to a future phase. |
| Exam timetable generation | Different scheduling problem; not requested. |
| Room / lab assignment | Rooms are not modelled in the pilot. Elective groups imply parallel rooms but room names are not tracked. |
| Student records | The system manages scheduling, not student data. |
| Attendance tracking | Out of scope. |
| Parent / student portal | No external-facing views. |
| Mobile native apps (iOS/Android) | Responsive web only. |
| Offline mode | Internet required. |
| Multi-language (i18n) | English only. |
| Automated unit / integration tests | Out of scope for initial build. |
| Notification emails (e.g., "timetable generated") | WebSocket push only. No email notifications beyond password reset. |
| Audit logging | Not required for pilot. |

---

*End of Section 2.*

---

## 3. Technology Stack

### 3.1 Stack Overview

| Layer | Technology | Version / Detail |
|-------|-----------|-----------------|
| **Frontend Framework** | React | Latest stable (v19.x) |
| **Build Tool** | Vite | Latest stable (v6.x) |
| **Routing** | React Router | v7 |
| **State Management** | Redux Toolkit + RTK Query | Latest stable |
| **CSS Framework** | Tailwind CSS | v4.x |
| **Theming** | Dark / Light mode | Toggle via Tailwind `dark:` classes, preference in `localStorage` |
| **Backend Runtime** | Node.js | v22 LTS |
| **Backend Framework** | Serverless Framework | Deploys Lambda functions |
| **ORM** | Prisma | Latest stable |
| **Database** | PostgreSQL | v16 (Amazon RDS) |
| **Auth Provider** | AWS Cognito User Pools | JWT issuance, email login, password reset |
| **Email Service** | AWS SES | Password reset emails via Cognito integration |
| **Timetable Engine** | Python | v3.12+ on Fargate |
| **GA Library** | PyGAD / custom | Genetic algorithm for timetable generation |
| **PDF Generation** | Puppeteer | Headless Chrome on Lambda |
| **Excel Generation** | ExcelJS | `.xlsx` export |
| **WebSocket** | API Gateway WebSocket API | Push notifications for async operations |
| **Connection Store** | DynamoDB | WebSocket `connectionId` tracking |
| **Object Storage** | Amazon S3 | Frontend hosting + export file storage |
| **CDN** | Amazon CloudFront | SPA delivery, HTTPS termination |
| **Container Compute** | AWS Fargate (ECS) | Timetable generation engine |
| **Serverless Compute** | AWS Lambda | All API-facing microservices |
| **VPC Networking** | Private subnets + NAT Gateway | Lambda & Fargate ENI access to RDS |
| **Infrastructure as Code** | Terraform | VPC, RDS, ECS, S3, API GW, Cognito, DynamoDB, IAM |
| **App Deployment** | Serverless Framework | Lambda function packaging and deployment |
| **CI/CD Orchestrator** | AWS CodePipeline + CodeBuild | Triggered by GitHub push |
| **Source Control** | GitHub | Monorepo |
| **Package Manager** | npm | Workspaces for monorepo |
| **Monitoring** | Amazon CloudWatch | Logs, metrics, alarms |
| **Language** | English only | No i18n framework |

### 3.2 Frontend Stack Detail

#### 3.2.1 React + Vite

- **Vite** serves as the development server and production bundler. Chosen over CRA for significantly faster HMR and build times.
- **React 19** with functional components and hooks exclusively — no class components.
- **TypeScript** for the entire frontend codebase (strict mode enabled).

#### 3.2.2 Tailwind CSS

- Utility-first CSS with the Tailwind configuration file defining:
  - **Four responsive breakpoints**: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1440px).
  - **Custom color palette** for the application brand.
  - **Dark mode** via the `class` strategy — a `.dark` class on `<html>` toggles all `dark:` variants. User preference is stored in `localStorage` and respected on page load (with system preference as default).
- No additional CSS-in-JS library. Global styles are minimal (Tailwind's `@layer base` for typography resets).

#### 3.2.3 Redux Toolkit + RTK Query

- **Redux Toolkit** for global application state: active academic year, theme mode, authenticated user info, WebSocket connection status.
- **RTK Query** for all server-state data fetching, caching, and cache invalidation. Each microservice maps to an RTK Query API slice:
  - `academicYearApi` — academic year CRUD.
  - `configApi` — classes, period structures, slots.
  - `subjectApi` — subject CRUD.
  - `teacherApi` — teacher CRUD + availability.
  - `divisionApi` — division and assignment management.
  - `timetableApi` — timetable CRUD, generation triggers, conflict data.
  - `notificationApi` — affected timetables list.
  - `dashboardApi` — dashboard aggregated data.
  - `exportApi` — trigger export, get download URL.
- **Cache invalidation tags** align with server-side entity mutations (e.g., updating a teacher invalidates `Teacher` and `Dashboard` tags).

#### 3.2.4 React Router v7

- **File-based route convention** not used — explicit route configuration in a central `router.tsx`:
  - `/login` — Login / Registration (Screen 0)
  - `/` — Dashboard (Screen 1) — protected route
  - `/academic-years` — Academic Year Management (Screen 2)
  - `/settings/period-structures` — Period Structures List (Screen 3)
  - `/settings/period-structures/:id` — Period Structure Editor (Screen 3A)
  - `/subjects` — Subjects List (Screen 4)
  - `/subjects/new` — Add Subject (Screen 5)
  - `/subjects/:id/edit` — Edit Subject (Screen 5)
  - `/teachers` — Teachers List (Screen 6)
  - `/teachers/new` — Add Teacher (Screen 7)
  - `/teachers/:id/edit` — Edit Teacher (Screen 7)
  - `/classes` — Classes List (Screen 8)
  - `/classes/:classId` — Class Detail & Division Management (Screen 9)
  - `/classes/:classId/divisions/:divisionId/assignments` — Division Assignments Editor (Screen 10)
  - `/classes/:classId/divisions/:divisionId/generate` — Timetable Generator (Screen 11)
  - `/classes/:classId/divisions/:divisionId/timetable` — Timetable Editor (Screen 12)
  - `/notifications` — Affected Timetables (Screen 13)
  - `/teacher-timetable` — Teacher Timetable View (Screen 14)
  - `/elective-groups` — Elective Group Management (new screen)
- All routes except `/login` are wrapped in an `<AuthGuard>` component that redirects to `/login` if no valid Cognito session exists.

#### 3.2.5 Drag-and-Drop

- **@dnd-kit/core** + **@dnd-kit/sortable** for:
  - Timetable cell drag-and-drop (Screen 12).
  - Period Structure slot reordering (Screen 3A).
  - Class sort-order reordering (Screen 8).

### 3.3 Backend Stack Detail

#### 3.3.1 Node.js 22 + Lambda

- Each microservice is a **standalone Serverless Framework service** within the monorepo, packaged and deployed independently.
- **TypeScript** for all backend code (strict mode).
- Each Lambda handler follows the pattern:
  ```
  API Gateway event → Router (path/method match) → Controller → Service layer → Prisma → RDS
  ```

#### 3.3.2 Shared Package (`@timetable/shared`)

All common code lives in `packages/shared/`, published as a workspace-internal npm package (`@timetable/shared`). Every Lambda depends on it. The package is **not published to npm** — it is resolved locally via npm workspaces and bundled into the Lambda Layer.

**Internal structure of `packages/shared/`**:

```
packages/shared/
├── src/
│   ├── middleware/
│   │   ├── authMiddleware.ts         — extract & verify JWT claims, attach school_id + user_id to context
│   │   ├── academicYearMiddleware.ts — read X-Academic-Year-Id header, validate, attach to context
│   │   ├── requestLogger.ts          — structured JSON log of method, path, latency
│   │   └── errorHandler.ts           — catch-all wrapper; maps errors to standard { error } format
│   ├── models/
│   │   ├── enums.ts                  — SlotType, JobStatus, TimetableStatus, ConflictType, AcademicYearStatus
│   │   ├── schemas/                  — Zod request validation schemas (one file per entity)
│   │   │   ├── academicYear.schema.ts
│   │   │   ├── class.schema.ts
│   │   │   ├── division.schema.ts
│   │   │   ├── subject.schema.ts
│   │   │   ├── teacher.schema.ts
│   │   │   ├── assignment.schema.ts
│   │   │   ├── electiveGroup.schema.ts
│   │   │   ├── timetable.schema.ts
│   │   │   └── slot.schema.ts
│   │   └── types.ts                  — derived TypeScript types exported from Zod schemas + Prisma
│   ├── db/
│   │   ├── client.ts                 — Prisma Client singleton (instantiated outside handler scope)
│   │   └── tenantScope.ts            — helper that wraps Prisma queries with school_id + deleted_at filter
│   ├── helpers/
│   │   ├── response.ts               — success(), created(), noContent(), error() HTTP response builders
│   │   ├── pagination.ts             — parsePagination(event) → { page, pageSize, skip }
│   │   ├── lambdaInvoke.ts           — typed wrapper around Lambda.invoke() for inter-service calls
│   │   └── validate.ts               — parseBody(event, zodSchema) → validated DTO or 400
│   ├── errors/
│   │   ├── AppError.ts               — base error class with statusCode + code
│   │   ├── NotFoundError.ts
│   │   ├── ConflictError.ts
│   │   ├── ValidationError.ts
│   │   └── ForbiddenError.ts
│   └── index.ts                      — barrel export
├── prisma/
│   └── schema.prisma                 — single Prisma schema for all tables
├── package.json
└── tsconfig.json
```

#### 3.3.3 AWS Lambda Layers

Lambda Layers are used to share heavy dependencies across all 10 Lambda microservices, keeping individual deployment artifacts lightweight.

| Layer | Contents | Attached To | Approx. Size |
|-------|----------|------------|--------------|
| **SharedDepsLayer** | `@timetable/shared` (compiled), `@prisma/client` + query engine, `zod`, `jsonwebtoken`, `@aws-sdk/client-lambda` | All 10 Lambdas | ~40 MB |
| **ChromiumLayer** | `@sparticuz/chromium` headless browser binary | Export Service only | ~45 MB |

**How it works**:
- A Lambda Layer is a `.zip` archive containing a `nodejs/node_modules/` directory.
- At runtime, the layer is mounted at `/opt/nodejs/node_modules/`.
- Lambda's Node.js module resolution automatically finds packages there.
- Each Lambda's own bundle contains **only** its handler code (controllers, route mapping) — typically 50–200 KB.

**Build process** (CI/CD):
1. In `packages/shared/`: run `npm run build` (TypeScript → JavaScript), then `npx prisma generate`.
2. Create layer directory: `mkdir -p layer/nodejs/node_modules/`.
3. Copy `packages/shared/dist/` → `layer/nodejs/node_modules/@timetable/shared/`.
4. Install layer-level dependencies into `layer/nodejs/`: `@prisma/client`, `zod`, `jsonwebtoken`, `@aws-sdk/client-lambda`.
5. Copy the Prisma query engine binary (`libquery_engine-rhel-openssl-*.so.node`) into the layer.
6. Zip the layer directory and publish via Serverless Framework (`layers:` config in `serverless.yml`).

**Serverless Framework configuration** (each service's `serverless.yml`):
```yaml
# layers/shared/serverless.yml
layers:
  SharedDeps:
    path: layer
    name: timetable-shared-deps-${sls:stage}
    compatibleRuntimes:
      - nodejs22.x
    retain: false

# services/academic-year/serverless.yml
functions:
  handler:
    handler: src/handler.main
    layers:
      - !Ref SharedDepsLambdaLayer    # from layers/shared
    package:
      individually: true
      patterns:
        - '!node_modules/**'          # exclude — resolved from layer
        - 'src/**'
```

#### 3.3.4 Prisma ORM

- **Single Prisma schema** (`packages/shared/prisma/schema.prisma`) shared across all microservices.
- **Prisma Migrate** for schema migrations — migration files committed to the repo, applied via CI/CD.
- **Prisma Client** is generated at build time and packaged into the SharedDepsLayer (see Section 3.3.3). The query engine binary (`libquery_engine-rhel-openssl-*.so.node`) is included in the layer.
- **Connection handling**: Prisma Client is instantiated once per Lambda container (outside the handler) to reuse across warm invocations. Connection string sourced from environment variables (injected via Serverless Framework from AWS SSM Parameter Store).

#### 3.3.5 API Gateway (HTTP API)

- **Single HTTP API** with route-based Lambda integration.
- **Cognito JWT Authorizer** attached to all routes except `/auth/register` and `/auth/health`.
- **CORS** configured to allow the CloudFront distribution origin.
- **Payload format version 2.0** (default for HTTP API).

### 3.4 Timetable Engine Stack Detail

#### 3.4.1 Python on Fargate

- **Docker image** based on `python:3.12-slim`.
- Dependencies: `psycopg2-binary` (PostgreSQL), `PyGAD` or custom GA implementation, `boto3` (AWS SDK for DynamoDB + API GW Management API).
- **Entry point**: receives generation parameters via environment variables or a JSON payload from S3.
- **Lifecycle**:
  1. Timetable Service Lambda calls `ECS RunTask` with task overrides (school_id, division_id, academic_year_id, adjacency_constraint flag).
  2. Fargate task starts, reads all required data from RDS (assignments, teacher availability, period structure, elective groups).
  3. Runs GA solver.
  4. Writes generated timetable to RDS.
  5. Reads WebSocket `connectionId` from DynamoDB.
  6. Calls API Gateway Management API `PostToConnection` to push completion status to the client.
  7. Task exits.

#### 3.4.2 Fargate Task Configuration

| Parameter | Value |
|-----------|-------|
| vCPU | 1 (pilot) |
| Memory | 2 GB (pilot) |
| Ephemeral storage | 20 GB (default) |
| Platform version | LATEST |
| Network mode | awsvpc (private subnet, same VPC as RDS) |
| Timeout | None (runs to completion) |

### 3.5 Export Stack Detail

#### 3.5.1 PDF via Puppeteer

- Runs on **Lambda** with a Chromium layer (`@sparticuz/chromium`).
- Renders the timetable as an HTML page (same layout as the grid in Screen 12/14), then calls `page.pdf()`.
- Output uploaded to the S3 exports bucket.
- Lambda returns a **pre-signed S3 URL** (expires in 15 minutes) to the client.

#### 3.5.2 Excel via ExcelJS

- Runs on the same **Export Service Lambda**.
- Builds workbook programmatically: one sheet per timetable, styled headers, merged cells for breaks.
- Output uploaded to S3, pre-signed URL returned.

### 3.6 Key npm Packages (Frontend)

| Package | Purpose |
|---------|---------|
| `react`, `react-dom` | UI framework |
| `vite`, `@vitejs/plugin-react` | Build tooling |
| `react-router` | Client-side routing |
| `@reduxjs/toolkit`, `react-redux` | State management |
| `tailwindcss`, `@tailwindcss/forms` | Styling |
| `@dnd-kit/core`, `@dnd-kit/sortable` | Drag-and-drop |
| `amazon-cognito-identity-js` | Cognito auth SDK |
| `dayjs` | Date/time utilities |
| `lucide-react` | Icon library |
| `react-hot-toast` | Toast notifications |
| `recharts` | Dashboard charts (optional) |
| `clsx` | Conditional class names |

### 3.7 Key npm Packages (Backend — per service)

| Package | Purpose |
|---------|---------|
| `@prisma/client` | ORM queries |
| `prisma` (dev) | Schema management, migrations |
| `zod` | Request validation |
| `jsonwebtoken` | JWT decoding/verification (backup; primary auth via API GW authorizer) |
| `exceljs` | Excel export generation |
| `@sparticuz/chromium`, `puppeteer-core` | PDF generation (Export Service only) |
| `@aws-sdk/client-ecs` | Trigger Fargate tasks (Timetable Service only) |
| `@aws-sdk/client-dynamodb` | WebSocket connection management |
| `@aws-sdk/client-apigatewaymanagementapi` | WebSocket push messages |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | S3 upload + pre-signed URLs |

### 3.8 Python Packages (Timetable Engine)

| Package | Purpose |
|---------|---------|
| `psycopg2-binary` | PostgreSQL driver |
| `pygad` | Genetic algorithm framework (or custom implementation) |
| `boto3` | AWS SDK — DynamoDB reads, API GW Management API calls |
| `numpy` | Numerical operations for fitness calculations |

---

*End of Section 3.*

---

## 4. System Architecture

### 4.1 Architecture Style

The system follows a **serverless microservices architecture** on AWS:

- **Microservices**: Each bounded context is a separate AWS Lambda function (or group of related handlers within a single Lambda). Services communicate **synchronously** via direct Lambda invocation (`aws-sdk` `Lambda.invoke()`).
- **Serverless**: No servers to manage. Compute scales to zero when idle and auto-scales with load.
- **Event-driven async**: Long-running operations (timetable generation) are offloaded to Fargate. Completion is pushed to the client via WebSocket.
- **Monolithic database**: All microservices share a single PostgreSQL instance. Logical separation is by table ownership — each service owns a set of tables but can read from others. Write access is restricted to the owning service.

### 4.2 Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 1 — PRESENTATION                             │
│                                                                             │
│  React SPA (S3 + CloudFront)                                                │
│  Tailwind CSS · Redux · RTK Query · React Router v7 · @dnd-kit             │
│  Communicates with Layer 2 via HTTPS REST and WSS                           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 2 — API GATEWAY                              │
│                                                                             │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  HTTP API                   │  │  WebSocket API                       │  │
│  │  Cognito JWT Authorizer     │  │  JWT on $connect                     │  │
│  │  Routes → Lambda functions  │  │  $connect / $disconnect / onMessage  │  │
│  └──────────────┬──────────────┘  └──────────────────┬───────────────────┘  │
└─────────────────┼────────────────────────────────────┼──────────────────────┘
                  │                                    │
                  ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 3 — APPLICATION (VPC Private Subnets)        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Lambda Microservices (Node.js 22 + Prisma)                          │  │
│  │                                                                       │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │  │
│  │  │ Academic Year │ │ School Config│ │   Subject    │ │  Teacher   │  │  │
│  │  │   Service    │ │   Service    │ │   Service    │ │  Service   │  │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │  │
│  │  │  Division &  │ │  Timetable   │ │ Notification │ │ Dashboard  │  │  │
│  │  │ Assignment   │ │   Service    │ │   Service    │ │ Aggregator │  │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │  │
│  │  ┌──────────────┐ ┌──────────────┐                                   │  │
│  │  │   Export     │ │  WebSocket   │                                   │  │
│  │  │   Service    │ │  Handler     │                                   │  │
│  │  └──────────────┘ └──────────────┘                                   │  │
│  │                                                                       │  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │  │
│  │  LAMBDA LAYERS (mounted at /opt/nodejs/):                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  SharedDepsLayer: @timetable/shared, @prisma/client, zod,      │  │  │
│  │  │                   jsonwebtoken, @aws-sdk/client-lambda          │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  ChromiumLayer: @sparticuz/chromium (Export Service only)       │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  ┌───────────────────────────────────▼───────────────────────────────────┐  │
│  │  Fargate Task — Timetable Generation Engine (Python 3.12)            │  │
│  │  Genetic Algorithm · Constraint Solver · WebSocket Push on Complete  │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 4 — DATA                                     │
│                                                                             │
│  ┌──────────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
│  │  RDS PostgreSQL      │  │  DynamoDB        │  │  S3                   │  │
│  │  All application     │  │  WebSocket       │  │  Frontend assets      │  │
│  │  data, row-level     │  │  connection IDs  │  │  Export files         │  │
│  │  tenant isolation    │  │                  │  │  (PDF / Excel)        │  │
│  │  via school_id       │  │                  │  │                       │  │
│  └──────────────────────┘  └─────────────────┘  └───────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 VPC Network Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  VPC: 10.0.0.0/16                                                            │
│                                                                              │
│  ┌────────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │  Public Subnet A (AZ-a)       │  │  Public Subnet B (AZ-b)           │  │
│  │  10.0.1.0/24                  │  │  10.0.2.0/24                      │  │
│  │                               │  │                                    │  │
│  │  ┌─────────────────────────┐  │  │  (reserved for future use /       │  │
│  │  │  NAT Gateway            │  │  │   multi-AZ NAT if needed)         │  │
│  │  │  Outbound internet for  │  │  │                                    │  │
│  │  │  Lambda + Fargate       │  │  │                                    │  │
│  │  └─────────────────────────┘  │  │                                    │  │
│  └────────────────────────────────┘  └────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │  Private Subnet A (AZ-a)      │  │  Private Subnet B (AZ-b)          │  │
│  │  10.0.10.0/24                 │  │  10.0.11.0/24                     │  │
│  │                               │  │                                    │  │
│  │  ┌─────────────────────────┐  │  │  ┌──────────────────────────────┐ │  │
│  │  │  Lambda ENIs            │  │  │  │  Lambda ENIs                 │ │  │
│  │  │  (microservices)        │  │  │  │  (microservices)             │ │  │
│  │  └─────────────────────────┘  │  │  └──────────────────────────────┘ │  │
│  │                               │  │                                    │  │
│  │  ┌─────────────────────────┐  │  │  ┌──────────────────────────────┐ │  │
│  │  │  Fargate ENI            │  │  │  │  Fargate ENI                 │ │  │
│  │  │  (timetable engine)     │  │  │  │  (timetable engine)          │ │  │
│  │  └─────────────────────────┘  │  │  └──────────────────────────────┘ │  │
│  └────────────────────────────────┘  └────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │  DB Subnet A (AZ-a)           │  │  DB Subnet B (AZ-b)              │  │
│  │  10.0.20.0/24                 │  │  10.0.21.0/24                    │  │
│  │                               │  │                                    │  │
│  │  ┌─────────────────────────┐  │  │  (standby for Multi-AZ if        │  │
│  │  │  RDS PostgreSQL         │  │  │   enabled later)                  │  │
│  │  │  Primary instance       │  │  │                                    │  │
│  │  └─────────────────────────┘  │  │                                    │  │
│  └────────────────────────────────┘  └────────────────────────────────────┘  │
│                                                                              │
│  Internet Gateway attached to VPC                                            │
│  Route Tables:                                                               │
│    Public subnets  → 0.0.0.0/0 via Internet Gateway                         │
│    Private subnets → 0.0.0.0/0 via NAT Gateway                              │
│    DB subnets      → No internet route (isolated)                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Security Groups

| Security Group | Attached To | Inbound Rules | Outbound Rules |
|---------------|-------------|---------------|----------------|
| **sg-lambda** | All Lambda ENIs | None (Lambdas are invoked by API Gateway, not by inbound connections) | Port 5432 → sg-rds (PostgreSQL). Port 443 → 0.0.0.0/0 (AWS APIs via NAT). |
| **sg-fargate** | Fargate task ENIs | None (Fargate tasks are triggered by ECS RunTask, not by inbound connections) | Port 5432 → sg-rds. Port 443 → 0.0.0.0/0 (AWS APIs via NAT). |
| **sg-rds** | RDS instance | Port 5432 from sg-lambda. Port 5432 from sg-fargate. | None (RDS does not initiate outbound connections). |

### 4.5 Data Flow Diagrams

#### 4.5.1 Authentication Flow

```
User                    React SPA              Cognito              API Gateway
 │                         │                      │                      │
 │  1. Enter email + pwd   │                      │                      │
 │ ──────────────────────► │                      │                      │
 │                         │  2. cognito.signIn() │                      │
 │                         │ ────────────────────► │                      │
 │                         │                      │  3. Validate creds   │
 │                         │  4. JWT (id + access  │     + issue tokens  │
 │                         │     + refresh tokens) │                      │
 │                         │ ◄──────────────────── │                      │
 │                         │                      │                      │
 │                         │  5. API call with    │                      │
 │                         │     Authorization:   │                      │
 │                         │     Bearer <JWT>     │                      │
 │                         │ ─────────────────────┼────────────────────► │
 │                         │                      │  6. Verify JWT       │
 │                         │                      │ ◄──────────────────  │
 │                         │                      │  7. Valid ✓          │
 │                         │                      │ ──────────────────►  │
 │                         │                      │                      │
 │                         │  8. Route to Lambda  │                      │
 │                         │ ◄─────────────────────────────────────────  │
 │  9. Display data        │                      │                      │
 │ ◄────────────────────── │                      │                      │
```

#### 4.5.2 Timetable Generation Flow (Async with WebSocket Push)

```
User        React SPA       API Gateway    Timetable     ECS/Fargate    RDS    DynamoDB   WS API GW
 │              │                │          Service(λ)        │           │         │          │
 │ 1. Click    │                │              │              │           │         │          │
 │  "Generate" │                │              │              │           │         │          │
 │ ──────────► │                │              │              │           │         │          │
 │              │ 2. POST       │              │              │           │         │          │
 │              │  /timetables/ │              │              │           │         │          │
 │              │  generate     │              │              │           │         │          │
 │              │ ─────────────►│              │              │           │         │          │
 │              │               │ 3. Route ───►│              │           │         │          │
 │              │               │              │              │           │         │          │
 │              │               │              │ 4. Create    │           │         │          │
 │              │               │              │   gen job    │           │         │          │
 │              │               │              │   record ────┼──────────►│         │          │
 │              │               │              │   (PENDING)  │           │         │          │
 │              │               │              │              │           │         │          │
 │              │               │              │ 5. ECS       │           │         │          │
 │              │               │              │   RunTask ──►│           │         │          │
 │              │               │              │              │           │         │          │
 │              │ 6. 202 Accepted              │              │           │         │          │
 │              │    { jobId }  │              │              │           │         │          │
 │              │ ◄─────────────┤              │              │           │         │          │
 │ 7. Show     │               │              │              │           │         │          │
 │  "Generating│               │              │              │           │         │          │
 │   ..." UI   │               │              │              │           │         │          │
 │ ◄────────── │               │              │              │           │         │          │
 │              │               │              │              │           │         │          │
 │              │               │    ┌─────── FARGATE TASK RUNNING ──────────┐     │          │
 │              │               │    │ 8. Read assignments, teachers,        │     │          │
 │              │               │    │    period structures, elective groups │     │          │
 │              │               │    │    from RDS ──────────────────────────►     │          │
 │              │               │    │                                       │     │          │
 │              │               │    │ 9. Run genetic algorithm              │     │          │
 │              │               │    │    (may take 1-5 minutes)             │     │          │
 │              │               │    │                                       │     │          │
 │              │               │    │ 10. Write timetable to RDS ──────────►│     │          │
 │              │               │    │     Update job status → COMPLETED     │     │          │
 │              │               │    │                                       │     │          │
 │              │               │    │ 11. Read connectionId ──────────────────────►│         │
 │              │               │    │                                       │     │          │
 │              │               │    │ 12. PostToConnection ──────────────────────────────────►
 │              │               │    │     { type: "GENERATION_COMPLETE",    │     │          │
 │              │               │    │       jobId, status, divisionId }     │     │          │
 │              │               │    └───────────────────────────────────────┘     │          │
 │              │               │                                                  │          │
 │              │ 13. WSS message received ◄───────────────────────────────────────────────── │
 │              │     "Generation complete"                                         │          │
 │ 14. UI      │               │                                                   │          │
 │  updates:   │               │                                                   │          │
 │  "Ready!    │               │                                                   │          │
 │   View TT"  │               │                                                   │          │
 │ ◄────────── │               │                                                   │          │
```

#### 4.5.3 Data Change → Timetable Invalidation Flow

```
User        React SPA      API Gateway     Teacher       Notification     RDS
 │              │                │          Service(λ)    Service(λ)        │
 │ 1. Edit     │                │              │              │             │
 │  teacher    │                │              │              │             │
 │  record     │                │              │              │             │
 │ ──────────► │                │              │              │             │
 │              │ 2. PUT        │              │              │             │
 │              │  /teachers/:id│              │              │             │
 │              │ ──────────────►              │              │             │
 │              │               │ 3. Route ───►│              │             │
 │              │               │              │ 4. Update    │             │
 │              │               │              │   teacher ───┼────────────►│
 │              │               │              │              │             │
 │              │               │              │ 5. Sync      │             │
 │              │               │              │   invoke ───►│             │
 │              │               │              │              │             │
 │              │               │              │              │ 6. Query    │
 │              │               │              │              │   all       │
 │              │               │              │              │   timetables│
 │              │               │              │              │   using     │
 │              │               │              │              │   this      │
 │              │               │              │              │   teacher──►│
 │              │               │              │              │             │
 │              │               │              │              │ 7. Flag     │
 │              │               │              │              │   affected  │
 │              │               │              │              │   as        │
 │              │               │              │              │ OUTDATED───►│
 │              │               │              │              │             │
 │              │               │              │ 8. Return ◄──│             │
 │              │               │              │   count      │             │
 │              │               │              │              │             │
 │              │ 9. 200 OK    │              │              │             │
 │              │  { affected:  │              │              │             │
 │              │    3 }        │              │              │             │
 │              │ ◄─────────────┤              │              │             │
 │ 10. Toast   │               │              │              │             │
 │ "Updated.   │               │              │              │             │
 │  3 timetable│               │              │              │             │
 │  affected"  │               │              │              │             │
 │ ◄────────── │               │              │              │             │
```

#### 4.5.4 Export Flow

```
User        React SPA      API Gateway     Export         S3 (Exports)
 │              │                │          Service(λ)         │
 │ 1. Click    │                │              │               │
 │  "Export    │                │              │               │
 │   PDF"      │                │              │               │
 │ ──────────► │                │              │               │
 │              │ 2. POST       │              │               │
 │              │  /export/pdf  │              │               │
 │              │  { divisionId }              │               │
 │              │ ──────────────►              │               │
 │              │               │ 3. Route ───►│               │
 │              │               │              │ 4. Read       │
 │              │               │              │   timetable   │
 │              │               │              │   from RDS    │
 │              │               │              │               │
 │              │               │              │ 5. Render     │
 │              │               │              │   HTML grid   │
 │              │               │              │   via         │
 │              │               │              │   Puppeteer   │
 │              │               │              │               │
 │              │               │              │ 6. page.pdf() │
 │              │               │              │               │
 │              │               │              │ 7. Upload ───►│
 │              │               │              │   to S3       │
 │              │               │              │               │
 │              │               │              │ 8. Generate   │
 │              │               │              │   pre-signed  │
 │              │               │              │   URL         │
 │              │               │              │               │
 │              │ 9. 200 OK    │              │               │
 │              │  { url }      │              │               │
 │              │ ◄─────────────┤              │               │
 │              │               │              │               │
 │              │ 10. window.open(url)         │               │
 │ 11. Browser │               │              │               │
 │  downloads  │               │              │               │
 │  PDF file   │               │              │               │
 │ ◄────────── │               │              │               │
```

### 4.6 Inter-Service Communication

All inter-service communication is **synchronous** via direct AWS Lambda invocation using the `@aws-sdk/client-lambda` `InvokeCommand`.

| Caller Service | Target Service | Trigger | Purpose |
|---------------|----------------|---------|---------|
| Subject Service | Notification Service | Subject created / updated / deleted | Flag affected timetables as OUTDATED |
| Teacher Service | Notification Service | Teacher updated / deleted / availability changed | Flag affected timetables as OUTDATED |
| Division & Assignment Service | Notification Service | Assignment added / updated / removed, Elective group changed | Flag affected timetables as OUTDATED |
| School Config Service | Notification Service | Slot deleted / structure modified | Flag affected timetables as OUTDATED |
| Timetable Service | ECS (Fargate) | User clicks "Generate" | Triggers `ECS RunTask` for GA engine |
| Fargate Task | DynamoDB | On completion | Read WebSocket connectionId |
| Fargate Task | API Gateway Management API | On completion | Push result to client via WebSocket |

#### Invocation Pattern

```typescript
// Example: Teacher Service invoking Notification Service after teacher update
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

await lambda.send(new InvokeCommand({
  FunctionName: process.env.NOTIFICATION_SERVICE_ARN,
  InvocationType: 'RequestResponse',  // synchronous
  Payload: JSON.stringify({
    action: 'FLAG_AFFECTED_TIMETABLES',
    entityType: 'TEACHER',
    entityId: teacherId,
    schoolId: schoolId,
    academicYearId: academicYearId,
  }),
}));
```

### 4.7 Service Ownership Matrix

Each microservice owns specific database tables and is the **sole writer** to those tables. Other services may read from any table via Prisma.

| Microservice | Owned Tables (write) | Reads From |
|-------------|---------------------|------------|
| **Academic Year Service** | `academic_years` | — |
| **School Config Service** | `classes`, `period_structures`, `period_structure_classes`, `working_days`, `slots` | `academic_years` |
| **Subject Service** | `subjects` | `division_assignments` (for deletion check) |
| **Teacher Service** | `teachers`, `teacher_subjects`, `teacher_availability` | `division_assignments` (for deletion check) |
| **Division & Assignment Service** | `divisions`, `division_assignments`, `elective_groups`, `elective_group_subjects` | `classes`, `subjects`, `teachers`, `period_structures` |
| **Timetable Service** | `timetables`, `timetable_slots`, `generation_jobs` | `divisions`, `division_assignments`, `period_structures`, `slots`, `elective_groups` |
| **Notification Service** | `timetable_notifications` | `timetables`, `timetable_slots`, `division_assignments`, `teachers`, `subjects` |
| **Dashboard Aggregator** | — (read-only) | All tables (aggregate counts) |
| **Export Service** | — (writes to S3 only) | `timetables`, `timetable_slots`, `divisions`, `classes`, `subjects`, `teachers`, `period_structures`, `slots` |
| **WebSocket Handler** | — (writes to DynamoDB only) | — |

### 4.8 Failure Handling & Resilience

| Scenario | Behavior |
|----------|----------|
| **Lambda cold start** | VPC-attached Lambdas may take 1–3s on cold start. Acceptable for pilot. Provisioned concurrency can be added later for hot paths (Dashboard, Timetable Editor). |
| **Fargate task fails** | Job status set to `FAILED` in RDS. If WebSocket push fails (connection dropped), the client falls back to polling `GET /timetables/jobs/:jobId` on next page visit. |
| **RDS unavailable** | All API calls fail with 500. CloudWatch alarm triggers. No automatic failover in pilot (single-AZ). Future: enable Multi-AZ. |
| **Notification Service invoke fails** | Teacher/Subject/Config Service catches the error, logs it, and still returns 200 to the user (the primary operation succeeded). A background reconciliation can re-flag later. |
| **WebSocket connection lost** | Client auto-reconnects with exponential backoff. DynamoDB connection record is cleaned up by the `$disconnect` handler. |
| **Export Lambda timeout** | Puppeteer operations that exceed 29 seconds return 504. Mitigation: optimize HTML rendering, limit grid size per export. If persistent, move export to Fargate. |
| **NAT Gateway failure** | Lambda and Fargate lose outbound internet access → cannot reach Cognito, S3, DynamoDB. CloudWatch alarm triggers. AWS-managed NAT Gateway has 99.9% SLA. |

---

*End of Section 4.*

---

## 5. Microservice Specifications

This section details each of the 10 Lambda microservices and the Fargate-based timetable engine. For every service: its responsibility, owned entities, API routes (summary), events emitted, and key business logic.

### 5.0 Shared Lambda Layer & Model Layer

All 10 Lambda microservices are attached to a shared **AWS Lambda Layer** (`timetable-shared-deps`) that provides:

- **`@timetable/shared`** — the compiled model/middleware/helper package (see Section 3.3.2 for full internal structure)
- **`@prisma/client`** + Prisma Query Engine binary
- **`zod`**, **`jsonwebtoken`**, **`@aws-sdk/client-lambda`**

This means each Lambda's deployment artifact contains **only its own handler code** (~50–200 KB). All shared dependencies are resolved from `/opt/nodejs/node_modules/` via the Layer.

The **request processing pipeline** inside every Lambda follows this layered flow:

```
API Gateway HTTP Event
        │
        ▼
┌──────────────────────────────────────────────┐
│  MIDDLEWARE LAYER (@timetable/shared)         │
│  ┌────────────────────────────────────────┐   │
│  │ 1. requestLogger — log request start   │   │
│  │ 2. authMiddleware — extract JWT claims │   │
│  │ 3. academicYearMiddleware — resolve    │   │
│  │    X-Academic-Year-Id header           │   │
│  │ 4. errorHandler — catch all, format    │   │
│  └────────────────────────────────────────┘   │
│                    │                          │
│                    ▼                          │
│  MODEL / DTO LAYER (@timetable/shared)        │
│  ┌────────────────────────────────────────┐   │
│  │ Zod schema validation on request body  │   │
│  │ Prisma-generated types for DB entities │   │
│  │ Shared enums (SlotType, JobStatus …)   │   │
│  └────────────────────────────────────────┘   │
│                    │                          │
│                    ▼                          │
│  DB CLIENT LAYER (@timetable/shared)          │
│  ┌────────────────────────────────────────┐   │
│  │ Prisma Client singleton                │   │
│  │ tenantScope → auto school_id filter    │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│  SERVICE HANDLER (per-Lambda code)            │
│  ┌────────────────────────────────────────┐   │
│  │ Route matching (path + method)         │   │
│  │ Controller → Business logic            │   │
│  │ Prisma queries via shared DB client    │   │
│  │ Inter-service calls via lambdaInvoke() │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
        │
        ▼
  API Gateway HTTP Response
```

The Export Service additionally attaches a second layer (`ChromiumLayer`) containing `@sparticuz/chromium` for PDF rendering.

---

### 5.1 Academic Year Service

| Property | Detail |
|----------|--------|
| **Responsibility** | CRUD for academic years. Set active year. Archive previous years. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `academic_years` |
| **API Base Path** | `/academic-years` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/academic-years` | List all academic years for the school |
| POST | `/academic-years` | Create a new academic year |
| GET | `/academic-years/:id` | Get a single academic year |
| PUT | `/academic-years/:id` | Update year label or date range |
| PUT | `/academic-years/:id/activate` | Set as the active academic year (deactivates the current one) |
| DELETE | `/academic-years/:id` | Delete an academic year (only if it has no associated data) |

**Business Logic**:
- Only one academic year can be `ACTIVE` at a time per school. Activating a year sets all others to `ARCHIVED`.
- Archived years are read-only — all write operations on data scoped to an archived year are rejected with `403`.
- Deleting an academic year that contains any classes, assignments, or timetables is blocked with a validation error listing the dependent data.
- The active academic year ID is included in the JWT custom claims (set during login) or passed as a header `X-Academic-Year-Id` on every request.

**Events Emitted**: None.

---

### 5.2 School Config Service

| Property | Detail |
|----------|--------|
| **Responsibility** | Manage classes (user-defined, dynamic), class sort order, period structures, working days, and per-day slot sequences. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `classes`, `period_structures`, `period_structure_classes`, `working_days`, `slots` |
| **API Base Path** | `/config` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config/classes` | List all classes (sorted by user-defined `sort_order`) |
| POST | `/config/classes` | Create a new class |
| PUT | `/config/classes/:id` | Update class name or display settings |
| DELETE | `/config/classes/:id` | Delete a class (warns if divisions exist) |
| PUT | `/config/classes/sort-order` | Batch update class sort order (drag-to-reorder) |
| GET | `/config/period-structures` | List all period structures |
| POST | `/config/period-structures` | Create a new period structure |
| GET | `/config/period-structures/:id` | Get full detail (working days + per-day slots + assigned classes) |
| PUT | `/config/period-structures/:id` | Update name, working days, assigned classes |
| DELETE | `/config/period-structures/:id` | Delete (warns if classes assigned) |
| POST | `/config/period-structures/:id/reset` | Reset to default (Mon–Fri, 8 periods, standard breaks) |
| GET | `/config/period-structures/:id/days/:dayId/slots` | Get slot sequence for a specific day |
| POST | `/config/period-structures/:id/days/:dayId/slots` | Add a slot to a day |
| PUT | `/config/period-structures/:id/days/:dayId/slots/:slotId` | Update slot type, times |
| DELETE | `/config/period-structures/:id/days/:dayId/slots/:slotId` | Delete a slot (warns if referenced by timetables) |
| PUT | `/config/period-structures/:id/days/:dayId/slots/reorder` | Batch reorder slots within a day |
| POST | `/config/period-structures/:id/days/:dayId/copy-from/:sourceDayId` | Copy slots from another day |

**Business Logic**:
- Classes are **not fixed** to any predefined set. The school creates them with any name (e.g., "KG", "Nursery", "Class I", "Grade 10").
- `sort_order` is an integer field. The batch reorder endpoint receives an array of `{ classId, sortOrder }` pairs.
- A class can only belong to **one period structure** at a time. Assigning a class to a new structure removes it from the previous one.
- Slot numbers for `PERIOD`-type slots auto-recalculate after every reorder or deletion within a day.
- Slot validation: warns if `end_time <= start_time` or if a gap/overlap exists between consecutive slots.
- Deleting a slot that is referenced by a timetable requires user confirmation (the API caller sends `?confirm=true`).

**Events Emitted** (sync invoke → Notification Service):
- `SLOT_DELETED` — when a slot used in timetables is removed.
- `STRUCTURE_CHANGED` — when working days are added/removed or slot sequences are modified.

---

### 5.3 Subject Service

| Property | Detail |
|----------|--------|
| **Responsibility** | CRUD for subjects. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `subjects` |
| **API Base Path** | `/subjects` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subjects` | List all subjects (searchable, paginated) |
| POST | `/subjects` | Create a subject |
| GET | `/subjects/:id` | Get a single subject with usage info |
| PUT | `/subjects/:id` | Update subject name |
| DELETE | `/subjects/:id` | Delete (warns if assigned to divisions) |

**Business Logic**:
- Subject names must be **unique** within a school (case-insensitive).
- On GET, the response includes `assignedTeacherCount` and `assignedDivisionCount` for display in the list view.
- On DELETE, if the subject is referenced in any `division_assignments` or `elective_group_subjects`, the API returns `409 Conflict` with a list of affected divisions. The client may re-send with `?confirm=true` to cascade soft-delete.

**Events Emitted** (sync invoke → Notification Service):
- `SUBJECT_UPDATED` — name change may affect timetable display.
- `SUBJECT_DELETED` — flag timetables using this subject as OUTDATED.

---

### 5.4 Teacher Service

| Property | Detail |
|----------|--------|
| **Responsibility** | CRUD for teachers, subject qualifications, and availability configuration. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `teachers`, `teacher_subjects`, `teacher_availability` |
| **API Base Path** | `/teachers` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/teachers` | List all teachers (searchable, paginated) |
| POST | `/teachers` | Create a teacher |
| GET | `/teachers/:id` | Get teacher with subjects and availability |
| PUT | `/teachers/:id` | Update name, contact, qualifications |
| DELETE | `/teachers/:id` | Delete (warns if assigned to divisions) |
| GET | `/teachers/:id/availability` | Get availability grid for the teacher |
| PUT | `/teachers/:id/availability` | Bulk update availability (array of unavailable day+period combos) |

**Business Logic**:
- A teacher record has: `name` (required), `contact` (optional text), and a many-to-many relationship with subjects via `teacher_subjects`.
- Availability is stored as a set of `(teacher_id, working_day_id, slot_id)` tuples representing **unavailable** slots. The absence of a tuple means the teacher is available for that slot.
- Availability is scoped to the active academic year.
- When updating qualifications: if a subject is removed from a teacher's qualified list, and that teacher is still assigned to divisions for that subject, a warning is returned (no auto-removal of assignments).
- Deletion with active assignments returns `409 Conflict` with affected division list.

**Events Emitted** (sync invoke → Notification Service):
- `TEACHER_UPDATED` — qualification or name change.
- `TEACHER_DELETED` — flag timetables using this teacher as OUTDATED.
- `AVAILABILITY_CHANGED` — flag timetables where this teacher is scheduled on now-unavailable slots.

---

### 5.5 Division & Assignment Service

| Property | Detail |
|----------|--------|
| **Responsibility** | Manage divisions within classes, subject–teacher–weightage assignments per division, elective groups, and copy-division operations. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `divisions`, `division_assignments`, `elective_groups`, `elective_group_subjects` |
| **API Base Path** | `/divisions`, `/assignments`, `/elective-groups` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/divisions?classId=:classId` | List divisions for a class |
| POST | `/divisions` | Create a division |
| PUT | `/divisions/:id` | Update label or stream name |
| DELETE | `/divisions/:id` | Delete a division and its assignments |
| POST | `/divisions/:id/copy` | Copy assignments from another division |
| GET | `/assignments?divisionId=:divisionId` | List assignments for a division |
| POST | `/assignments` | Create a subject–teacher–weightage assignment |
| PUT | `/assignments/:id` | Update teacher, weightage, or assistant teacher |
| DELETE | `/assignments/:id` | Remove an assignment |
| GET | `/elective-groups` | List all elective groups for the school |
| POST | `/elective-groups` | Create an elective group |
| GET | `/elective-groups/:id` | Get group detail with member subjects |
| PUT | `/elective-groups/:id` | Update group name or member subjects |
| DELETE | `/elective-groups/:id` | Delete an elective group |
| POST | `/assignments/elective` | Assign an elective group to a division (creates linked assignments for each subject in the group) |

**Business Logic**:
- Divisions are optional — a class may have zero divisions.
- Division labels: for classes without a stream requirement, just a letter (e.g., "A"). With stream: letter + stream name (e.g., "B — Science").
- The same subject may appear multiple times per division with **different teachers**.
- Each assignment has an optional `assistant_teacher_id`. The assistant must be qualified for the subject and must not be the same as the primary teacher.
- **Elective groups** are school-level entities (not per-division). An elective group has a name and 2+ member subjects. When assigned to a division:
  - One `division_assignment` row is created per subject in the group, all sharing the same `elective_group_id` and the same `weightage`.
  - Each assignment within the group must have a **different teacher** (students split into parallel sessions).
  - During timetable generation, all assignments in an elective group are scheduled into the **same time slot(s)**.
- Copy division: creates a new division and duplicates all `division_assignments` (including elective group links) from the source. No timetable is generated for the copy.
- The API returns a `totalWeightage` (sum of all assignment weightages) and `availablePeriods` (total period slots per week from the period structure) for the division, so the UI can show over/under-allocation.

**Events Emitted** (sync invoke → Notification Service):
- `ASSIGNMENT_CHANGED` — assignment added, updated, or removed.
- `ELECTIVE_GROUP_CHANGED` — subjects added/removed from a group that's assigned to divisions.

---

### 5.6 Timetable Service

| Property | Detail |
|----------|--------|
| **Responsibility** | Timetable CRUD, trigger generation (Fargate), conflict detection for drag-and-drop edits, generation job status tracking. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `timetables`, `timetable_slots`, `generation_jobs` |
| **API Base Path** | `/timetables` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/timetables?divisionId=:divisionId` | Get the timetable for a division (full grid) |
| POST | `/timetables/generate` | Trigger timetable generation (launches Fargate task) |
| GET | `/timetables/jobs/:jobId` | Poll generation job status |
| PUT | `/timetables/:id/slots` | Batch update slot assignments (drag-and-drop save) |
| POST | `/timetables/:id/validate-move` | Validate a proposed drag-and-drop move (returns conflicts) |
| GET | `/timetables/:id/conflicts` | Get all current conflicts for a timetable |
| DELETE | `/timetables/:id` | Delete a generated timetable |
| GET | `/timetables/teacher/:teacherId` | Get the teacher's consolidated timetable view |

**Business Logic**:
- **Generation trigger**: Creates a `generation_jobs` record with status `PENDING`, calls `ECS RunTask` with overrides, returns `202 Accepted` with the job ID.
- **Job status flow**: `PENDING` → `RUNNING` (set by Fargate on start) → `COMPLETED` | `FAILED`.
- If a timetable already exists for the division, the user must confirm overwrite (client sends `?overwrite=true`).
- **Generation options** (sent in the POST body):
  - `adjacencyConstraint: boolean` (default `false`) — if true, the GA enforces adjacent periods for repeated subjects on the same day.
- **Validate move** (`POST /validate-move`): takes `{ fromDayId, fromSlotId, toDayId, toSlotId }` and returns an array of conflicts:
  - `TEACHER_CLASH` — the teacher is scheduled elsewhere at the target slot.
  - `ASSISTANT_TEACHER_CLASH` — the assistant teacher is scheduled elsewhere at the target slot.
  - `WEIGHTAGE_DEVIATION` — the move changes the weekly count for the subject.
  - `ADJACENCY_VIOLATION` — the move breaks the adjacency rule (only if adjacency was enabled at generation).
  - `ELECTIVE_GROUP_BREAK` — the move separates an elective group assignment from its partner (elective group subjects must remain in the same slot).
- **Batch slot update**: receives the full grid of `{ dayId, slotId, assignmentId }` tuples. Validates all and writes atomically.
- **Teacher timetable view**: aggregates across all divisions where the teacher is assigned (primary or assistant), merging slot data from potentially different period structures.

**Events Emitted**: None (timetable is the end-state; invalidation is handled by Notification Service).

---

### 5.7 Notification Service

| Property | Detail |
|----------|--------|
| **Responsibility** | Receive invalidation events from other services, scan affected timetables, flag them as OUTDATED, and maintain the notification report. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | `timetable_notifications` |
| **API Base Path** | `/notifications` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List all active timetable notifications (paginated) |
| PUT | `/notifications/:id/dismiss` | Dismiss a single notification |
| PUT | `/notifications/dismiss-all` | Dismiss all notifications |
| GET | `/notifications/count` | Get count of active notifications (for dashboard badge) |

**Business Logic**:
- Invoked synchronously by other services (via Lambda invoke) when data changes. The incoming payload specifies `entityType` (TEACHER, SUBJECT, ASSIGNMENT, SLOT, STRUCTURE, ELECTIVE_GROUP) and `entityId`.
- The service queries `timetable_slots` to find all timetables that reference the changed entity.
- For each affected timetable, if no existing active notification exists, a `timetable_notifications` record is created with:
  - `timetable_id`, `division_id`, `conflict_type`, `change_description`, `created_at`.
- The timetable's `status` field is updated from `GENERATED` to `OUTDATED`.
- Dismissing a notification does **not** change the timetable status back to `GENERATED` — the user must regenerate or manually fix the timetable.

**Events Emitted**: None.

---

### 5.8 Dashboard Aggregator Service

| Property | Detail |
|----------|--------|
| **Responsibility** | Provide aggregated counts and summary data for the dashboard (Screen 1). |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | None (read-only) |
| **API Base Path** | `/dashboard` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Get all dashboard data in a single call |

**Response Payload**:
```json
{
  "activeAcademicYear": { "id": "...", "label": "2026-27" },
  "totalClasses": 14,
  "totalDivisions": 32,
  "totalTeachers": 54,
  "totalSubjects": 31,
  "timetablesGenerated": 28,
  "timetablesPending": 4,
  "timetablesOutdated": 2,
  "activeNotificationCount": 3
}
```

**Business Logic**:
- Single endpoint, single query pass. Uses `COUNT` aggregations across multiple tables scoped by `school_id` and `academic_year_id`.
- `timetablesPending` = divisions that have assignments but no generated timetable.
- `timetablesOutdated` = timetables with status `OUTDATED`.
- Cached in RTK Query on the frontend with a short TTL (30 seconds) and invalidated on mutations to related entities.

**Events Emitted**: None.

---

### 5.9 Export Service

| Property | Detail |
|----------|--------|
| **Responsibility** | Generate PDF and Excel exports for division timetables and teacher timetables. Upload to S3 and return pre-signed download URLs. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | None (writes to S3 only) |
| **API Base Path** | `/export` |

**Routes Summary**:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/export/division/pdf` | Export a division timetable as PDF |
| POST | `/export/division/excel` | Export a division timetable as Excel |
| POST | `/export/teacher/pdf` | Export a teacher timetable as PDF |
| POST | `/export/teacher/excel` | Export a teacher timetable as Excel |

**Business Logic**:
- **PDF generation** (Puppeteer):
  1. Read timetable data from RDS (joins across timetable_slots, assignments, subjects, teachers, divisions, slots).
  2. Render an HTML template styled with inline CSS (same grid layout as Screen 12/14).
  3. Launch headless Chromium via `@sparticuz/chromium`.
  4. Call `page.pdf({ format: 'A3', landscape: true })`.
  5. Upload the PDF buffer to S3 under `exports/{schoolId}/{timestamp}_{type}.pdf`.
  6. Generate a pre-signed GET URL (15-minute expiry).
  7. Return `{ url }` to the client.
- **Excel generation** (ExcelJS):
  1. Read same timetable data.
  2. Create a workbook with styled headers, merged break cells, borders, and alternating row colors.
  3. Upload `.xlsx` buffer to S3.
  4. Return pre-signed URL.
- **File naming convention**: `{ClassName}_{Division}_{Date}.pdf` or `Teacher_{Name}_{Date}.xlsx`.
- S3 lifecycle rule: exported files auto-delete after **7 days**.

**Events Emitted**: None.

---

### 5.10 WebSocket Handler

| Property | Detail |
|----------|--------|
| **Responsibility** | Manage WebSocket connections — store connection IDs on `$connect`, remove on `$disconnect`, and serve as the entry point for the WebSocket API Gateway. |
| **Runtime** | Node.js 22 · Lambda · VPC-attached |
| **Owned Tables** | None (writes to DynamoDB) |
| **API Base Path** | N/A (WebSocket routes) |

**Routes**:

| Route Key | Description |
|-----------|-------------|
| `$connect` | Validate JWT from query string `?token=`. Store `{ connectionId, schoolId, userId }` in DynamoDB. |
| `$disconnect` | Remove connection record from DynamoDB. |
| `$default` | Catch-all — log and discard unsupported messages. |

**Business Logic**:
- On `$connect`: extract the JWT from `?token=` query parameter, decode and verify it (signature verification via Cognito JWKS), extract `school_id` and `user_id` claims, and write to DynamoDB:
  ```json
  {
    "connectionId": "abc123",
    "schoolId": "school_xxx",
    "userId": "user_yyy",
    "connectedAt": "2026-03-12T10:00:00Z",
    "ttl": 86400
  }
  ```
- DynamoDB TTL is set to auto-clean stale connections after 24 hours (safety net if `$disconnect` is missed).
- The Fargate timetable engine reads from this table to find the `connectionId` for the school/user and pushes completion via API Gateway Management API.

**Events Emitted**: None.

---

### 5.11 Timetable Generation Engine (Fargate — Python)

| Property | Detail |
|----------|--------|
| **Responsibility** | Run the genetic algorithm to generate a conflict-free weekly timetable for a division. |
| **Runtime** | Python 3.12 · Fargate · VPC-attached |
| **Owned Tables** | Writes to `timetables`, `timetable_slots`, `generation_jobs` (shared ownership with Timetable Service) |
| **Trigger** | `ECS RunTask` from Timetable Service Lambda |

**Input Parameters** (task environment overrides):

| Env Variable | Description |
|-------------|-------------|
| `SCHOOL_ID` | School account ID |
| `ACADEMIC_YEAR_ID` | Active academic year |
| `DIVISION_ID` | Division to generate timetable for |
| `JOB_ID` | Generation job ID (for status updates) |
| `ADJACENCY_CONSTRAINT` | `true` / `false` |
| `DATABASE_URL` | PostgreSQL connection string |
| `DYNAMODB_TABLE` | WebSocket connections table name |
| `WS_API_ENDPOINT` | WebSocket API Gateway management endpoint |

**Execution Steps**:
1. Update `generation_jobs` status to `RUNNING`.
2. Load all required data from RDS:
   - Period structure for the division's class (working days + slot sequences per day).
   - All `division_assignments` for the division (including elective group links).
   - Teacher availability (`teacher_availability` tuples).
   - Existing timetables for **all other divisions** in the same academic year (to detect teacher clashes across divisions).
3. Run the genetic algorithm (detailed in Section 10).
4. On success:
   - Write timetable to `timetables` table.
   - Write individual slot assignments to `timetable_slots` table.
   - Update `generation_jobs` status to `COMPLETED`.
5. On failure (no valid solution found):
   - Update `generation_jobs` status to `FAILED` with error details.
6. Push WebSocket notification:
   - Query DynamoDB for `connectionId` matching the `school_id`.
   - Call `PostToConnection` with the result payload.
7. Exit (Fargate task stops).

---

*End of Section 5.*

---

## 6. Database Schema

### 6.1 Design Principles

1. **Multi-tenancy**: Every table includes a `school_id` column. All queries filter by `school_id`. There is a composite index on `(school_id, ...)` for every table.
2. **Academic year scoping**: Tables that hold per-year data include `academic_year_id`.
3. **Soft delete**: Records are not physically deleted. A `deleted_at` timestamp column (nullable) is used. Queries filter `WHERE deleted_at IS NULL` by default.
4. **Timestamps**: All tables have `created_at` and `updated_at` (auto-managed by Prisma).
5. **UUIDs**: All primary keys use UUID v4 (`@default(uuid())` in Prisma).

### 6.2 Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────────┐
│  schools         │       │  academic_years       │
│──────────────────│       │──────────────────────│
│  id (PK)         │──┐    │  id (PK)             │
│  name            │  │    │  school_id (FK) ──────┤
│  admin_email     │  │    │  label               │
│  cognito_user_id │  │    │  start_date          │
│  created_at      │  │    │  end_date            │
│  updated_at      │  │    │  status (ACTIVE/      │
└──────────────────┘  │    │         ARCHIVED)     │
                      │    │  created_at           │
                      │    │  updated_at           │
                      │    └──────────────────────┘
                      │
  ┌───────────────────┼───────────────────────────────────────────────┐
  │                   │                                               │
  ▼                   ▼                                               ▼
┌──────────────────┐ ┌──────────────────────┐  ┌───────────────────────┐
│  classes         │ │  subjects            │  │  teachers             │
│──────────────────│ │──────────────────────│  │───────────────────────│
│  id (PK)         │ │  id (PK)             │  │  id (PK)              │
│  school_id (FK)  │ │  school_id (FK)      │  │  school_id (FK)       │
│  academic_year_id│ │  academic_year_id    │  │  academic_year_id     │
│  name            │ │  name               │  │  name                 │
│  sort_order      │ │  deleted_at          │  │  contact              │
│  requires_stream │ │  created_at          │  │  deleted_at           │
│  deleted_at      │ │  updated_at          │  │  created_at           │
│  created_at      │ └──────────────────────┘  │  updated_at           │
│  updated_at      │           │               └───────────────────────┘
└──────────────────┘           │                   │            │
       │                       │                   │            │
       ▼                       │      ┌────────────┘            │
┌──────────────────┐           │      ▼                         ▼
│  divisions       │           │ ┌─────────────────────┐  ┌───────────────────────┐
│──────────────────│           │ │  teacher_subjects    │  │  teacher_availability │
│  id (PK)         │           │ │─────────────────────│  │───────────────────────│
│  school_id (FK)  │           │ │  id (PK)            │  │  id (PK)              │
│  class_id (FK)   │           │ │  teacher_id (FK)    │  │  school_id (FK)       │
│  academic_year_id│           │ │  subject_id (FK)    │  │  teacher_id (FK)      │
│  label           │           │ │  school_id (FK)     │  │  academic_year_id     │
│  stream_name     │           │ └─────────────────────┘  │  working_day_id (FK)  │
│  deleted_at      │           │                          │  slot_id (FK)         │
│  created_at      │           │                          └───────────────────────┘
│  updated_at      │           │
└──────────────────┘           │
       │                       │
       ▼                       ▼
┌─────────────────────────────────────────────┐
│  division_assignments                        │
│─────────────────────────────────────────────│
│  id (PK)                                     │
│  school_id (FK)                              │
│  division_id (FK)                            │
│  subject_id (FK)                             │
│  teacher_id (FK)                             │
│  assistant_teacher_id (FK, nullable)         │
│  weightage (integer)                         │
│  elective_group_id (FK, nullable)            │
│  academic_year_id                            │
│  deleted_at                                  │
│  created_at                                  │
│  updated_at                                  │
└─────────────────────────────────────────────┘
       │                            │
       │                            ▼
       │              ┌──────────────────────────────┐
       │              │  elective_groups              │
       │              │──────────────────────────────│
       │              │  id (PK)                      │
       │              │  school_id (FK)               │
       │              │  academic_year_id             │
       │              │  name                         │
       │              │  deleted_at                   │
       │              │  created_at                   │
       │              │  updated_at                   │
       │              └──────────────────────────────┘
       │                            │
       │                            ▼
       │              ┌──────────────────────────────┐
       │              │  elective_group_subjects      │
       │              │──────────────────────────────│
       │              │  id (PK)                      │
       │              │  elective_group_id (FK)       │
       │              │  subject_id (FK)              │
       │              │  school_id (FK)               │
       │              └──────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  period_structures                                    │
│──────────────────────────────────────────────────────│
│  id (PK)                                              │
│  school_id (FK)                                       │
│  academic_year_id                                     │
│  name                                                 │
│  deleted_at                                           │
│  created_at                                           │
│  updated_at                                           │
└──────────────────────────────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────────────┐  ┌──────────────────────────┐
│ period_structure_    │  │  working_days            │
│ classes              │  │──────────────────────────│
│─────────────────────│  │  id (PK)                  │
│ id (PK)              │  │  period_structure_id (FK) │
│ period_structure_id  │  │  school_id (FK)           │
│ class_id (FK)        │  │  day_of_week (0-6)       │
│ school_id (FK)       │  │  label (e.g., "Monday")  │
└─────────────────────┘  │  sort_order               │
                         └──────────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────────────┐
                         │  slots                    │
                         │──────────────────────────│
                         │  id (PK)                  │
                         │  working_day_id (FK)      │
                         │  school_id (FK)           │
                         │  slot_type (PERIOD /       │
                         │    INTERVAL / LUNCH_BREAK) │
                         │  slot_number (nullable,    │
                         │    auto for PERIOD type)   │
                         │  start_time (TIME)         │
                         │  end_time (TIME)           │
                         │  sort_order               │
                         │  created_at               │
                         │  updated_at               │
                         └──────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  timetables                                           │
│──────────────────────────────────────────────────────│
│  id (PK)                                              │
│  school_id (FK)                                       │
│  division_id (FK)                                     │
│  academic_year_id                                     │
│  status (NOT_GENERATED / GENERATED / OUTDATED)        │
│  adjacency_constraint_enabled (boolean)               │
│  generated_at (timestamp)                             │
│  created_at                                           │
│  updated_at                                           │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  timetable_slots                                      │
│──────────────────────────────────────────────────────│
│  id (PK)                                              │
│  timetable_id (FK)                                    │
│  school_id (FK)                                       │
│  working_day_id (FK)                                  │
│  slot_id (FK)                                         │
│  division_assignment_id (FK, nullable — null for      │
│    empty/break slots)                                 │
│  created_at                                           │
│  updated_at                                           │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  generation_jobs                                      │
│──────────────────────────────────────────────────────│
│  id (PK)                                              │
│  school_id (FK)                                       │
│  division_id (FK)                                     │
│  academic_year_id                                     │
│  status (PENDING / RUNNING / COMPLETED / FAILED)      │
│  error_message (text, nullable)                       │
│  started_at (timestamp, nullable)                     │
│  completed_at (timestamp, nullable)                   │
│  created_at                                           │
│  updated_at                                           │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  timetable_notifications                              │
│──────────────────────────────────────────────────────│
│  id (PK)                                              │
│  school_id (FK)                                       │
│  timetable_id (FK)                                    │
│  division_id (FK)                                     │
│  conflict_type (enum)                                 │
│  change_description (text)                            │
│  dismissed (boolean, default false)                   │
│  created_at                                           │
│  updated_at                                           │
└──────────────────────────────────────────────────────┘
```

### 6.3 Table Details

#### 6.3.1 `schools`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK, default uuid() | School account ID |
| `name` | VARCHAR(255) | NOT NULL | School name |
| `admin_email` | VARCHAR(255) | NOT NULL, UNIQUE | Administrator's email (login username) |
| `cognito_user_id` | VARCHAR(255) | NOT NULL, UNIQUE | Cognito User Sub |
| `created_at` | TIMESTAMP | NOT NULL, default now() | |
| `updated_at` | TIMESTAMP | NOT NULL, auto-updated | |

**Indexes**: `UNIQUE(admin_email)`, `UNIQUE(cognito_user_id)`

---

#### 6.3.2 `academic_years`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `label` | VARCHAR(50) | NOT NULL | e.g., "2026–27" |
| `start_date` | DATE | NOT NULL | |
| `end_date` | DATE | NOT NULL | |
| `status` | ENUM('ACTIVE', 'ARCHIVED') | NOT NULL, default 'ARCHIVED' | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, status)` — for quickly finding the active year. **Unique constraint**: only one `ACTIVE` per `school_id` (enforced via partial unique index or application logic).

---

#### 6.3.3 `classes`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `name` | VARCHAR(100) | NOT NULL | e.g., "Class I", "KG", "Nursery" |
| `sort_order` | INTEGER | NOT NULL, default 0 | User-defined display order |
| `requires_stream` | BOOLEAN | NOT NULL, default false | If true, divisions must have a stream_name |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, academic_year_id, sort_order)`, `(school_id, academic_year_id, name)` UNIQUE WHERE deleted_at IS NULL.

---

#### 6.3.4 `divisions`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `class_id` | UUID | FK → classes.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `label` | VARCHAR(10) | NOT NULL | e.g., "A", "B" |
| `stream_name` | VARCHAR(100) | NULLABLE | e.g., "Science", "Commerce" |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, class_id, academic_year_id)`, `(school_id, class_id, label, stream_name)` UNIQUE WHERE deleted_at IS NULL.

---

#### 6.3.5 `subjects`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, academic_year_id, name)` UNIQUE WHERE deleted_at IS NULL (case-insensitive).

---

#### 6.3.6 `teachers`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | |
| `contact` | TEXT | NULLABLE | Free-form contact details |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, academic_year_id)`.

---

#### 6.3.7 `teacher_subjects`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `teacher_id` | UUID | FK → teachers.id, NOT NULL | |
| `subject_id` | UUID | FK → subjects.id, NOT NULL | |

**Indexes**: `(teacher_id, subject_id)` UNIQUE.

---

#### 6.3.8 `teacher_availability`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `teacher_id` | UUID | FK → teachers.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `working_day_id` | UUID | FK → working_days.id, NOT NULL | |
| `slot_id` | UUID | FK → slots.id, NOT NULL | |

**Note**: Each row represents an **unavailable** slot. Absence = available.

**Indexes**: `(teacher_id, academic_year_id, working_day_id, slot_id)` UNIQUE.

---

#### 6.3.9 `period_structures`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | e.g., "Primary Block", "Senior Block" |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, academic_year_id, name)` UNIQUE WHERE deleted_at IS NULL.

---

#### 6.3.10 `period_structure_classes`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `period_structure_id` | UUID | FK → period_structures.id, NOT NULL | |
| `class_id` | UUID | FK → classes.id, NOT NULL | |

**Indexes**: `(class_id)` UNIQUE (a class belongs to exactly one structure).

---

#### 6.3.11 `working_days`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `period_structure_id` | UUID | FK → period_structures.id, NOT NULL | |
| `day_of_week` | INTEGER | NOT NULL, CHECK (0–6) | 0=Mon, 1=Tue, ..., 6=Sun |
| `label` | VARCHAR(20) | NOT NULL | e.g., "Monday" |
| `sort_order` | INTEGER | NOT NULL | |

**Indexes**: `(period_structure_id, day_of_week)` UNIQUE.

---

#### 6.3.12 `slots`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `working_day_id` | UUID | FK → working_days.id, NOT NULL | |
| `slot_type` | ENUM('PERIOD', 'INTERVAL', 'LUNCH_BREAK') | NOT NULL | |
| `slot_number` | INTEGER | NULLABLE | Auto-calculated; only for PERIOD type |
| `start_time` | TIME | NOT NULL | |
| `end_time` | TIME | NOT NULL | |
| `sort_order` | INTEGER | NOT NULL | Order within the day |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(working_day_id, sort_order)` UNIQUE.

---

#### 6.3.13 `elective_groups`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | e.g., "Biology / Computer Science" |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, academic_year_id, name)` UNIQUE WHERE deleted_at IS NULL.

---

#### 6.3.14 `elective_group_subjects`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `elective_group_id` | UUID | FK → elective_groups.id, NOT NULL | |
| `subject_id` | UUID | FK → subjects.id, NOT NULL | |

**Indexes**: `(elective_group_id, subject_id)` UNIQUE.

---

#### 6.3.15 `division_assignments`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `division_id` | UUID | FK → divisions.id, NOT NULL | |
| `subject_id` | UUID | FK → subjects.id, NOT NULL | |
| `teacher_id` | UUID | FK → teachers.id, NOT NULL | |
| `assistant_teacher_id` | UUID | FK → teachers.id, NULLABLE | |
| `weightage` | INTEGER | NOT NULL, CHECK (>= 1) | Periods per week |
| `elective_group_id` | UUID | FK → elective_groups.id, NULLABLE | If part of an elective group |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `deleted_at` | TIMESTAMP | NULLABLE | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, division_id, academic_year_id)`, `(teacher_id)`, `(assistant_teacher_id)`, `(elective_group_id)`.

---

#### 6.3.16 `timetables`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `division_id` | UUID | FK → divisions.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `status` | ENUM('GENERATED', 'OUTDATED') | NOT NULL | |
| `adjacency_constraint_enabled` | BOOLEAN | NOT NULL, default false | |
| `generated_at` | TIMESTAMP | NOT NULL | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, division_id, academic_year_id)` UNIQUE.

---

#### 6.3.17 `timetable_slots`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `timetable_id` | UUID | FK → timetables.id, NOT NULL | |
| `working_day_id` | UUID | FK → working_days.id, NOT NULL | |
| `slot_id` | UUID | FK → slots.id, NOT NULL | |
| `division_assignment_id` | UUID | FK → division_assignments.id, NULLABLE | NULL for break/empty slots |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(timetable_id, working_day_id, slot_id)` UNIQUE, `(division_assignment_id)`.

---

#### 6.3.18 `generation_jobs`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `division_id` | UUID | FK → divisions.id, NOT NULL | |
| `academic_year_id` | UUID | FK → academic_years.id, NOT NULL | |
| `status` | ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') | NOT NULL | |
| `error_message` | TEXT | NULLABLE | Error details if FAILED |
| `started_at` | TIMESTAMP | NULLABLE | Set when Fargate picks up |
| `completed_at` | TIMESTAMP | NULLABLE | Set on completion |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, division_id, academic_year_id)`.

---

#### 6.3.19 `timetable_notifications`

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK | |
| `school_id` | UUID | FK → schools.id, NOT NULL | |
| `timetable_id` | UUID | FK → timetables.id, NOT NULL | |
| `division_id` | UUID | FK → divisions.id, NOT NULL | |
| `conflict_type` | ENUM('TEACHER_CHANGED', 'TEACHER_DELETED', 'SUBJECT_CHANGED', 'SUBJECT_DELETED', 'ASSIGNMENT_CHANGED', 'SLOT_CHANGED', 'STRUCTURE_CHANGED', 'AVAILABILITY_CHANGED', 'ELECTIVE_GROUP_CHANGED') | NOT NULL | |
| `change_description` | TEXT | NOT NULL | Human-readable description |
| `dismissed` | BOOLEAN | NOT NULL, default false | |
| `created_at` | TIMESTAMP | NOT NULL | |
| `updated_at` | TIMESTAMP | NOT NULL | |

**Indexes**: `(school_id, dismissed)` — for listing active notifications.

---

### 6.4 DynamoDB Table

**Table Name**: `timetable-ws-connections`

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `connectionId` | String | Partition Key | API Gateway WebSocket connection ID |
| `schoolId` | String | — | School account ID (GSI partition key) |
| `userId` | String | — | Cognito user ID |
| `connectedAt` | String | — | ISO timestamp |
| `ttl` | Number | — | TTL epoch seconds (24h from connection) |

**GSI**: `schoolId-index` — partition key `schoolId`, used by Fargate to look up connections for a school.

---

*End of Section 6.*

---

## 7. API Specifications

### 7.1 Common Conventions

| Convention | Detail |
|-----------|--------|
| **Base URL** | `https://api.{domain}/` |
| **Content Type** | `application/json` for all requests and responses |
| **Authentication** | All endpoints (except registration and health) require a valid JWT in `Authorization: Bearer <token>` header |
| **School Scoping** | `school_id` is extracted from the JWT claims — never passed by the client |
| **Academic Year Scoping** | Passed via `X-Academic-Year-Id` request header on every scoped request |
| **Pagination** | Query params: `page` (1-based, default 1), `pageSize` (default 20, max 100). Response: `{ data: [...], meta: { page, pageSize, totalCount, totalPages } }` |
| **Search** | Query param: `search` — case-insensitive substring match on the primary name field |
| **Soft Delete** | DELETE endpoints set `deleted_at`. Response: `204 No Content`. With `?confirm=true` to bypass active-usage warnings. |
| **Error Format** | `{ error: { code: "VALIDATION_ERROR", message: "...", details: [...] } }` |
| **Timestamps** | ISO 8601 format: `2026-03-12T10:30:00.000Z` |
| **Time fields** | `HH:mm` 24-hour format for slot times |

### 7.2 Standard HTTP Status Codes

| Code | Usage |
|------|-------|
| `200` | Successful GET, PUT |
| `201` | Successful POST (resource created) |
| `202` | Accepted (async operation started — timetable generation) |
| `204` | Successful DELETE |
| `400` | Validation error (bad input) |
| `401` | Unauthorized (missing/invalid JWT) |
| `403` | Forbidden (archived year write attempt, wrong school) |
| `404` | Resource not found |
| `409` | Conflict (attempting to delete an entity with active references) |
| `500` | Internal server error |

### 7.3 Academic Year Endpoints

#### `GET /academic-years`

List all academic years for the school.

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "label": "2026-27",
      "startDate": "2026-05-01",
      "endDate": "2027-03-31",
      "status": "ACTIVE",
      "createdAt": "2026-03-12T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalCount": 2, "totalPages": 1 }
}
```

#### `POST /academic-years`

**Request Body**:
```json
{
  "label": "2026-27",
  "startDate": "2026-05-01",
  "endDate": "2027-03-31"
}
```

**Validation**: `label` required (max 50 chars), `startDate` < `endDate`, no overlapping date ranges with existing years.

**Response** `201`: Created academic year object.

#### `PUT /academic-years/:id`

**Request Body** (partial update):
```json
{
  "label": "2026-2027",
  "startDate": "2026-05-01",
  "endDate": "2027-04-15"
}
```

**Response** `200`: Updated academic year object.

#### `PUT /academic-years/:id/activate`

No request body. Sets the specified year as `ACTIVE`, all others as `ARCHIVED`.

**Response** `200`: Activated academic year object.

#### `DELETE /academic-years/:id`

Rejected if any data (classes, subjects, teachers, timetables) exists under this year. Returns `409` with list of dependent entity counts.

**Response** `204`: Deleted.

---

### 7.4 School Config Endpoints (Classes & Period Structures)

#### `GET /config/classes`

**Query Params**: `search` (optional)

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Class I",
      "sortOrder": 1,
      "requiresStream": false,
      "divisionCount": 3,
      "periodStructureName": "Primary Block"
    }
  ]
}
```

#### `POST /config/classes`

**Request Body**:
```json
{
  "name": "Class I",
  "requiresStream": false,
  "sortOrder": 1
}
```

**Validation**: `name` required, unique per school+year. `sortOrder` auto-assigned if not provided (max + 1).

**Response** `201`: Created class object.

#### `PUT /config/classes/:id`

**Request Body**: `{ "name": "Class I", "requiresStream": false }`

**Response** `200`: Updated class.

#### `PUT /config/classes/sort-order`

**Request Body**:
```json
{
  "order": [
    { "classId": "uuid-1", "sortOrder": 1 },
    { "classId": "uuid-2", "sortOrder": 2 },
    { "classId": "uuid-3", "sortOrder": 3 }
  ]
}
```

**Response** `200`: `{ "updated": 3 }`

#### `DELETE /config/classes/:id`

Returns `409` if divisions exist under this class. With `?confirm=true`, cascades soft-delete to divisions and their assignments.

**Response** `204`.

#### `GET /config/period-structures`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Primary Block",
      "workingDays": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "assignedClassCount": 5
    }
  ]
}
```

#### `POST /config/period-structures`

**Request Body**:
```json
{
  "name": "Primary Block",
  "workingDays": [0, 1, 2, 3, 4],
  "assignedClassIds": ["uuid-1", "uuid-2"]
}
```

**Validation**: `name` required, unique. At least one working day. Class IDs must exist and not already belong to another structure.

**Response** `201`.

#### `GET /config/period-structures/:id`

Returns full detail including working days and their slot sequences.

**Response** `200`:
```json
{
  "id": "uuid",
  "name": "Primary Block",
  "workingDays": [
    {
      "id": "wd-uuid",
      "dayOfWeek": 0,
      "label": "Monday",
      "slots": [
        {
          "id": "slot-uuid",
          "slotType": "PERIOD",
          "slotNumber": 1,
          "startTime": "09:00",
          "endTime": "09:45",
          "sortOrder": 1
        },
        {
          "id": "slot-uuid-2",
          "slotType": "INTERVAL",
          "slotNumber": null,
          "startTime": "09:45",
          "endTime": "10:00",
          "sortOrder": 2
        }
      ]
    }
  ],
  "assignedClasses": [
    { "id": "class-uuid", "name": "Class I" }
  ]
}
```

#### `PUT /config/period-structures/:id`

**Request Body** (partial):
```json
{
  "name": "Primary Block Updated",
  "workingDays": [0, 1, 2, 3, 4, 5],
  "assignedClassIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response** `200`.

#### `DELETE /config/period-structures/:id`

Returns `409` if classes are still assigned. User must reassign classes to another structure first or confirm with `?confirm=true` (which unlinks classes).

**Response** `204`.

#### `POST /config/period-structures/:id/reset`

Resets to default: Mon–Fri, 8 periods, 3 breaks (after Period 2, after Period 4, after Period 6).

**Response** `200`: Updated structure.

#### `POST /config/period-structures/:id/days/:dayId/slots`

**Request Body**:
```json
{
  "slotType": "PERIOD",
  "startTime": "14:00",
  "endTime": "14:45"
}
```

**Validation**: `slotType` ∈ {PERIOD, INTERVAL, LUNCH_BREAK}. `endTime > startTime`. Gap/overlap warnings returned in response metadata.

**Response** `201`: Created slot with auto-calculated `slotNumber` and `sortOrder`.

#### `PUT /config/period-structures/:id/days/:dayId/slots/:slotId`

**Request Body**: `{ "startTime": "14:00", "endTime": "14:50", "slotType": "PERIOD" }`

**Response** `200`.

#### `DELETE /config/period-structures/:id/days/:dayId/slots/:slotId`

If slot is referenced by timetables, returns `409` with affected timetable list. Proceed with `?confirm=true`.

**Response** `204`.

#### `PUT /config/period-structures/:id/days/:dayId/slots/reorder`

**Request Body**:
```json
{
  "order": [
    { "slotId": "uuid-1", "sortOrder": 1 },
    { "slotId": "uuid-2", "sortOrder": 2 }
  ]
}
```

Period slot numbers recalculate automatically.

**Response** `200`.

#### `POST /config/period-structures/:id/days/:dayId/copy-from/:sourceDayId`

Copies all slots from the source day into this day (replaces existing slots).

**Response** `200`.

---

### 7.5 Subject Endpoints

#### `GET /subjects`

**Query Params**: `search`, `page`, `pageSize`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Mathematics",
      "assignedTeacherCount": 4,
      "assignedDivisionCount": 12
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "totalCount": 31, "totalPages": 2 }
}
```

#### `POST /subjects`

**Request Body**: `{ "name": "Mathematics" }`

**Validation**: Name required, unique (case-insensitive).

**Response** `201`.

#### `GET /subjects/:id`

**Response** `200`:
```json
{
  "id": "uuid",
  "name": "Mathematics",
  "assignedTeachers": [
    { "id": "t-uuid", "name": "Julie" },
    { "id": "t-uuid-2", "name": "Rajani" }
  ],
  "assignedDivisions": [
    { "id": "d-uuid", "className": "Class I", "divisionLabel": "A" }
  ]
}
```

#### `PUT /subjects/:id`

**Request Body**: `{ "name": "Maths" }`

**Response** `200`.

#### `DELETE /subjects/:id`

`409` if assigned. `?confirm=true` to cascade.

**Response** `204`.

---

### 7.6 Teacher Endpoints

#### `GET /teachers`

**Query Params**: `search`, `page`, `pageSize`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Julie",
      "contact": null,
      "subjectNames": ["Mathematics"],
      "assignedDivisionCount": 5
    }
  ],
  "meta": { ... }
}
```

#### `POST /teachers`

**Request Body**:
```json
{
  "name": "Julie",
  "contact": "julie@school.com",
  "subjectIds": ["subj-uuid-1", "subj-uuid-2"]
}
```

**Response** `201`.

#### `GET /teachers/:id`

**Response** `200`:
```json
{
  "id": "uuid",
  "name": "Julie",
  "contact": null,
  "subjects": [
    { "id": "subj-uuid", "name": "Mathematics" }
  ],
  "assignedDivisions": [
    { "id": "div-uuid", "className": "Class I", "label": "A", "subjectName": "Mathematics", "weightage": 7 }
  ]
}
```

#### `PUT /teachers/:id`

**Request Body**:
```json
{
  "name": "Julie M.",
  "contact": "updated@school.com",
  "subjectIds": ["subj-uuid-1"]
}
```

**Response** `200`.

#### `DELETE /teachers/:id`

`409` if assigned. `?confirm=true` to cascade.

**Response** `204`.

#### `GET /teachers/:id/availability`

**Response** `200`:
```json
{
  "teacherId": "uuid",
  "unavailableSlots": [
    {
      "workingDayId": "wd-uuid",
      "workingDayLabel": "Monday",
      "slotId": "slot-uuid",
      "slotNumber": 1,
      "startTime": "09:00",
      "endTime": "09:45"
    }
  ]
}
```

#### `PUT /teachers/:id/availability`

**Request Body**:
```json
{
  "unavailableSlots": [
    { "workingDayId": "wd-uuid", "slotId": "slot-uuid" },
    { "workingDayId": "wd-uuid-2", "slotId": "slot-uuid-3" }
  ]
}
```

Replaces the entire availability set for this teacher in the active academic year.

**Response** `200`: `{ "updated": 2 }`

---

### 7.7 Division & Assignment Endpoints

#### `GET /divisions?classId=:classId`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "classId": "class-uuid",
      "label": "A",
      "streamName": null,
      "assignmentCount": 14,
      "totalWeightage": 40,
      "timetableStatus": "GENERATED"
    }
  ]
}
```

#### `POST /divisions`

**Request Body**:
```json
{
  "classId": "class-uuid",
  "label": "C",
  "streamName": "Science"
}
```

**Validation**: `label` required. `streamName` required if the class has `requiresStream = true`. Label+stream must be unique within the class.

**Response** `201`.

#### `POST /divisions/:id/copy`

**Request Body**:
```json
{
  "sourceDivisionId": "source-div-uuid"
}
```

Copies all assignments (including elective group links and assistant teachers) from the source division. No timetable is generated.

**Response** `201`: New division with copied assignments.

#### `DELETE /divisions/:id`

Cascades soft-delete to all assignments. If a timetable exists, warns first (`409`). `?confirm=true` to proceed.

**Response** `204`.

#### `GET /assignments?divisionId=:divisionId`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "subject": { "id": "s-uuid", "name": "Mathematics" },
      "teacher": { "id": "t-uuid", "name": "Julie" },
      "assistantTeacher": null,
      "weightage": 7,
      "electiveGroup": null
    },
    {
      "id": "uuid-2",
      "subject": { "id": "s-uuid-2", "name": "Biology" },
      "teacher": { "id": "t-uuid-2", "name": "Anu S Nair" },
      "assistantTeacher": null,
      "weightage": 9,
      "electiveGroup": { "id": "eg-uuid", "name": "Biology / Computer Science" }
    },
    {
      "id": "uuid-3",
      "subject": { "id": "s-uuid-3", "name": "Computer Science" },
      "teacher": { "id": "t-uuid-3", "name": "Swetha" },
      "assistantTeacher": null,
      "weightage": 9,
      "electiveGroup": { "id": "eg-uuid", "name": "Biology / Computer Science" }
    }
  ],
  "summary": {
    "totalWeightage": 45,
    "availablePeriods": 45,
    "isBalanced": true
  }
}
```

#### `POST /assignments`

**Request Body**:
```json
{
  "divisionId": "div-uuid",
  "subjectId": "subj-uuid",
  "teacherId": "teacher-uuid",
  "assistantTeacherId": null,
  "weightage": 7
}
```

**Validation**:
- Teacher must be qualified for the subject.
- Assistant teacher (if provided) must be qualified and different from primary.
- Weightage ≥ 1.

**Response** `201`.

#### `PUT /assignments/:id`

**Request Body** (partial):
```json
{
  "teacherId": "new-teacher-uuid",
  "assistantTeacherId": "asst-uuid",
  "weightage": 8
}
```

**Response** `200`.

#### `DELETE /assignments/:id`

**Response** `204`.

#### `POST /assignments/elective`

Assign an elective group to a division. Creates one assignment per subject in the group.

**Request Body**:
```json
{
  "divisionId": "div-uuid",
  "electiveGroupId": "eg-uuid",
  "weightage": 9,
  "assignments": [
    { "subjectId": "bio-uuid", "teacherId": "teacher-1-uuid", "assistantTeacherId": null },
    { "subjectId": "cs-uuid", "teacherId": "teacher-2-uuid", "assistantTeacherId": null }
  ]
}
```

**Validation**: Every subject in the elective group must be covered. All teachers must be distinct. Weightage is the same for all.

**Response** `201`: Array of created assignments.

---

### 7.8 Elective Group Endpoints

#### `GET /elective-groups`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Biology / Computer Science",
      "subjects": [
        { "id": "s1", "name": "Biology" },
        { "id": "s2", "name": "Computer Science" }
      ],
      "assignedDivisionCount": 4
    }
  ]
}
```

#### `POST /elective-groups`

**Request Body**:
```json
{
  "name": "Biology / Computer Science",
  "subjectIds": ["bio-uuid", "cs-uuid"]
}
```

**Validation**: Name required, unique. At least 2 subjects. Subjects must exist.

**Response** `201`.

#### `PUT /elective-groups/:id`

**Request Body**: `{ "name": "BIO/CS Elective", "subjectIds": ["bio-uuid", "cs-uuid", "math-uuid"] }`

If subjects are removed and the group is assigned to divisions, those assignments are flagged.

**Response** `200`.

#### `DELETE /elective-groups/:id`

`409` if assigned to any division. `?confirm=true` cascades — removes elective_group_id from division_assignments.

**Response** `204`.

---

### 7.9 Timetable Endpoints

#### `GET /timetables?divisionId=:divisionId`

Returns the full timetable grid for a division.

**Response** `200`:
```json
{
  "timetable": {
    "id": "tt-uuid",
    "divisionId": "div-uuid",
    "status": "GENERATED",
    "adjacencyConstraintEnabled": false,
    "generatedAt": "2026-03-12T10:00:00.000Z"
  },
  "grid": [
    {
      "workingDay": { "id": "wd-uuid", "label": "Monday", "dayOfWeek": 0 },
      "slots": [
        {
          "slot": {
            "id": "slot-uuid",
            "slotType": "PERIOD",
            "slotNumber": 1,
            "startTime": "09:00",
            "endTime": "09:45"
          },
          "assignment": {
            "id": "asgn-uuid",
            "subject": { "id": "s-uuid", "name": "Mathematics" },
            "teacher": { "id": "t-uuid", "name": "Julie" },
            "assistantTeacher": null,
            "electiveGroup": null
          }
        },
        {
          "slot": {
            "id": "slot-uuid-2",
            "slotType": "INTERVAL",
            "slotNumber": null,
            "startTime": "09:45",
            "endTime": "10:00"
          },
          "assignment": null
        }
      ]
    }
  ]
}
```

#### `POST /timetables/generate`

**Request Body**:
```json
{
  "divisionId": "div-uuid",
  "adjacencyConstraint": false,
  "overwrite": false
}
```

If a timetable exists and `overwrite` is `false`, returns `409` with `{ existingTimetableId, message: "Timetable already exists. Set overwrite=true to regenerate." }`.

**Response** `202`:
```json
{
  "jobId": "job-uuid",
  "status": "PENDING"
}
```

#### `GET /timetables/jobs/:jobId`

**Response** `200`:
```json
{
  "jobId": "job-uuid",
  "status": "COMPLETED",
  "startedAt": "2026-03-12T10:00:05.000Z",
  "completedAt": "2026-03-12T10:02:30.000Z",
  "errorMessage": null
}
```

#### `POST /timetables/:id/validate-move`

**Request Body**:
```json
{
  "fromWorkingDayId": "wd-uuid-1",
  "fromSlotId": "slot-uuid-1",
  "toWorkingDayId": "wd-uuid-2",
  "toSlotId": "slot-uuid-2"
}
```

**Response** `200`:
```json
{
  "conflicts": [
    {
      "type": "TEACHER_CLASH",
      "severity": "ERROR",
      "message": "Julie is already teaching Class II A in Period 3 on Tuesday."
    }
  ],
  "isValid": false
}
```

#### `PUT /timetables/:id/slots`

Batch save all slot assignments (full grid replacement).

**Request Body**:
```json
{
  "slots": [
    { "workingDayId": "wd-uuid", "slotId": "slot-uuid", "divisionAssignmentId": "asgn-uuid" },
    { "workingDayId": "wd-uuid", "slotId": "slot-uuid-2", "divisionAssignmentId": null }
  ]
}
```

**Response** `200`: `{ "updated": 40 }`

#### `GET /timetables/:id/conflicts`

Returns all active conflicts for the timetable.

**Response** `200`:
```json
{
  "conflicts": [
    {
      "type": "WEIGHTAGE_DEVIATION",
      "severity": "WARNING",
      "message": "Mathematics has 6 periods this week but weightage is 7.",
      "details": { "subjectId": "...", "expected": 7, "actual": 6 }
    }
  ]
}
```

#### `DELETE /timetables/:id`

**Response** `204`.

#### `GET /timetables/teacher/:teacherId`

Returns the consolidated teacher timetable across all divisions.

**Response** `200`:
```json
{
  "teacher": { "id": "t-uuid", "name": "Julie" },
  "grid": [
    {
      "workingDay": { "id": "wd-uuid", "label": "Monday", "dayOfWeek": 0 },
      "periodStructure": { "id": "ps-uuid", "name": "Primary Block" },
      "slots": [
        {
          "slot": { "id": "slot-uuid", "slotType": "PERIOD", "slotNumber": 1, "startTime": "09:00", "endTime": "09:45" },
          "entry": {
            "className": "Class I",
            "divisionLabel": "A",
            "subjectName": "Mathematics",
            "role": "PRIMARY"
          }
        },
        {
          "slot": { "id": "slot-uuid-2", "slotType": "PERIOD", "slotNumber": 2, "startTime": "09:45", "endTime": "10:30" },
          "entry": {
            "className": "Class I",
            "divisionLabel": "B",
            "subjectName": "Mathematics",
            "role": "ASSISTANT"
          }
        }
      ]
    }
  ]
}
```

---

### 7.10 Notification Endpoints

#### `GET /notifications`

**Query Params**: `page`, `pageSize`

**Response** `200`:
```json
{
  "data": [
    {
      "id": "notif-uuid",
      "timetableId": "tt-uuid",
      "className": "Class VII",
      "divisionLabel": "A",
      "conflictType": "TEACHER_DELETED",
      "changeDescription": "Teacher 'Manju' was deleted. Class VII A timetable references this teacher.",
      "dismissed": false,
      "createdAt": "2026-03-12T14:00:00.000Z"
    }
  ],
  "meta": { ... }
}
```

#### `GET /notifications/count`

**Response** `200`: `{ "count": 3 }`

#### `PUT /notifications/:id/dismiss`

**Response** `200`: `{ "dismissed": true }`

#### `PUT /notifications/dismiss-all`

**Response** `200`: `{ "dismissedCount": 3 }`

---

### 7.11 Dashboard Endpoint

#### `GET /dashboard`

**Response** `200`:
```json
{
  "activeAcademicYear": { "id": "uuid", "label": "2026-27" },
  "totalClasses": 14,
  "totalDivisions": 32,
  "totalTeachers": 54,
  "totalSubjects": 31,
  "timetablesGenerated": 28,
  "timetablesPending": 4,
  "timetablesOutdated": 2,
  "activeNotificationCount": 3
}
```

---

### 7.12 Export Endpoints

#### `POST /export/division/pdf`

**Request Body**: `{ "divisionId": "div-uuid" }`

**Response** `200`:
```json
{
  "url": "https://s3.amazonaws.com/exports-bucket/...",
  "expiresIn": 900,
  "fileName": "Class_I_A_2026-03-12.pdf"
}
```

#### `POST /export/division/excel`

Same shape as PDF. **Response** `200`: `{ "url": "...", "fileName": "Class_I_A_2026-03-12.xlsx" }`

#### `POST /export/teacher/pdf`

**Request Body**: `{ "teacherId": "teacher-uuid" }`

**Response** `200`: `{ "url": "...", "fileName": "Teacher_Julie_2026-03-12.pdf" }`

#### `POST /export/teacher/excel`

Same shape. **Response** `200`: `{ "url": "...", "fileName": "Teacher_Julie_2026-03-12.xlsx" }`

---

*End of Section 7.*

---

## 8. WebSocket Specification

### 8.1 Purpose

The WebSocket channel provides **server-to-client push notifications** for long-running asynchronous operations. In the pilot, the only such operation is **timetable generation** (Fargate, 30s–5min). Without WebSocket, the client would need to poll `GET /timetables/jobs/:jobId` repeatedly.

### 8.2 Infrastructure

| Component | Detail |
|-----------|--------|
| **API Gateway Type** | WebSocket API (separate from the HTTP API) |
| **Endpoint** | `wss://ws.{domain}/` |
| **Route Selection Expression** | `$request.body.action` |
| **Routes** | `$connect`, `$disconnect`, `$default` |
| **Lambda Integration** | WebSocket Handler Lambda (Section 5.10) |
| **Connection Store** | DynamoDB table `timetable-ws-connections` (Section 6.4) |
| **Push Origin** | Fargate timetable engine (Python) via API Gateway Management API |

### 8.3 Connection Lifecycle

```
┌──────────┐                     ┌──────────────┐              ┌───────────┐
│  Client  │                     │  API Gateway  │              │  Lambda   │
│  (React) │                     │  WebSocket    │              │  Handler  │
└────┬─────┘                     └──────┬───────┘              └─────┬─────┘
     │                                  │                            │
     │  1. new WebSocket(wss://…?token=JWT)                          │
     │ ─────────────────────────────────>│                           │
     │                                  │  2. $connect route        │
     │                                  │ ─────────────────────────>│
     │                                  │                            │
     │                                  │      3. Verify JWT         │
     │                                  │         Extract school_id  │
     │                                  │         Extract user_id    │
     │                                  │                            │
     │                                  │      4. DynamoDB PutItem   │
     │                                  │         { connectionId,    │
     │                                  │           schoolId,        │
     │                                  │           userId,          │
     │                                  │           ttl }            │
     │                                  │                            │
     │                                  │  5. Return { statusCode:   │
     │                                  │ <────────────── 200 }      │
     │  6. Connection OPEN              │                            │
     │ <────────────────────────────────│                            │
     │                                  │                            │
     │          ─ ─ ─ connection active ─ ─ ─                        │
     │                                  │                            │
     │  7. Client sends close / tab closes                           │
     │ ─────────────────────────────────>│                           │
     │                                  │  8. $disconnect route     │
     │                                  │ ─────────────────────────>│
     │                                  │                            │
     │                                  │      9. DynamoDB           │
     │                                  │         DeleteItem         │
     │                                  │         (connectionId)     │
     │                                  │                            │
     │  10. Connection CLOSED           │  <─────── { 200 }         │
     │ <────────────────────────────────│                            │
```

### 8.4 Authentication on `$connect`

WebSocket API Gateway does **not** support the Cognito JWT authorizer natively. Authentication is handled in the `$connect` Lambda handler:

1. Extract `token` from the query string: `event.queryStringParameters.token`.
2. Decode the JWT header to get the `kid` (Key ID).
3. Fetch the Cognito JWKS from `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json` (cached in Lambda memory after first fetch).
4. Verify the JWT signature using the matching public key.
5. Validate claims: `token_use === 'access'`, `iss` matches the user pool, `exp` > now.
6. Extract `sub` (user_id) and `custom:school_id` from the token.
7. If verification fails → return `{ statusCode: 401 }` → API Gateway terminates the connection.

### 8.5 DynamoDB Connection Record

Written on `$connect`, deleted on `$disconnect`:

```json
{
  "connectionId": "Abc123xyz=",
  "schoolId": "school_7f2a...",
  "userId": "user_3e1b...",
  "connectedAt": "2026-03-12T10:15:00.000Z",
  "ttl": 1741859700
}
```

| Field | Description |
|-------|-------------|
| `connectionId` | Partition key. Assigned by API Gateway. |
| `schoolId` | Used by Fargate to look up connections for a school (via GSI). |
| `userId` | Identifies which user connected (for future per-user targeting). |
| `connectedAt` | ISO timestamp for observability. |
| `ttl` | DynamoDB TTL (epoch seconds). Set to `connectedAt + 86400` (24h). Safety net — if `$disconnect` is never fired (network drop), the record auto-expires. |

**GSI**: `schoolId-index` (partition key: `schoolId`). Fargate queries this GSI to find all active connections for the school.

### 8.6 Server-to-Client Message Format

All messages pushed from the server follow a consistent envelope:

```json
{
  "type": "GENERATION_COMPLETE",
  "payload": {
    "jobId": "job-uuid",
    "divisionId": "div-uuid",
    "status": "COMPLETED",
    "message": "Timetable generated successfully for Class VII A."
  },
  "timestamp": "2026-03-12T10:17:30.000Z"
}
```

**Message Types** (pilot):

| `type` | Trigger | `payload` Fields |
|--------|---------|-----------------|
| `GENERATION_COMPLETE` | Fargate finishes successfully | `jobId`, `divisionId`, `status: "COMPLETED"`, `message` |
| `GENERATION_FAILED` | Fargate fails to find a valid solution | `jobId`, `divisionId`, `status: "FAILED"`, `errorMessage` |

Future message types (post-pilot): `NOTIFICATION_CREATED`, `EXPORT_READY`.

### 8.7 Push Mechanism (Fargate → Client)

The Fargate timetable engine pushes messages using the **API Gateway Management API**:

```python
import boto3
import json

def push_ws_message(school_id: str, message: dict):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])

    # Query GSI to find all connections for this school
    response = table.query(
        IndexName='schoolId-index',
        KeyConditionExpression='schoolId = :sid',
        ExpressionAttributeValues={':sid': school_id}
    )

    apigw = boto3.client(
        'apigatewaymanagementapi',
        endpoint_url=os.environ['WS_API_ENDPOINT']
    )

    for item in response['Items']:
        connection_id = item['connectionId']
        try:
            apigw.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(message).encode('utf-8')
            )
        except apigw.exceptions.GoneException:
            # Connection no longer valid — clean up
            table.delete_item(Key={'connectionId': connection_id})
```

**Error handling**: If `PostToConnection` raises `GoneException` (client disconnected), the stale record is removed from DynamoDB. Any other error is logged but does not fail the generation.

### 8.8 Client-Side Implementation

**Connection establishment** (React):

```typescript
// hooks/useWebSocket.ts
const WS_URL = import.meta.env.VITE_WS_URL;

function useWebSocket() {
  const token = useSelector(selectAccessToken);
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
          dispatch(generationComplete(msg.payload));
          break;
        case 'GENERATION_FAILED':
          dispatch(generationFailed(msg.payload));
          break;
      }
    };

    ws.onclose = () => {
      dispatch(setWsConnected(false));
      // Exponential backoff reconnect
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

**Redux state** (`slices/wsSlice.ts`):

| State Field | Type | Description |
|-------------|------|-------------|
| `connected` | `boolean` | Whether the WebSocket is currently open |
| `lastMessage` | `WsMessage \| null` | Most recent message received |

**Fallback polling**: If `connected === false` and a generation job is in-progress, the UI polls `GET /timetables/jobs/:jobId` every 5 seconds via RTK Query with `pollingInterval: 5000`.

### 8.9 Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **Token in query string** | WebSocket API does not support `Authorization` header during handshake. The `?token=` is transmitted over TLS (WSS). The token is short-lived (1 hour). |
| **Token expiry during session** | If the WebSocket connection is active for >1 hour, the server will reject new `PostToConnection` calls only if the connection has been idle too long. API Gateway has a 10-minute idle timeout and a 2-hour max connection duration. The client reconnects with a fresh token on close. |
| **Connection hijacking** | Each connection is scoped to a `schoolId` from the verified JWT. Messages are only sent to connections matching the `schoolId` of the generation job. |
| **DDoS via $connect** | API Gateway WebSocket API has a default limit of 500 new connections/second. The `$connect` handler performs JWT verification before writing to DynamoDB — unauthenticated connections are rejected immediately. |

### 8.10 Limits

| Limit | Value | Source |
|-------|-------|--------|
| Max message size (server → client) | 128 KB | API Gateway |
| Idle connection timeout | 10 minutes | API Gateway (configurable) |
| Max connection duration | 2 hours | API Gateway |
| Max concurrent connections | 500 | API Gateway default (sufficient for 15–20 users) |
| DynamoDB TTL cleanup | 24 hours | Application-set TTL |

---

*End of Section 8.*

---

## 9. Elective Group Model

### 9.1 Concept

An **elective group** represents a set of two or more subjects that are taught **simultaneously in parallel sessions** during the same time slot(s). Students in the division are split across the subjects, each taught by a different teacher in a different room.

**Real-world examples** (from the school's data):

| Elective Group Name | Subjects | Applies To |
|---------------------|----------|-----------|
| Biology / Computer Science | Biology, Computer Science | Class XI A/B Science, Class XII A/B Science |
| Maths / IP | Mathematics, Informatics Practices | Class XI C Commerce, Class XII C Commerce |
| Maths / IP / Psychology | Mathematics, Informatics Practices, Psychology | Class XI D Humanities, Class XII D Humanities |

> **Note**: "Combined subjects" (where a class has subjects that share periods) use the **same elective group mechanism**. There is no separate "combined subject" concept in the system.

### 9.2 Data Model

The elective group model spans three tables:

```
┌──────────────────────────┐
│    elective_groups       │
│──────────────────────────│        ┌──────────────────────────┐
│  id (PK)                 │───┐    │  elective_group_subjects │
│  school_id (FK)          │   │    │──────────────────────────│
│  academic_year_id (FK)   │   └───>│  id (PK)                 │
│  name                    │        │  elective_group_id (FK)  │
│  deleted_at              │        │  subject_id (FK)  ───────┼──> subjects
│  created_at              │        │  school_id (FK)          │
│  updated_at              │        └──────────────────────────┘
└──────────────────────────┘
                                         │
                                         │ (linked via division_assignments.elective_group_id)
                                         ▼
┌───────────────────────────────────────────────────────────────────┐
│  division_assignments                                              │
│───────────────────────────────────────────────────────────────────│
│  id (PK)                                                           │
│  division_id (FK)                                                  │
│  subject_id (FK)  ◄── one of the group's subjects                  │
│  teacher_id (FK)  ◄── unique per subject in the group              │
│  assistant_teacher_id (FK, nullable)                               │
│  weightage        ◄── same for all assignments in the group        │
│  elective_group_id (FK, nullable) ◄── links to the group          │
│  ...                                                               │
└───────────────────────────────────────────────────────────────────┘
```

### 9.3 Lifecycle

#### 9.3.1 Create an Elective Group

1. Admin navigates to the Elective Groups screen.
2. Clicks "Add Elective Group".
3. Enters a name (e.g., "Biology / Computer Science").
4. Selects 2+ subjects from the subject list.
5. System creates one `elective_groups` row and N `elective_group_subjects` rows.

**Validation**:
- Name must be unique within the school+year.
- At least 2 subjects required.
- Each subject can belong to **multiple** elective groups (e.g., "Computer Science" can be in both "Bio/CS" and "Maths/CS" groups).

#### 9.3.2 Assign an Elective Group to a Division

1. Admin opens the Division Assignments editor (Screen 10).
2. Clicks "Add Elective Assignment".
3. Selects an elective group from the dropdown.
4. For each subject in the group, selects a teacher (and optionally an assistant teacher).
5. Enters a single weightage value (applied to all subjects in the group).
6. System calls `POST /assignments/elective`.

**What happens on save**:
- One `division_assignment` row is created per subject in the group.
- All rows share the same `elective_group_id` and the same `weightage`.
- Each row has a **different** `teacher_id`.

**Example**: Assigning "Bio/CS" with weightage 9 to Class XII A:

| division_assignment.id | subject | teacher | weightage | elective_group_id |
|------------------------|---------|---------|-----------|-------------------|
| asgn-1 | Biology | Anu S Nair | 9 | eg-bio-cs |
| asgn-2 | Computer Science | Swetha | 9 | eg-bio-cs |

#### 9.3.3 Display in the Assignments Table

Elective group assignments are visually grouped in the UI:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Division Assignments — Class XII A (Science)                          │
├────────────┬────────────────┬──────────────────────┬──────────┬───────┤
│  Subject   │  Teacher       │  Assistant Teacher   │  Wt.     │ Edit  │
├────────────┼────────────────┼──────────────────────┼──────────┼───────┤
│  English   │  Soumya        │  —                   │  5       │  ✎ 🗑 │
│  Physics   │  Divya         │  —                   │  7       │  ✎ 🗑 │
├────────────┴────────────────┴──────────────────────┴──────────┴───────┤
│  ⟐ Elective: Biology / Computer Science                    Wt: 9     │
│  ├─ Biology          │  Anu S Nair     │  —                │         │
│  └─ Computer Science │  Swetha         │  —                │   ✎ 🗑  │
├────────────┬────────────────┬──────────────────────┬──────────┬───────┤
│  Hindi     │  Lalitha       │  —                   │  4       │  ✎ 🗑 │
└────────────┴────────────────┴──────────────────────┴──────────┴───────┘
│  Total: 45 / 45 periods                                    Balanced ✓ │
└────────────────────────────────────────────────────────────────────────┘
```

- The elective group is rendered as a **collapsed group row** with the group name and shared weightage.
- Individual subject rows are indented beneath the group header.
- Edit/delete actions apply to the **entire group assignment** (not individual subjects).

### 9.4 Timetable Generation Rules

During genetic algorithm execution, elective groups impose these **hard constraints**:

| Rule | Description |
|------|-------------|
| **Co-scheduling** | All `division_assignment` rows sharing the same `elective_group_id` must be placed in the **exact same** `(working_day_id, slot_id)` combination(s). If weightage = 9 and the division has 5 working days, the group occupies 9 slot positions — in each position, all subjects in the group run simultaneously. |
| **No teacher clash** | Each subject in the group has a different teacher. The GA must ensure none of these teachers are scheduled elsewhere in the same slot (across all divisions). |
| **Weightage match** | The number of slots assigned to the group must equal the `weightage` value. Since all subjects share the same weightage, they automatically get the same count. |
| **Adjacency (if enabled)** | If `adjacencyConstraint` is on and the group has >1 slot on the same day, the slots must be adjacent (no break or other subject between them). |

### 9.5 Timetable Display

In the timetable grid (Screen 12), an elective group slot shows **both subjects** stacked:

```
┌─────────────────────────┐
│  Period 3               │
│  ┌────────────────────┐ │
│  │ Biology             │ │
│  │ Anu S Nair          │ │
│  ├────────────────────┤ │
│  │ Computer Science    │ │
│  │ Swetha              │ │
│  └────────────────────┘ │
│  ⟐ Bio/CS Elective     │
└─────────────────────────┘
```

- The cell has a distinct visual indicator (e.g., a split background or elective badge "⟐").
- Hovering or clicking the cell shows the full elective group name.
- In the **teacher timetable view** (Screen 14), the teacher sees only their own subject line — e.g., Anu S Nair sees "Biology — Class XII A" in that slot, not the Computer Science line.

### 9.6 Drag-and-Drop Rules

When an elective group slot is dragged in the timetable editor:

1. **All subjects in the group move together** — you cannot drag just one subject out of the group.
2. The `POST /timetables/:id/validate-move` endpoint checks:
   - `TEACHER_CLASH` for **every teacher** in the group at the target slot.
   - `ELECTIVE_GROUP_BREAK` if the dropped position would separate one subject from the others (this should never happen in the UI since they move as a unit, but the API validates defensively).
3. Swapping: if the target slot already has an assignment, the swap applies to all subjects in both slots.

### 9.7 Modification & Deletion

| Action | Effect |
|--------|--------|
| **Edit group definition** (add/remove subjects) | If the group is assigned to divisions, the system warns. Adding a subject requires the admin to assign a teacher for that subject in each affected division. Removing a subject deletes the corresponding `division_assignment` rows and flags affected timetables as `OUTDATED`. |
| **Delete group** | If assigned to any division, returns `409`. With `?confirm=true`: removes `elective_group_id` from all linked `division_assignment` rows (they become standalone assignments) and flags timetables as `OUTDATED`. |
| **Delete a subject that's in a group** | Returns `409` listing affected elective groups. With `?confirm=true`: removes the subject from the group. If the group drops below 2 subjects, the group is auto-dissolved (all assignments become standalone). |
| **Delete a division assignment within a group** | Not allowed individually — the entire elective group assignment must be deleted. |

### 9.8 Notification & Invalidation

When an elective group is modified (subjects added/removed, group deleted), the Notification Service receives an `ELECTIVE_GROUP_CHANGED` event and:

1. Finds all `division_assignments` with the affected `elective_group_id`.
2. For each affected division, finds the timetable (if generated).
3. Creates a `timetable_notifications` record with `conflict_type = 'ELECTIVE_GROUP_CHANGED'` and a human-readable description.
4. Sets the timetable status to `OUTDATED`.

---

*End of Section 9.*

---

## 10. Timetable Generation Engine

### 10.1 Overview

The timetable generation engine is a **Python 3.12 application** running on **AWS Fargate** (1 vCPU, 2 GB RAM). It uses a **genetic algorithm (GA)** to produce a conflict-free weekly timetable for a single division.

**Input**: All structured data for the division (period structure, assignments, teacher availability, existing timetables for other divisions).  
**Output**: A complete assignment of subjects to time slots such that all hard constraints are satisfied and soft constraints are optimized.

### 10.2 Trigger & Lifecycle

```
┌───────────┐     ┌──────────────────┐      ┌─────────────┐     ┌──────────┐
│  Client   │     │ Timetable Service│      │   Fargate   │     │  Client  │
│  (React)  │     │    (Lambda)      │      │   (Python)  │     │  (React) │
└─────┬─────┘     └────────┬─────────┘      └──────┬──────┘     └────┬─────┘
      │                    │                        │                  │
      │  POST /generate    │                        │                  │
      │───────────────────>│                        │                  │
      │                    │                        │                  │
      │                    │  INSERT generation_job │                  │
      │                    │  (status: PENDING)     │                  │
      │                    │                        │                  │
      │                    │  ECS RunTask           │                  │
      │                    │───────────────────────>│                  │
      │                    │                        │                  │
      │  202 { jobId }     │                        │                  │
      │<───────────────────│                        │                  │
      │                    │                        │                  │
      │                    │   UPDATE job → RUNNING │                  │
      │                    │                        │                  │
      │                    │   Load data from RDS   │                  │
      │                    │   Run GA (30s–5min)    │                  │
      │                    │                        │                  │
      │                    │   Write timetable +    │                  │
      │                    │   slots to RDS         │                  │
      │                    │                        │                  │
      │                    │   UPDATE job →         │                  │
      │                    │   COMPLETED            │                  │
      │                    │                        │                  │
      │                    │   Query DynamoDB for   │                  │
      │                    │   school connections   │                  │
      │                    │                        │                  │
      │                    │   PostToConnection     │                  │
      │                    │   (WSS push)  ─────────┼─────────────────>│
      │                    │                        │                  │
      │                    │   EXIT (task stops)    │   UI updates     │
```

### 10.3 Data Loading Phase

On startup, the engine loads the following from RDS (single read pass):

| Data | Query | Purpose |
|------|-------|---------|
| **Period structure** | `period_structures` → `working_days` → `slots` for the division's class | Defines the grid: which days, which slots, which are breaks |
| **Division assignments** | `division_assignments` WHERE `division_id` and `deleted_at IS NULL` | The subjects, teachers, weightages, and elective group links to schedule |
| **Teacher availability** | `teacher_availability` WHERE `teacher_id IN (assigned teachers)` | Slots where teachers are **unavailable** (hard constraint) |
| **Other timetables** | `timetable_slots` JOIN `division_assignments` for all **other** divisions in the same academic year | Existing teacher placements — needed to prevent cross-division teacher clashes |

All data is loaded into in-memory Python dataclasses for fast access during the GA.

### 10.4 Chromosome Representation

Each **chromosome** (individual) in the GA population represents a complete weekly timetable for the division.

**Encoding**: A 1D integer array of length `P` (total period slots across all working days).

```
chromosome = [a3, a1, a5, a2, a1, a4, a3, a5, a2, a1, ...]
              ↑    ↑    ↑    ↑    ↑    ↑    ↑    ↑    ↑    ↑
              Mon  Mon  Mon  Mon  Mon  Tue  Tue  Tue  Tue  Tue
              P1   P2   P3   P4   P5   P1   P2   P3   P4   P5
```

- Each position maps to a `(working_day, slot)` pair (only `PERIOD`-type slots; breaks are excluded from the chromosome).
- Each gene value is an **assignment index** referencing a `division_assignment` ID.
- The chromosome length `P` = Σ (period-type slots per day × number of working days).

**Example**: For a division with 5 working days and 8 periods each → `P = 40` genes.

### 10.5 Initialization

The initial population is seeded with a **greedy heuristic** to improve convergence:

1. Create a pool of `(assignment_id, count)` pairs from the weightages. E.g., if Math has weightage 7, the pool has 7 copies of Math's assignment ID.
2. Shuffle the pool randomly.
3. Place assignments into the chromosome sequentially, skipping slots where a hard constraint would be violated (teacher unavailable, teacher clash with other division).
4. If a placement fails, try the next assignment in the pool.
5. Repeat for each individual in the initial population.

This produces semi-valid starting solutions that the GA can refine.

**Population size**: 100 individuals (configurable via env var `GA_POPULATION_SIZE`, default 100).

### 10.6 Constraint System

#### 10.6.1 Hard Constraints (Must Not Be Violated)

Each violation adds a **large penalty** (1000 points per occurrence) to the fitness function. The GA will never accept a solution with hard constraint violations as final output.

| # | Constraint | Description |
|---|-----------|-------------|
| H1 | **Weightage satisfaction** | Each assignment must appear exactly `weightage` times in the chromosome. |
| H2 | **Teacher availability** | No assignment may be placed in a slot where its teacher is marked unavailable (`teacher_availability` table). |
| H3 | **Teacher clash (intra-division)** | The same teacher cannot appear in two different assignments in the same `(day, slot)` within this division. |
| H4 | **Teacher clash (cross-division)** | The teacher must not be scheduled in the same `(day, slot)` in any other division's existing timetable. |
| H5 | **Assistant teacher clash** | If an assignment has an assistant teacher, the assistant must not be double-booked in the same slot (intra- or cross-division). |
| H6 | **Elective group co-scheduling** | All assignments sharing the same `elective_group_id` must occupy the **exact same set** of `(day, slot)` positions. |

#### 10.6.2 Soft Constraints (Optimized But Can Be Relaxed)

Each violation adds a **small penalty** (1–10 points per occurrence).

| # | Constraint | Weight | Description |
|---|-----------|--------|-------------|
| S1 | **Subject distribution** | 5 | Subjects should be spread across different days. Penalize having >2 periods of the same subject on the same day. |
| S2 | **Teacher workload balance** | 3 | Avoid scheduling all of a teacher's periods in a single day. Penalize if a teacher has >5 periods on one day. |
| S3 | **Adjacency** (when enabled) | 10 | If `ADJACENCY_CONSTRAINT=true`: when a subject appears >1 time on the same day, the periods must be consecutive (no gap). Each non-adjacent pair adds penalty. |
| S4 | **First/last period variety** | 2 | Avoid scheduling the same subject in the first period every day. |

### 10.7 Fitness Function

```python
def fitness(chromosome: list[int], context: GenerationContext) -> float:
    score = 0.0

    # Hard constraints
    score -= 1000 * count_weightage_violations(chromosome, context)
    score -= 1000 * count_teacher_unavailability(chromosome, context)
    score -= 1000 * count_teacher_clashes_intra(chromosome, context)
    score -= 1000 * count_teacher_clashes_cross(chromosome, context)
    score -= 1000 * count_assistant_clashes(chromosome, context)
    score -= 1000 * count_elective_group_violations(chromosome, context)

    # Soft constraints
    score -= 5 * count_subject_clustering(chromosome, context)
    score -= 3 * count_teacher_overload(chromosome, context)
    if context.adjacency_enabled:
        score -= 10 * count_adjacency_violations(chromosome, context)
    score -= 2 * count_first_period_repetition(chromosome, context)

    return score
```

A **perfect score is 0** (no violations). The GA maximizes the fitness function (i.e., minimizes penalties toward 0).

### 10.8 Genetic Operators

| Operator | Strategy | Details |
|----------|----------|---------|
| **Selection** | Tournament selection (size 5) | Pick 5 random individuals, select the fittest. |
| **Crossover** | Day-preserving crossover | Split at day boundaries (not mid-day) to preserve daily structure. For each day, inherit from Parent A or Parent B with 50% probability. |
| **Mutation** | Swap mutation | With probability `P_mutation` (default 0.15), pick two random positions in the chromosome and swap their gene values. Elective group genes are swapped as a unit (all subjects in the group move together). |
| **Elitism** | Top 5% carried forward | The best 5 individuals survive unchanged to the next generation. |

### 10.9 Elective Group Handling in GA

Elective groups require special treatment throughout the GA:

1. **Initialization**: All assignments in an elective group are placed in the same slots. The group is treated as a **single scheduling unit** with N parallel teachers.

2. **Crossover**: When a day is inherited from a parent, all elective group members at each slot on that day are inherited together (never split).

3. **Mutation (swap)**: When a position containing an elective group gene is selected for swap:
   - Find all positions occupied by the same elective group on the same day.
   - Swap the **entire block** with the target position block.
   - If the target also has an elective group, swap both blocks atomically.

4. **Fitness evaluation**: The `count_elective_group_violations` function checks that for each elective group assigned to this division, the set of `(day, slot)` positions for subject A exactly equals the set for subject B (and C if 3 subjects). Any mismatch is a hard constraint violation.

### 10.10 Termination Criteria

The GA terminates when **any** of these conditions is met:

| Condition | Value | Rationale |
|-----------|-------|-----------|
| **Perfect fitness** | Score == 0 | All hard and soft constraints satisfied. |
| **Max generations** | 2000 | Upper bound to prevent infinite loops. |
| **Stagnation** | 200 generations with no improvement | Solution is likely at a local optimum. |
| **Time limit** | 5 minutes wall-clock | Fargate task budget. |

### 10.11 Post-Processing

After the GA terminates:

1. **Select the best individual** from the final population.
2. **Validate hard constraints**: If any hard constraint violations remain (score < 0 due to H1–H6), the generation has **failed**.
   - Set `generation_jobs.status = 'FAILED'`.
   - Set `generation_jobs.error_message` to a human-readable summary: e.g., "Could not resolve teacher clash for Julie between Class VII A and Class X B in Monday Period 3."
   - Push `GENERATION_FAILED` via WebSocket.
3. **If valid** (all hard constraints satisfied, possibly soft violations remain):
   - Decode the chromosome into `(working_day_id, slot_id, division_assignment_id)` triples.
   - **Transaction**: Within a single database transaction:
     - If a timetable already exists for this division (`overwrite=true`), delete existing `timetable_slots` rows.
     - Upsert the `timetables` row (status = `GENERATED`, `adjacency_constraint_enabled`, `generated_at = now()`).
     - Bulk insert `timetable_slots` rows.
   - Update `generation_jobs.status = 'COMPLETED'`, `completed_at = now()`.
   - Push `GENERATION_COMPLETE` via WebSocket.

### 10.12 Output Data

The engine writes to these tables:

**`timetables`** (one row per division):

```sql
INSERT INTO timetables (id, school_id, division_id, academic_year_id, status,
                        adjacency_constraint_enabled, generated_at)
VALUES ($1, $2, $3, $4, 'GENERATED', $5, NOW())
ON CONFLICT (school_id, division_id, academic_year_id)
DO UPDATE SET status = 'GENERATED', adjacency_constraint_enabled = $5, generated_at = NOW();
```

**`timetable_slots`** (one row per period slot per day):

```sql
-- Example: 5 days × 8 periods = 40 rows
INSERT INTO timetable_slots (id, school_id, timetable_id, working_day_id, slot_id,
                             division_assignment_id)
VALUES ($1, $2, $3, $4, $5, $6);
```

For elective groups, each slot position produces **N rows** (one per subject in the group), all with the same `(working_day_id, slot_id)` but different `division_assignment_id` values.

### 10.13 Performance Characteristics

| Metric | Typical Value | Worst Case |
|--------|---------------|------------|
| **Population size** | 100 | 200 |
| **Chromosome length** | 40 (8 periods × 5 days) | 54 (9 periods × 6 days) |
| **Assignments per division** | 10–15 | 20 (with multiple elective groups) |
| **Generations to converge** | 200–500 | 2000 (max) |
| **Wall-clock time** | 30–90 seconds | 5 minutes (timeout) |
| **Memory usage** | ~200 MB | ~500 MB (large cross-division data) |

**Scaling note**: The engine generates one division at a time. For 32 divisions, the admin triggers generation sequentially (or in the future, multiple Fargate tasks can run in parallel). Cross-division data is read at the start and treated as fixed — there is no coordination between concurrent generations.

### 10.14 Error Scenarios

| Scenario | Behavior |
|----------|----------|
| **No valid solution found** | Job status → `FAILED`. Error message describes the most common unresolvable conflict (e.g., "Teacher X has 42 assigned periods but only 40 available slots"). |
| **Database connection lost mid-generation** | Caught exception → job status remains `RUNNING` (no update possible). Fargate task exits with non-zero code. Client falls back to polling; after 5 minutes with no completion, UI shows "Generation may have failed — please retry." |
| **Fargate task killed (OOM / timeout)** | Fargate stop reason logged to CloudWatch. Job remains `RUNNING`. A background reconciliation (future enhancement) or manual retry handles this. |
| **WebSocket push fails** | Logged but not critical. Client's polling fallback detects job completion on next poll cycle. |
| **Cross-division data stale** | If another division's timetable changes during generation, the new timetable may have teacher clashes. The Notification Service will detect and flag these post-generation. |

### 10.15 Configuration

All GA parameters are configurable via environment variables:

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `GA_POPULATION_SIZE` | 100 | Number of individuals per generation |
| `GA_MAX_GENERATIONS` | 2000 | Maximum generations before forced stop |
| `GA_STAGNATION_LIMIT` | 200 | Generations with no improvement before stop |
| `GA_MUTATION_RATE` | 0.15 | Probability of mutation per offspring |
| `GA_CROSSOVER_RATE` | 0.8 | Probability of crossover per pair |
| `GA_TOURNAMENT_SIZE` | 5 | Tournament selection pool size |
| `GA_ELITE_PERCENT` | 0.05 | Fraction of population preserved via elitism |
| `GA_TIME_LIMIT_SECONDS` | 300 | Wall-clock timeout (5 minutes) |
| `HARD_PENALTY` | 1000 | Penalty per hard constraint violation |

---

*End of Section 10.*

---

## 11. UI/UX Screen Specifications

This section details every screen in the application. Screens map 1-to-1 with React Router routes defined in Section 3.2.4. All screens share a common shell (sidebar navigation, top bar with academic-year selector and theme toggle) except Screen 0 (Login/Registration).

### 11.0 Global Shell

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⟐ School Timetable        AY: 2026-27 ▾     🌙/☀ Toggle    Admin ▾│
├──────────┬───────────────────────────────────────────────────────────┤
│          │                                                           │
│  ☰ Menu  │                   Content Area                            │
│          │                                                           │
│  Dashboard│                                                          │
│  Academic │                                                          │
│   Years   │                                                          │
│  Classes  │                                                          │
│  Subjects │                                                          │
│  Teachers │                                                          │
│  Elective │                                                          │
│   Groups  │                                                          │
│  Generate │                                                          │
│  Notifi-  │                                                          │
│   cations │                                                          │
│  Teacher  │                                                          │
│   View    │                                                          │
│  Settings │                                                          │
│          │                                                           │
│          │                                                           │
└──────────┴───────────────────────────────────────────────────────────┘
```

**Global elements**:

| Element | Behavior |
|---------|----------|
| **Academic Year selector** | Dropdown in top bar. Changing the year reloads all data. Active year shown with green badge; archived years with grey badge. Selecting an archived year puts the entire app into **read-only mode** (all mutation buttons disabled, grey overlay on forms). |
| **Theme toggle** | Sun/moon icon. Toggles `dark` class on `<html>`. Preference saved in `localStorage`. |
| **User menu** | Dropdown: School Name (display), Logout. |
| **Sidebar** | Collapsible. Active route highlighted. Badge on "Notifications" if unread count >0. |
| **Breadcrumb** | Shown on nested pages (e.g., Classes > Class VII > Division A > Assignments). Clickable segments for navigation. |
| **Toast notifications** | `react-hot-toast` bottom-right. Success (green), Error (red), Info (blue). Auto-dismiss after 4 seconds. |

**Responsive behavior**:

| Breakpoint | Layout |
|------------|--------|
| `≥1440px` (xl) | Sidebar always visible (240px). Full content area. |
| `1024–1439px` (lg) | Sidebar collapsed to icon-only (64px). Hover to expand. |
| `640–1023px` (md) | Sidebar hidden. Hamburger menu in top bar to toggle overlay sidebar. |
| `<640px` (sm) | Same as md. Tables switch to card layout. Timetable grid scrolls horizontally. |

---

### 11.1 Screen 0 — Login / Registration

**Route**: `/login`  
**Auth**: Public (no `<AuthGuard>`)

```
┌────────────────────────────────────────────────┐
│                                                │
│         ⟐ School Timetable Manager             │
│                                                │
│    ┌──────────────────────────────────────┐    │
│    │  Email        [________________]     │    │
│    │  Password     [________________]     │    │
│    │                                      │    │
│    │  ☐ Remember me                       │    │
│    │                                      │    │
│    │  [ Login ]                           │    │
│    │                                      │    │
│    │  Forgot Password?                    │    │
│    │  Register New School →               │    │
│    └──────────────────────────────────────┘    │
│                                                │
└────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Login form** | Email + Password fields. Cognito `USER_PASSWORD_AUTH` flow. On success: store JWT in memory, refresh token in `httpOnly` logic (Cognito SDK handles). Redirect to `/`. |
| **Remember me** | If checked, Cognito refresh token persists in `localStorage`; otherwise `sessionStorage`. |
| **Forgot Password** | Inline swap to email-only form. Calls Cognito `forgotPassword`. Shows "Check your email" message. Link in email → confirm form (code + new password). |
| **Register** | Inline swap to registration form: School Name, Admin Email, Password, Confirm Password. Password strength indicator (red/amber/green bar). On submit: Cognito `signUp` → auto-confirm (admin trigger) → login → redirect to `/`. |
| **Validation** | Email format, password ≥8 chars with mixed case + number, confirm match. Errors shown inline beneath fields. |

---

### 11.2 Screen 1 — Dashboard

**Route**: `/` (protected)

```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard                                          AY: 2026-27 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Classes  │ │Divisions │ │ Teachers │ │ Subjects │           │
│  │    12    │ │    32    │ │    54    │ │    31    │           │
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
│  • Manage Classes & Divisions                                    │
│  • Generate Timetables                                           │
│  • View Teacher Timetable                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Summary cards** | 6 cards. Data fetched via `GET /dashboard/summary`. Cards are clickable — navigate to respective list page. |
| **Conflict banner** | Visible only if `outdatedTimetableCount > 0`. Orange background in light mode, amber in dark mode. Links to `/notifications` (Screen 13). |
| **Quick links** | Static navigation shortcuts. |
| **Loading state** | Skeleton shimmer placeholders while data loads. |
| **Empty state** | First-time user sees a welcome message with setup wizard guidance: "Start by creating your academic year →". |

---

### 11.3 Screen 2 — Academic Year Management

**Route**: `/academic-years`

```
┌──────────────────────────────────────────────────────────────────┐
│  Academic Years                            [ + Create New Year ] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┬────────────┬────────────┬──────────┬──────────┐ │
│  │  Label     │  Start     │  End       │  Status  │  Actions │ │
│  ├────────────┼────────────┼────────────┼──────────┼──────────┤ │
│  │  2026-27   │ 01 May '26 │ 31 Mar '27 │ ● Active │          │ │
│  │  2025-26   │ 01 May '25 │ 31 Mar '26 │ Archived │ View     │ │
│  └────────────┴────────────┴────────────┴──────────┴──────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Create form** | Modal dialog: Label (text, required), Start Date (date picker), End Date (date picker). Validation: end > start, label unique. On save: `POST /academic-years`. New year defaults to `INACTIVE`; admin must explicitly "Set as Active". |
| **Set as Active** | Button on inactive rows. Calls `PATCH /academic-years/:id/activate`. Confirms "This will archive the current active year." |
| **Archived year** | Row greyed out. Click → navigates to Dashboard in read-only mode for that year. |

---

### 11.4 Screen 3 — Period Structures List

**Route**: `/settings/period-structures`

```
┌──────────────────────────────────────────────────────────────────┐
│  Period Structures (Settings)          [ + Add Period Structure ] │
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

| Component | Detail |
|-----------|--------|
| **Table** | Paginated (10/page). Shows assigned classes as comma-separated pills. |
| **Edit** | Navigates to Screen 3A with the structure pre-loaded. |
| **Delete** | If classes are assigned, modal warns: "X classes are linked to this structure. They will not have a period structure until reassigned." Requires confirmation. |

---

### 11.5 Screen 3A — Period Structure Editor

**Route**: `/settings/period-structures/:id` (edit) or `/settings/period-structures/new` (create)

```
┌──────────────────────────────────────────────────────────────────┐
│  Period Structure Editor                                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Structure Name: [Senior Block___________]                       │
│                                                                  │
│  Working Days:  ☑ Mon  ☑ Tue  ☑ Wed  ☑ Thu  ☑ Fri  ☐ Sat ☐ Sun│
│                                                                  │
│  Assigned Classes: [Multi-select: I, II, ... XII ]               │
│                                                                  │
│  ─── Day-wise Slot Configuration ─────────────────────────────── │
│  ┌─────┬─────┬─────┬─────┬─────┐                                │
│  │ Mon │ Tue │ Wed │ Thu │ Fri │  (one tab per working day)     │
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
│  │ ≡  │ —   │ Interval  │ 14:15     │ 14:30    │ 15m    │  🗑  ││
│  │ ≡  │ 7   │ Period    │ 14:30     │ 15:15    │ 45m    │  🗑  ││
│  │ ≡  │ 8   │ Period    │ 15:15     │ 16:00    │ 45m    │  🗑  ││
│  └────┴─────┴───────────┴───────────┴──────────┴────────┴──────┘│
│                                                                  │
│  [ + Add Slot ]                                                  │
│                                                                  │
│  [ Save ]  [ Reset to Default ]  [ Cancel ]                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Drag handle** (≡) | `@dnd-kit/sortable`. Drag rows to reorder. Slot numbers (period only) auto-recalculate on drop. |
| **Type selector** | Dropdown: Period, Interval, Lunch Break. Changing type recalculates period numbers. |
| **Time inputs** | `<input type="time">`. Inline validation: end > start. Warning toast if gap/overlap detected between consecutive slots. |
| **Duration** | Auto-calculated (readonly). Displayed as "45m", "15m", etc. |
| **Copy from day** | Dropdown copies the entire slot configuration from another working day. Overwrites current day's slots. Confirmation dialog shown. |
| **Add Slot** | Appends a new row with defaults (Type: Period, Start: previous slot's end, End: start + 45min). |
| **Delete slot** | If slot is referenced by any timetable, shows warning modal listing affected timetables. |
| **Reset to Default** | Restores to the system default (Mon–Fri, 8 periods, 3 breaks). Confirmation required. |
| **Assigned Classes** | Multi-select with search. If a class is already assigned to another structure, it appears with a warning icon and tooltip: "Currently in 'Primary Block' — will be reassigned." |

---

### 11.6 Screen 4 — Subjects List

**Route**: `/subjects`

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
│  │  ...             │  ...                 │          │         │
│  └──────────────────┴──────────────────────┴──────────┘         │
│                                                                  │
│  ◀ 1 2 3 ▶                                                      │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Search** | Client-side filter by subject name. Debounced 300ms. |
| **Assigned Teachers** | Derived from teacher records where subject is in their qualified list. Displayed as comma-joined text, max 3 visible + "+N more" tooltip. |
| **Delete** | If subject has active division assignments: modal warns "This subject is currently assigned in X divisions. Deleting will remove those assignments and flag Y timetables as outdated." Requires `?confirm=true`. |

---

### 11.7 Screen 5 — Add / Edit Subject

**Route**: `/subjects/new` (create) or `/subjects/:id/edit` (edit)

Simple form: single field **Subject Name** (required, unique per school). Save → `POST /subjects` or `PUT /subjects/:id`. Cancel → back to Screen 4.

---

### 11.8 Screen 6 — Teachers List

**Route**: `/teachers`

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
│  │  ...             │  ...                  │        │         ││
│  └──────────────────┴───────────────────────┴────────┴─────────┘│
│                                                                  │
│  ◀ 1 2 3 ▶                                                      │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Assign. column** | Number of division assignments. Fetched from the list endpoint. |
| **Delete** | Same pattern as subjects — warns if actively assigned. |

---

### 11.9 Screen 7 — Add / Edit Teacher

**Route**: `/teachers/new` or `/teachers/:id/edit`

```
┌──────────────────────────────────────────────────────────────────┐
│  Add Teacher                                                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Name:            [__________________] (required)                │
│  Contact Details: [__________________] (optional)                │
│                                                                  │
│  Subjects Qualified: [Multi-select dropdown ▾]                   │
│    ┌─────────────┐ ┌──────────┐ ┌─────────┐                    │
│    │ English  ✕  │ │ Hindi  ✕ │ │ + more  │                    │
│    └─────────────┘ └──────────┘ └─────────┘                    │
│                                                                  │
│  ─── Availability ─────────────────────────────────────────────  │
│                                                                  │
│  (Grid: rows = all working days; columns = period slots)         │
│  Click a cell to toggle UNAVAILABLE (red) / AVAILABLE (default)  │
│                                                                  │
│  ┌───────┬────┬────┬────┬────┬────┬────┬────┬────┐             │
│  │       │ P1 │ P2 │ P3 │ P4 │ P5 │ P6 │ P7 │ P8 │             │
│  ├───────┼────┼────┼────┼────┼────┼────┼────┼────┤             │
│  │ Mon   │    │    │ ██ │ ██ │    │    │    │    │             │
│  │ Tue   │    │    │    │    │    │    │    │    │             │
│  │ Wed   │    │    │    │    │    │ ██ │    │    │             │
│  │ Thu   │    │    │    │    │    │    │    │    │             │
│  │ Fri   │    │    │    │    │    │    │    │    │             │
│  └───────┴────┴────┴────┴────┴────┴────┴────┴────┘             │
│  ██ = Unavailable                                                │
│                                                                  │
│  [ Save ]  [ Cancel ]                                            │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Subjects multi-select** | Searchable dropdown. Shows all subjects. Selected items shown as pills with ✕ to remove. |
| **Availability grid** | Rows = working days from **all** period structures in the active year. Columns = period-type slots only (breaks excluded). Each cell is a toggle: click to mark unavailable (filled red/dark square), click again to clear. Saved via `PUT /teachers/:id/availability`. |
| **Period structures note** | If the school has multiple period structures with different slot counts, the grid adapts: rows from different structures may have different column counts. A header row indicates which period structure applies. |

---

### 11.10 Screen 8 — Classes List

**Route**: `/classes`

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
│  │  ...         │  ...       │ ...               │             ││
│  │  Class XI    │  4         │ 2/4 Outdated ⚠    │  View       ││
│  │  Class XII   │  4         │ 4/4 Generated     │  View       ││
│  └──────────────┴────────────┴───────────────────┴─────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Timetable Status** | Aggregated from all divisions: "X/Y Generated". If any division is `OUTDATED`, show amber warning icon. |
| **Add Class** | Modal: Class Name (required, unique). On save: `POST /config/classes`. New class has zero divisions. |
| **View** | Navigates to Screen 9 for that class. |

---

### 11.11 Screen 9 — Class Detail & Division Management

**Route**: `/classes/:classId`

```
┌──────────────────────────────────────────────────────────────────┐
│  Classes > Class XI                              [ + Add Division]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Division A — Science                                     │   │
│  │  Subjects: 9  │  Total Periods: 45/45  │  Status: Generated│  │
│  │  [ Assignments ]  [ Generate ]  [ View Timetable ]  [ 🗑 ] │  │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Division B — Science                                     │   │
│  │  Subjects: 9  │  Total Periods: 45/45  │  Status: Pending │  │
│  │  [ Assignments ]  [ Generate ]  [ Copy Division ]  [ 🗑 ]  │  │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Division C — Commerce                                    │   │
│  │  Subjects: 10 │  Total Periods: 42/45  ⚠  │  Status: —   │  │
│  │  [ Assignments ]  [ Generate ]  [ Copy Division ]  [ 🗑 ]  │  │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Division cards** | One card per division. Shows quick stats. Classes I–X show just letter ("Division B"); XI–XII show letter + stream ("Division C — Commerce"). |
| **Total Periods** | Sum of weightages vs. available period slots. If mismatched, amber warning icon + tooltip "Periods do not match the period structure." |
| **Add Division** | Modal: Division letter (auto-suggested next available, editable), Stream name (required for XI–XII, hidden for I–X), "Copy assignments from" dropdown (all divisions across all classes). On save: creates division + copies assignments if selected. |
| **Copy Division** | Same as "Add Division" but pre-selects the current division in the "Copy from" dropdown. |
| **Delete Division** | If timetable exists: warns "Timetable will be deleted." If assignments exist: warns "All assignments will be removed." Requires confirmation. |

---

### 11.12 Screen 10 — Division Assignments Editor

**Route**: `/classes/:classId/divisions/:divisionId/assignments`

```
┌──────────────────────────────────────────────────────────────────────┐
│  Classes > Class XII > Division A (Science) > Assignments            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [ + Add Assignment ]  [ + Add Elective Assignment ]                 │
│                                                                      │
│  ┌──────────┬───────────┬────────────────┬──────┬──────────────────┐│
│  │ Subject  │ Teacher   │ Asst. Teacher  │ Wt.  │ Actions          ││
│  ├──────────┼───────────┼────────────────┼──────┼──────────────────┤│
│  │ English  │ Soumya    │ —              │  5   │ ✎  🗑            ││
│  │ Physics  │ Divya     │ —              │  7   │ ✎  🗑            ││
│  │ Chemistry│ Lin Maria │ —              │  7   │ ✎  🗑            ││
│  ├──────────┴───────────┴────────────────┴──────┴──────────────────┤│
│  │ ⟐ Elective: Biology / Computer Science              Wt: 9      ││
│  │  ├─ Biology          │ Anu S Nair    │ —              │         ││
│  │  └─ Computer Science │ Swetha        │ —              │  ✎  🗑  ││
│  ├──────────┬───────────┬────────────────┬──────┬──────────────────┤│
│  │ Hindi    │ Lalitha   │ —              │  4   │ ✎  🗑            ││
│  │ PE       │ Shijo     │ —              │  4   │ ✎  🗑            ││
│  │ GK       │ Ashitha   │ —              │  2   │ ✎  🗑            ││
│  └──────────┴───────────┴────────────────┴──────┴──────────────────┘│
│                                                                      │
│  Total: 45 / 45 periods                                 Balanced ✓  │
│                                                                      │
│  [ → Generate Timetable ]                                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Add Assignment modal** | Subject dropdown (all subjects), Teacher dropdown (filtered to teachers qualified for selected subject), Assistant Teacher (optional, filtered, excludes selected primary), Weightage (number, min 1). |
| **Add Elective Assignment modal** | Elective Group dropdown (all groups for this school/year). For each subject in the group: teacher dropdown (qualified + not same as another subject in this group). Single weightage field (applies to all). |
| **Elective row** | Grouped display (see Section 9.3.3). Edit opens a modal with all subjects + teachers pre-populated. Delete removes the entire group assignment. |
| **Same subject indicator** | If the same subject appears in multiple rows (e.g., "Mathematics" taught by two different teachers), both rows have a small badge "×2" linking them visually. |
| **Total bar** | Green "Balanced ✓" if sum matches period structure. Amber "Unbalanced ⚠" with deficit/surplus count if not. |
| **Generate button** | Shortcut to Screen 11 for this division. |

---

### 11.13 Screen 11 — Timetable Generator

**Route**: `/classes/:classId/divisions/:divisionId/generate`

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

| Component | Detail |
|-----------|--------|
| **Status badge** | `Not Generated` (grey), `Generated` (green + date), `Outdated` (amber + warning). |
| **Adjacency toggle** | Switch component. Default OFF. Tooltip explains the constraint. |
| **Generate button** | If timetable exists: confirmation dialog "Existing timetable will be overwritten." On confirm: `POST /timetables/generate` → receives `jobId` → UI shows spinner with "Generating…" text. WebSocket listens for `GENERATION_COMPLETE` or `GENERATION_FAILED`. On completion: refreshes status, shows toast. On failure: shows error message from the payload. |
| **Generating state** | Button replaced with a progress indicator (pulsing animation). Text: "Generating timetable… This may take up to 5 minutes." Cancel not supported in pilot. |
| **View/Edit button** | Visible only if timetable exists. Navigates to Screen 12. |
| **Generation history** | Table of past `generation_jobs`. Shows status, duration, whether adjacency was enabled. Limited to last 10 jobs. |

---

### 11.14 Screen 12 — Timetable Editor (Drag & Drop)

**Route**: `/classes/:classId/divisions/:divisionId/timetable`

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
│  ─── Conflict Panel ─────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  No conflicts detected. ✓                                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  [ Discard Changes ]                                   [ Back to Generator ] │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Grid structure** | Rows = working days. Columns = all slots (periods + breaks) in chronological order. Column headers show slot label + time range. Columns may vary per day if the period structure differs per day. |
| **Period cells** | Show Subject (bold) + Teacher name. If assistant teacher: second line "(Asst: Name)". Background color derived from subject (consistent hash-based color). Draggable via `@dnd-kit`. |
| **Break columns** | Grey hatched (░) background. Non-droppable. Label only ("Break", "Lunch"). |
| **Elective cells** | Stacked display (see Section 9.5). All subjects in the group shown in a split cell. Dragged as a unit. |
| **Drag and drop** | Drag a period cell to another period cell → swap. Drag to empty cell → move. On drop, `POST /timetables/:id/validate-move` is called. If conflicts detected, the conflict panel updates in real time. The move is applied optimistically in the UI; if validation fails with a hard conflict, the move is reverted with a shake animation. |
| **Conflict panel** | Below the grid. Lists all active conflicts with severity: 🔴 Error (hard — must fix) or 🟡 Warning (soft — can ignore). Each conflict row: icon + description + affected cell highlight link. Clicking a conflict scrolls to and pulses the affected cell. |
| **Save** | `PUT /timetables/:id/slots` with full slot array. Disabled if unsaved changes count is 0. |
| **Discard** | Reverts to last saved state. Confirmation dialog if unsaved changes exist. |
| **Export dropdown** | "PDF" or "Excel". Calls `POST /export/division/pdf` or `POST /export/division/excel`. Opens download in new tab. |

---

### 11.15 Screen 13 — Affected Timetables / Notifications

**Route**: `/notifications`

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
│  ├───────────┼────────────┼──────────────────┼────────┼────────┤│
│  │ Class XI  │ Div B Sci  │ ELECTIVE_GROUP_  │ Mar 10 │Edit  ✕ ││
│  │           │            │ CHANGED Bio/CS   │        │        ││
│  └───────────┴────────────┴──────────────────┴────────┴────────┘│
│                                                                  │
│  3 notifications                                                 │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Table** | Paginated (20/page). One row per notification. Sorted by date descending. |
| **Conflict Type** | Badge with type code + human-readable description below. Types: `TEACHER_REMOVED`, `TEACHER_AVAILABILITY_CHANGED`, `SUBJECT_REMOVED`, `WEIGHTAGE_CHANGED`, `ASSIGNMENT_REMOVED`, `SLOT_STRUCTURE_CHANGED`, `ELECTIVE_GROUP_CHANGED`. |
| **Edit action** | Navigates to Screen 12 for the affected division's timetable. |
| **Dismiss (✕)** | `PATCH /notifications/:id/dismiss`. Row fades out. Does NOT fix the conflict — just hides the notification. Timetable remains `OUTDATED` until regenerated. |
| **Dismiss All** | `PATCH /notifications/dismiss-all`. Confirmation dialog. |
| **Empty state** | "All timetables are up to date. No conflicts detected. ✓" |

---

### 11.16 Screen 14 — Teacher Timetable View

**Route**: `/teacher-timetable`

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
│  ├────────┼────────────┼────────────┼────────┼────────────┼────────────────┤│
│  │  ...   │  ...       │  ...       │ ░░░░░░ │  ...       │  ...     ...   ││
│  └────────┴────────────┴────────────┴────────┴────────────┴────────────────┘│
│                                                                              │
│  Summary: 38 periods / week across 8 divisions                               │
│  Periods with assistant role: 3 (marked with *)                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Teacher dropdown** | Searchable. Lists all teachers. On change: fetches teacher's timetable via `GET /timetables/teacher/:teacherId`. |
| **Grid** | Read-only. Same layout as Screen 12 but aggregated across all divisions. Rows = all working days; columns = slots. |
| **Period cells** | Subject + Class + Division. If the teacher is an **assistant** in that slot, cell has a subtle border/badge and "(Asst)" label. |
| **Empty cells** | Dash "—". Represents the teacher's free periods. |
| **Summary bar** | Total periods/week, number of divisions taught, assistant-role count. |
| **Export** | PDF or Excel. Same endpoint pattern as division export but for teacher: `POST /export/teacher/pdf` or `POST /export/teacher/excel`. |
| **Cross-structure display** | If the teacher teaches across divisions with different period structures (e.g., "Primary Block" and "Senior Block"), the grid shows **separate sections** per structure with a structure-name header row. |

---

### 11.17 Elective Groups Management Screen

**Route**: `/elective-groups`

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
│  │  Maths / IP / Psych    │ Maths, IP, Psych   │ 2 div. │ ✎ 🗑 ││
│  └────────────────────────┴────────────────────┴────────┴──────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|-----------|--------|
| **Add** | Modal: Name (required, unique), Subjects multi-select (min 2). Calls `POST /elective-groups`. |
| **Edit** | Modal pre-populated. Can add/remove subjects. If assigned to divisions, warns about cascade effects (Section 9.7). |
| **Delete** | If in use: `409`. With confirmation: dissolves group, assignments become standalone. Affected timetables flagged `OUTDATED`. |
| **Used In** | Count of divisions where this group has been assigned. |

---

### 11.18 Common UI Patterns

| Pattern | Implementation |
|---------|---------------|
| **Loading states** | Skeleton shimmer placeholders matching the layout shape. RTK Query `isLoading` flag. |
| **Empty states** | Illustrated placeholder + action prompt (e.g., "No subjects yet. Add your first subject →"). |
| **Error states** | Red error banner with message + "Retry" button. RTK Query `isError` flag. |
| **Confirmation dialogs** | Modal with description, "Cancel" (secondary) and "Confirm" (destructive red or primary blue). Used for all delete operations and overwrites. |
| **Form validation** | Zod schemas shared with backend (in `@timetable/shared`). Inline field errors below the input. Form submit blocked until valid. |
| **Pagination** | 10 items/page default. "Previous / Next" buttons + page number display. RTK Query pagination params. |
| **Search** | Client-side debounced filter (300ms) for lists with <100 items. Server-side `?search=` query for larger datasets. |
| **Keyboard navigation** | Tab order follows logical flow. Enter submits forms. Escape closes modals. Arrow keys navigate timetable grid cells. |
| **Dark mode** | All components use Tailwind `dark:` variants. Chart colors adapted. Break cells use `dark:bg-gray-800`. |

---

*End of Section 11. Section 12 (Testing Strategy) is deferred. Section 13 (Non-Functional Requirements) follows.*

---

## 13. Non-Functional Requirements

### 13.1 Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| **API response time (p95)** | ≤ 500 ms | CRUD operations on small datasets (≤100 rows per school). |
| **API cold start (Lambda)** | ≤ 3 seconds | SharedDepsLayer adds ~1.5s cold start. Acceptable for 15–20 user concurrency. |
| **Timetable generation** | ≤ 5 minutes wall-clock | Fargate timeout; GA converges within 2000 generations. |
| **Frontend initial load** | ≤ 3 seconds (3G Fast) | Vite code-splitting, tree-shaking, Brotli/gzip via CloudFront. |
| **Frontend route transitions** | ≤ 200 ms | RTK Query cache hits. No full-page reloads. |
| **WebSocket push latency** | ≤ 2 seconds from write to client | API Gateway Management API → client hop. |
| **Export generation (PDF)** | ≤ 15 seconds | Chromium Lambda cold start + render. |
| **Export generation (Excel)** | ≤ 5 seconds | ExcelJS in-memory build. |
| **Database query time (p95)** | ≤ 100 ms | Indexed queries on small tables. RDS db.t3.micro (pilot). |

### 13.2 Scalability

| Dimension | Approach |
|-----------|----------|
| **Multi-tenancy** | All data scoped by `school_id`. Row-level isolation in shared PostgreSQL database. No per-tenant infrastructure. |
| **Concurrent users** | Target: 15–20 max across all schools. Lambda auto-scales up to account concurrency limit (default 1000). |
| **Data volume** | Per school: ≤12 classes, ≤50 divisions, ≤100 subjects, ≤200 teachers, ≤1000 assignments. RDS db.t3.micro sufficient. |
| **Horizontal Lambda scaling** | Each request spawns a Lambda execution. No shared in-memory state between invocations. |
| **Fargate tasks** | One task per generation job. Multiple divisions can generate sequentially. Concurrent generation not supported in pilot (ECS task limit = 2). |
| **Database connections** | Prisma connection pool per Lambda container (pool size = 5). At 15–20 concurrent users, max ~100 connections. RDS db.t3.micro supports 150. |

### 13.3 Availability & Reliability

| Aspect | Specification |
|--------|---------------|
| **Uptime target** | 99.5% (excludes planned maintenance). AWS managed services provide ≥99.9% individually. |
| **RDS** | Single-AZ (pilot). Automated daily backups with 7-day retention. Manual snapshot before major changes. |
| **Lambda** | Stateless; inherent fault tolerance via AWS retry. API Gateway returns 502 if Lambda fails → client retries. |
| **Fargate** | If task fails (OOM, crash), job status remains `RUNNING`. Client detects via polling fallback. Manual retry by admin. |
| **WebSocket** | If connection drops, client reconnects with exponential backoff (Section 8.8). Fallback polling every 5 seconds. |
| **Data durability** | RDS with automated backups. S3 with standard durability (11 nines). DynamoDB with TTL-based cleanup. |
| **Graceful degradation** | If Fargate is unavailable → generation fails, all other features work. If DynamoDB is unavailable → WebSocket push fails, polling works. If SES is unavailable → password reset fails, login works. |

### 13.4 Security

| Aspect | Implementation |
|--------|----------------|
| **Authentication** | AWS Cognito User Pools. JWT access tokens (1-hour expiry) + refresh tokens (30-day expiry). |
| **Authorization** | Single role (School Administrator). All API endpoints require a valid JWT (Cognito authorizer on API Gateway). `school_id` extracted from JWT claims — no cross-school access possible. |
| **Transport** | TLS 1.2+ enforced on all endpoints (HTTPS, WSS). S3 bucket policy denies non-HTTPS. |
| **Injection prevention** | Prisma ORM parameterized queries (no raw SQL). Zod input validation on all API inputs. React JSX auto-escapes output (no `dangerouslySetInnerHTML`). |
| **CORS** | API Gateway CORS configured for CloudFront origin only. No wildcard `*`. |
| **Secrets management** | Database credentials, Cognito client secret, JWT signing keys stored in AWS Systems Manager Parameter Store (SecureString). Injected into Lambda/Fargate via environment variables at deploy time. |
| **Soft deletes** | All entities use `deleted_at` column. No physical deletes. Prevents accidental data loss. |
| **S3 exports** | Pre-signed URLs with 15-minute expiry. Bucket is private (no public access). |
| **Lambda IAM** | Least-privilege IAM roles per service. Each Lambda can only invoke the specific resources it needs. |
| **DynamoDB** | `connectionId` records auto-expire via TTL. No sensitive data stored. |
| **Dependency security** | `npm audit` in CI pipeline. Dependabot enabled on GitHub repository. |

### 13.5 Usability

| Aspect | Specification |
|--------|---------------|
| **Learnability** | System designed for low-to-moderate technical users. All CRUD flows follow consistent patterns (list → add/edit modal or page → save). No training manual required. |
| **Error messages** | User-friendly text (e.g., "This teacher is already scheduled in Class VII A during Monday Period 3"). Technical details in CloudWatch only. |
| **Undo / Confirmation** | All destructive actions require confirmation dialog. Timetable editor supports "Discard Changes". No general undo feature. |
| **Dark/Light mode** | Toggle accessible from every screen. Preference persists across sessions. Default: system preference detection (`prefers-color-scheme`). |
| **Responsive design** | 4 breakpoints (Section 3.2.2). Timetable grid scrolls horizontally on small screens. Tables degrade to card layout below 640px. |
| **Drag-and-drop** | Visual feedback: dragged item opacity reduced, drop target highlighted (green = valid, red = conflict). Keyboard alternative: select cell → arrow keys → Enter to place. |
| **Feedback** | Toast notifications for all actions. Loading spinners/skeletons during data fetch. Real-time conflict panel in timetable editor. |
| **Accessibility** | Semantic HTML. ARIA labels on interactive elements. Focus management on modal open/close. Keyboard-navigable timetable grid. Color is never the sole indicator (icons/text accompany color). Minimum contrast ratio 4.5:1 (WCAG 2.1 AA). |

### 13.6 Maintainability

| Aspect | Specification |
|--------|---------------|
| **Monorepo** | Single GitHub repository. `apps/frontend/`, `services/*/`, `packages/shared/`. npm workspaces. |
| **Code style** | TypeScript strict mode. ESLint + Prettier enforced in CI. Consistent handler/controller/service pattern across all Lambdas. |
| **Database migrations** | Prisma Migrate. Migration files committed to repo. Applied automatically during CI/CD deploy. |
| **Infrastructure as Code** | Terraform for VPC, RDS, ECS, S3, API Gateway, Cognito, DynamoDB, IAM. Serverless Framework for Lambda functions. All changes via PR → plan → apply. |
| **Logging** | Structured JSON logs (Section 5.0 request pipeline). Correlation ID per request. Logs shipped to CloudWatch Log Groups (one per Lambda + one for Fargate). |
| **Environment parity** | Single environment in pilot (production). Future: dev/staging environments via Terraform workspaces. |

### 13.7 Deployment & DevOps

| Aspect | Specification |
|--------|---------------|
| **CI/CD pipeline** | GitHub → AWS CodePipeline → CodeBuild. Trigger: push to `main` branch. |
| **Build stages** | (1) Install dependencies, (2) Lint + type-check, (3) Build shared package, (4) Build Lambda Layer zip, (5) Build each Lambda service, (6) Build frontend, (7) Terraform apply (infra), (8) Serverless deploy (Lambdas), (9) S3 sync (frontend), (10) CloudFront invalidation. |
| **Rollback** | Serverless Framework supports Lambda version rollback. Terraform state enables infra rollback. S3 versioning for frontend rollback. |
| **Zero-downtime deploy** | Lambda: API Gateway routes to new version atomically. Frontend: S3 + CloudFront invalidation (brief cache miss, no downtime). Database: Prisma migrations are additive (no breaking schema changes). |

### 13.8 Browser Compatibility

| Browser | Minimum Version |
|---------|----------------|
| Google Chrome | Latest 2 versions |
| Mozilla Firefox | Latest 2 versions |
| Apple Safari | Latest 2 versions |
| Microsoft Edge | Latest 2 versions |

**Not supported**: Internet Explorer (any version), Opera Mini, Samsung Internet (<v20).

### 13.9 Monitoring & Observability

| Aspect | Implementation |
|--------|----------------|
| **Application logs** | CloudWatch Logs. Structured JSON. One log group per Lambda and one for Fargate. Retention: 30 days. |
| **Metrics** | CloudWatch Metrics: Lambda invocations, errors, duration, throttles. API Gateway: 4XX/5XX rates, latency. RDS: CPU, connections, storage. |
| **Alarms** | Lambda error rate >5% in 5 minutes → SNS alert. RDS CPU >80% for 10 minutes → SNS alert. Fargate task failures → SNS alert. |
| **Dashboard** | CloudWatch dashboard with key widgets: API latency, error rates, active DB connections, Fargate task status, Lambda cold start frequency. |
| **Request tracing** | Correlation ID (`X-Request-Id`) passed through all service calls. Logged in every middleware step. Enables end-to-end trace via CloudWatch Logs Insights query. |

### 13.10 Data Constraints

| Constraint | Limit | Rationale |
|-----------|-------|-----------|
| Max classes per school | No hard limit (dynamic) | Realistically 12–15 |
| Max divisions per class | No hard limit | Realistically 4–5 |
| Max subjects per school | No hard limit | Realistically 30–50 |
| Max teachers per school | No hard limit | Realistically 50–100 |
| Max assignments per division | No hard limit | Realistically 10–20 |
| Weightage per assignment | 1–99 | Sufficient for any period count |
| Subject name length | 100 characters | DB column `VARCHAR(100)` |
| Teacher name length | 100 characters | DB column `VARCHAR(100)` |
| Class name length | 50 characters | DB column `VARCHAR(50)` |
| Academic year label length | 20 characters | DB column `VARCHAR(20)` |
| Max slots per day | 20 | UI grid display limit |
| Max working days | 7 (Mon–Sun) | Full week |
| Max elective group subjects | 10 | GA performance limit |

---

*End of Section 13.*

---

## 14. Appendices

### Appendix A — Constraint & Scope Boundary Summary

Consolidated from Plan.md Appendix and SRS Section 2:

| Topic | Decision |
|-------|----------|
| **Authentication** | JWT via AWS Cognito — one school account per login (BR-15). |
| **Timetable scope** | Per division (not per class). Each division has its own independent weekly timetable. |
| **Period Structures** | Multiple user-defined; each linked to set of classes; per-day slot sequences; configurable working days (BR-2). |
| **Break slots** | Configurable per Period Structure per working day; drag-and-drop reorder supported (BR-3). |
| **Adjacency constraint** | Optional toggle per generation run; off by default (Screen 11). |
| **Teacher deletion** | Warns if actively assigned; user confirms. Affected timetables flagged as `OUTDATED`. |
| **Subject deletion** | Warns if actively assigned; user confirms. Affected timetables flagged as `OUTDATED`. |
| **Copy Division** | Copies assignments only; no timetable auto-generated. |
| **Timing uniformity** | Fully configurable per working day within each Period Structure (BR-2, BR-3). Not uniform across days. |
| **Timetable invalidation** | Passive notification — timetable kept, flagged as `OUTDATED`, user fixes manually or regenerates. |
| **Export formats** | PDF and Excel (.xlsx) for division and teacher timetables. |
| **Multi-tenancy** | One school account per login; data fully isolated between schools via `school_id` row-level scoping (BR-15). |
| **Assistant teacher** | Optional co-teacher per division assignment; standard teacher record, no separate type (BR-16). |
| **Elective groups** | School-level entities. 2+ subjects sharing same time slot(s). Handled via elective group model (Section 9). |
| **Classes** | Dynamic and unlimited (not fixed to I–XII). |
| **Substitute teacher** | Deferred to future phase. |
| **Exam timetable** | Out of scope. |
| **Room/lab assignment** | Out of scope. Rooms not modelled. |
| **Student records** | Out of scope. Scheduling only. |
| **Bulk import** | Out of scope (pilot). Manual entry only. |
| **Mobile native apps** | Out of scope. Responsive web only. |
| **Multi-language (i18n)** | Out of scope. English only. |
| **Unit/integration tests** | Out of scope for pilot. |
| **Notifications via email** | Out of scope. In-app WebSocket push + polling only (except Cognito password reset via SES). |
| **Audit logging** | Out of scope for pilot. |
| **RBAC** | Out of scope. Single admin role sufficient for pilot. |
| **Offline mode** | Out of scope. Internet always required. |

### Appendix B — Sample Data Reference

The following real-world data from the reference school informs the system's design capacity and serves as test data for development:

#### B.1 Academic Year

| Label | Start | End |
|-------|-------|-----|
| 2026–27 | 01 May 2026 | 31 March 2027 |

#### B.2 Bell Schedule (Period & Break Timings)

**Classes I–IX** (8 periods/day):

| Slot | Type | Start | End |
|------|------|-------|-----|
| 1 | Period | 09:00 | 09:45 |
| 2 | Period | 09:45 | 10:30 |
| — | Interval | 10:30 | 10:45 |
| 3 | Period | 10:45 | 11:30 |
| 4 | Period | 11:30 | 12:15 |
| — | Lunch | 12:15 | 12:45 |
| 5 | Period | 12:45 | 13:30 |
| 6 | Period | 13:30 | 14:15 |
| — | Interval | 14:15 | 14:30 |
| 7 | Period | 14:30 | 15:15 |
| 8 | Period | 15:15 | 16:00 |

**Classes X–XII** (9 periods/day):

| Slot | Type | Start | End |
|------|------|-------|-----|
| 1 | Period | 09:00 | 09:45 |
| 2 | Period | 09:45 | 10:30 |
| — | Interval | 10:30 | 10:45 |
| 3 | Period | 10:45 | 11:30 |
| 4 | Period | 11:30 | 12:15 |
| — | Lunch | 12:15 | 12:45 |
| 5 | Period | 12:45 | 13:30 |
| 6 | Period | 13:30 | 14:15 |
| — | Interval | 14:15 | 14:30 |
| 7 | Period | 14:30 | 15:15 |
| 8 | Period | 15:15 | 16:00 |
| 9 | Period | 16:00 | 16:45 |

#### B.3 Class & Division Structure

| Class | Divisions | Working Days | Periods/Week |
|-------|-----------|-------------|-------------|
| Class I | A, B, C | Mon–Fri | 40 |
| Class II | A, B | Mon–Fri | 40 |
| Class III | A, B, C | Mon–Fri | 40 |
| Class IV | A, B | Mon–Fri | 40 |
| Class V | A, B, C | Mon–Fri | 40 |
| Class VI | A, B | Mon–Fri | 40 |
| Class VII | A, B, C | Mon–Fri | 40 |
| Class VIII | A, B | Mon–Fri | 40 |
| Class IX | A, B, C | Mon–Fri | 40 |
| Class X | A, B | Mon–Fri | 45 |
| Class XI | A Science, B Science, C Commerce, D Humanities | Mon–Fri | 45 |
| Class XII | A Science, B Science, C Commerce, D Humanities | Mon–Fri | 45 |

**Total divisions**: 32

#### B.4 Subject Count

31 subjects including combined/elective subjects (Biology, Computer Science, Informatics Practices, Psychology, etc.).

#### B.5 Teacher Count

54 teachers across all subjects and class levels.

#### B.6 Elective Group Examples

| Group Name | Subjects | Applied To |
|------------|----------|-----------|
| Biology / Computer Science | Biology, Computer Science | Class XI A/B Science, Class XII A/B Science |
| Maths / IP | Mathematics, Informatics Practices | Class XI C Commerce, Class XII C Commerce |
| Maths / IP / Psychology | Mathematics, Informatics Practices, Psychology | Class XI D Humanities, Class XII D Humanities |

#### B.7 Sample Division Assignment (Class XII A — Science)

| Subject | Teacher | Weightage |
|---------|---------|-----------|
| English | Soumya | 5 |
| Physics | Divya | 7 |
| Chemistry | Lin Maria | 7 |
| Maths | Ashitha | 7 |
| Biology *(elective)* | Anu S Nair | 9 |
| Computer Science *(elective)* | Swetha | 9 |
| Physical Training | Shijo C Mathew | 4 |
| General Knowledge | Ashitha M | 2 |
| Library | Megha K | 1 |
| Life Skills | Neethu Paul | 2 |
| STEAM | Roshni | 1 |
| **Total** | | **45** |

### Appendix C — Conflict Type Reference

Complete list of conflict types used by the Notification Service and the timetable editor:

| Conflict Type Code | Severity | Trigger | Description |
|--------------------|----------|---------|-------------|
| `TEACHER_CLASH` | Error | Drag-and-drop validation | The teacher is already scheduled in another division at the same time slot. |
| `ASSISTANT_CLASH` | Error | Drag-and-drop validation | The assistant teacher is already scheduled elsewhere at the same time slot. |
| `WEIGHTAGE_DEVIATION` | Warning | Drag-and-drop / post-edit | The subject's period count no longer matches its assigned weightage. |
| `ADJACENCY_VIOLATION` | Warning | Drag-and-drop (if enabled) | The same subject appears on the same day but not in consecutive periods. |
| `ELECTIVE_GROUP_BREAK` | Error | Drag-and-drop validation | Elective group subjects are no longer co-scheduled in the same time slot. |
| `TEACHER_REMOVED` | Notification | Teacher deleted | A teacher used in the timetable has been deleted from the system. |
| `TEACHER_AVAILABILITY_CHANGED` | Notification | Availability updated | A teacher's availability changed, creating a conflict with their scheduled slots. |
| `SUBJECT_REMOVED` | Notification | Subject deleted | A subject used in the timetable has been deleted. |
| `WEIGHTAGE_CHANGED` | Notification | Assignment updated | A subject's weightage changed, making the current slot count incorrect. |
| `ASSIGNMENT_REMOVED` | Notification | Assignment deleted | An assignment was removed; its slots are now orphaned. |
| `SLOT_STRUCTURE_CHANGED` | Notification | Period structure edited | The period structure's slots were modified, affecting the timetable grid shape. |
| `ELECTIVE_GROUP_CHANGED` | Notification | Elective group modified | An elective group was altered (subjects added/removed/group deleted). |

### Appendix D — HTTP Status Code Reference

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST (resource created) |
| `202` | Accepted | Timetable generation triggered (async) |
| `204` | No Content | Successful DELETE |
| `400` | Bad Request | Zod validation failure, malformed input |
| `401` | Unauthorized | Missing or invalid JWT |
| `403` | Forbidden | Cross-school access attempt |
| `404` | Not Found | Resource doesn't exist or soft-deleted |
| `409` | Conflict | Duplicate resource, delete blocked by dependency |
| `500` | Internal Server Error | Unhandled exception |

**Standard error response body**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Weightage must be between 1 and 99.",
    "details": [
      { "field": "weightage", "message": "Must be ≥ 1" }
    ]
  }
}
```

**Error codes**:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Input validation failure |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate or dependency block |
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | School ID mismatch |
| `GENERATION_FAILED` | 200 (in job) | GA could not find a valid solution |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Appendix E — Environment Variables

#### E.1 Lambda Services (Common)

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | RDS connection string |
| `COGNITO_USER_POOL_ID` | `ap-south-1_AbCdEf` | Cognito pool for JWT verification |
| `COGNITO_CLIENT_ID` | `1a2b3c4d5e6f7g` | Cognito app client |
| `CORS_ORIGIN` | `https://app.example.com` | Allowed CORS origin |
| `STAGE` | `production` | Deployment stage |

#### E.2 Additional per-service variables

| Service | Variable | Description |
|---------|----------|-------------|
| Timetable Service | `ECS_CLUSTER_ARN` | Fargate cluster ARN |
| Timetable Service | `ECS_TASK_DEFINITION` | Task definition ARN |
| Timetable Service | `ECS_SUBNET_IDS` | Private subnet IDs |
| Timetable Service | `ECS_SECURITY_GROUP_ID` | SG for Fargate tasks |
| WebSocket Handler | `DYNAMODB_TABLE` | Connection store table name |
| Export Service | `S3_EXPORT_BUCKET` | Bucket for generated files |
| Export Service | `PRESIGN_EXPIRY` | Pre-signed URL TTL (seconds) |
| Notification Service | `TIMETABLE_SERVICE_FUNCTION` | Lambda function name for cross-invoke |

#### E.3 Fargate Timetable Engine

| Variable | Description |
|----------|-------------|
| `SCHOOL_ID` | Target school ID (from RunTask override) |
| `ACADEMIC_YEAR_ID` | Target academic year |
| `DIVISION_ID` | Target division |
| `JOB_ID` | Generation job ID (for status updates) |
| `ADJACENCY_CONSTRAINT` | `"true"` or `"false"` |
| `DATABASE_URL` | RDS connection string |
| `DYNAMODB_TABLE` | WebSocket connection table |
| `WS_API_ENDPOINT` | API Gateway Management API URL |
| `GA_POPULATION_SIZE` | Default `100` |
| `GA_MAX_GENERATIONS` | Default `2000` |
| `GA_STAGNATION_LIMIT` | Default `200` |
| `GA_MUTATION_RATE` | Default `0.15` |
| `GA_CROSSOVER_RATE` | Default `0.8` |
| `GA_TOURNAMENT_SIZE` | Default `5` |
| `GA_ELITE_PERCENT` | Default `0.05` |
| `GA_TIME_LIMIT_SECONDS` | Default `300` |
| `HARD_PENALTY` | Default `1000` |

### Appendix F — Glossary Quick Reference

| Term | Definition |
|------|-----------|
| Academic Year | Scoping entity. All operational data belongs to exactly one academic year. |
| Adjacency Constraint | Optional rule requiring repeated subjects on the same day to occupy consecutive periods. |
| Assignment | A (subject, teacher, weightage) tuple linked to a specific division. |
| Assistant Teacher | Optional secondary teacher co-assigned to an assignment; shares the same periods. |
| Class | A grade level (e.g., "Class VII"). Contains one or more divisions. |
| Chromosome | GA representation of a complete weekly timetable for one division. |
| Conflict | A scheduling rule violation (hard or soft) detected during editing or post-generation. |
| Division | A section within a class (e.g., "A", "B Science"). The unit for which timetables are generated. |
| Elective Group | A set of 2+ subjects scheduled simultaneously in the same time slot(s) with different teachers. |
| Fargate | AWS container compute service used to run the Python timetable generation engine. |
| Fitness Function | The scoring function in the GA that evaluates a chromosome's quality (lower penalty = better). |
| Generation Job | A record tracking the status of an asynchronous timetable generation request. |
| Hard Constraint | A scheduling rule that must never be violated in the final timetable (e.g., teacher clash). |
| Lambda | AWS serverless compute service running the Node.js microservices. |
| Period Structure | Defines working days, slot configuration (periods + breaks per day), and linked classes. |
| Pilot | The initial release scope of the system. |
| Slot | A time block in a day. Type: Period (schedulable), Interval (short break), or Lunch Break. |
| Soft Constraint | A scheduling preference that the GA optimizes but can relax (e.g., subject distribution). |
| Soft Delete | Records marked with `deleted_at` timestamp rather than physically removed. |
| Tenant | A school. All data for a tenant is isolated via `school_id`. |
| Weightage | Number of periods per week a subject is taught in a division. |
| WebSocket | Persistent bidirectional connection for real-time push notifications. |

---

*End of Section 14.*

---

## 15. Notification & Invalidation System

### 15.1 Design Philosophy

The system uses a **passive invalidation model**: post-generation data changes never auto-delete or auto-modify an existing timetable. Instead, affected timetables are flagged as `OUTDATED` and a human-readable notification report is surfaced. The administrator decides whether to regenerate, manually edit, or dismiss the notification.

This approach preserves the administrator's work and avoids surprises — a teacher name correction should not silently erase a carefully tuned timetable.

### 15.2 Invalidation Triggers

Any mutation to entities referenced by a generated timetable can trigger invalidation. The **calling service** is responsible for invoking the Notification Service synchronously after its own write succeeds.

| Calling Service | Mutation | Entity Type Sent | Conflict Type Created |
|----------------|----------|------------------|-----------------------|
| **Teacher Service** | Teacher name/contact updated | `TEACHER` | `TEACHER_CHANGED` |
| **Teacher Service** | Teacher deleted | `TEACHER` | `TEACHER_DELETED` |
| **Teacher Service** | Availability toggled | `TEACHER` | `AVAILABILITY_CHANGED` |
| **Subject Service** | Subject name updated | `SUBJECT` | `SUBJECT_CHANGED` |
| **Subject Service** | Subject deleted | `SUBJECT` | `SUBJECT_DELETED` |
| **Division & Assignment Service** | Assignment weightage changed | `ASSIGNMENT` | `ASSIGNMENT_CHANGED` (→ `WEIGHTAGE_CHANGED` on notification) |
| **Division & Assignment Service** | Assignment removed | `ASSIGNMENT` | `ASSIGNMENT_CHANGED` (→ `ASSIGNMENT_REMOVED` on notification) |
| **Division & Assignment Service** | Elective group subjects changed / group deleted | `ELECTIVE_GROUP` | `ELECTIVE_GROUP_CHANGED` |
| **School Config Service** | Slot added / removed / reordered | `SLOT` | `SLOT_CHANGED` |
| **School Config Service** | Period structure working days changed | `STRUCTURE` | `STRUCTURE_CHANGED` |

### 15.3 Invalidation Flow (End-to-End)

```
┌──────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────┐
│  Admin   │     │ Calling      │     │ Notification     │     │ RDS  │
│  (React) │     │ Service (λ)  │     │ Service (λ)      │     │      │
└────┬─────┘     └──────┬───────┘     └────────┬─────────┘     └──┬───┘
     │                  │                       │                   │
     │  1. Mutation     │                       │                   │
     │  (e.g. DELETE    │                       │                   │
     │   teacher)       │                       │                   │
     │ ────────────────>│                       │                   │
     │                  │                       │                   │
     │                  │  2. Execute own write  │                   │
     │                  │ ──────────────────────────────────────────>│
     │                  │                       │                   │
     │                  │  3. Lambda Invoke      │                   │
     │                  │  (synchronous)         │                   │
     │                  │ ─────────────────────>│                   │
     │                  │                       │                   │
     │                  │                       │  4. Query:         │
     │                  │                       │  SELECT t.id,      │
     │                  │                       │    d.id            │
     │                  │                       │  FROM timetables t │
     │                  │                       │  JOIN timetable_   │
     │                  │                       │    slots ts        │
     │                  │                       │  JOIN division_    │
     │                  │                       │    assignments da  │
     │                  │                       │  WHERE da.teacher  │
     │                  │                       │    _id = :entityId │
     │                  │                       │  AND t.status !=   │
     │                  │                       │    'OUTDATED'      │
     │                  │                       │ ─────────────────>│
     │                  │                       │                   │
     │                  │                       │  5. For each       │
     │                  │                       │  affected          │
     │                  │                       │  timetable:        │
     │                  │                       │                   │
     │                  │                       │  a. INSERT INTO    │
     │                  │                       │     timetable_     │
     │                  │                       │     notifications  │
     │                  │                       │                   │
     │                  │                       │  b. UPDATE         │
     │                  │                       │     timetables     │
     │                  │                       │     SET status =   │
     │                  │                       │     'OUTDATED'     │
     │                  │                       │ ─────────────────>│
     │                  │                       │                   │
     │                  │  6. Return             │                   │
     │                  │  { affectedCount: 3 } │                   │
     │                  │ <─────────────────────│                   │
     │                  │                       │                   │
     │  7. 200 OK       │                       │                   │
     │  { ...,           │                       │                   │
     │    affectedTimetables: 3 }               │                   │
     │ <────────────────│                       │                   │
     │                  │                       │                   │
     │  8. Toast:        │                       │                   │
     │  "Teacher deleted.│                       │                   │
     │   3 timetables    │                       │                   │
     │   affected."      │                       │                   │
```

### 15.4 Notification Service Internal Logic

The Notification Service receives an invocation payload:

```json
{
  "action": "FLAG_AFFECTED_TIMETABLES",
  "entityType": "TEACHER",
  "entityId": "teacher-uuid",
  "schoolId": "school-uuid",
  "academicYearId": "year-uuid"
}
```

**Processing steps**:

1. **Resolve affected timetables** — Query varies by `entityType`:

| Entity Type | Resolution Query |
|-------------|-----------------|
| `TEACHER` | Find all `division_assignments` where `teacher_id` or `assistant_teacher_id` = entityId → find timetables for those divisions. |
| `SUBJECT` | Find all `division_assignments` where `subject_id` = entityId → find timetables for those divisions. |
| `ASSIGNMENT` | Directly look up `division_assignments.division_id` → find timetable for that division. |
| `ELECTIVE_GROUP` | Find all `division_assignments` where `elective_group_id` = entityId → find timetables for those divisions. |
| `SLOT` | Find the `working_day` for the slot → find its `period_structure` → find all classes using that structure → find all divisions in those classes → find timetables. |
| `STRUCTURE` | Find all classes using the period structure → find all divisions → find timetables. |

2. **Deduplicate** — A single mutation may affect the same timetable through multiple paths (e.g., a teacher teaches in 3 slots of the same timetable). Only one notification per timetable per event.

3. **Skip already-outdated** — If the timetable is already `OUTDATED`, still create a notification (different change), but do not re-update the status.

4. **Create notifications** — One `timetable_notifications` row per affected timetable:

```sql
INSERT INTO timetable_notifications
  (id, school_id, timetable_id, division_id, conflict_type, change_description, dismissed)
VALUES
  (gen_random_uuid(), :schoolId, :timetableId, :divisionId, :conflictType,
   'Teacher "Julie" was deleted. 5 periods in this timetable referenced her.', false);
```

5. **Flag timetables** — Update status in a single batch:

```sql
UPDATE timetables SET status = 'OUTDATED', updated_at = NOW()
WHERE id = ANY(:affectedTimetableIds) AND status = 'GENERATED';
```

6. **Return count** — The caller receives `{ affectedCount: N }` to include in its API response.

### 15.5 Change Description Templates

The `change_description` field is populated with a human-readable message:

| Conflict Type | Template | Example |
|---------------|----------|---------|
| `TEACHER_CHANGED` | Teacher "{name}" was updated. | Teacher "Julie" was updated. |
| `TEACHER_DELETED` | Teacher "{name}" was deleted. {N} period(s) in this timetable referenced them. | Teacher "Julie" was deleted. 5 periods in this timetable referenced them. |
| `AVAILABILITY_CHANGED` | Teacher "{name}" availability changed. They are now unavailable on {day} Period {slot}. | Teacher "Anu" availability changed. They are now unavailable on Monday Period 3. |
| `SUBJECT_CHANGED` | Subject "{name}" was updated. | Subject "Physics" was updated. |
| `SUBJECT_DELETED` | Subject "{name}" was deleted. {N} period(s) in this timetable referenced it. | Subject "Physics" was deleted. 7 periods in this timetable referenced it. |
| `WEIGHTAGE_CHANGED` | Assignment "{subject}" weightage changed from {old} to {new}. | Assignment "Mathematics" weightage changed from 7 to 6. |
| `ASSIGNMENT_REMOVED` | Assignment "{subject} – {teacher}" was removed from {division}. | Assignment "Hindi – Lalitha" was removed from Class VII A. |
| `ELECTIVE_GROUP_CHANGED` | Elective group "{name}" was modified. | Elective group "Biology / Computer Science" was modified. |
| `SLOT_CHANGED` | A slot in "{structureName}" was modified on {day}. | A slot in "Senior Block" was modified on Monday. |
| `STRUCTURE_CHANGED` | Period structure "{name}" working days were changed. | Period structure "Middle Block" working days were changed. |

### 15.6 Notification Lifecycle

```
                    ┌──────────────┐
                    │   CREATED    │  (dismissed = false)
                    └──────┬───────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────────┐
     │   DISMISSED  │ │ TIMETABLE│ │  MORE CHANGES    │
     │  (by admin)  │ │ REGENER- │ │  (new notif row  │
     │              │ │ ATED     │ │   added to same  │
     │ dismissed=   │ │          │ │   timetable)     │
     │ true         │ │ All notifs│ │                  │
     └──────────────┘ │ for this │ └──────────────────┘
                      │ timetable│
                      │ auto-    │
                      │ dismissed│
                      └──────────┘
```

**Key rules**:

| Event | Effect on Notifications |
|-------|------------------------|
| Admin dismisses a notification | `dismissed = true`. Timetable stays `OUTDATED`. |
| Admin dismisses all notifications | All rows for the school set `dismissed = true`. Timetables stay `OUTDATED`. |
| Timetable is regenerated | All undismissed notifications for that timetable are **bulk-dismissed** (`dismissed = true`). Timetable status → `GENERATED`. |
| Same timetable gets a new change | New notification row added. If timetable was already `OUTDATED`, status stays `OUTDATED`. |

### 15.7 Client-Side Integration

#### 15.7.1 Notification Badge

The sidebar "Notifications" link shows a badge with the active (undismissed) count:

```typescript
// RTK Query: auto-polling every 60 seconds
const { data } = useGetNotificationCountQuery(undefined, {
  pollingInterval: 60_000,
});
// Badge shows data.count if > 0
```

The count endpoint `GET /notifications/count` is lightweight (single `COUNT(*)` with index).

#### 15.7.2 Dashboard Conflict Banner

On the Dashboard (Screen 1), if `outdatedTimetableCount > 0` from the summary endpoint, an amber banner appears:

```
⚠ 3 timetables have conflicts. View Notifications →
```

Clicking navigates to `/notifications` (Screen 13).

#### 15.7.3 Inline Feedback on Mutation

When a calling service returns `affectedTimetables > 0`, the React mutation handler shows a toast:

```typescript
const [deleteTeacher] = useDeleteTeacherMutation();

const handleDelete = async (id: string) => {
  const result = await deleteTeacher(id).unwrap();
  if (result.affectedTimetables > 0) {
    toast(`Teacher deleted. ${result.affectedTimetables} timetable(s) affected.`, {
      icon: '⚠️',
    });
    // Invalidate notification count cache
    dispatch(notificationApi.util.invalidateTags(['NotificationCount']));
  } else {
    toast.success('Teacher deleted.');
  }
};
```

#### 15.7.4 Cache Invalidation (RTK Query)

When a notification is dismissed or timetable regenerated, the following cache tags are invalidated:

| Action | Tags Invalidated |
|--------|-----------------|
| Dismiss notification | `Notification`, `NotificationCount` |
| Dismiss all | `Notification`, `NotificationCount` |
| Regenerate timetable | `Notification`, `NotificationCount`, `Timetable`, `DashboardSummary` |
| Data mutation (teacher/subject/etc.) | Entity's own tags + `NotificationCount`, `DashboardSummary` |

### 15.8 Failure Handling

| Scenario | Behavior |
|----------|----------|
| Notification Service Lambda invocation fails | The calling service catches the error, logs it, and **still returns 200** to the user — the primary operation (e.g., teacher delete) succeeded. The timetable will remain `GENERATED` (should be `OUTDATED`). A future reconciliation job (not in pilot) would catch this. |
| Database error during notification write | Same as above — error is logged, primary operation succeeds. |
| Race condition: two mutations for the same timetable simultaneously | Each notification is an independent `INSERT`. Both succeed. The `UPDATE timetables SET status = 'OUTDATED'` is idempotent — second call is a no-op if already `OUTDATED`. |

---

*End of Section 15.*

---

## 16. Monorepo Folder Structure

### 16.1 Repository Layout

The entire application lives in a single GitHub repository organized as an **npm workspace monorepo**:

```
school-timetable-management/
│
├── apps/
│   └── frontend/                          # React SPA
│       ├── public/
│       │   └── favicon.svg
│       ├── src/
│       │   ├── app/
│       │   │   ├── store.ts               # Redux store configuration
│       │   │   └── router.tsx             # React Router v7 route config
│       │   ├── components/
│       │   │   ├── ui/                    # Reusable primitives (Button, Modal, Input, etc.)
│       │   │   ├── layout/                # Shell, Sidebar, TopBar, Breadcrumb
│       │   │   └── shared/                # ConfirmDialog, Toast, Skeleton, EmptyState
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   │   ├── LoginPage.tsx
│       │   │   │   ├── RegisterForm.tsx
│       │   │   │   ├── ForgotPasswordForm.tsx
│       │   │   │   ├── authSlice.ts       # JWT state, login/logout actions
│       │   │   │   └── authApi.ts         # RTK Query endpoints for Cognito
│       │   │   ├── dashboard/
│       │   │   │   ├── DashboardPage.tsx
│       │   │   │   └── dashboardApi.ts
│       │   │   ├── academic-years/
│       │   │   │   ├── AcademicYearListPage.tsx
│       │   │   │   ├── AcademicYearForm.tsx
│       │   │   │   └── academicYearApi.ts
│       │   │   ├── period-structures/
│       │   │   │   ├── PeriodStructureListPage.tsx
│       │   │   │   ├── PeriodStructureEditor.tsx
│       │   │   │   ├── SlotRow.tsx
│       │   │   │   └── configApi.ts
│       │   │   ├── subjects/
│       │   │   │   ├── SubjectListPage.tsx
│       │   │   │   ├── SubjectForm.tsx
│       │   │   │   └── subjectApi.ts
│       │   │   ├── teachers/
│       │   │   │   ├── TeacherListPage.tsx
│       │   │   │   ├── TeacherForm.tsx
│       │   │   │   ├── AvailabilityGrid.tsx
│       │   │   │   └── teacherApi.ts
│       │   │   ├── classes/
│       │   │   │   ├── ClassListPage.tsx
│       │   │   │   ├── ClassDetailPage.tsx
│       │   │   │   ├── DivisionCard.tsx
│       │   │   │   ├── AddDivisionModal.tsx
│       │   │   │   └── classApi.ts        # Uses divisionApi under the hood
│       │   │   ├── assignments/
│       │   │   │   ├── AssignmentEditorPage.tsx
│       │   │   │   ├── AssignmentRow.tsx
│       │   │   │   ├── ElectiveGroupRow.tsx
│       │   │   │   ├── AddAssignmentModal.tsx
│       │   │   │   ├── AddElectiveAssignmentModal.tsx
│       │   │   │   └── assignmentApi.ts
│       │   │   ├── elective-groups/
│       │   │   │   ├── ElectiveGroupListPage.tsx
│       │   │   │   ├── ElectiveGroupModal.tsx
│       │   │   │   └── electiveGroupApi.ts
│       │   │   ├── timetable/
│       │   │   │   ├── GeneratorPage.tsx
│       │   │   │   ├── TimetableEditorPage.tsx
│       │   │   │   ├── TimetableGrid.tsx
│       │   │   │   ├── TimetableCell.tsx
│       │   │   │   ├── ElectiveCell.tsx
│       │   │   │   ├── ConflictPanel.tsx
│       │   │   │   ├── GenerationStatus.tsx
│       │   │   │   └── timetableApi.ts
│       │   │   ├── notifications/
│       │   │   │   ├── NotificationListPage.tsx
│       │   │   │   └── notificationApi.ts
│       │   │   ├── teacher-timetable/
│       │   │   │   ├── TeacherTimetablePage.tsx
│       │   │   │   └── teacherTimetableApi.ts
│       │   │   └── export/
│       │   │       └── exportApi.ts
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts        # WebSocket connection manager
│       │   │   ├── useTheme.ts            # Dark/light mode toggle
│       │   │   └── useAuth.ts             # Auth state helpers
│       │   ├── slices/
│       │   │   └── wsSlice.ts             # WebSocket connected state
│       │   ├── guards/
│       │   │   └── AuthGuard.tsx          # Route protection wrapper
│       │   ├── utils/
│       │   │   ├── cn.ts                  # clsx + tailwind-merge helper
│       │   │   └── format.ts              # Date/time formatters
│       │   ├── types/
│       │   │   └── index.ts               # Frontend-specific TS types
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── index.css                  # Tailwind directives
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                            # @timetable/shared (Lambda Layer source)
│       ├── src/
│       │   ├── middleware/
│       │   │   ├── authMiddleware.ts
│       │   │   ├── academicYearMiddleware.ts
│       │   │   ├── requestLogger.ts
│       │   │   └── errorHandler.ts
│       │   ├── models/
│       │   │   ├── enums.ts               # SlotType, JobStatus, TimetableStatus, ConflictType
│       │   │   ├── schemas/               # Zod schemas (one per entity)
│       │   │   │   ├── academicYear.ts
│       │   │   │   ├── teacher.ts
│       │   │   │   ├── subject.ts
│       │   │   │   ├── division.ts
│       │   │   │   ├── assignment.ts
│       │   │   │   ├── timetable.ts
│       │   │   │   ├── notification.ts
│       │   │   │   └── ...
│       │   │   └── types.ts               # Derived TS types from Zod + Prisma
│       │   ├── db/
│       │   │   ├── client.ts              # Prisma Client singleton
│       │   │   └── tenantScope.ts         # school_id + deleted_at query wrappers
│       │   ├── helpers/
│       │   │   ├── response.ts            # success(), created(), error()
│       │   │   ├── pagination.ts          # parsePagination()
│       │   │   ├── lambdaInvoke.ts        # Inter-service Lambda invoke wrapper
│       │   │   └── validate.ts            # parseBody() with Zod
│       │   ├── errors/
│       │   │   ├── AppError.ts
│       │   │   ├── NotFoundError.ts
│       │   │   ├── ConflictError.ts
│       │   │   ├── ValidationError.ts
│       │   │   └── ForbiddenError.ts
│       │   └── index.ts                   # Barrel export
│       ├── prisma/
│       │   ├── schema.prisma              # Single schema for all 19 tables
│       │   └── migrations/                # Prisma Migrate files (versioned)
│       ├── tsconfig.json
│       └── package.json
│
├── services/
│   ├── academic-year/
│   │   ├── src/
│   │   │   ├── handler.ts                 # Lambda entry point
│   │   │   ├── router.ts                  # Route definitions
│   │   │   ├── controller.ts              # Request/response handling
│   │   │   └── service.ts                 # Business logic
│   │   ├── serverless.yml
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── school-config/                     # Same structure as academic-year
│   │   ├── src/
│   │   │   ├── handler.ts
│   │   │   ├── router.ts
│   │   │   ├── controller.ts
│   │   │   └── service.ts
│   │   ├── serverless.yml
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── subject/                           # Same structure
│   ├── teacher/                           # Same structure
│   ├── division-assignment/               # Same structure
│   ├── timetable/                         # Same structure
│   ├── notification/                      # Same structure
│   ├── dashboard/                         # Same structure
│   ├── export/                            # Same structure (+ Chromium layer ref)
│   └── websocket/                         # Same structure (WebSocket routes)
│       ├── src/
│       │   ├── handler.ts                 # $connect, $disconnect, $default handlers
│       │   └── service.ts                 # DynamoDB read/write logic
│       ├── serverless.yml                 # WebSocket API Gateway config
│       ├── tsconfig.json
│       └── package.json
│
├── engine/
│   └── timetable-generator/               # Python Fargate application
│       ├── src/
│       │   ├── main.py                    # Entry point
│       │   ├── data_loader.py             # Load from RDS
│       │   ├── ga/
│       │   │   ├── chromosome.py          # Encoding & decoding
│       │   │   ├── fitness.py             # Fitness function (hard + soft constraints)
│       │   │   ├── operators.py           # Selection, crossover, mutation
│       │   │   ├── elective_handler.py    # Elective-group-aware GA operations
│       │   │   └── engine.py              # Main GA loop
│       │   ├── constraints/
│       │   │   ├── hard.py                # H1–H6 constraint checkers
│       │   │   └── soft.py                # S1–S4 constraint checkers
│       │   ├── output_writer.py           # Write timetable to RDS
│       │   └── ws_pusher.py               # DynamoDB query + PostToConnection
│       ├── Dockerfile
│       ├── requirements.txt               # psycopg2-binary, pygad, boto3, numpy
│       └── README.md
│
├── layers/
│   └── shared/                            # Lambda Layer build output
│       └── nodejs/
│           └── node_modules/              # Built artifacts (not committed; CI builds)
│               ├── @timetable/shared/     # Compiled shared package
│               ├── @prisma/client/
│               ├── zod/
│               ├── jsonwebtoken/
│               └── @aws-sdk/client-lambda/
│
├── infra/
│   └── terraform/
│       ├── main.tf                        # Root module
│       ├── variables.tf                   # Input variables
│       ├── outputs.tf                     # Output values (ARNs, URLs)
│       ├── provider.tf                    # AWS provider config (ap-south-1)
│       ├── modules/
│       │   ├── vpc/                       # VPC, subnets, NAT, security groups
│       │   │   ├── main.tf
│       │   │   ├── variables.tf
│       │   │   └── outputs.tf
│       │   ├── rds/                       # PostgreSQL instance
│       │   │   ├── main.tf
│       │   │   ├── variables.tf
│       │   │   └── outputs.tf
│       │   ├── ecs/                       # Fargate cluster, task definition, ECR
│       │   │   ├── main.tf
│       │   │   ├── variables.tf
│       │   │   └── outputs.tf
│       │   ├── cognito/                   # User pool, app client, domain
│       │   │   ├── main.tf
│       │   │   ├── variables.tf
│       │   │   └── outputs.tf
│       │   ├── dynamodb/                  # WebSocket connections table + GSI
│       │   │   ├── main.tf
│       │   │   └── variables.tf
│       │   ├── s3/                        # Frontend bucket, export bucket
│       │   │   ├── main.tf
│       │   │   └── outputs.tf
│       │   ├── cloudfront/                # Distribution for frontend
│       │   │   ├── main.tf
│       │   │   └── outputs.tf
│       │   ├── api-gateway/               # HTTP API + WebSocket API
│       │   │   ├── main.tf
│       │   │   └── outputs.tf
│       │   ├── ssm/                       # Parameter Store secrets
│       │   │   └── main.tf
│       │   └── monitoring/                # CloudWatch dashboards, alarms, SNS
│       │       └── main.tf
│       ├── terraform.tfvars               # Environment values (git-ignored)
│       └── backend.tf                     # S3 remote state backend
│
├── scripts/
│   ├── build-layer.sh                     # Build Lambda Layer zip
│   ├── seed-data.sh                       # Load sample data into RDS
│   └── local-dev.sh                       # Start local dev environment
│
├── .github/
│   ├── dependabot.yml                     # Automated dependency updates
│   └── CODEOWNERS                         # PR review assignments
│
├── package.json                           # Root workspace config
├── tsconfig.base.json                     # Shared TS compiler options
├── .eslintrc.js                           # Shared ESLint config
├── .prettierrc                            # Prettier config
├── .gitignore
└── README.md
```

### 16.2 npm Workspace Configuration

The root `package.json` defines the workspace:

```json
{
  "name": "school-timetable-management",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "dev:frontend": "npm -w apps/frontend run dev",
    "build:shared": "npm -w packages/shared run build",
    "build:frontend": "npm -w apps/frontend run build",
    "build:layer": "bash scripts/build-layer.sh",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit --project tsconfig.base.json",
    "prisma:generate": "npm -w packages/shared run prisma:generate",
    "prisma:migrate": "npm -w packages/shared run prisma:migrate",
    "deploy:infra": "cd infra/terraform && terraform apply -auto-approve",
    "deploy:services": "bash scripts/deploy-services.sh",
    "deploy:frontend": "aws s3 sync apps/frontend/dist/ s3://$FRONTEND_BUCKET --delete"
  },
  "devDependencies": {
    "eslint": "^9.x",
    "prettier": "^3.x",
    "typescript": "^5.x"
  }
}
```

### 16.3 Dependency Flow

```
                    ┌────────────────┐
                    │  apps/frontend │
                    │  (React SPA)   │
                    └───────┬────────┘
                            │ imports types only
                            ▼
                    ┌────────────────────┐
        ┌──────────│  packages/shared    │──────────┐
        │          │  (@timetable/shared)│          │
        │          └────────────────────┘          │
        │ import            │ import               │ import
        ▼                   ▼                      ▼
┌──────────────┐  ┌──────────────┐      ┌──────────────┐
│ services/    │  │ services/    │ ...  │ services/    │
│ academic-year│  │ teacher      │      │ websocket    │
└──────────────┘  └──────────────┘      └──────────────┘
```

**Rules**:
- `packages/shared` has **zero internal dependencies** — it only depends on npm packages (`@prisma/client`, `zod`, `jsonwebtoken`, `@aws-sdk/client-lambda`).
- Each `services/*` depends on `@timetable/shared` (via npm workspace link) and its own minimal dependencies.
- `apps/frontend` imports **types and enums** from `@timetable/shared` at build time (Zod schemas, TypeScript types, enums). It does **not** bundle backend-only code (`@prisma/client`, `jsonwebtoken`) — Vite tree-shakes these away.
- `engine/timetable-generator/` is an independent Python project. It has no npm dependencies.
- `infra/terraform/` is independent. No npm dependencies.

### 16.4 Service Internal Structure

Every Lambda service follows an identical 4-file pattern:

```
services/{service-name}/
├── src/
│   ├── handler.ts       # API Gateway event → router
│   ├── router.ts        # URL pattern matching → controller methods
│   ├── controller.ts    # Parse request, call service, format response
│   └── service.ts       # Business logic, Prisma queries, Lambda invokes
├── serverless.yml       # Deployment config (routes, layers, VPC, env vars)
├── tsconfig.json        # Extends ../../tsconfig.base.json
└── package.json         # Minimal: only local dev deps
```

**Handler pattern** (all services):

```typescript
// handler.ts
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { authMiddleware, academicYearMiddleware, requestLogger, errorHandler }
  from '@timetable/shared';
import { router } from './router';

export const main = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    requestLogger(event);
    const context = await authMiddleware(event);
    await academicYearMiddleware(event, context);
    return await router(event, context);
  } catch (error) {
    return errorHandler(error);
  }
};
```

### 16.5 Local Development

| Tool | Purpose |
|------|---------|
| **Vite dev server** | `npm run dev:frontend` — hot reload on `localhost:5173` |
| **Serverless Offline** | `npx sls offline` per service — local API emulation |
| **Docker Compose** (optional) | Local PostgreSQL + DynamoDB Local for database development |
| **Prisma Studio** | `npx prisma studio` — browser-based DB admin for development |

Developers work on one service at a time. The frontend proxies API calls to the deployed (or locally emulated) backend via Vite's `proxy` config in `vite.config.ts`.

---

*End of Section 16.*

---

## 17. CI/CD Pipeline

### 17.1 Pipeline Overview

The CI/CD pipeline runs on **AWS CodePipeline** triggered by pushes to the `main` branch on GitHub:

```
┌────────┐     ┌────────────┐     ┌──────────────────────────────────────┐
│ GitHub │────>│ CodePipeline│────>│            CodeBuild                 │
│  main  │     │  (trigger)  │     │                                      │
└────────┘     └────────────┘     │  Stage 1: Install & Validate         │
                                   │  Stage 2: Build Artifacts            │
                                   │  Stage 3: Deploy Infrastructure      │
                                   │  Stage 4: Deploy Application         │
                                   └──────────────────────────────────────┘
```

### 17.2 Pipeline Stages (Detailed)

#### Stage 1 — Install & Validate

| Step | Command | Purpose |
|------|---------|---------|
| 1.1 | `npm ci` | Install all workspace dependencies (deterministic from lock file) |
| 1.2 | `npm run lint` | ESLint across all TypeScript files |
| 1.3 | `npm run typecheck` | `tsc --noEmit` — full type-check across all workspaces |
| 1.4 | `npm run prisma:generate` | Generate Prisma Client (needed for type-check) |

**Fail gate**: Pipeline aborts if any step fails. No deploy occurs.

#### Stage 2 — Build Artifacts

| Step | Command | Output |
|------|---------|--------|
| 2.1 | `npm run build:shared` | `packages/shared/dist/` — compiled JS + type declarations |
| 2.2 | `npm run build:layer` | `layers/shared/` — zip artifact (~40 MB) containing shared deps |
| 2.3 | Build each service | `services/*/dist/handler.js` — bundled handler (~50–200 KB each) |
| 2.4 | `npm run build:frontend` | `apps/frontend/dist/` — production SPA bundle (Vite) |
| 2.5 | `docker build engine/timetable-generator/` | ECR image for Fargate task |
| 2.6 | `docker push` to ECR | Push tagged image (`latest` + git SHA) |

**Lambda Layer build** (`scripts/build-layer.sh`):

```bash
#!/bin/bash
set -e

# Build shared package
cd packages/shared
npm run build
cd ../..

# Create layer directory structure
rm -rf layers/shared/nodejs
mkdir -p layers/shared/nodejs/node_modules/@timetable/shared

# Copy compiled shared package
cp -r packages/shared/dist/* layers/shared/nodejs/node_modules/@timetable/shared/
cp packages/shared/package.json layers/shared/nodejs/node_modules/@timetable/shared/

# Install layer production dependencies
cd layers/shared/nodejs
npm init -y
npm install @prisma/client zod jsonwebtoken @aws-sdk/client-lambda --production

# Copy Prisma query engine
cp ../../packages/shared/node_modules/.prisma/client/libquery_engine-* \
   node_modules/.prisma/client/ 2>/dev/null || true

cd ../../..
echo "Layer build complete."
```

#### Stage 3 — Deploy Infrastructure

| Step | Command | Resources Affected |
|------|---------|-------------------|
| 3.1 | `cd infra/terraform && terraform init` | Initialize providers + remote state |
| 3.2 | `terraform plan -out=tfplan` | Generate execution plan |
| 3.3 | `terraform apply tfplan` | Apply infrastructure changes |

**Resources managed by Terraform** (Section 4 architecture):

| Module | Resources |
|--------|-----------|
| `vpc` | VPC, 2 public subnets, 2 private subnets, 2 isolated subnets, NAT Gateway, Internet Gateway, route tables, 3 security groups |
| `rds` | PostgreSQL 16 instance (db.t3.micro), subnet group, parameter group |
| `ecs` | Fargate cluster, task definition, ECR repository, IAM execution role, IAM task role |
| `cognito` | User pool, app client, custom attributes (`school_id`) |
| `dynamodb` | `timetable-ws-connections` table + GSI (`schoolId-index`), TTL config |
| `s3` | Frontend bucket (private, CloudFront OAI), export bucket (private, lifecycle rules) |
| `cloudfront` | Distribution, OAI, custom error responses (SPA fallback), SSL certificate |
| `api-gateway` | HTTP API (Lambda integration, Cognito authorizer, CORS), WebSocket API (Lambda routes) |
| `ssm` | Parameter Store entries for DATABASE_URL, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and other secrets (SecureString) |
| `monitoring` | CloudWatch log groups, metric alarms, SNS topic, CloudWatch dashboard |

**Terraform state**: Stored in a dedicated S3 bucket (`${project}-terraform-state`) with DynamoDB lock table. Never committed to Git.

#### Stage 4 — Deploy Application

| Step | Command | Effect |
|------|---------|--------|
| 4.1 | Publish Lambda Layer | Upload `layers/shared/` zip → new layer version |
| 4.2 | Deploy each service | `cd services/{name} && npx sls deploy --stage prod` (10 services, sequential) |
| 4.3 | Run Prisma migrations | `npx prisma migrate deploy` (against production RDS) |
| 4.4 | Sync frontend to S3 | `aws s3 sync apps/frontend/dist/ s3://$FRONTEND_BUCKET --delete` |
| 4.5 | Invalidate CloudFront | `aws cloudfront create-invalidation --distribution-id $CF_DIST --paths "/*"` |

**Service deployment order matters** for the Lambda Layer version:
1. Publish layer → get new ARN with version number.
2. Update each `serverless.yml` layer reference (or use SSM parameter for latest layer ARN).
3. Deploy services → each picks up the new layer.

### 17.3 Environment Configuration

**Single environment in pilot** (production). Future environments via Terraform workspaces.

| Config Source | Contents | Access |
|--------------|----------|--------|
| **Terraform variables** (`terraform.tfvars`) | Region, instance sizes, bucket names, domain | Git-ignored. Stored in CodeBuild environment variables. |
| **AWS SSM Parameter Store** | `DATABASE_URL`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `S3_EXPORT_BUCKET`, `ECS_CLUSTER_ARN`, `ECS_TASK_DEFINITION`, `WS_API_ENDPOINT`, `DYNAMODB_TABLE` | SecureString. Injected into Lambda/Fargate at deploy time via Serverless Framework `${ssm:...}` syntax. |
| **CodeBuild environment** | `AWS_ACCOUNT_ID`, `AWS_REGION`, `ECR_REPO_URI`, `FRONTEND_BUCKET`, `CF_DISTRIBUTION_ID` | Set in CodeBuild project config. |
| **Vite environment** | `VITE_API_URL`, `VITE_WS_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID` | `.env.production` file (committed, contains no secrets — only public endpoints). |

### 17.4 Rollback Strategies

| Component | Rollback Method | Time to Rollback |
|-----------|----------------|-----------------|
| **Lambda functions** | Serverless Framework: `sls rollback --timestamp <ts>` — restores previous deployment package + layer version. | ~1 minute per service |
| **Lambda Layer** | Previous layer version is never deleted. Update service config to reference previous version ARN → redeploy. | ~2 minutes |
| **Frontend (S3)** | S3 bucket versioning enabled. Restore previous version via `aws s3api` or re-sync from previous build artifact. | ~1 minute |
| **Terraform (infra)** | `terraform plan` against previous state → `terraform apply`. For urgent rollback: `terraform state` operations. Destructive infra changes require manual approval. | 5–10 minutes |
| **Database schema** | Prisma migrations are **additive only** (add columns, add tables — never drop or rename in production). If a migration must be reverted: write a new migration that undoes the change. | Varies |
| **Fargate image** | ECR retains previous image tags. Update task definition to reference previous image tag → new task uses old image. | ~2 minutes |

### 17.5 Build Artifact Summary

| Artifact | Location | Size (approx.) |
|----------|----------|----------------|
| Lambda Layer zip | CodeBuild output → S3 (via Serverless) | ~40 MB |
| Chromium Layer zip | Pre-built, stored in S3 | ~45 MB |
| Each Lambda handler bundle | CodeBuild output → S3 (via Serverless) | 50–200 KB |
| Frontend SPA | `apps/frontend/dist/` → S3 bucket | ~2–5 MB |
| Fargate Docker image | ECR | ~150 MB |
| Terraform state | S3 state bucket | ~100 KB |

### 17.6 Pipeline Security

| Concern | Mitigation |
|---------|-----------|
| **Secrets in build logs** | CodeBuild environment variables marked as `PARAMETER_STORE` type — values never printed. Build logs exclude `set -x` for sensitive steps. |
| **IAM permissions** | CodeBuild role has least-privilege: `lambda:*`, `s3:PutObject`/`DeleteObject` on specific buckets, `cloudfront:CreateInvalidation`, `ecs:RegisterTaskDefinition`, `ecr:PutImage`, `ssm:GetParameter`, `terraform state` S3 bucket access. |
| **Dependency integrity** | `npm ci` uses lock file. `npm audit` runs in Stage 1 (non-blocking warning in pilot). Dependabot enabled for automated PR creation on vulnerable dependencies. |
| **Terraform state protection** | S3 bucket with versioning + encryption (AES-256). DynamoDB lock table prevents concurrent applies. Bucket policy restricts access to CodeBuild role + admin IAM users. |

### 17.7 Post-Deploy Verification

After Stage 4 completes, the pipeline runs a lightweight smoke check:

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| API health | `curl $API_URL/auth/health` | HTTP 200 |
| Frontend loads | `curl -I $CLOUDFRONT_URL` | HTTP 200, `content-type: text/html` |
| Database connectivity | Lambda invocation test: `aws lambda invoke --function-name academic-year-service-prod-api` with a health check payload | HTTP 200 response |

If any check fails, the pipeline sends an SNS alert. Rollback is manual in the pilot (no automated rollback on smoke failure).

---

*End of Section 17.*

---

## 18. Authentication & Authorization

This section consolidates the complete authentication and authorization design for the School Timetable Management System, covering identity provider configuration, token lifecycle, route protection, and multi-tenant data isolation.

---

### 18.1 Identity Provider — AWS Cognito User Pools

| Parameter | Value |
|-----------|-------|
| **Provider** | AWS Cognito User Pools |
| **Region** | Same region as all other AWS resources |
| **User Pool name** | `timetable-user-pool-{stage}` |
| **Sign-in attributes** | Email (primary identifier) |
| **Password policy** | Minimum 8 characters, requires uppercase, lowercase, number, and special character |
| **MFA** | Disabled (pilot) |
| **Account recovery** | Email-based (via AWS SES) |
| **Self-registration** | Enabled (public sign-up) |
| **Auto-confirm trigger** | Lambda trigger auto-confirms new users and auto-verifies email attribute |
| **Custom attributes** | `custom:school_id` (String, mutable by admin only) |
| **App client** | `timetable-web-client-{stage}` — No client secret (SPA), explicit auth flows: `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |
| **Token validity** | Access token: 1 hour · ID token: 1 hour · Refresh token: 30 days |
| **Hosted UI** | Disabled — custom React-based auth screens |

#### 18.1.1 Cognito Lambda Triggers

| Trigger | Lambda Function | Purpose |
|---------|----------------|---------|
| **Pre Sign-Up** | `cognito-pre-signup` | Auto-confirm user, auto-verify email. Set `event.response.autoConfirmUser = true` and `event.response.autoVerifyEmail = true`. |
| **Post Confirmation** | `cognito-post-confirmation` | Create the `schools` row and `users` row in RDS. Generate a `school_id` (UUID), write it as `custom:school_id` attribute back to Cognito using `adminUpdateUserAttributes`. |
| **Pre Token Generation** | `cognito-pre-token-generation` | Inject `school_id` and `user_id` (RDS PK) into the ID token claims under `custom:school_id` and `custom:user_id`. |

---

### 18.2 Authentication Flows

#### 18.2.1 Registration Flow

```
User                    React SPA                  Cognito                 Post-Confirmation Lambda        RDS
 │                         │                          │                            │                        │
 │  1. Fill form:          │                          │                            │                        │
 │     School Name,        │                          │                            │                        │
 │     Email, Password     │                          │                            │                        │
 │ ──────────────────────► │                          │                            │                        │
 │                         │  2. Auth.signUp({        │                            │                        │
 │                         │     username: email,     │                            │                        │
 │                         │     password,            │                            │                        │
 │                         │     attributes: {        │                            │                        │
 │                         │       'custom:school_    │                            │                        │
 │                         │        name': schoolName │                            │                        │
 │                         │     }                    │                            │                        │
 │                         │  })                      │                            │                        │
 │                         │ ────────────────────────►│                            │                        │
 │                         │                          │  3. Pre Sign-Up trigger:   │                        │
 │                         │                          │     auto-confirm user      │                        │
 │                         │                          │ ──────────────────────────►│                        │
 │                         │                          │                            │  4. INSERT INTO schools │
 │                         │                          │                            │     (name, school_id)   │
 │                         │                          │                            │  5. INSERT INTO users   │
 │                         │                          │                            │     (email, cognito_    │
 │                         │                          │                            │      user_id, school_id)│
 │                         │                          │                            │ ──────────────────────►│
 │                         │                          │                            │                        │
 │                         │                          │                            │  6. adminUpdateUser     │
 │                         │                          │                            │     Attributes:         │
 │                         │                          │                            │     custom:school_id    │
 │                         │                          │◄─────────────────────────── │                        │
 │                         │                          │                            │                        │
 │                         │  7. SignUp success        │                            │                        │
 │                         │◄──────────────────────── │                            │                        │
 │                         │                          │                            │                        │
 │                         │  8. Auto-login:           │                            │                        │
 │                         │     Auth.signIn(email,   │                            │                        │
 │                         │     password)            │                            │                        │
 │                         │ ────────────────────────►│                            │                        │
 │                         │                          │                            │                        │
 │                         │  9. JWT tokens returned   │                            │                        │
 │                         │◄──────────────────────── │                            │                        │
 │                         │                          │                            │                        │
 │  10. Redirect to /      │                          │                            │                        │
 │◄──────────────────────  │                          │                            │                        │
```

**Validation rules (client-side + server-side)**:

| Field | Rules |
|-------|-------|
| **School Name** | Required. 2–100 characters. Trimmed. |
| **Email** | Required. Valid email format (Zod `.email()`). Unique in Cognito. |
| **Password** | Required. Minimum 8 characters. Must contain: uppercase, lowercase, digit, special character. |
| **Confirm Password** | Must match Password field exactly. |

**Error handling**:

| Error | User-facing message |
|-------|-------------------|
| `UsernameExistsException` | "An account with this email already exists. Please log in." |
| `InvalidPasswordException` | "Password does not meet requirements." |
| Network error | "Unable to connect. Please check your internet connection." |

---

#### 18.2.2 Login Flow

```
User                    React SPA              Cognito              API Gateway
 │                         │                      │                      │
 │  1. Enter email + pwd   │                      │                      │
 │ ──────────────────────► │                      │                      │
 │                         │  2. Auth.signIn(      │                      │
 │                         │     email, password)  │                      │
 │                         │ ────────────────────► │                      │
 │                         │                      │  3. Validate creds   │
 │                         │                      │     + SRP exchange   │
 │                         │  4. Tokens returned:  │                      │
 │                         │     - accessToken     │                      │
 │                         │     - idToken         │                      │
 │                         │     - refreshToken    │                      │
 │                         │ ◄──────────────────── │                      │
 │                         │                      │                      │
 │                         │  5. Store tokens in   │                      │
 │                         │     Cognito SDK       │                      │
 │                         │     (localStorage)    │                      │
 │                         │                      │                      │
 │                         │  6. API call with     │                      │
 │                         │     Authorization:    │                      │
 │                         │     Bearer <idToken>  │                      │
 │                         │ ─────────────────────────────────────────►   │
 │                         │                      │                      │
 │                         │                      │  7. Cognito JWT      │
 │                         │                      │     Authorizer       │
 │                         │                      │     validates token  │
 │                         │                      │◄──────────────────── │
 │                         │                      │                      │
 │                         │                      │  8. Claims extracted │
 │                         │                      │     → Lambda context │
 │                         │  9. Response           │                      │
 │                         │◄───────────────────────────────────────────  │
 │                         │                      │                      │
 │  10. Dashboard renders  │                      │                      │
 │◄──────────────────────  │                      │                      │
```

**Error handling**:

| Error | User-facing message |
|-------|-------------------|
| `NotAuthorizedException` | "Incorrect email or password." |
| `UserNotFoundException` | "Incorrect email or password." (same message — prevent enumeration) |
| `UserNotConfirmedException` | "Account not confirmed. Please contact support." |
| Network error | "Unable to connect. Please check your internet connection." |

---

#### 18.2.3 Password Reset Flow

```
User                    React SPA              Cognito              SES
 │                         │                      │                   │
 │  1. Click "Forgot       │                      │                   │
 │     Password?"          │                      │                   │
 │ ──────────────────────► │                      │                   │
 │                         │                      │                   │
 │  2. Enter email         │                      │                   │
 │ ──────────────────────► │                      │                   │
 │                         │  3. Auth.forgotPwd(   │                   │
 │                         │     email)            │                   │
 │                         │ ────────────────────► │                   │
 │                         │                      │  4. Send reset     │
 │                         │                      │     code email     │
 │                         │                      │ ────────────────► │
 │                         │                      │                   │
 │                         │  5. Success callback  │                   │
 │                         │◄──────────────────── │                   │
 │                         │                      │                   │
 │  6. "Check your email"  │                      │                   │
 │◄──────────────────────  │                      │                   │
 │                         │                      │                   │
 │  7. Enter code +        │                      │                   │
 │     new password        │                      │                   │
 │ ──────────────────────► │                      │                   │
 │                         │  8. Auth.forgotPwd    │                   │
 │                         │     Submit(email,     │                   │
 │                         │     code, newPwd)     │                   │
 │                         │ ────────────────────► │                   │
 │                         │                      │  9. Validate code  │
 │                         │                      │     + update pwd   │
 │                         │  10. Success          │                   │
 │                         │◄──────────────────── │                   │
 │                         │                      │                   │
 │  11. Redirect to login  │                      │                   │
 │◄──────────────────────  │                      │                   │
```

**Error handling**:

| Error | User-facing message |
|-------|-------------------|
| `UserNotFoundException` | "If this email is registered, you will receive a reset code." (prevent enumeration) |
| `CodeMismatchException` | "Invalid verification code. Please try again." |
| `ExpiredCodeException` | "Verification code has expired. Please request a new one." |
| `LimitExceededException` | "Too many attempts. Please try again later." |

---

### 18.3 Token Lifecycle & Session Management

#### 18.3.1 Token Types

| Token | Purpose | Expiry | Storage | Sent To |
|-------|---------|--------|---------|---------|
| **ID Token** | Carries user identity claims (`email`, `custom:school_id`, `custom:user_id`). Used as the `Authorization: Bearer` token for API calls. | 1 hour | Cognito SDK (localStorage) | API Gateway, WebSocket `$connect` |
| **Access Token** | Carries scopes and groups. Used internally by Cognito SDK for user operations. | 1 hour | Cognito SDK (localStorage) | Cognito APIs only |
| **Refresh Token** | Used to obtain new ID + Access tokens without re-entering credentials. | 30 days | Cognito SDK (localStorage) | Cognito token endpoint only |

#### 18.3.2 Token Refresh Strategy

```
React SPA (RTK Query baseQuery)         Cognito
 │                                          │
 │  1. API call → 401 Unauthorized          │
 │                                          │
 │  2. Intercept in baseQueryWithReauth:    │
 │     Auth.currentSession()                │
 │ ────────────────────────────────────────►│
 │                                          │  3. Cognito SDK automatically
 │                                          │     uses refresh token to get
 │                                          │     new ID + Access tokens
 │  4. New tokens stored                    │
 │◄──────────────────────────────────────── │
 │                                          │
 │  5. Retry the original API call          │
 │     with new ID token                    │
 │                                          │
```

- The RTK Query `baseQuery` wrapper intercepts **401 responses**.
- On 401, it calls `Auth.currentSession()` which triggers Cognito SDK's built-in refresh flow.
- If refresh succeeds → retry the original request with the new token.
- If refresh fails (refresh token expired or revoked) → clear local state, redirect to `/login`.

#### 18.3.3 Session Termination

| Scenario | Action |
|----------|--------|
| **User clicks Logout** | Call `Auth.signOut()`. Clears all tokens from localStorage. Invalidates refresh token on Cognito server. Redirect to `/login`. Clear Redux store. |
| **Refresh token expired** | Next API call fails 401 → refresh attempt fails → automatic redirect to `/login`. |
| **Token revoked server-side** | Same as expired — transparent to user. |
| **Browser tab closed** | Tokens persist in localStorage. User remains logged in on next visit (until tokens expire). |

---

### 18.4 API Gateway Authorization

#### 18.4.1 Cognito JWT Authorizer Configuration

| Parameter | Value |
|-----------|-------|
| **Authorizer type** | JWT (HTTP API) |
| **Identity source** | `$request.header.Authorization` |
| **Issuer URL** | `https://cognito-idp.{region}.amazonaws.com/{userPoolId}` |
| **Audience** | `{appClientId}` |

#### 18.4.2 Route Authorization Matrix

| Route Pattern | Authorizer | Notes |
|--------------|------------|-------|
| `POST /auth/register` | **None** | Public — registration endpoint |
| `GET /*/health` | **None** | Public — health check endpoints |
| `ALL /*` (all other routes) | **Cognito JWT** | Requires valid, non-expired ID token |
| `$connect` (WebSocket) | **Custom Lambda** | Extracts JWT from `?token=` query parameter, verifies against Cognito JWKS |

#### 18.4.3 Claims Extraction in Lambda

After API Gateway validates the JWT, the claims are available in the Lambda event:

```
event.requestContext.authorizer.jwt.claims
├── sub                 → Cognito User Sub (UUID)
├── email               → User's email
├── custom:school_id    → School UUID (used for tenant isolation)
├── custom:user_id      → RDS user primary key
├── iat                 → Issued at (epoch)
├── exp                 → Exporation (epoch)
└── iss                 → Cognito issuer URL
```

The shared middleware `authMiddleware.ts` extracts `school_id` and `user_id` from claims and attaches them to the request context. All downstream service logic uses these context values — **never** from request body or query parameters.

---

### 18.5 Multi-Tenant Data Isolation

#### 18.5.1 Isolation Strategy

| Layer | Mechanism |
|-------|-----------|
| **API Gateway** | JWT authorizer ensures only authenticated users reach Lambda. |
| **Lambda Middleware** | `authMiddleware.ts` extracts `school_id` from JWT claims and injects into Prisma query context. |
| **Prisma Tenant Scope** | The `tenantScope` extension automatically appends `WHERE school_id = ?` to every query. Every `findMany`, `findUnique`, `create`, `update`, and `delete` operation is scoped. |
| **Database** | Every table (except `schools` itself) includes a `school_id` column with a foreign key to `schools.id`. No RDS-level row-level security (pilot) — isolation is enforced at the ORM layer. |

#### 18.5.2 Tenant Scope Implementation

```typescript
// Shared Layer: db/tenantScope.ts
export function tenantScope(schoolId: string) {
  return Prisma.defineExtension({
    query: {
      $allOperations({ model, operation, args, query }) {
        if (model === 'School') return query(args);
        
        // For read operations: add school_id filter
        if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate'].includes(operation)) {
          args.where = { ...args.where, school_id: schoolId };
        }
        
        // For write operations: inject school_id
        if (['create'].includes(operation)) {
          args.data = { ...args.data, school_id: schoolId };
        }
        
        // For update/delete: scope to school
        if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
          args.where = { ...args.where, school_id: schoolId };
        }
        
        return query(args);
      },
    },
  });
}
```

#### 18.5.3 Cross-Tenant Access Prevention

| Attack Vector | Mitigation |
|--------------|------------|
| Tampered `school_id` in request body | Ignored — `school_id` is always extracted from JWT claims by middleware. |
| Tampered JWT | Rejected by API Gateway Cognito authorizer (signature verification against JWKS). |
| Direct RDS access | RDS is in an isolated DB subnet with no internet route. Security group only allows inbound from `sg-lambda` and `sg-fargate`. |
| IDOR (guessing another school's resource IDs) | All queries are scoped by `school_id` via Prisma extension. Even with a valid UUID of another school's resource, the query returns 404. |

---

### 18.6 WebSocket Authentication

| Aspect | Implementation |
|--------|----------------|
| **Connection** | Client sends `wss://{ws-api-url}?token={idToken}` |
| **$connect handler** | Custom Lambda authorizer: extracts token from query string, downloads Cognito JWKS (cached), verifies JWT signature + expiry, extracts `school_id` and `user_id`. |
| **Connection storage** | On success: writes `{ connectionId, schoolId, userId, ttl }` to DynamoDB `WebSocketConnections` table. |
| **$disconnect handler** | Deletes the DynamoDB record for the `connectionId`. |
| **Message authorization** | All messages pushed server→client are scoped by `schoolId` in DynamoDB queries. A school only receives notifications for its own data changes. |
| **Token expiry during connection** | WebSocket connections persist even after the token expires (API Gateway only validates at `$connect`). If the client reconnects after token expiry, it must refresh the token first. |
| **DynamoDB TTL** | Connection records have a 24-hour TTL as a cleanup safety net for stale connections. |

---

### 18.7 Frontend Auth State Management

#### 18.7.1 AuthGuard Component

```
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<AuthGuard />}>        ← Checks Cognito session
      <Route path="/" element={<Dashboard />} />
      <Route path="/classes" element={<ClassesPage />} />
      <Route path="/teachers" element={<TeachersPage />} />
      ... (all protected routes)
    </Route>
  </Routes>
</BrowserRouter>
```

- `AuthGuard` calls `Auth.currentAuthenticatedUser()` on mount.
- If no session exists → redirect to `/login`.
- If session exists → render child routes via `<Outlet />`.
- While checking → render a full-page loading spinner.

#### 18.7.2 Redux Auth Slice

| State Field | Type | Purpose |
|-------------|------|---------|
| `isAuthenticated` | `boolean` | Whether the user has a valid Cognito session |
| `user` | `{ email, schoolId, userId } \| null` | Decoded from ID token claims |
| `isLoading` | `boolean` | Auth check in progress |

**Actions**:

| Action | Trigger | Effect |
|--------|---------|--------|
| `authChecked` | `AuthGuard` mount | Set `isAuthenticated`, `user` from Cognito session |
| `loggedIn` | Successful `Auth.signIn()` | Set `isAuthenticated = true`, populate `user` |
| `loggedOut` | `Auth.signOut()` or refresh failure | Reset entire auth slice + clear all RTK Query cache |

---

*End of Section 18.*

---

## 19. Deployment Architecture

This section defines the complete AWS deployment architecture, infrastructure provisioning, environment configuration, and operational topology for the School Timetable Management System.

---

### 19.1 Architecture Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         AWS Cloud                                            │
│                                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Public Internet Edge                                     │   │
│  │                                                                                       │   │
│  │   ┌──────────────┐     ┌─────────────────────┐     ┌──────────────────────────────┐  │   │
│  │   │  CloudFront   │     │  API Gateway (REST) │     │  API Gateway (WebSocket)     │  │   │
│  │   │  Distribution │     │  {stage}/v1/*        │     │  wss://{ws-api-url}          │  │   │
│  │   │               │     │                     │     │                              │  │   │
│  │   │  Origin: S3   │     │  Cognito JWT        │     │  Custom Lambda Authorizer    │  │   │
│  │   │  OAI access   │     │  Authorizer         │     │  (JWT from ?token=)          │  │   │
│  │   └──────┬───────┘     └──────────┬──────────┘     └──────────────┬───────────────┘  │   │
│  │          │                        │                               │                   │   │
│  └──────────┼────────────────────────┼───────────────────────────────┼───────────────────┘   │
│             │                        │                               │                       │
│  ┌──────────┼────────────────────────┼───────────────────────────────┼───────────────────┐   │
│  │          │              VPC: 10.0.0.0/16                          │                   │   │
│  │          │                        │                               │                   │   │
│  │   ┌──────────────────────────────────────────────────────────────────────────────┐    │   │
│  │   │  Public Subnets (10.0.1.0/24, 10.0.2.0/24)                                  │    │   │
│  │   │                                                                              │    │   │
│  │   │   ┌──────────────┐                                                          │    │   │
│  │   │   │  NAT Gateway  │  ← Outbound internet for private subnets                │    │   │
│  │   │   └──────┬───────┘                                                          │    │   │
│  │   └──────────┼───────────────────────────────────────────────────────────────────┘    │   │
│  │              │                                                                        │   │
│  │   ┌──────────┼───────────────────────────────────────────────────────────────────┐    │   │
│  │   │  Private Subnets (10.0.10.0/24, 10.0.11.0/24)                               │    │   │
│  │   │              │                                                               │    │   │
│  │   │   ┌──────────────────────────────────────────────────────────────────────┐   │    │   │
│  │   │   │  Lambda Functions (VPC-attached via ENIs)                             │   │    │   │
│  │   │   │                                                                      │   │    │   │
│  │   │   │  ┌───────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │   │    │   │
│  │   │   │  │ Academic   │  │ Class      │  │ Teacher    │  │ Subject      │   │   │    │   │
│  │   │   │  │ Year Svc   │  │ Service    │  │ Service    │  │ Service      │   │   │    │   │
│  │   │   │  └───────────┘  └────────────┘  └────────────┘  └──────────────┘   │   │    │   │
│  │   │   │                                                                      │   │    │   │
│  │   │   │  ┌───────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │   │    │   │
│  │   │   │  │ Slot       │  │ Timetable  │  │ Dashboard  │  │ Export       │   │   │    │   │
│  │   │   │  │ Service    │  │ Service    │  │ Service    │  │ Service      │   │   │    │   │
│  │   │   │  └───────────┘  └────────────┘  └────────────┘  └──────────────┘   │   │    │   │
│  │   │   │                                                                      │   │    │   │
│  │   │   │  ┌───────────┐  ┌────────────┐  ┌────────────┐                     │   │    │   │
│  │   │   │  │ Assignment │  │ WebSocket  │  │ Auth       │                     │   │    │   │
│  │   │   │  │ Service    │  │ Handler    │  │ Service    │                     │   │    │   │
│  │   │   │  └───────────┘  └────────────┘  └────────────┘                     │   │    │   │
│  │   │   └──────────────────────────────────────────────────────────────────────┘   │    │   │
│  │   │                                                                              │    │   │
│  │   │   ┌──────────────────────────────────────────────────────────────────────┐   │    │   │
│  │   │   │  Fargate Task (ECS)                                                  │   │    │   │
│  │   │   │  ┌─────────────────────────────────────────────────────────────────┐ │   │    │   │
│  │   │   │  │  Timetable Generation Engine (Python 3.12)                      │ │   │    │   │
│  │   │   │  │  1 vCPU · 2 GB RAM · awsvpc network mode                       │ │   │    │   │
│  │   │   │  └─────────────────────────────────────────────────────────────────┘ │   │    │   │
│  │   │   └──────────────────────────────────────────────────────────────────────┘   │    │   │
│  │   └──────────────────────────────────────────────────────────────────────────────┘    │   │
│  │                                                                                       │   │
│  │   ┌──────────────────────────────────────────────────────────────────────────────┐    │   │
│  │   │  DB Subnets (10.0.20.0/24, 10.0.21.0/24) — Isolated (no internet route)     │    │   │
│  │   │                                                                              │    │   │
│  │   │   ┌──────────────────────────────────────────────────────────┐               │    │   │
│  │   │   │  RDS PostgreSQL 16                                       │               │    │   │
│  │   │   │  db.t4g.micro · 20 GB gp3 · Single-AZ (pilot)           │               │    │   │
│  │   │   │  Automated backups: 7-day retention                      │               │    │   │
│  │   │   └──────────────────────────────────────────────────────────┘               │    │   │
│  │   └──────────────────────────────────────────────────────────────────────────────┘    │   │
│  │                                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐     │
│  │  AWS Managed Services (outside VPC)                                                  │     │
│  │                                                                                      │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │     │
│  │  │  Cognito      │  │  DynamoDB     │  │  S3           │  │  Systems Manager     │   │     │
│  │  │  User Pools   │  │  WebSocket   │  │  - Frontend   │  │  Parameter Store     │   │     │
│  │  │              │  │  Connections  │  │  - Exports    │  │  (SecureString)      │   │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └───────────────────────┘   │     │
│  │                                                                                      │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │     │
│  │  │  SES          │  │  CloudWatch   │  │  ECR          │  │  SNS                 │   │     │
│  │  │  (Password   │  │  Logs +       │  │  (Fargate    │  │  (Pipeline alerts)   │   │     │
│  │  │   reset)     │  │  Alarms       │  │   images)    │  │                      │   │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └───────────────────────┘   │     │
│  └─────────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 19.2 AWS Resource Inventory

#### 19.2.1 Compute Resources

| Resource | Service | Configuration | Provisioned By |
|----------|---------|---------------|----------------|
| 11 Lambda functions | AWS Lambda | Node.js 22, 256 MB memory, 29s timeout, VPC-attached | Serverless Framework |
| 3 Cognito trigger Lambdas | AWS Lambda | Node.js 22, 128 MB memory, 10s timeout, non-VPC | Serverless Framework |
| 1 WebSocket authorizer Lambda | AWS Lambda | Node.js 22, 128 MB memory, 10s timeout, non-VPC | Serverless Framework |
| Timetable Engine | AWS Fargate (ECS) | Python 3.12, 1 vCPU, 2 GB RAM, awsvpc | Terraform |

#### 19.2.2 Storage Resources

| Resource | Service | Configuration | Provisioned By |
|----------|---------|---------------|----------------|
| Primary database | RDS PostgreSQL 16 | db.t4g.micro, 20 GB gp3, Single-AZ, 7-day backups | Terraform |
| WebSocket connections | DynamoDB | On-demand capacity, TTL enabled | Terraform |
| Frontend assets | S3 | Private bucket, CloudFront OAI, versioning enabled | Terraform |
| Export files | S3 | Private bucket, 7-day lifecycle expiry | Terraform |
| Terraform state | S3 | Versioning enabled, DynamoDB lock table | Manual (bootstrap) |

#### 19.2.3 Networking Resources

| Resource | Service | Configuration | Provisioned By |
|----------|---------|---------------|----------------|
| VPC | Amazon VPC | `10.0.0.0/16` | Terraform |
| Public Subnets | VPC Subnets | `10.0.1.0/24` (AZ-a), `10.0.2.0/24` (AZ-b) | Terraform |
| Private Subnets | VPC Subnets | `10.0.10.0/24` (AZ-a), `10.0.11.0/24` (AZ-b) | Terraform |
| DB Subnets | VPC Subnets | `10.0.20.0/24` (AZ-a), `10.0.21.0/24` (AZ-b), isolated | Terraform |
| Internet Gateway | VPC IGW | Attached to VPC | Terraform |
| NAT Gateway | VPC NAT | Single NAT in Public Subnet A (pilot) | Terraform |
| Security Groups | VPC SGs | `sg-lambda`, `sg-fargate`, `sg-rds` (see Section 4.4) | Terraform |

#### 19.2.4 Edge & API Resources

| Resource | Service | Configuration | Provisioned By |
|----------|---------|---------------|----------------|
| REST API | API Gateway (HTTP API) | Regional, Cognito JWT authorizer, CORS | Serverless Framework |
| WebSocket API | API Gateway (WebSocket) | Regional, custom Lambda authorizer | Serverless Framework |
| CDN | CloudFront | OAI, custom error pages (SPA fallback), SSL | Terraform |
| DNS/SSL | ACM | Certificate for CloudFront distribution | Terraform |

#### 19.2.5 Security & Identity Resources

| Resource | Service | Configuration | Provisioned By |
|----------|---------|---------------|----------------|
| User Pool | Cognito | Email sign-in, custom attributes, Lambda triggers | Terraform |
| App Client | Cognito | No secret, SRP auth, 1h/30d token validity | Terraform |
| Secrets | SSM Parameter Store | SecureString: DB credentials, Cognito client ID, etc. | Terraform |
| IAM Roles | IAM | Per-service least-privilege roles | Terraform + Serverless |

---

### 19.3 Infrastructure as Code — Terraform Modules

```
infra/
├── main.tf                          # Root module — orchestrates all child modules
├── variables.tf                     # Input variables (stage, region, etc.)
├── outputs.tf                       # Exported values (API URLs, bucket names, etc.)
├── backend.tf                       # S3 backend for Terraform state
├── terraform.tfvars                 # Environment-specific variable values
│
└── modules/
    ├── vpc/                         # VPC, subnets, route tables, IGW, NAT, SGs
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: vpc_id, subnet_ids, sg_ids
    │
    ├── rds/                         # RDS PostgreSQL instance, subnet group, parameter group
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: db_endpoint, db_name
    │
    ├── cognito/                     # User Pool, App Client, custom attributes
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: user_pool_id, app_client_id
    │
    ├── s3/                          # Frontend bucket (OAI), export bucket (lifecycle)
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: bucket_names, bucket_arns
    │
    ├── cloudfront/                  # Distribution, OAI, custom error responses, SSL
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: distribution_id, domain_name
    │
    ├── dynamodb/                    # WebSocketConnections table with TTL
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: table_name, table_arn
    │
    ├── ecs/                         # ECS cluster, task definition, ECR repository
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf               # Exports: cluster_arn, task_def_arn, ecr_url
    │
    ├── ssm/                         # Parameter Store entries for all secrets
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    │
    └── iam/                         # Shared IAM roles and policies
        ├── main.tf
        ├── variables.tf
        └── outputs.tf               # Exports: role_arns (Lambda, Fargate, CodeBuild)
```

#### 19.3.1 Module Dependency Graph

```
                    ┌─────┐
                    │ vpc │
                    └──┬──┘
           ┌──────────┼──────────┬──────────┐
           ▼          ▼          ▼          ▼
        ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐
        │ rds │   │ ecs │   │ iam │   │ ssm │
        └─────┘   └──┬──┘   └──┬──┘   └─────┘
                     │          │
                     ▼          │
                  ┌─────┐      │
                  │ ecr │      │
                  └─────┘      │
                               │
        ┌──────────────────────┼──────────────┐
        ▼                      ▼              ▼
   ┌─────────┐          ┌──────────┐    ┌─────────┐
   │ cognito │          │ dynamodb │    │   s3    │
   └─────────┘          └──────────┘    └────┬────┘
                                             │
                                             ▼
                                       ┌────────────┐
                                       │ cloudfront │
                                       └────────────┘
```

---

### 19.4 Serverless Framework — Service Deployment

Each Lambda microservice has its own `serverless.yml`:

```yaml
# Example: services/academic-year-service/serverless.yml
service: academic-year-service

frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs22.x
  memorySize: 256
  timeout: 29
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'ap-south-1'}
  vpc:
    securityGroupIds:
      - ${ssm:/timetable/${self:provider.stage}/sg-lambda-id}
    subnetIds:
      - ${ssm:/timetable/${self:provider.stage}/private-subnet-a-id}
      - ${ssm:/timetable/${self:provider.stage}/private-subnet-b-id}
  environment:
    DATABASE_URL: ${ssm:/timetable/${self:provider.stage}/database-url}
    STAGE: ${self:provider.stage}
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - lambda:InvokeFunction
          Resource:
            - arn:aws:lambda:${self:provider.region}:*:function:*-${self:provider.stage}-*

layers:
  - ${ssm:/timetable/${self:provider.stage}/shared-layer-arn}

functions:
  api:
    handler: dist/handler.handler
    events:
      - httpApi:
          path: /academic-years/{proxy+}
          method: '*'
          authorizer:
            type: jwt
            id: ${ssm:/timetable/${self:provider.stage}/cognito-authorizer-id}
```

#### 19.4.1 Lambda Layer Deployment

| Layer | Contents | Size | Attached To |
|-------|----------|------|-------------|
| **SharedDepsLayer** | `@timetable/shared` package (middleware, Prisma client, Zod models, helpers) + `node_modules` | ~40 MB | All 11 microservice Lambdas |
| **ChromiumLayer** | `@sparticuz/chromium` headless browser binary | ~45 MB | Export Service only |

**Layer Build Process**:

```bash
# 1. Build the shared package
cd packages/shared && npm run build

# 2. Create layer directory structure
mkdir -p layers/shared/nodejs/node_modules

# 3. Copy shared package + production dependencies
cp -r packages/shared/dist layers/shared/nodejs/node_modules/@timetable/shared
cd layers/shared/nodejs && npm install --production

# 4. Zip and deploy
cd layers/shared && zip -r shared-layer.zip nodejs/
aws lambda publish-layer-version --layer-name SharedDepsLayer-{stage} \
  --zip-file fileb://shared-layer.zip --compatible-runtimes nodejs22.x
```

---

### 19.5 Environment Configuration

#### 19.5.1 Environment Variables Per Service

| Variable | Services | Source | Description |
|----------|----------|--------|-------------|
| `DATABASE_URL` | All Lambda services | SSM SecureString | PostgreSQL connection string |
| `STAGE` | All | Serverless `stage` | Environment name (`dev`, `prod`) |
| `COGNITO_USER_POOL_ID` | Auth Service, Cognito triggers | SSM | Cognito User Pool ID |
| `COGNITO_APP_CLIENT_ID` | Auth Service | SSM | App Client ID |
| `WS_API_ENDPOINT` | Timetable Service, WebSocket Handler | SSM | WebSocket API callback URL |
| `WS_CONNECTIONS_TABLE` | WebSocket Handler, Timetable Service | SSM | DynamoDB table name |
| `EXPORT_BUCKET` | Export Service | SSM | S3 bucket name for exports |
| `PRESIGN_EXPIRY` | Export Service | SSM | Pre-signed URL TTL in seconds (900) |
| `ECS_CLUSTER_ARN` | Timetable Service | SSM | Fargate cluster ARN |
| `ECS_TASK_DEF_ARN` | Timetable Service | SSM | Fargate task definition ARN |
| `ECS_SUBNET_IDS` | Timetable Service | SSM | Private subnet IDs (comma-separated) |
| `ECS_SECURITY_GROUP_ID` | Timetable Service | SSM | `sg-fargate` security group ID |

#### 19.5.2 SSM Parameter Store Naming Convention

```
/timetable/{stage}/database-url                → SecureString
/timetable/{stage}/cognito-user-pool-id        → String
/timetable/{stage}/cognito-app-client-id       → String
/timetable/{stage}/ws-api-endpoint             → String
/timetable/{stage}/ws-connections-table         → String
/timetable/{stage}/export-bucket               → String
/timetable/{stage}/shared-layer-arn            → String
/timetable/{stage}/chromium-layer-arn          → String
/timetable/{stage}/sg-lambda-id                → String
/timetable/{stage}/sg-fargate-id               → String
/timetable/{stage}/private-subnet-a-id         → String
/timetable/{stage}/private-subnet-b-id         → String
/timetable/{stage}/cognito-authorizer-id       → String
/timetable/{stage}/ecs-cluster-arn             → String
/timetable/{stage}/ecs-task-def-arn            → String
```

---

### 19.6 Deployment Topology — Single Environment (Pilot)

| Aspect | Specification |
|--------|---------------|
| **Stage** | `prod` (single environment for pilot) |
| **Region** | `ap-south-1` (Mumbai) |
| **Availability Zones** | 2 AZs (`ap-south-1a`, `ap-south-1b`) |
| **Multi-AZ RDS** | Disabled (pilot) — single-AZ primary in `ap-south-1a` |
| **NAT Gateways** | 1 (in Public Subnet A) — add second in B for HA later |
| **CloudFront** | Global edge locations (AWS-managed) |
| **Estimated monthly cost** | ~$50–80 USD (see breakdown below) |

#### 19.6.1 Estimated Cost Breakdown (Pilot)

| Resource | Tier | Estimated Monthly Cost |
|----------|------|----------------------|
| RDS PostgreSQL (db.t4g.micro) | Free tier eligible (first 12 months) | $0 – $15 |
| Lambda (11 services) | Free tier: 1M requests + 400K GB-seconds | $0 – $5 |
| NAT Gateway | $0.045/hr + data processing | ~$33 |
| S3 (frontend + exports) | Free tier eligible | $0 – $2 |
| CloudFront | Free tier: 1TB transfer/month | $0 – $5 |
| DynamoDB (on-demand) | Free tier: 25 WCU/RCU | $0 – $1 |
| Cognito | Free tier: 50,000 MAUs | $0 |
| API Gateway | Free tier: 1M REST calls/month | $0 – $2 |
| Fargate (on-demand tasks) | ~$0.04/task (1 vCPU, 2 GB, ~3 min) | $0 – $5 |
| SSM Parameter Store | Standard tier: free | $0 |
| CloudWatch Logs | 5 GB ingestion free | $0 – $5 |
| **Total** | | **~$50 – $80** |

---

### 19.7 Security Architecture

#### 19.7.1 Network Security Layers

```
Internet
    │
    ▼
┌────────────┐     ┌───────────────────┐     ┌──────────────────────┐
│ CloudFront │────►│ S3 (OAI only)     │     │ AWS WAF (optional)   │
│ (HTTPS)    │     │ No public access   │     │ Rate limiting, IP    │
└────────────┘     └───────────────────┘     │ blocking (future)    │
                                              └──────────────────────┘
    │
    ▼
┌───────────────────────────┐
│ API Gateway               │
│ - TLS 1.2+ termination    │
│ - Cognito JWT validation  │
│ - Throttling: 1000 rps    │
│ - CORS: CloudFront only   │
└──────────┬────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ VPC: Private Subnets                                      │
│                                                           │
│  Lambda (sg-lambda)           Fargate (sg-fargate)        │
│  - No inbound                 - No inbound                │
│  - Outbound: 5432→sg-rds     - Outbound: 5432→sg-rds     │
│  - Outbound: 443→NAT         - Outbound: 443→NAT         │
│                                                           │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│ Isolated DB Subnets                                       │
│                                                           │
│  RDS (sg-rds)                                             │
│  - Inbound: 5432 from sg-lambda + sg-fargate only         │
│  - No outbound                                            │
│  - No internet route                                      │
│  - Encryption at rest: AWS-managed key                    │
│  - Encryption in transit: SSL enforced                    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

#### 19.7.2 IAM Least-Privilege Roles

| Role | Attached To | Permissions |
|------|-------------|-------------|
| `timetable-lambda-{service}-role` | Each Lambda service | `rds-data:*` on specific DB, `lambda:InvokeFunction` on allowed targets, `ssm:GetParameter` on `/timetable/{stage}/*`, CloudWatch Logs write |
| `timetable-lambda-export-role` | Export Service | Above + `s3:PutObject`/`s3:GetObject` on export bucket, `s3:PutObject` presigner |
| `timetable-lambda-timetable-role` | Timetable Service | Above + `ecs:RunTask` on specific task def, `iam:PassRole` for Fargate execution role |
| `timetable-lambda-ws-role` | WebSocket Handler | Above + `dynamodb:PutItem`/`DeleteItem`/`Query` on connections table, `execute-api:ManageConnections` on WebSocket API |
| `timetable-fargate-role` | Fargate task | `rds-data:*` on specific DB, `execute-api:ManageConnections` on WebSocket API, `dynamodb:Query` on connections table, `ssm:GetParameter`, CloudWatch Logs write |
| `timetable-codebuild-role` | CodeBuild | `lambda:*`, `s3:PutObject`/`DeleteObject` on specific buckets, `cloudfront:CreateInvalidation`, `ecs:RegisterTaskDefinition`, `ecr:PutImage`, `ssm:GetParameter`, Terraform state S3 access |
| `timetable-cognito-trigger-role` | Cognito trigger Lambdas | `cognito-idp:AdminUpdateUserAttributes`, `rds-data:*` on specific DB, CloudWatch Logs write |

---

### 19.8 Monitoring & Alerting

#### 19.8.1 CloudWatch Dashboards

| Dashboard | Widgets |
|-----------|---------|
| **API Health** | API Gateway 4xx/5xx rates, latency (p50, p95, p99), request count per service |
| **Lambda Performance** | Invocation count, duration, errors, throttles, concurrent executions per function |
| **Database** | RDS CPU utilization, free storage, database connections, read/write IOPS |
| **Timetable Generation** | Fargate task count, duration, success/failure rate, memory utilization |

#### 19.8.2 CloudWatch Alarms

| Alarm | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| **API 5xx spike** | API Gateway 5XXError | > 5 in 5 minutes | SNS → email to admin |
| **Lambda errors** | Lambda Errors (per function) | > 3 in 5 minutes | SNS → email |
| **RDS CPU** | CPUUtilization | > 80% for 10 minutes | SNS → email |
| **RDS storage** | FreeStorageSpace | < 2 GB | SNS → email |
| **RDS connections** | DatabaseConnections | > 80 (of 87 max for t4g.micro) | SNS → email |
| **NAT Gateway errors** | ErrorPortAllocation | > 0 in 5 minutes | SNS → email |
| **Fargate task failure** | ECS RunTask failures | > 0 | SNS → email |

#### 19.8.3 CloudWatch Log Groups

| Log Group | Source | Retention |
|-----------|--------|-----------|
| `/aws/lambda/academic-year-service-{stage}` | Academic Year Service | 30 days |
| `/aws/lambda/class-service-{stage}` | Class Service | 30 days |
| `/aws/lambda/teacher-service-{stage}` | Teacher Service | 30 days |
| `/aws/lambda/subject-service-{stage}` | Subject Service | 30 days |
| `/aws/lambda/slot-service-{stage}` | Slot Service | 30 days |
| `/aws/lambda/timetable-service-{stage}` | Timetable Service | 30 days |
| `/aws/lambda/assignment-service-{stage}` | Assignment Service | 30 days |
| `/aws/lambda/dashboard-service-{stage}` | Dashboard Service | 30 days |
| `/aws/lambda/export-service-{stage}` | Export Service | 30 days |
| `/aws/lambda/ws-handler-{stage}` | WebSocket Handler | 30 days |
| `/aws/lambda/auth-service-{stage}` | Auth Service | 30 days |
| `/ecs/timetable-engine-{stage}` | Fargate timetable engine | 30 days |
| `/aws/lambda/cognito-triggers-{stage}` | Cognito Lambda triggers | 30 days |

#### 19.8.4 Structured Log Format

All Lambda services use a consistent JSON log format:

```json
{
  "timestamp": "2026-03-12T10:30:00.000Z",
  "level": "INFO",
  "service": "academic-year-service",
  "requestId": "abc123-def456",
  "schoolId": "sch_uuid_here",
  "method": "POST",
  "path": "/academic-years",
  "statusCode": 201,
  "duration": 45,
  "message": "Academic year created successfully"
}
```

Error logs additionally include:

```json
{
  "level": "ERROR",
  "error": {
    "name": "PrismaClientKnownRequestError",
    "code": "P2002",
    "message": "Unique constraint failed on the fields: (`school_id`,`label`)",
    "stack": "..."
  }
}
```

---

### 19.9 Backup & Disaster Recovery

| Aspect | Strategy |
|--------|----------|
| **RDS automated backups** | Enabled. 7-day retention. Daily snapshot window: 03:00–04:00 UTC. |
| **RDS point-in-time recovery** | Available within the 7-day backup window (5-minute granularity). |
| **RDS manual snapshots** | Created before each Prisma migration. Retained for 30 days. |
| **S3 frontend versioning** | Enabled. Allows instant rollback to previous deployment. |
| **S3 export files** | 7-day lifecycle. Not backed up (regeneratable). |
| **DynamoDB** | No backups needed — ephemeral WebSocket connection records. |
| **Terraform state** | S3 with versioning + DynamoDB lock table. State file is the source of truth for all infrastructure. |
| **Code** | GitHub repository. All infrastructure and application code version-controlled. |
| **Recovery Time Objective (RTO)** | < 1 hour (restore from RDS snapshot + Terraform apply + Serverless deploy). |
| **Recovery Point Objective (RPO)** | < 5 minutes (RDS point-in-time recovery). |

---

*End of Section 19.*

---

## 20. Export Module

This section provides the complete specification for the Export Module — covering PDF and Excel export generation for division timetables and teacher timetables, including rendering pipelines, file formats, S3 integration, and client-side download flows.

---

### 20.1 Export Types Matrix

| Export Type | Grid Source | File Format | Generator | Naming Convention |
|-------------|-------------|-------------|-----------|-------------------|
| Division Timetable PDF | Screen 12 grid layout | `.pdf` (A3 landscape) | Puppeteer (`@sparticuz/chromium`) | `{ClassName}_{Division}_{YYYY-MM-DD}.pdf` |
| Division Timetable Excel | Screen 12 grid data | `.xlsx` | ExcelJS | `{ClassName}_{Division}_{YYYY-MM-DD}.xlsx` |
| Teacher Timetable PDF | Screen 14 grid layout | `.pdf` (A3 landscape) | Puppeteer (`@sparticuz/chromium`) | `Teacher_{Name}_{YYYY-MM-DD}.pdf` |
| Teacher Timetable Excel | Screen 14 grid data | `.xlsx` | ExcelJS | `Teacher_{Name}_{YYYY-MM-DD}.xlsx` |

---

### 20.2 API Endpoints

| Method | Path | Request Body | Response |
|--------|------|-------------|----------|
| POST | `/export/division/pdf` | `{ "divisionId": "uuid", "academicYearId": "uuid" }` | `{ "url": "https://s3.../presigned-url" }` |
| POST | `/export/division/excel` | `{ "divisionId": "uuid", "academicYearId": "uuid" }` | `{ "url": "https://s3.../presigned-url" }` |
| POST | `/export/teacher/pdf` | `{ "teacherId": "uuid", "academicYearId": "uuid" }` | `{ "url": "https://s3.../presigned-url" }` |
| POST | `/export/teacher/excel` | `{ "teacherId": "uuid", "academicYearId": "uuid" }` | `{ "url": "https://s3.../presigned-url" }` |

**Common response headers**: `Content-Type: application/json`

**Error responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or invalid `divisionId`/`teacherId` | `{ "error": "VALIDATION_ERROR", "message": "divisionId is required" }` |
| 404 | Division/teacher not found or no timetable published | `{ "error": "NOT_FOUND", "message": "No published timetable found for this division" }` |
| 504 | Puppeteer timeout (> 29s) | `{ "error": "TIMEOUT", "message": "Export generation timed out. Please try again." }` |

---

### 20.3 PDF Generation Pipeline (Puppeteer)

#### 20.3.1 Processing Steps

```
Export Service Lambda
 │
 │  1. Validate request (Zod schema)
 │
 │  2. Query timetable data from RDS:
 │     SELECT ts.*, a.*, s.name AS subject, t.name AS teacher,
 │            d.name AS division, sl.day, sl.period, sl.start_time, sl.end_time
 │     FROM timetable_slots ts
 │     JOIN assignments a ON ts.assignment_id = a.id
 │     JOIN subjects s ON a.subject_id = s.id
 │     JOIN teachers t ON a.teacher_id = t.id
 │     JOIN divisions d ON ts.division_id = d.id
 │     JOIN slots sl ON ts.slot_id = sl.id
 │     WHERE ts.division_id = ? AND ts.school_id = ? AND ts.academic_year_id = ?
 │     AND ts.status = 'published'
 │     ORDER BY sl.day, sl.period
 │
 │  3. Transform query results into grid data:
 │     {
 │       days: ["Monday", "Tuesday", ..., "Saturday"],
 │       periods: [{ period: 1, start: "08:00", end: "08:40", isBreak: false }, ...],
 │       grid: {
 │         "Monday": {
 │           1: { subject: "Mathematics", teacher: "Mr. Sharma", room: null },
 │           2: { subject: "English", teacher: "Ms. Patel", room: null },
 │           ...
 │         },
 │         ...
 │       },
 │       title: "Class X-A Timetable",
 │       schoolName: "ABC School",
 │       academicYear: "2025-2026"
 │     }
 │
 │  4. Render HTML template:
 │     - Inline CSS (no external stylesheets — Puppeteer renders in isolation)
 │     - Grid layout matching Screen 12/14 (days as columns, periods as rows)
 │     - Break rows rendered as merged cells with distinct background (#f0f0f0)
 │     - School name and title in header
 │     - Generated date in footer
 │
 │  5. Launch headless Chromium:
 │     const chromium = require('@sparticuz/chromium');
 │     const browser = await puppeteer.launch({
 │       args: chromium.args,
 │       defaultViewport: chromium.defaultViewport,
 │       executablePath: await chromium.executablePath(),
 │       headless: chromium.headless,
 │     });
 │
 │  6. Generate PDF:
 │     const page = await browser.newPage();
 │     await page.setContent(html, { waitUntil: 'networkidle0' });
 │     const pdfBuffer = await page.pdf({
 │       format: 'A3',
 │       landscape: true,
 │       printBackground: true,
 │       margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
 │     });
 │     await browser.close();
 │
 │  7. Upload to S3:
 │     s3.putObject({
 │       Bucket: EXPORT_BUCKET,
 │       Key: `exports/${schoolId}/${timestamp}_${fileName}.pdf`,
 │       Body: pdfBuffer,
 │       ContentType: 'application/pdf'
 │     })
 │
 │  8. Generate pre-signed URL:
 │     const url = getSignedUrl(s3Client, new GetObjectCommand({
 │       Bucket: EXPORT_BUCKET,
 │       Key: key
 │     }), { expiresIn: PRESIGN_EXPIRY })  // 900 seconds = 15 minutes
 │
 │  9. Return { url } to client
```

#### 20.3.2 HTML Template Structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { font-size: 18px; margin: 0; }
    .header h2 { font-size: 14px; color: #555; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #1a56db; color: #fff; padding: 8px; font-size: 11px;
         border: 1px solid #ccc; }
    td { padding: 6px; text-align: center; font-size: 10px;
         border: 1px solid #ccc; vertical-align: middle; }
    .break-row td { background: #f0f0f0; font-style: italic; color: #888; }
    .subject { font-weight: 600; }
    .teacher { font-size: 9px; color: #555; }
    .footer { text-align: right; font-size: 9px; color: #999; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>{{schoolName}}</h1>
    <h2>{{title}} — {{academicYear}}</h2>
  </div>
  <table>
    <thead>
      <tr>
        <th>Period / Day</th>
        <th>Monday</th><th>Tuesday</th><th>Wednesday</th>
        <th>Thursday</th><th>Friday</th><th>Saturday</th>
      </tr>
    </thead>
    <tbody>
      {{#each periods}}
        {{#if isBreak}}
          <tr class="break-row">
            <td>{{label}} ({{start}}–{{end}})</td>
            <td colspan="6">— Break —</td>
          </tr>
        {{else}}
          <tr>
            <td>P{{period}} ({{start}}–{{end}})</td>
            {{#each ../days}}
              <td>
                <div class="subject">{{lookup ../../grid this ../period "subject"}}</div>
                <div class="teacher">{{lookup ../../grid this ../period "teacher"}}</div>
              </td>
            {{/each}}
          </tr>
        {{/if}}
      {{/each}}
    </tbody>
  </table>
  <div class="footer">Generated on {{generatedDate}}</div>
</body>
</html>
```

#### 20.3.3 Puppeteer Performance Constraints

| Constraint | Value | Mitigation |
|-----------|-------|------------|
| Lambda timeout | 29 seconds | Optimize HTML (no external resources). Pre-warm Chromium in Lambda init. |
| Chromium cold start | ~2–4 seconds | Chromium binary loaded from Lambda Layer (not downloaded). |
| PDF generation | ~3–8 seconds per timetable | Single-page timetable. No complex SVGs or images. |
| Lambda memory | 256 MB (may need 512 MB for Puppeteer) | Monitor memory usage. Increase if OOM errors occur. |
| Total E2E | ~8–15 seconds typical | Well within 29s limit for single timetable export. |

---

### 20.4 Excel Generation Pipeline (ExcelJS)

#### 20.4.1 Processing Steps

```
Export Service Lambda
 │
 │  1. Validate request (same Zod schema as PDF)
 │
 │  2. Query timetable data from RDS (same query as PDF pipeline)
 │
 │  3. Create ExcelJS workbook:
 │     const workbook = new ExcelJS.Workbook();
 │     workbook.creator = schoolName;
 │     workbook.created = new Date();
 │
 │  4. Add worksheet:
 │     const sheet = workbook.addWorksheet(title);
 │
 │  5. Build header row:
 │     - Row 1: School name (merged across all columns, bold, centered)
 │     - Row 2: Timetable title + academic year (merged, centered)
 │     - Row 3: Empty (spacer)
 │     - Row 4: Column headers [Period/Day, Monday, Tuesday, ..., Saturday]
 │
 │  6. Build data rows:
 │     For each period:
 │       If break → merged cell "— Break —" with gray background
 │       Else → cell per day with:
 │         Line 1: Subject name (bold)
 │         Line 2: Teacher name (gray, smaller font)
 │
 │  7. Apply styling:
 │     - Column headers: blue background (#1a56db), white text, bold
 │     - Data cells: borders on all sides, vertical center alignment
 │     - Break rows: #f0f0f0 background, italic, merged across all day columns
 │     - Alternating row colors: white / #f9fafb
 │     - Column widths: Period column = 18, Day columns = 22
 │
 │  8. Generate buffer:
 │     const buffer = await workbook.xlsx.writeBuffer();
 │
 │  9. Upload to S3 (same as PDF pipeline but content type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 │
 │  10. Generate pre-signed URL and return { url }
```

#### 20.4.2 Excel Styling Specification

| Element | Font | Size | Color | Background | Border | Alignment |
|---------|------|------|-------|------------|--------|-----------|
| School name (R1) | Calibri, Bold | 16 | `#000000` | None | None | Center, merged |
| Title (R2) | Calibri | 12 | `#555555` | None | None | Center, merged |
| Column headers (R4) | Calibri, Bold | 11 | `#FFFFFF` | `#1A56DB` | Thin, `#CCCCCC` | Center |
| Subject cell line 1 | Calibri, Bold | 10 | `#000000` | White / `#F9FAFB` | Thin, `#CCCCCC` | Center, Wrap |
| Teacher cell line 2 | Calibri | 9 | `#555555` | Same as row | Same | Center, Wrap |
| Break row | Calibri, Italic | 10 | `#888888` | `#F0F0F0` | Thin, `#CCCCCC` | Center, merged |
| Period column | Calibri | 10 | `#000000` | `#F3F4F6` | Thin, `#CCCCCC` | Center |

#### 20.4.3 Excel Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Generation time | ≤ 5 seconds | ExcelJS builds workbook in memory. No browser required. |
| File size | ~50–100 KB per timetable | Single worksheet, no images. |
| Memory usage | ~50 MB peak | Well within 256 MB Lambda allocation. |

---

### 20.5 S3 Storage & Lifecycle

#### 20.5.1 Bucket Configuration

| Property | Value |
|----------|-------|
| **Bucket name** | `timetable-exports-{stage}-{account-id}` |
| **Region** | Same as all other resources |
| **Access** | Private — no public access, no bucket policy allowing public reads |
| **Versioning** | Disabled (exports are immutable, regeneratable) |
| **Encryption** | SSE-S3 (AES-256, AWS-managed) |
| **Lifecycle rule** | All objects under `exports/` prefix → delete after **7 days** |
| **CORS** | Not required (downloads via pre-signed URL, not browser-direct S3 fetch) |

#### 20.5.2 Object Key Structure

```
exports/
└── {schoolId}/
    ├── 1710234567890_ClassX_A_2026-03-12.pdf
    ├── 1710234567890_ClassX_A_2026-03-12.xlsx
    ├── 1710234890123_Teacher_Mr_Sharma_2026-03-12.pdf
    └── 1710234890123_Teacher_Mr_Sharma_2026-03-12.xlsx
```

- **Tenant isolation**: Objects are keyed under `{schoolId}/`. The Export Service Lambda IAM role has `s3:PutObject` and `s3:GetObject` scoped to `exports/${school_id_from_jwt}/*` — but since IAM policies don't support runtime claim substitution at that granularity, the application code enforces the `schoolId` prefix. The bucket-level policy restricts access to the Export Service role only.

#### 20.5.3 Pre-signed URL Security

| Aspect | Implementation |
|--------|----------------|
| **Signing method** | AWS SDK v3 `@aws-sdk/s3-request-presigner` → `getSignedUrl()` |
| **Expiry** | 900 seconds (15 minutes), configurable via `PRESIGN_EXPIRY` env var |
| **HTTP method** | GET only (download) |
| **Who can use it** | Anyone with the URL — URL is returned to the authenticated user only |
| **After expiry** | URL returns 403 Forbidden. User must trigger a new export. |
| **No caching** | URL is unique per generation (timestamp in key). Browser won't serve stale exports. |

---

### 20.6 Client-Side Export Flow

#### 20.6.1 User Interaction (Screen 12 — Division Timetable View)

```
User clicks "Export PDF" button
 │
 │  1. Button shows loading spinner
 │
 │  2. RTK Query mutation: POST /export/division/pdf
 │     Body: { divisionId, academicYearId }
 │     Headers: Authorization: Bearer <idToken>
 │
 │  3. Wait for response (typically 8–15s for PDF, ≤5s for Excel)
 │
 │  4. On success: receive { url }
 │
 │  5. Trigger browser download:
 │     const a = document.createElement('a');
 │     a.href = url;
 │     a.download = 'ClassX_A_2026-03-12.pdf';
 │     a.click();
 │
 │  6. Button returns to normal state
 │
 │  On error:
 │     - 504 Timeout → toast: "Export timed out. Please try again."
 │     - 404 Not Found → toast: "No published timetable found."
 │     - Network error → toast: "Unable to connect. Please check your internet connection."
```

#### 20.6.2 Export Button States

| State | Visual | Interactions |
|-------|--------|--------------|
| **Idle** | Icon (PDF/Excel icon) + label text | Clickable |
| **Loading** | Spinner replacing icon + "Generating..." text | Disabled (no double-click) |
| **Success** | Brief green check → reverts to Idle | Download triggers automatically |
| **Error** | Red toast notification → reverts to Idle | Clickable (retry) |

#### 20.6.3 Export Buttons Location

| Screen | Buttons | Position |
|--------|---------|----------|
| **Screen 12** (Division Timetable View) | "Export PDF", "Export Excel" | Top-right action bar, next to "Edit" button |
| **Screen 14** (Teacher Timetable View) | "Export PDF", "Export Excel" | Top-right action bar |

---

### 20.7 Teacher Timetable Export Differences

The teacher timetable export follows the same pipeline but with a different data query and grid layout:

| Aspect | Division Timetable | Teacher Timetable |
|--------|-------------------|-------------------|
| **Query scope** | All slots for a specific `division_id` | All slots assigned to a specific `teacher_id` across all divisions |
| **Grid columns** | Days (Mon–Sat) | Days (Mon–Sat) |
| **Grid rows** | Periods (from slot configuration) | Same periods |
| **Cell content** | Subject + Teacher | Subject + Division (e.g., "Mathematics — X-A") |
| **Title** | "Class X-A Timetable" | "Teacher: Mr. Sharma — Timetable" |
| **Free periods** | Empty cell | Highlighted as "Free" with green background |
| **Conflicts** | N/A (each division has one assignment per slot) | Possible if teacher teaches multiple divisions — shown with red border |

---

### 20.8 Export Module Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `puppeteer-core` | `^22.x` | Headless browser automation for PDF rendering |
| `@sparticuz/chromium` | `^122.x` | Chromium binary optimized for Lambda (deployed as Lambda Layer) |
| `exceljs` | `^4.x` | Excel workbook generation |
| `@aws-sdk/client-s3` | `^3.x` | S3 upload operations |
| `@aws-sdk/s3-request-presigner` | `^3.x` | Pre-signed URL generation |

---

*End of Section 20.*

---

*End of SRS Document.*
