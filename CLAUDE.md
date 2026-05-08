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
- **Timetable statuses**: Multi-status JSON model (`status_json JSONB` column) with tags: VALID, EMPTY_SLOTS, EXCESS_ASSIGNMENTS, TEACHER_CONFLICT, AVAILABILITY_VIOLATION, PREFERENCE_VIOLATION_HARD, PREFERENCE_VIOLATION_SOFT, ORPHANED_SLOTS. Old `status` enum column and `TimetableStatus` enum have been dropped. Status recomputed via `recomputeTimetableStatus()` after every data change. Per-slot violation annotations returned in timetable grid API responses. Dashboard shows per-status-tag counts.
- **Prisma binaryTargets**: `["native", "rhel-openssl-3.0.x"]` — native for Windows dev, rhel for Lambda

Run migrations: `npx prisma migrate dev --schema packages/shared/prisma/schema.prisma`

## Key Business Rules

- **Classes are user-defined** — any naming convention, not fixed to I–XII
- **Period structures** are assigned to **divisions**, not classes. Different divisions in the same class can have different structures.
- **Academic year scoping** — all data is scoped to the active academic year. Only one active per school.
- **Teacher maxPeriodsPerWeek** is a **soft cap** — engine tries to respect, may exceed, violations shown as warnings.
- **Subjects** have an optional `abbreviation` field (max 10 chars) — short code shown in timetable grid (e.g., "Phy", "Maths", "CS").
- **Subject deletion** cascades: timetable slots become empty, affected timetable statuses recomputed.
- **Elective groups** — co-scheduled subjects. Cross-division electives co-schedule all participating divisions at the same time slot. Each subject has `parallel_sections` in `elective_group_subjects`: teachers <= ps = parallel mode (all teach every slot), teachers > ps = split mode (teachers take turns). Cross-div electives may be **asymmetric** — different divisions can have different subject subsets (e.g., XI B has only Maths, XI C has IP+Psy, XI D has all three). The output writer must use only each division's own assignments when writing timetable_slots.
- **Scheduling preferences** — per-assignment JSONB field with preferred/excluded days, period ranges, adjacency, min/max per day. Constraint type: HARD or SOFT.
- **Assistant teachers** — optional co-teacher per assignment. Treated identically to primary for scheduling (HARD constraint, same busy tracking). Shown as "Asst: Name" in timetable views.
- **Timetable visibility** — all timetables (any status) are viewable, exportable, and included in teacher period counts.
- **Teacher timetable DnD** — drag-and-drop swap across divisions. Same-division swaps execute directly, cross-division shows preview dialog with affected cells table + conflict resolution. Uses `previewTeacherSwap`, `swapTeacherSlots`, `getValidTeacherSwapTargets` endpoints.
- **Unified Elective Modal** — single modal for creating/editing elective groups with subjects, teachers, division participation grid, and scheduling preferences. Opens from Elective Groups table page and Assignment Editor page. Per-division electives with matching name/teachers/weightage are grouped in UI (Approach A — separate DB records, visual consolidation). Cross-division electives are each their own entry.
- **Export features** — PDF/Excel for divisions, classes, teachers. Teacher export includes summary table (class-wise period counts). Free Periods export (day-by-day teacher availability grid). Elective cells use compact format ("Subject - Teacher1, Teacher2"). Export uses time-range overlap for cross-structure free period detection.

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
- `SRS.md` — Full software requirements specification (consolidated: includes business requirements, new features, constraints)
- `Implementation_Plan.md` — Backend implementation plan with progress tracker
- `Frontend_Implementation_Plan.md` — Frontend implementation plan (22/22 phases complete)
- `Engine_Algorithm.md` — Timetable generation engine algorithm documentation
- `User_Flow.md` — Step-by-step user flow + FAB/setup wizard spec
- `DataCollection.md` — Reference school data (Don Bosco) for seeding
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

## Deployment (Development)

