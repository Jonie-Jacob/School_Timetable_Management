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
- **Prisma binaryTargets**: `["native", "rhel-openssl-3.0.x"]` — native for Windows dev, rhel for Lambda

Run migrations: `npx prisma migrate dev --schema packages/shared/prisma/schema.prisma`

## Key Business Rules

- **Classes are user-defined** — any naming convention, not fixed to I–XII
- **Period structures** are assigned to **divisions**, not classes. Different divisions in the same class can have different structures.
- **Academic year scoping** — all data is scoped to the active academic year. Only one active per school.
- **Teacher maxPeriodsPerWeek** is a **soft cap** — engine tries to respect, may exceed, violations shown as warnings.
- **Subjects** have an optional `abbreviation` field (max 10 chars) — short code shown in timetable grid (e.g., "Phy", "Maths", "CS").
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
- **All API routes use `/api/` prefix** in production (e.g., `/api/teachers`, `/api/classes`)

## Testing

- No automated tests — manual testing via Postman
- Postman collections in `Documentaion/postman/`
- Each service has a `/api/<service>/health` endpoint

## Documentation

All design docs are in `Documentaion/` (note the typo — keep as-is):
- `SRS.md` — Full software requirements specification
- `Plan.md` — Business requirements and UI screen specs
- `Implementation_Plan.md` — Backend implementation plan with progress tracker
- `Frontend_Implementation_Plan.md` — Frontend implementation plan (22/22 phases complete)
- `New_Features_Implementation_Plan.md` — Class Teacher, Export, Unassigned Subjects plan
- `User_Flow.md` — Step-by-step user flow + FAB/setup wizard spec
- `DataCollection.md` — Sample school data for seeding
- `AWS_Deployment_Guide.md` — Full deployment guide (PowerShell)
- `Deployment_Operations.md` — How to deploy changes to BE/FE code

## Frontend Design System

- **Color Theme**: Warm Amber (#F59E0B) primary with Stone neutral palette. NOT purple/blue.
- **Style**: Glassmorphism — frosted glass cards, backdrop blur, animated orbs on light mode background.
- **Dark Surfaces**: Table headers, pagination bars, page headers, Setup Guide stepper all use `bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800` with white text.
- **Sidebar**: Solid dark `#1C1917` (Stone 900) with colorful per-item icons (each nav item has a unique color). Active state: amber left border + amber text.
- **Buttons**: Glossy top-down gradients with `hover:scale-[1.02]`, `active:scale-[0.98]`. Outline variant uses `backdrop-blur-[10px]`.
- **Tables**: Dark gradient header/footer, resizable columns (persisted in localStorage per page via `storageKey`), inline quick-edit (click cell → input), customizable page size, entries count display.
- **Orbs**: 3 animated floating orbs with blur(80px) in the main content area for glassmorphism depth. Light mode: 35% opacity. Dark mode: 5%.

## Deployment (Production)

- **AWS Account**: 648485682362
- **Region**: ap-south-1 (Mumbai)
- **CloudFront URL**: `https://d25i05v9hwcs8q.cloudfront.net`
- **Cognito User Pool**: `ap-south-1_rlYNHNPRZ`
- **Cognito Client ID**: `42r2ih2m9c3l26lb4u1mrrl5sb`
- **RDS Endpoint**: `timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432`
- **Frontend S3 Bucket**: `timetable-prod-frontend`
- **CloudFront Distribution ID**: `EUWIXJK2BNYEF`
- **Terraform State**: `s3://zyphr-timetable-terraform-state`
- **Auth**: AWS Cognito (`VITE_AUTH_MODE=cognito` in production, mock auth in local dev)

### Quick Deploy Commands (PowerShell)

**Frontend only:**
```powershell
cd apps\frontend; npm run build
aws s3 sync dist/ s3://timetable-prod-frontend --delete
aws cloudfront create-invalidation --distribution-id EUWIXJK2BNYEF --paths "/*"
```

**Backend service (e.g. teacher):**
```powershell
# Set env vars first (see Documentaion/Deployment_Operations.md)
cd services\teacher; npx serverless deploy --stage prod
```

**Full deployment guide:** See `Documentaion/AWS_Deployment_Guide.md`
**Operations & updates:** See `Documentaion/Deployment_Operations.md`

## Important Notes

- Do NOT add a `period_structure_classes` table — it was removed. Use `divisions.period_structure_id` instead.
- Do NOT add a `PUBLISHED` timetable status — only `GENERATED` and `OUTDATED` exist.
- The `Documentaion/` directory name has a typo. Do not rename it — existing references depend on this path.
- Frontend uses `sonner` for toasts, `@dnd-kit` for drag-and-drop, `shadcn/ui` primitives.
- The guided setup wizard uses a **Floating Action Button (FAB)** — not sidebar-based. The FAB doubles as a conflict notification hub after setup is complete.
- Vite proxy uses `rewrite` to strip `/api` prefix before forwarding to localhost services.

## Recently Fixed Bugs

**API `/api` prefix double-slash issue** (FIXED April 8, 2026): Removed leading `/` from all RTK Query endpoint URLs in all 10 API slices. URLs now use `'academic-years'` instead of `'/academic-years'` so `fetchBaseQuery` joins correctly with `baseUrl: '/api'`.

## Auth Architecture (Production)

- **Frontend**: Uses `amazon-cognito-identity-js` SDK for signup/signin/session
- **Cognito flow**: Register → email verification code → confirm → signin → get idToken
- **Backend auth**: `authMiddleware` is **async** — extracts `email` from JWT claims, looks up school by `adminEmail` in DB
- **Session persistence**: Cognito SDK stores tokens in localStorage; app stores school data in `app-session` localStorage key
- **All controllers** use `await authMiddleware(event)` (async)
- **Auth service** (`/api/auth/*`) does NOT have Cognito authorizer — uses custom auth
- **All other services** have Cognito JWT authorizers on API Gateway

## Lambda Layer

- Layer name: `timetable-shared`
- Current version: **8** (ARN: `arn:aws:lambda:ap-south-1:648485682362:layer:timetable-shared:8`)
- Contains: `@timetable/shared` compiled code + Prisma client + Linux engine binary (`libquery_engine-rhel-openssl-3.0.x.so.node`)
- Must include only the Linux engine (remove Windows DLL, WASM, non-PostgreSQL engines to stay under 250MB unzipped limit)
- Published via S3 upload (too large for direct upload): `s3://zyphr-timetable-terraform-state/layers/shared-layer.zip`

## CloudFront API Routing

All API calls go through CloudFront with `/api/` prefix behaviors:
```
/api/auth*              → API GW (7qzi5sjy57)
/api/academic-years*    → API GW (ktyoe2hub0)
/api/config*            → API GW (u4p6ckbwi2)
/api/subjects*          → API GW (96y3eaw5b9)
/api/teachers*          → API GW (ooaa0mzts6)
/api/classes*           → API GW (07l7jhdc7d)
/api/assignments*       → API GW (hy1ce6t917)
/api/divisions*         → API GW (hy1ce6t917)
/api/elective-groups*   → API GW (hy1ce6t917)
/api/timetables*        → API GW (oi8y49acg0)
/api/dashboard*         → API GW (974c7m4l1k)
/api/export*            → API GW (ou8ti6lcci)
/api/notifications*     → API GW (hymkzmxboc)
Default (*)             → S3 (timetable-prod-frontend) — SPA with 403/404 → index.html
```
