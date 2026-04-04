# CLAUDE.md — Project Guide

## Project Overview

School Timetable Management System — a multi-tenant SaaS for automated school timetable generation. Monorepo with Node.js backend (12 serverless microservices), Python timetable engine (genetic algorithm), and React frontend.

## Tech Stack

- **Backend**: Node.js 22, TypeScript, Serverless Framework, Prisma ORM, PostgreSQL 16
- **Frontend**: React 19, Vite 6, Redux Toolkit + RTK Query, Tailwind CSS 4, React Router 7
- **Timetable Engine**: Python 3.12, PyGAD/custom GA, runs on AWS Fargate
- **Auth**: AWS Cognito (mocked locally with JWT)
- **Infra**: Terraform, AWS Lambda, API Gateway, RDS, S3, CloudFront, DynamoDB
- **Region**: ap-south-1 (Mumbai)

## Repository Structure

```
apps/frontend/           # React SPA (Vite)
packages/shared/         # Shared library (@timetable/shared) — Prisma, Zod, middleware, errors
  prisma/schema.prisma   # Database schema (20 tables)
  src/                   # Errors, helpers, middleware, models, db client
services/                # 12 Lambda microservices
  auth/           :4001  # Mock auth (register, login, me)
  academic-year/  :4002  # Academic year CRUD + activate
  school-config/  :4007  # Period structures, working days, slots
  subject/        :4004  # Subject CRUD + cascade invalidation
  teacher/        :4005  # Teacher CRUD + subjects + availability
  class/          :4003  # Classes + divisions + sort order
  division-assignment/ :4006  # Assignments + elective groups + preferences
  timetable/      :4008  # Generate, status, grid, override, conflicts
  dashboard/      :4009  # Stats, activity, setup wizard API
  notification/   :4012  # List, count, dismiss notifications
  export/         :4010  # PDF/Excel export (division, class, teacher, multi-teacher)
  websocket/      :4011  # WebSocket connection management
engine/timetable-generator/  # Python GA engine
infra/                       # Terraform modules (VPC, RDS, Cognito, S3, ECS, etc.)
```

## Getting Started

```bash
# Start database
docker compose up -d

# Install dependencies
npm install

# Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# Seed test data
npm run db:seed

# Run all backend services
npm run dev

# Run including frontend
npm run dev:all

# Run individual service
npm run dev:auth
npm run dev:school-config
# etc.

# Prisma Studio (DB browser)
npm run prisma:studio
```

## Environment

Required in `.env` (root):
```
DATABASE_URL=postgresql://timetable_admin:localdev123@localhost:5433/timetable_dev
DYNAMODB_ENDPOINT=http://localhost:8000
STAGE=dev
```

Docker Compose provides PostgreSQL on port **5433** and DynamoDB Local on port **8000**.

## Service Architecture

Each service follows the pattern: `handler.ts` → `router.ts` → `controller.ts` → `service.ts`

- **handler.ts**: Lambda entry point, wraps router with error handling
- **router.ts**: Path matching (method + path), dispatches to controller
- **controller.ts**: Auth middleware, request parsing (Zod), calls service, formats response
- **service.ts**: Business logic, Prisma queries

All services use `@timetable/shared` for: Prisma client, error classes (`AppError`, `NotFoundError`, `ConflictError`, `ValidationError`), middleware (`authMiddleware`, `academicYearMiddleware`), response helpers (`success()`, `paginated()`, `created()`), and Zod schemas.

## Database

- **ORM**: Prisma with schema at `packages/shared/prisma/schema.prisma`
- **20 tables**, all with `school_id` for multi-tenancy
- **Soft deletes** via `deleted_at` column on most entities
- **Period structures** assigned at the **division level** (not class level) — `divisions.period_structure_id`
- **Timetable statuses**: only `GENERATED` and `OUTDATED` (no PUBLISHED/DRAFT)

Run migrations: `npx prisma migrate dev --schema packages/shared/prisma/schema.prisma`

## Key Business Rules

- **Classes are user-defined** — any naming convention, not fixed to I–XII
- **Period structures** are assigned to **divisions**, not classes. Different divisions in the same class can have different structures.
- **Academic year scoping** — all data is scoped to the active academic year. Only one active per school.
- **Teacher maxPeriodsPerWeek** is a **soft cap** — engine tries to respect, may exceed, violations shown as warnings.
- **Subject deletion** cascades: timetable slots become empty, affected timetables flagged OUTDATED with conflict notifications.
- **Elective groups** — co-scheduled subjects. Cross-division electives enforce same teachers across linked divisions of the same class.
- **Scheduling preferences** — per-assignment JSONB field with preferred/excluded days, period ranges, adjacency, min/max per day. Constraint type: HARD or SOFT.

## Coding Conventions

- TypeScript strict mode throughout
- Zod for all request validation
- Error responses: `{ error: { code, message, details? } }`
- Success responses: `{ data: ... }` or `{ data: [...], meta: { page, pageSize, totalCount, totalPages } }`
- Auth: `X-Academic-Year-Id` header (or falls back to active year)
- All Prisma queries filter by `schoolId` and `deletedAt: null`
- Services communicate via synchronous Lambda invoke (for invalidation)

## Testing

- No automated tests — manual testing via Postman
- Postman collections in `Documentaion/postman/`
- Each service has a `/health` endpoint

## Documentation

All design docs are in `Documentaion/` (note the typo — keep as-is):
- `SRS.md` — Full software requirements specification
- `Plan.md` — Business requirements and UI screen specs
- `Implementation_Plan.md` — Backend implementation plan with progress tracker
- `Frontend_Implementation_Plan.md` — Frontend implementation plan
- `User_Flow.md` — Step-by-step user flow + FAB/setup wizard spec
- `DataCollection.md` — Sample school data for seeding

## Important Notes

- Do NOT add a `period_structure_classes` table — it was removed. Use `divisions.period_structure_id` instead.
- Do NOT add a `PUBLISHED` timetable status — only `GENERATED` and `OUTDATED` exist.
- The `Documentaion/` directory name has a typo. Do not rename it — existing references depend on this path.
- Frontend uses `sonner` for toasts, `@dnd-kit` for drag-and-drop, `shadcn/ui` primitives.
- The guided setup wizard uses a **Floating Action Button (FAB)** — not sidebar-based. The FAB doubles as a conflict notification hub after setup is complete.