- **CloudFront URL**: `https://dhx488d27udyg.cloudfront.net`
- **CloudFront Distribution ID**: `EHYD0FQL3TM93`
- **Cognito User Pool**: `ap-south-1_mWBuXlrB7`
- **Cognito Client ID**: `24fdegijgjj58bo24c1mujs20l`
- **Database**: `timetable_dev` (same RDS instance as prod)
- **Frontend S3 Bucket**: `timetable-dev-frontend`
- **DynamoDB Table**: `timetable-dev-ws-connections`
- **Lambda Role**: `timetable-dev-lambda-role`
- **Terraform State**: `s3://zyphr-timetable-terraform-state` key: `dev/terraform.tfstate`
- **Terraform Config**: `infra/terraform-dev/` (references prod state for shared VPC/RDS)
- **WebSocket URL**: `wss://rgqbuabhu1.execute-api.ap-south-1.amazonaws.com/dev`

### Branch Strategy

- `production` branch → deploys to `--stage prod` (production)
- `develop` branch → deploys to `--stage dev` (development)
- Feature branches → merge into `develop` → test on dev → merge into `production` for release

### Quick Deploy Commands

```bash
# Deploy all services to dev
npm run deploy:all:dev

# Deploy frontend to dev
npm run deploy:frontend:dev

# Health check dev
npm run health:check:dev
```

## Important Notes

- Do NOT add a `period_structure_classes` table — it was removed. Use `divisions.period_structure_id` instead.
- Timetable status is computed, not imperative. Do NOT add a `status` enum column — use `status_json` JSONB with `recomputeTimetableStatus()`. Do NOT use `flagTimetables()` — it has been removed.
- The `Documentaion/` directory name has a typo. Do not rename it — existing references depend on this path.
- Frontend uses `sonner` for toasts, `@dnd-kit` for drag-and-drop, `shadcn/ui` primitives.
- The FAB and setup wizard have been removed (Enhancement 3). Timetable status is now shown via computed status badges throughout the UI. The notification bell and notifications page have also been removed — status information is derived from `status_json`.
- Vite proxy uses `rewrite` to strip `/api` prefix before forwarding to localhost services.
- Local dev uses `--stage local` (not `dev`). The `dev` stage is now a real AWS deployment. All service `package.json` scripts use `serverless offline start --stage local`.
- Frontend has three env modes: `.env` (local mock auth), `.env.staging` (dev AWS Cognito), `.env.production` (prod AWS Cognito). Build with `npx vite build --mode staging` for dev.
- Cross-div elective divisions may have **different subject subsets** (asymmetric). For subjects shared across divisions, teacher sets must be identical. The output writer writes timetable_slots using only each division's own assignments.
- `parallel_sections` in `elective_group_subjects` determines parallel vs split mode. Ensure this matches the actual number of simultaneous classes intended.

## Recently Fixed Bugs

**API `/api` prefix double-slash issue** (FIXED April 8, 2026): Removed leading `/` from all RTK Query endpoint URLs in all 10 API slices. URLs now use `'academic-years'` instead of `'/academic-years'` so `fetchBaseQuery` joins correctly with `baseUrl: '/api'`.

**Split-mode elective teacher double-bookings** (FIXED April 20, 2026): Engine now marks ALL elective teachers busy during placement (not just `parallel_sections` picked teachers). Prevents regular assignments from landing on elective slots that the output writer later assigns to split-mode teachers.

**Missing `end_time` in `_place_cross_div`** (FIXED April 20, 2026): Added `end_time=slot.end_time` parameter to `pick_available_teachers` call in `_place_cross_div`. Without it, time-range overlap detection was degraded.

**DB duplicate elective assignments** (FIXED April 20, 2026): XII Bio/CS (XII B) and XI Maths/IP/Psy (XI B, XI C) had duplicate teacher entries instead of correct teacher pairs. Fixed data and added rule 4 in Engine_Algorithm.md Critical Rules.

**XII Maths/IP/Psy parallel_sections** (FIXED April 20, 2026): Mathematics `parallel_sections` was 1 (split mode) but should be 2 (parallel mode — both Amrutha and Julie teach simultaneously).

## Auth Architecture (Production)

