# School Timetable Management System
## Backend Implementation Plan

**Version**: 1.0  
**Date**: March 13, 2026  
**Scope**: Backend only (frontend plan will be a separate document)  
**Strategy**: Service-by-service implementation following the dependency chain

---

## Table of Contents

1. [Implementation Principles](#1-implementation-principles)
2. [Phase 0 — Local Development Environment](#2-phase-0--local-development-environment)
3. [Phase 1 — Monorepo Scaffolding](#3-phase-1--monorepo-scaffolding)
4. [Phase 2 — Shared Package (`@timetable/shared`)](#4-phase-2--shared-package-timetableshared)
5. [Phase 3 — Database Schema & Seed Data](#5-phase-3--database-schema--seed-data)
6. [Phase 4 — Auth Service (Mock)](#6-phase-4--auth-service-mock)
7. [Phase 5 — Academic Year Service](#7-phase-5--academic-year-service)
8. [Phase 6 — School Config Service (Slot Service)](#8-phase-6--school-config-service-slot-service)
9. [Phase 7 — Subject Service](#9-phase-7--subject-service)
10. [Phase 8 — Teacher Service](#10-phase-8--teacher-service)
11. [Phase 9 — Class Service](#11-phase-9--class-service)
12. [Phase 10 — Assignment Service (Division Assignment)](#12-phase-10--assignment-service-division-assignment)
13. [Phase 11 — Timetable Service](#13-phase-11--timetable-service)
14. [Phase 12 — Dashboard Service](#14-phase-12--dashboard-service)
15. [Phase 13 — Export Service](#15-phase-13--export-service)
16. [Phase 14 — WebSocket Service](#16-phase-14--websocket-service)
17. [Phase 15 — Timetable Generation Engine (Python / Fargate)](#17-phase-15--timetable-generation-engine-python--fargate)
18. [Phase 16 — Infrastructure & Deployment (Terraform + Serverless)](#18-phase-16--infrastructure--deployment-terraform--serverless)
19. [Postman Collection Strategy](#19-postman-collection-strategy)
20. [Service Dependency Map](#20-service-dependency-map)

---

## 1. Implementation Principles

| Principle | Detail |
|-----------|--------|
| **One service at a time** | Complete each service fully (code + Postman tests) before starting the next. |
| **Dependency order** | Services are ordered so that every service only depends on services already built. |
| **Shared package first** | `@timetable/shared` (Prisma, Zod, middleware, helpers) is built before any service. |
| **Single Prisma schema** | All 19 tables are defined upfront in `packages/shared/prisma/schema.prisma`. One migration creates everything. |
| **Mock auth for local dev** | A dev-only middleware injects a hardcoded `school_id` and `user_id` into the request context, bypassing Cognito entirely. Real Cognito is wired during the infrastructure phase. |
| **Postman as living doc** | A single Postman collection (with folders per service) is updated incrementally as each service is built. Environment variables (`{{baseUrl}}`, `{{token}}`, etc.) keep it portable. |
| **serverless-offline** | Each service runs locally via `serverless-offline` for rapid iteration. |
| **No automated tests** | Per SRS — no unit/integration tests. Validation is manual via Postman. |
| **Infra last** | All Terraform and Serverless deployment configs are written after all services are complete and tested locally. |

---

## 2. Phase 0 — Local Development Environment

### 2.1 Prerequisites

Install the following on the development machine:

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22.x LTS | Lambda runtime |
| npm | 10.x+ (ships with Node 22) | Package manager + workspaces |
| Python | 3.12+ | Timetable generation engine |
| Docker Desktop | Latest | Local PostgreSQL + DynamoDB Local |
| Git | Latest | Version control |
| AWS CLI | v2 | Deployment (later phases) |
| Serverless Framework | v4 | Lambda deployment + offline emulation |
| VS Code | Latest | IDE |
| Postman | Latest | API testing |
| Prisma CLI | (installed via npm) | Schema management, migrations, studio |

### 2.2 Docker Compose — Local Database

Create `docker-compose.yml` at the monorepo root to provide PostgreSQL and DynamoDB Local:

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: timetable-db
    environment:
      POSTGRES_USER: timetable_admin
      POSTGRES_PASSWORD: localdev123
      POSTGRES_DB: timetable_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  dynamodb-local:
    image: amazon/dynamodb-local:latest
    container_name: timetable-dynamodb
    ports:
      - "8000:8000"
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /home/dynamodblocal/data/"
    volumes:
      - dynamodata:/home/dynamodblocal/data

volumes:
  pgdata:
  dynamodata:
```

**Local DATABASE_URL**: `postgresql://timetable_admin:localdev123@localhost:5432/timetable_dev`

### 2.3 VS Code Extensions (Recommended)

| Extension | Purpose |
|-----------|---------|
| Prisma | Syntax highlighting for `.prisma` files |
| ESLint | Linting |
| Prettier | Formatting |
| Thunder Client / REST Client | Quick API testing in-editor |
| Docker | Container management |

### 2.4 Startup Checklist

- [ ] Node.js 22 installed and `node -v` confirms
- [ ] Python 3.12 installed and `python --version` confirms
- [ ] Docker Desktop running
- [ ] `docker compose up -d` starts PostgreSQL on port 5432
- [ ] `psql` or Prisma Studio can connect to the database
- [ ] Serverless Framework v4 installed globally (`npm i -g serverless`)
- [ ] Git repository cloned and ready

---

## 3. Phase 1 — Monorepo Scaffolding

### 3.1 Goal

Set up the monorepo directory structure with npm workspaces so that all services can share code from `@timetable/shared`.

### 3.2 Tasks

1. **Initialize root `package.json`** with npm workspaces:
   ```json
   {
     "name": "school-timetable-management",
     "private": true,
     "workspaces": [
       "apps/*",
       "packages/*",
       "services/*"
     ]
   }
   ```

2. **Create the full directory skeleton**:
   ```
   school-timetable-management/
   ├── apps/
   │   └── frontend/              (empty — to be built in frontend phase)
   ├── packages/
   │   └── shared/                (@timetable/shared)
   ├── services/
   │   ├── academic-year/
   │   ├── school-config/
   │   ├── subject/
   │   ├── teacher/
   │   ├── class/
   │   ├── division-assignment/
   │   ├── timetable/
   │   ├── dashboard/
   │   ├── export/
   │   ├── websocket/
   │   └── auth/
   ├── engine/
   │   └── timetable-generator/
   ├── layers/
   │   └── shared/
   ├── infra/
   │   └── terraform/
   ├── scripts/
   ├── docker-compose.yml
   ├── tsconfig.base.json
   ├── .eslintrc.js
   ├── .prettierrc
   ├── .gitignore
   └── README.md
   ```

3. **Create `tsconfig.base.json`** — shared TypeScript compiler options for all backend packages:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "commonjs",
       "lib": ["ES2022"],
       "outDir": "dist",
       "rootDir": "src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true
     }
   }
   ```

4. **Create `.gitignore`**:
   ```
   node_modules/
   dist/
   .serverless/
   .env
   *.js.map
   layers/shared/nodejs/
   infra/terraform/.terraform/
   infra/terraform/*.tfstate*
   infra/terraform/terraform.tfvars
   __pycache__/
   *.pyc
   .venv/
   ```

5. **Create `.eslintrc.js`** and **`.prettierrc`** with standard configurations.

6. **Create skeleton `package.json`** for each service directory (minimal — just name and `@timetable/shared` dependency).

7. **Run `npm install`** from the root to link all workspaces.

### 3.3 Verification

- `npm ls --workspaces` shows all packages/services correctly linked.
- No errors on `npm install`.

---

## 4. Phase 2 — Shared Package (`@timetable/shared`)

### 4.1 Goal

Build the shared package that all Lambda services will import: Prisma client, Zod validation schemas, middleware pipeline, response helpers, and custom error classes.

### 4.2 Tasks

1. **Initialize `packages/shared/package.json`**:
   ```json
   {
     "name": "@timetable/shared",
     "version": "1.0.0",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "scripts": {
       "build": "tsc",
       "prisma:generate": "prisma generate",
       "prisma:migrate": "prisma migrate dev",
       "prisma:studio": "prisma studio"
     },
     "dependencies": {
       "@prisma/client": "^6.x",
       "zod": "^3.x",
       "jsonwebtoken": "^9.x",
       "@aws-sdk/client-lambda": "^3.x"
     },
     "devDependencies": {
       "prisma": "^6.x",
       "typescript": "^5.x",
       "@types/jsonwebtoken": "^9.x",
       "@types/aws-lambda": "^8.x"
     }
   }
   ```

2. **Create `packages/shared/tsconfig.json`** extending the base config.

3. **Implement the error classes** (`src/errors/`):
   - `AppError.ts` — base error with `statusCode`, `code`, `message`
   - `NotFoundError.ts` — 404
   - `ConflictError.ts` — 409
   - `ValidationError.ts` — 400
   - `ForbiddenError.ts` — 403

4. **Implement the helper modules** (`src/helpers/`):
   - `response.ts` — `success(data, statusCode)`, `created(data)`, `noContent()`, `error(err)`
   - `pagination.ts` — `parsePagination(event)` extracting `page`, `limit`, `search` from query string
   - `validate.ts` — `parseBody<T>(event, zodSchema)` parses and validates request body
   - `lambdaInvoke.ts` — wrapper for synchronous Lambda-to-Lambda `InvokeCommand`

5. **Implement the middleware pipeline** (`src/middleware/`):
   - `authMiddleware.ts` — extract `school_id` + `user_id` from JWT claims in `event.requestContext.authorizer`
   - `academicYearMiddleware.ts` — read `X-Academic-Year-Id` header or fall back to active year from DB
   - `requestLogger.ts` — log method, path, schoolId in structured JSON
   - `errorHandler.ts` — catch `AppError` subclasses, map to HTTP responses

6. **Implement the database layer** (`src/db/`):
   - `client.ts` — Prisma Client singleton (reuse across Lambda invocations)
   - `tenantScope.ts` — Prisma extension that auto-injects `school_id` and `deleted_at IS NULL` filters on every query

7. **Implement Zod schemas and enums** (`src/models/`):
   - `enums.ts` — `SlotType`, `JobStatus`, `TimetableStatus`, `ConflictType`
   - `schemas/` — one file per entity: `academicYear.ts`, `teacher.ts`, `subject.ts`, `division.ts`, `class.ts`, `assignment.ts`, `timetable.ts`, `slot.ts`, `notification.ts`, `periodStructure.ts`, `electiveGroup.ts`, `workingDays.ts`
   - `types.ts` — TypeScript types inferred from Zod schemas + Prisma types

8. **Create barrel export** (`src/index.ts`) — re-exports everything.

9. **Build and verify**: `npm run build` in `packages/shared` produces `dist/` without errors.

### 4.3 Verification

- `tsc --noEmit` passes with zero errors.
- Importing `@timetable/shared` from a service directory resolves correctly via npm workspace link.

---

## 5. Phase 3 — Database Schema & Seed Data

### 5.1 Goal

Define all 19 PostgreSQL tables in a single Prisma schema, run the initial migration, and populate the database with sample data from DataCollection.md.

### 5.2 Tasks

1. **Write `packages/shared/prisma/schema.prisma`** with all 19 tables:
   - `schools`
   - `academic_years`
   - `classes`
   - `divisions`
   - `subjects`
   - `teachers`
   - `teacher_subjects`
   - `teacher_availability`
   - `period_structures`
   - `period_structure_classes`
   - `working_days`
   - `slots`
   - `elective_groups`
   - `elective_group_subjects`
   - `division_assignments`
   - `timetables`
   - `timetable_slots`
   - `generation_jobs`
   - `timetable_notifications`

   Include all indexes, unique constraints, foreign keys, soft-delete columns (`deleted_at`), and `school_id` on every table as specified in SRS Section 6.

2. **Generate Prisma Client**: `npx prisma generate`.

3. **Run initial migration** against the local Docker PostgreSQL:
   `npx prisma migrate dev --name init`.

4. **Verify schema** via Prisma Studio: `npx prisma studio` — confirm all 19 tables exist with correct columns.

5. **Create seed script** (`packages/shared/prisma/seed.ts` or `scripts/seed-data.ts`):
   - Insert a sample school
   - Insert an academic year (`2026-27`, May 2026 – March 2027)
   - Insert the bell schedule from DataCollection.md (9 periods + breaks)
   - Insert all classes I–XII with their divisions
   - Insert all 35+ subjects from DataCollection.md
   - Insert all 57 teachers with their subject mappings from DataCollection.md
   - Insert sample division assignments for a few divisions (Class I-A, X-A, etc.) to enable testing of downstream services

6. **Run seed**: `npx prisma db seed` — verify data appears in Prisma Studio.

### 5.3 Verification

- All 19 tables created in PostgreSQL.
- Seed data queryable via Prisma Studio.
- `@prisma/client` import works from service code.

---

## 6. Phase 4 — Auth Service (Mock)

### 6.1 Goal

Create a mock auth layer for local development that bypasses AWS Cognito. This allows all subsequent services to be developed and tested without any AWS infrastructure.

### 6.2 Tasks

1. **Create a dev-only auth middleware** (in `@timetable/shared` or as a local override):
   - Reads `Authorization` header. If absent or invalid, injects a hardcoded context:
     ```typescript
     // Mock context for local development
     {
       schoolId: "<seeded school UUID>",
       userId: "<seeded user UUID>",
       email: "admin@testschool.com"
     }
     ```
   - This mimics the claims that would come from Cognito JWT in production.

2. **Scaffold the Auth Service** (`services/auth/`):
   - Standard 4-file structure: `handler.ts`, `router.ts`, `controller.ts`, `service.ts`
   - `serverless.yml` with `serverless-offline` plugin
   - Routes:
     | Method | Path | Description |
     |--------|------|-------------|
     | POST | `/auth/register` | Create a school + user record in RDS (mock — no Cognito) |
     | POST | `/auth/login` | Return a mock JWT token (hardcoded or simple sign) |
     | GET | `/auth/me` | Return the current user's profile from RDS |
     | GET | `/auth/health` | Health check |

3. **Implement mock registration**: Insert a `schools` row + `users` row in RDS. Return a mock token.

4. **Implement mock login**: Look up user by email, return a mock JWT containing `school_id` and `user_id`.

5. **Configure `serverless-offline`** for the auth service and verify it runs on a local port.

6. **Update Postman collection**: Add `Auth` folder with Register, Login, Me, Health requests.

### 6.3 Verification

- `POST /auth/register` creates a school and returns a token.
- `POST /auth/login` returns a token.
- Token can be used in `Authorization: Bearer` header for subsequent service calls.
- `GET /auth/me` returns user details.

---

## 7. Phase 5 — Academic Year Service

### 7.1 Goal

Implement CRUD for academic years. This is the most fundamental entity — almost all other entities are scoped to an academic year.

### 7.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/academic-years` | Create academic year |
| GET | `/academic-years` | List all academic years (paginated) |
| GET | `/academic-years/:id` | Get a single academic year |
| PUT | `/academic-years/:id` | Update academic year |
| DELETE | `/academic-years/:id` | Soft-delete academic year |
| PATCH | `/academic-years/:id/activate` | Set as the active academic year |

### 7.3 Tasks

1. **Scaffold service** (`services/academic-year/`): `handler.ts`, `router.ts`, `controller.ts`, `service.ts`, `serverless.yml`, `tsconfig.json`, `package.json`.
2. **Implement all 6 routes** using the shared Prisma client with tenant scoping.
3. **Business logic**:
   - Only one academic year can be active at a time per school. Activating one deactivates others.
   - Date range validation: `start_date < end_date`.
   - Soft-delete: set `deleted_at`, don't physically remove.
4. **Configure `serverless-offline`** for local testing.
5. **Update Postman collection**: Add `Academic Year` folder with all 6 requests + example bodies.

### 7.4 Verification

- All CRUD operations work via Postman.
- Only one active academic year at a time.
- Soft-delete hides the record from list/get but row persists in DB.

---

## 8. Phase 6 — School Config Service (Slot Service)

### 8.1 Goal

Implement the School Config Service, responsible for period structures (bell schedules), working days, and slot generation.

### 8.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/config/period-structures` | Create period structure |
| GET | `/config/period-structures` | List period structures |
| GET | `/config/period-structures/:id` | Get period structure with slots |
| PUT | `/config/period-structures/:id` | Update period structure |
| DELETE | `/config/period-structures/:id` | Soft-delete period structure |
| POST | `/config/period-structures/:id/assign` | Assign period structure to classes |
| PUT | `/config/working-days` | Set working days for the academic year |
| GET | `/config/working-days` | Get working days |
| POST | `/config/slots/generate` | Generate slots matrix (days × periods) |
| GET | `/config/slots` | Get all generated slots |

### 8.3 Tasks

1. **Scaffold service** (`services/school-config/`).
2. **Implement period structure CRUD** — a period structure is a named set of periods/breaks with timings. Classes can be assigned to different structures (e.g., Class I–IX: 8 periods, Class X–XII: 9 periods).
3. **Implement working days management** — which days of the week are school days (e.g., Mon–Sat).
4. **Implement slot generation** — cross-product of working days × periods → creates `slots` rows. This is a key building block for timetable generation.
5. **Business logic**:
   - A class can only be assigned to one period structure per academic year.
   - Slot generation is idempotent — regenerating deletes old slots and creates new ones.
   - Breaks are included in the period structure but are not assignable slots.
6. **Update Postman collection**: Add `School Config` folder.

### 8.4 Verification

- Period structures created with correct period/break configuration.
- Classes assigned to period structures.
- Working days set.
- Slots generated and queryable.

---

## 9. Phase 7 — Subject Service

### 9.1 Goal

Implement CRUD for subjects.

### 9.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/subjects` | Create subject |
| GET | `/subjects` | List subjects (paginated, searchable) |
| GET | `/subjects/:id` | Get a single subject |
| PUT | `/subjects/:id` | Update subject |
| DELETE | `/subjects/:id` | Soft-delete subject |

### 9.3 Tasks

1. **Scaffold service** (`services/subject/`).
2. **Implement all 5 routes**.
3. **Business logic**:
   - Subject name is unique per school (case-insensitive).
   - Search filter on name.
   - Cannot delete a subject that is referenced by active assignments.
4. **Update Postman collection**: Add `Subject` folder.

### 9.4 Verification

- CRUD works. Duplicate names rejected. Soft-delete works.

---

## 10. Phase 8 — Teacher Service

### 10.1 Goal

Implement CRUD for teachers, including teacher-subject mappings and teacher availability.

### 10.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/teachers` | Create teacher |
| GET | `/teachers` | List teachers (paginated, searchable) |
| GET | `/teachers/:id` | Get teacher with subjects and availability |
| PUT | `/teachers/:id` | Update teacher |
| DELETE | `/teachers/:id` | Soft-delete teacher |
| PUT | `/teachers/:id/subjects` | Set teacher's subject mappings |
| PUT | `/teachers/:id/availability` | Set teacher's unavailability (slots where they can't teach) |

### 10.3 Tasks

1. **Scaffold service** (`services/teacher/`).
2. **Implement all 7 routes**.
3. **Business logic**:
   - Teacher name + email unique per school.
   - Subject mappings: replace entire list on PUT (array of subject IDs).
   - Availability: array of `{ slotId, isAvailable: false }` entries. The timetable engine reads these as hard constraints.
   - GET detail returns teacher with nested subjects and availability.
4. **Update Postman collection**: Add `Teacher` folder.

### 10.4 Verification

- Teachers created with subject mappings.
- Availability set for specific slots.
- Cannot delete teachers with active assignments.

---

## 11. Phase 9 — Class Service

### 11.1 Goal

Implement CRUD for classes and divisions. Classes have a 1-to-many relationship with divisions.

### 11.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/classes` | Create class |
| GET | `/classes` | List classes with divisions |
| GET | `/classes/:id` | Get class detail with divisions |
| PUT | `/classes/:id` | Update class |
| DELETE | `/classes/:id` | Soft-delete class |
| POST | `/classes/:id/divisions` | Add division to class |
| PUT | `/classes/:classId/divisions/:divisionId` | Update division |
| DELETE | `/classes/:classId/divisions/:divisionId` | Soft-delete division |

### 11.3 Tasks

1. **Scaffold service** (`services/class/`).
2. **Implement all 8 routes**.
3. **Business logic**:
   - Class numeric level (1–12) is unique per school.
   - Division name is unique within a class (e.g., only one "A" in Class X).
   - Listing returns classes ordered by numeric level, each with nested divisions.
   - Classes XI–XII may have a `stream` field (Science, Commerce, Humanities).
   - Cannot delete a class/division that has active assignments or timetable data.
4. **Update Postman collection**: Add `Class` folder.

### 11.4 Verification

- Classes I–XII created with divisions A, B, C, etc.
- Stream field works for XI–XII.
- Nested response structure correct.

---

## 12. Phase 10 — Assignment Service (Division Assignment)

### 12.1 Goal

Implement division assignments — the core link between divisions, subjects, and teachers. Also implement elective group management.

### 12.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/divisions/:divisionId/assignments` | List all assignments for a division |
| POST | `/divisions/:divisionId/assignments` | Create a regular assignment |
| PUT | `/assignments/:id` | Update assignment (change teacher, periods_per_week, etc.) |
| DELETE | `/assignments/:id` | Delete assignment |
| POST | `/elective-groups` | Create elective group |
| GET | `/elective-groups` | List elective groups |
| GET | `/elective-groups/:id` | Get elective group with subjects |
| PUT | `/elective-groups/:id` | Update elective group |
| DELETE | `/elective-groups/:id` | Delete elective group |
| POST | `/elective-groups/:id/subjects` | Add subject to elective group |
| DELETE | `/elective-groups/:groupId/subjects/:subjectId` | Remove subject from elective group |
| POST | `/divisions/:divisionId/assignments/elective` | Create an elective assignment (link division to elective group) |

### 12.3 Tasks

1. **Scaffold service** (`services/division-assignment/`).
2. **Implement all 12 routes**.
3. **Business logic**:
   - A regular assignment links: division + subject + teacher + `periods_per_week`.
   - Validation: teacher must teach the subject (check `teacher_subjects`). Uses **Lambda invoke** to Teacher Service if needed, or direct DB query.
   - Elective groups: a group of mutually exclusive subjects scheduled in the same slot. All subjects in the group get the same `periods_per_week`.
   - Elective assignment: links a division to an elective group, overriding individual subject assignments for those subjects.
   - Duplicate prevention: cannot assign the same subject twice to the same division (unless one is an elective replacement).
   - `periods_per_week` must be a positive integer.
4. **Update Postman collection**: Add `Assignment` and `Elective Group` folders.

### 12.4 Verification

- Regular assignments created linking division → subject → teacher.
- Elective groups created with multiple subjects.
- Elective assignments link divisions to elective groups.
- Validation errors returned for invalid teacher-subject combos.

---

## 13. Phase 11 — Timetable Service

### 13.1 Goal

Implement timetable management — triggering generation, viewing/editing generated timetables, publishing, and manual slot overrides.

### 13.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/timetables/generate` | Trigger timetable generation (launches Fargate task) |
| GET | `/timetables/generate/status/:jobId` | Get generation job status |
| GET | `/timetables/divisions/:divisionId` | Get timetable grid for a division |
| PUT | `/timetables/slots/:slotId` | Manual override — reassign a single slot |
| POST | `/timetables/:id/publish` | Publish a draft timetable |
| GET | `/timetables/:id/conflicts` | Get conflicts for a timetable |
| GET | `/timetables/teacher/:teacherId` | Get teacher's timetable view |

### 13.3 Tasks

1. **Scaffold service** (`services/timetable/`).
2. **Implement all 7 routes**.
3. **Business logic**:
   - `POST /timetables/generate`: Create a `generation_jobs` record with status `PENDING`, then invoke Fargate task (in local dev, this will be mocked/stubbed — the actual Fargate integration happens in Phase 15).
   - `GET status`: Poll the `generation_jobs` table for status updates.
   - `GET division timetable`: Join `timetable_slots` → `assignments` → `subjects` → `teachers` → `slots` to build the full grid.
   - `PUT slot override`: Validate no hard-constraint violations (teacher double-booking, etc.) before allowing the override.
   - `POST publish`: Change timetable status from `DRAFT` to `PUBLISHED`.
   - Conflict detection: Check all hard constraints (H1–H6) and soft constraints (S1–S4) on the current timetable state.
4. **Mock the Fargate trigger** for local dev: Instead of launching ECS RunTask, create generation_jobs row with COMPLETED status and dummy timetable data, or use a local Python script.
5. **Update Postman collection**: Add `Timetable` folder.

### 13.4 Verification

- Generation job created and status trackable.
- Division timetable grid returns correctly structured data.
- Manual slot override works with conflict validation.
- Publish changes timetable status.

---

## 14. Phase 12 — Dashboard Service

### 14.1 Goal

Implement the dashboard aggregation service that provides summary statistics for the admin's home screen.

### 14.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/stats` | Get aggregate statistics |
| GET | `/dashboard/recent-activity` | Get recent activity log |

### 14.3 Tasks

1. **Scaffold service** (`services/dashboard/`).
2. **Implement both routes**.
3. **Business logic**:
   - `GET /dashboard/stats`: Run aggregate queries to return:
     - Total classes, divisions, teachers, subjects
     - Active academic year info
     - Timetable generation status (how many divisions have published timetables)
     - Unresolved conflict count
   - `GET /dashboard/recent-activity`: Query recent `timetable_notifications` or audit log entries.
   - All queries are read-only. Uses direct Prisma queries (no inter-service Lambda calls for performance).
4. **Update Postman collection**: Add `Dashboard` folder.

### 14.4 Verification

- Stats endpoint returns correct aggregates matching seeded data.
- Recent activity returns meaningful entries.

---

## 15. Phase 13 — Export Service

### 15.1 Goal

Implement PDF and Excel export generation for division and teacher timetables.

### 15.2 Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/export/division/pdf` | Export division timetable as PDF |
| POST | `/export/division/excel` | Export division timetable as Excel |
| POST | `/export/teacher/pdf` | Export teacher timetable as PDF |
| POST | `/export/teacher/excel` | Export teacher timetable as Excel |

### 15.3 Tasks

1. **Scaffold service** (`services/export/`).
2. **Install additional dependencies**: `puppeteer-core`, `@sparticuz/chromium`, `exceljs`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
3. **Implement PDF generation pipeline**:
   - Query timetable data from RDS.
   - Render HTML template with inline CSS (timetable grid layout).
   - Launch headless Chromium via `@sparticuz/chromium`.
   - Generate PDF (A3 landscape).
   - Upload to S3 (local dev: use MinIO or local folder).
   - Return pre-signed URL (local dev: return local file path or mock URL).
4. **Implement Excel generation pipeline**:
   - Same data query.
   - Build ExcelJS workbook with styled headers, merged break cells, alternating row colors.
   - Upload to S3 / return URL.
5. **Local dev S3 alternative**: For local development, either:
   - Write files to a local `exports/` directory and return the file path.
   - Use MinIO (S3-compatible) in Docker Compose.
6. **Update Postman collection**: Add `Export` folder.

### 15.4 Verification

- PDF generated with correct timetable grid, readable in a PDF viewer.
- Excel generated with correct data and styling.
- Pre-signed URLs (or local paths) work for download.

---

## 16. Phase 14 — WebSocket Service

### 16.1 Goal

Implement the WebSocket handler for real-time push notifications (timetable generation progress, live updates).

### 16.2 Routes

| Event | Handler | Description |
|-------|---------|-------------|
| `$connect` | `onConnect` | Validate token, store connection in DynamoDB |
| `$disconnect` | `onDisconnect` | Remove connection from DynamoDB |
| `$default` | `onMessage` | Handle incoming messages (ping/pong) |

### 16.3 Tasks

1. **Scaffold service** (`services/websocket/`).
2. **Implement DynamoDB connection management**:
   - `$connect`: Extract `school_id` from token (mock auth in local dev), write `{ connectionId, schoolId, userId, ttl }` to DynamoDB.
   - `$disconnect`: Delete the DynamoDB record.
3. **Implement `broadcastToSchool(schoolId, message)`** utility:
   - Query DynamoDB for all connections matching `schoolId`.
   - Send message to each via API Gateway Management API (`PostToConnection`).
   - Handle stale connections (410 Gone → delete from DynamoDB).
4. **Configure `serverless-offline` with WebSocket support** (or use `serverless-offline-websocket` plugin).
5. **Update Postman collection**: WebSocket testing is done via Postman's WebSocket feature or via a simple test client script.

### 16.4 Verification

- WebSocket connects and stores connection in DynamoDB Local.
- Disconnect cleans up the record.
- Broadcast sends message to all connected clients for a school.

---

## 17. Phase 15 — Timetable Generation Engine (Python / Fargate)

### 17.1 Goal

Implement the genetic algorithm engine that generates optimal timetables. This is an independent Python project that runs as a Fargate task.

### 17.2 Tasks

1. **Set up Python project** (`engine/timetable-generator/`):
   - `requirements.txt`: `psycopg2-binary`, `pygad` (or custom GA), `boto3`, `numpy`
   - `Dockerfile` for Fargate deployment
   - Virtual environment for local development

2. **Implement data loader** (`data_loader.py`):
   - Connect to RDS and read: divisions, subjects, teachers, assignments, slots, teacher_availability, elective_groups, working_days.
   - Build the constraint matrices.

3. **Implement chromosome encoding** (`ga/chromosome.py`):
   - Each gene = one `(division, slot)` pair → assigned subject+teacher.
   - Flatten all divisions × slots into a single chromosome.

4. **Implement fitness function** (`ga/fitness.py`):
   - Hard constraints (H1–H6): teacher no double-booking, correct periods_per_week, teacher availability, no breaks assigned, elective group parallel alignment, teacher-subject match.
   - Soft constraints (S1–S4): subject spread across days, weightage-based period preference, avoid consecutive same-subject, teacher workload balance.
   - Hard violations → heavy penalty. Soft violations → weighted penalty.

5. **Implement GA operators** (`ga/operators.py`):
   - Selection: tournament selection.
   - Crossover: uniform crossover respecting division boundaries.
   - Mutation: random slot swap within a division.

6. **Implement elective handler** (`ga/elective_handler.py`):
   - Ensure elective group subjects are always scheduled in the same slot across divisions.

7. **Implement main GA loop** (`ga/engine.py`):
   - Population initialization, evolution loop, convergence criteria.
   - Push progress updates via WebSocket (query DynamoDB for connections, use `PostToConnection`).

8. **Implement output writer** (`output_writer.py`):
   - Write the best chromosome as `timetable_slots` rows to RDS.
   - Update `generation_jobs` status to `COMPLETED` or `FAILED`.

9. **Implement WebSocket notifier** (`ws_pusher.py`):
   - Push final status to connected clients.

10. **Local testing**: Run `python src/main.py` directly with local PostgreSQL. No Fargate needed locally.

### 17.3 Verification

- Engine reads from local DB, generates a valid timetable, writes back to DB.
- No hard constraint violations in the output.
- Soft constraints optimized (fitness score improves over generations).
- Completion status written to `generation_jobs`.

---

## 18. Phase 16 — Infrastructure & Deployment (Terraform + Serverless)

### 18.1 Goal

After all services are implemented and tested locally, provision the AWS infrastructure and deploy everything.

### 18.2 Tasks

1. **Terraform modules** (`infra/terraform/modules/`):
   - `vpc/` — VPC, 6 subnets (2 public, 2 private, 2 DB), NAT Gateway, Internet Gateway, route tables, 3 security groups
   - `rds/` — PostgreSQL 16 (db.t4g.micro), DB subnet group, parameter group
   - `cognito/` — User Pool, App Client, custom attributes, Lambda triggers
   - `s3/` — Frontend bucket (OAI), export bucket (7-day lifecycle)
   - `cloudfront/` — Distribution, OAI, custom error responses for SPA routing
   - `dynamodb/` — WebSocketConnections table with TTL
   - `ecs/` — ECS cluster, task definition, ECR repository
   - `ssm/` — Parameter Store entries for all secrets and config values
   - `iam/` — Per-service Lambda roles, Fargate role, CodeBuild role
   - `monitoring/` — CloudWatch dashboards, alarms, SNS topic

2. **Replace mock auth with real Cognito**:
   - Update `authMiddleware.ts` to verify real Cognito JWT claims.
   - Configure API Gateway Cognito JWT authorizer.
   - Implement Cognito Lambda triggers (pre-signup, post-confirmation, pre-token-generation).

3. **Configure Serverless Framework for each service**:
   - Update each `serverless.yml` with:
     - VPC config (security group + subnet IDs from SSM)
     - Lambda Layer reference (SharedDepsLayer ARN from SSM)
     - Cognito authorizer
     - Environment variables from SSM
     - IAM role statements

4. **Build and deploy Lambda Layer**:
   - Run `scripts/build-layer.sh` to package `@timetable/shared` + `node_modules` into a zip.
   - Publish as Lambda Layer.

5. **Deploy all services**: `sls deploy --stage prod` for each service.

6. **Deploy Fargate engine**:
   - Build Docker image and push to ECR.
   - Register ECS task definition.

7. **Run Prisma migration on production RDS**:
   - Connect to RDS via bastion or Lambda migration function.
   - `npx prisma migrate deploy`.

8. **CI/CD pipeline** (optional for pilot):
   - CodePipeline + CodeBuild configuration.
   - Automated build, test, deploy on push to `main`.

### 18.3 Verification

- All services reachable via API Gateway.
- Cognito authentication works end-to-end.
- WebSocket connects via WSS.
- Export generates PDFs and uploads to S3.
- Timetable generation triggers Fargate task successfully.

---

## 19. Postman Collection Strategy

### 19.1 Collection Structure

A single Postman collection named **School Timetable Management API** with the following folder hierarchy:

```
School Timetable Management API/
├── Auth/
│   ├── Register
│   ├── Login
│   ├── Get Me
│   └── Health
├── Academic Year/
│   ├── Create Academic Year
│   ├── List Academic Years
│   ├── Get Academic Year
│   ├── Update Academic Year
│   ├── Delete Academic Year
│   └── Activate Academic Year
├── School Config/
│   ├── Period Structures/
│   │   ├── Create Period Structure
│   │   ├── List Period Structures
│   │   ├── Get Period Structure
│   │   ├── Update Period Structure
│   │   ├── Delete Period Structure
│   │   └── Assign to Classes
│   ├── Working Days/
│   │   ├── Set Working Days
│   │   └── Get Working Days
│   └── Slots/
│       ├── Generate Slots
│       └── Get Slots
├── Subject/
│   ├── Create Subject
│   ├── List Subjects
│   ├── Get Subject
│   ├── Update Subject
│   └── Delete Subject
├── Teacher/
│   ├── Create Teacher
│   ├── List Teachers
│   ├── Get Teacher
│   ├── Update Teacher
│   ├── Delete Teacher
│   ├── Set Subject Mappings
│   └── Set Availability
├── Class/
│   ├── Create Class
│   ├── List Classes
│   ├── Get Class
│   ├── Update Class
│   ├── Delete Class
│   ├── Add Division
│   ├── Update Division
│   └── Delete Division
├── Assignment/
│   ├── List Division Assignments
│   ├── Create Assignment
│   ├── Update Assignment
│   ├── Delete Assignment
│   └── Create Elective Assignment
├── Elective Group/
│   ├── Create Elective Group
│   ├── List Elective Groups
│   ├── Get Elective Group
│   ├── Update Elective Group
│   ├── Delete Elective Group
│   ├── Add Subject to Group
│   └── Remove Subject from Group
├── Timetable/
│   ├── Trigger Generation
│   ├── Get Generation Status
│   ├── Get Division Timetable
│   ├── Override Slot
│   ├── Publish Timetable
│   ├── Get Conflicts
│   └── Get Teacher Timetable
├── Dashboard/
│   ├── Get Stats
│   └── Get Recent Activity
├── Export/
│   ├── Export Division PDF
│   ├── Export Division Excel
│   ├── Export Teacher PDF
│   └── Export Teacher Excel
└── WebSocket/
    └── (WebSocket test via Postman WS tab)
```

### 19.2 Environment Variables

Create a Postman environment named **Local Dev**:

| Variable | Initial Value | Description |
|----------|--------------|-------------|
| `baseUrl` | `http://localhost:3000` | Base URL for serverless-offline |
| `wsUrl` | `ws://localhost:3001` | WebSocket URL |
| `token` | *(set by Login script)* | JWT token from mock auth |
| `schoolId` | *(set by Register script)* | School UUID |
| `academicYearId` | *(set by Create Academic Year)* | Active academic year UUID |
| `classId` | *(set dynamically)* | Last created class UUID |
| `divisionId` | *(set dynamically)* | Last created division UUID |
| `teacherId` | *(set dynamically)* | Last created teacher UUID |
| `subjectId` | *(set dynamically)* | Last created subject UUID |
| `timetableId` | *(set dynamically)* | Last created timetable UUID |
| `jobId` | *(set dynamically)* | Generation job UUID |

### 19.3 Auto-set Variables via Test Scripts

Each request's **Tests** tab will include a Postman script to extract and store IDs:

```javascript
// Example: After "Create Academic Year" request
if (pm.response.code === 201) {
  const data = pm.response.json().data;
  pm.environment.set("academicYearId", data.id);
}
```

Login request will auto-set the `token`:

```javascript
// After "Login" request
if (pm.response.code === 200) {
  const data = pm.response.json().data;
  pm.environment.set("token", data.token);
}
```

### 19.4 Authorization

All authenticated requests will use the collection-level auth:
- **Type**: Bearer Token
- **Token**: `{{token}}`

Unauthenticated requests (Register, Health) will override to "No Auth" at the request level.

### 19.5 Delivery

The Postman collection and environment will be exported as JSON files in the repository:

```
postman/
├── School_Timetable_Management_API.postman_collection.json
├── Local_Dev.postman_environment.json
└── README.md    (import instructions)
```

---

## 20. Service Dependency Map

This diagram shows why services must be implemented in the specified order. Each service depends only on services above it.

```
Phase 2:  @timetable/shared          ← Foundation (Prisma, Zod, middleware)
Phase 3:  Database Schema + Seed     ← All tables created
              │
Phase 4:  Auth Service (Mock)        ← Provides tokens for all other services
              │
Phase 5:  Academic Year Service      ← Almost everything scopes to an academic year
              │
Phase 6:  School Config Service      ← Period structures + slots (needed for assignments)
              │
        ┌─────┴─────┐
        │            │
Phase 7: Subject    Phase 8: Teacher  ← Independent of each other
        │            │
        └─────┬──────┘
              │
Phase 9:  Class Service              ← Needs subjects for context, not hard dependency
              │
Phase 10: Assignment Service         ← Links divisions + subjects + teachers
              │
Phase 11: Timetable Service          ← Reads assignments, slots, generates timetables
              │
        ┌─────┼───────────┐
        │     │            │
Phase 12: Dashboard  Phase 13: Export  Phase 14: WebSocket  ← Read-only consumers
              │
Phase 15: Timetable Engine (Python)  ← Writes timetable_slots, pushes via WebSocket
              │
Phase 16: Infrastructure & Deploy    ← Everything goes to AWS
```

---

*End of Backend Implementation Plan.*