- **Frontend**: Uses `amazon-cognito-identity-js` SDK for signup/signin/session
- **Cognito flow**: Register → email verification code → confirm → signin → get idToken
- **Backend auth**: `authMiddleware` is **async** — extracts `email` from JWT claims, looks up school by `adminEmail` in DB
- **Session persistence**: Cognito SDK stores tokens in localStorage; app stores school data in `app-session` localStorage key
- **All controllers** use `await authMiddleware(event)` (async)
- **Auth service** (`/api/auth/*`) does NOT have Cognito authorizer — uses custom auth
- **All other services** have Cognito JWT authorizers on API Gateway

## Lambda Layer

- Prod layer name: `timetable-prod-shared-deps`, Dev: `timetable-dev-shared-deps`
- Published via S3 upload (too large for direct upload): `s3://zyphr-timetable-terraform-state/layers/{stage}/shared-layer.zip`
- Contains: `@timetable/shared` compiled code + Prisma client + Linux engine binary + AWS SDK deps (@aws-sdk/client-lambda, client-dynamodb, lib-dynamodb, client-ses, @smithy/*)
- Must include only the Linux engine (remove Windows DLL, WASM engines to stay under 250MB unzipped limit)
- Build script: `scripts/build-layer.sh` — uses PowerShell `Compress-Archive` fallback on Windows (no `zip` command)

## CloudFront API Routing

API behaviors are **NOT managed by Terraform** — they were added manually via AWS CLI/Console. Running `terraform apply` on the CloudFront module will **remove** these behaviors (Terraform treats them as drift). If that happens, re-add them using the Node.js script approach from the dev environment setup.

**Production** (CloudFront `EUWIXJK2BNYEF`):
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

**Development** (CloudFront `EHYD0FQL3TM93`):
```
/api/auth*              → API GW (vxr50r3xyb)
/api/academic-years*    → API GW (3k8m24snx2)
/api/config*            → API GW (kbyufnofyb)
/api/subjects*          → API GW (ldf7qfc8e9)
/api/teachers*          → API GW (nqlsm39mia)
/api/classes*           → API GW (jfjsrl74lj)
/api/assignments*       → API GW (bdkc3cak4c)
/api/divisions*         → API GW (bdkc3cak4c)
/api/elective-groups*   → API GW (bdkc3cak4c)
/api/timetables*        → API GW (e138tmyci8)
/api/dashboard*         → API GW (z7m27shfq5)
/api/export*            → API GW (jovoris00a)
/api/ws*                → API GW (x1qfc9co14)
Default (*)             → S3 (timetable-dev-frontend)
```

## Multi-Environment Notes

- **Serverless stages**: `prod` for production, `dev` for development, `local` for local offline dev. The `serverless-prod-config` plugin skips VPC/IAM/Layer only when `stage === 'local'`.
- **RDS access from Lambda**: The Lambda security group (`sg-023ec7ce6f103470a`) has a **self-referencing inbound rule** on port 5432. This allows Lambdas in that SG to reach the RDS instance (also in that SG). Do NOT remove this rule.
- **RDS is in a private subnet** with NAT gateway only — cannot be reached from the internet even when marked "publicly accessible". To run ad-hoc SQL, use a Lambda function inside the VPC (with the `pg` npm package bundled, not Prisma).
- **Creating a new database on RDS**: Use a temporary Lambda with bundled `pg` package (not the shared layer — Prisma from the layer has engine path issues for ad-hoc scripts). See Phase 3 of `Documentaion/enhancements/dev-environment-setup.md`.
- **Git Bash on Windows (MSYS)**: Paths starting with `/` get converted to `C:/Program Files/Git/...`. Use `export MSYS_NO_PATHCONV=1` in bash scripts that pass paths to AWS CLI (SSM parameter names, S3 keys, etc.). Already set in `scripts/deploy.sh`.
- **Lambda layer upload**: Layer zip (~60MB) is too large for direct `PublishLayerVersion` upload. Must upload to S3 first, then use `--content S3Bucket=...,S3Key=...`. Already handled in `scripts/deploy.sh`.
- **Terraform and CloudFront**: Do NOT run `terraform apply` on the CloudFront module without checking the plan — it will remove manually-added API Gateway behaviors. If needed, re-add them via AWS CLI `update-distribution` with a JSON config.
