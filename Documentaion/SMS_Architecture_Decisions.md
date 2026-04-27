# School Management System (SMS) -- Architecture Decisions

> Document created: April 27, 2026
> Status: ARCHITECTURE COMPLETE -- awaiting feature list for module planning
> Last updated: April 27, 2026

## 1. Deployment & Infrastructure

| Decision | Choice | Notes |
|----------|--------|-------|
| **Multi-tenancy model** | Option A -- shared DB with `school_id` columns | Current approach, no migration needed |
| **Database** | Single shared PostgreSQL, column-level isolation | No schema-per-school, no RLS. Middleware enforces tenant scope |
| **Subdomain routing** | `*.sms.zyphr.co.in` for schools, `sms.zyphr.co.in` for admin | Wildcard cert + Route53 |
| **DNS** | Delegate `sms.zyphr.co.in` to Route53 from GoDaddy | GoDaddy retains `zyphr.co.in` for company website |
| **Environments** | Local, Staging, Production | Staging mirrors prod (separate RDS, Cognito, CloudFront) |
| **Region** | ap-south-1 (Mumbai) | Existing setup |

### Subdomain Structure

```
sms.zyphr.co.in            -- Zyphr admin portal
don-bosco.sms.zyphr.co.in  -- Don Bosco school app
emmaus.sms.zyphr.co.in     -- Emmaus school app
*.sms.zyphr.co.in          -- Wildcard for new schools
```

### Infrastructure Changes Required

- Add `slug` column to `schools` table (unique, e.g., "don-bosco")
- Route53 hosted zone for `sms.zyphr.co.in`
- ACM wildcard cert `*.sms.zyphr.co.in` (us-east-1 for CloudFront)
- CloudFront alternate domain names + cert
- Auth middleware: resolve school from Host header slug
- Frontend: read subdomain for auto school context + branding

---

## 2. Authentication & Authorization

| Decision | Choice | Notes |
|----------|--------|-------|
| **Cognito setup** | Separate User Pool per school + one pool for Zyphr admins | True isolation per school |
| **Cross-school users** | Same email, separate accounts in each pool | Parent with kids in 2 schools has 2 logins |
| **Teacher transfers** | New account created in new school's pool | Old record stays in old school |
| **Login flow** | Subdomain determines which Cognito pool to auth against | Frontend reads slug -> looks up pool ID from DB |
| **Admin auth** | Separate Cognito pool for Zyphr employees | sms.zyphr.co.in uses admin pool |
| **Permissions** | Granular, role-based | Role list TBD after feature list finalized |
| **First login** | Super admin sets initial password, must reset on first login | Cognito forced password change |

### User Types (confirmed)

| User Type | Login? | Platform |
|-----------|--------|----------|
| Super Admin | Yes | Web (admin portal only) |
| Support Agent | Yes | Web (admin portal only) |
| Onboarding Manager | Yes | Web (admin portal only) |
| School Admin | Yes | Web + Mobile |
| Teacher | Yes | Web + Mobile |
| Parent | Yes | Web + Mobile |
| Student | Yes | Web + Mobile |

### Cognito Pool Architecture

```
Cognito Pool: zyphr-sms-admin
  -- Super Admins, Support Agents, Onboarding Managers

Cognito Pool: sms-don-bosco (created on school onboarding)
  -- School admins, teachers, parents, students of Don Bosco

Cognito Pool: sms-emmaus (created on school onboarding)
  -- School admins, teachers, parents, students of Emmaus
```

---

## 3. Academic Year Management

| Decision | Choice | Notes |
|----------|--------|-------|
| **Model** | Current approach -- academic year selector in header, one active at a time | All data scoped to academic year |
| **Rollover** | Yes -- "Start new academic year" feature | What data carries forward TBD after feature list |
| **Calendar** | Different schools may have different academic year calendars | June-May, April-March, etc. |

---

## 4. API Architecture

| Decision | Choice | Notes |
|----------|--------|-------|
| **API Gateway** | Grouped by module, shared gateways | Option B: separate Lambdas, shared API Gateway per module |
| **Gateway management** | Terraform creates API GW + routes, Serverless deploys Lambda only | Clean separation of infra vs code |
| **Current services** | Keep 12 existing services as-is | Add new services for new modules |

### API Gateway Grouping (planned)

```
API GW: timetable-module
  /api/academic-years/*  -- academic-year service
  /api/config/*          -- school-config service
  /api/subjects/*        -- subject service
  /api/teachers/*        -- teacher service
  /api/classes/*         -- class service
  /api/assignments/*     -- division-assignment service
  /api/divisions/*       -- division-assignment service
  /api/elective-groups/* -- division-assignment service
  /api/timetables/*      -- timetable service
  /api/export/*          -- export service

API GW: core-module
  /api/auth/*            -- auth service
  /api/dashboard/*       -- dashboard service
  /api/notifications/*   -- notification service
  /api/ws/*              -- websocket service

API GW: student-module (future)
API GW: finance-module (future)
API GW: exam-module (future)
... (grouped by module as modules are added)
```

---

## 5. Frontend Architecture

| Decision | Choice | Notes |
|----------|--------|-------|
| **Web app** | React SPA (current, continues) | Responsive design required |
| **Admin portal** | Separate React app | `apps/admin/` in monorepo |
| **Mobile app** | React Native (Android + iOS) | `apps/mobile/` in monorepo |
| **Shared UI** | Extract shared component library | `packages/ui/` |
| **Framework** | Expo (React Native) | OTA via EAS Update, cloud builds via EAS Build |

### Monorepo Structure (planned)

```
apps/
  web/                -- school web app (renamed from frontend/)
  admin/              -- Zyphr admin portal
  mobile/             -- React Native app

packages/
  shared/             -- existing (Prisma, middleware, errors, schemas)
  ui/                 -- NEW: shared component library
```

### Mobile App Roles & Views

| Role | Mobile Login | Notes |
|------|-------------|-------|
| Super Admin | No | Web-only (admin portal) |
| Support Agent | No | Web-only (admin portal) |
| Onboarding Manager | No | Web-only (admin portal) |
| School Admin | Yes | Full admin features on mobile |
| Teacher | Yes | Timetable, attendance, grades |
| Parent | Yes | Child's timetable, attendance, grades, fees, announcements |
| Student | Yes | Own timetable, grades, assignments |

Each role gets a different color theme on mobile (specifics TBD).

---

## 6. File Storage

| Decision | Choice | Notes |
|----------|--------|-------|
| **Storage** | S3 with presigned URLs | Standard approach |
| **Bucket strategy** | Separate bucket per school | `sms-files-don-bosco`, `sms-files-emmaus`, etc. |
| **Bucket creation** | Automated during school onboarding | Part of the automated setup flow |

---

## 7. Notifications

| Channel | Provider | Status |
|---------|----------|--------|
| **In-app** | Existing notification service | Already implemented |
| **Push (mobile)** | Firebase Cloud Messaging (FCM) | Confirmed |
| **Email** | TBD (AWS SES likely) | Provider to be decided |
| **SMS** | TBD | Provider to be decided |
| **WhatsApp** | TBD (WhatsApp Business API) | Provider to be decided |

---

## 8. School Onboarding (Automated)

When super admin creates a school, the system auto-provisions:

1. Create `School` record (name, slug, config) in DB
2. Create Cognito User Pool for the school
3. Create S3 bucket for the school's files
4. Create school admin Cognito user (initial password, forced reset)
5. Create `SchoolUser` record linking admin to school
6. Send welcome email to school admin with login instructions

---

## 9. Localization (i18n)

| Decision | Choice | Notes |
|----------|--------|-------|
| **Multi-language** | Yes, but English-only for now | Infrastructure setup for i18n from the start |
| **Default scope** | School-level setting | School admin sets default language |
| **User override** | Yes | Individual users can switch language |
| **Languages (future)** | English, Malayalam, Hindi (more TBD) | Based on school needs |

---

## 10. Compliance & Data

| Decision | Choice | Notes |
|----------|--------|-------|
| **Regulation** | DPDP Act 2023 compliance required | Student data = minor data = strict rules |
| **Audit logging** | Hybrid -- DB triggers for writes + application-level for reads | Option C: best coverage |
| **Read access logging** | Yes -- required for DPDP (minor data) | "Teacher X viewed Student Y's grades" |
| **Audit queryable** | Yes, in admin portal | Search by user, school, date, action type (unless violates DPDP) |
| **Suspicious activity alerts** | Not now | Can add later |
| **Data retention** | Never delete | Frozen schools retain all data indefinitely |
| **Data export** | Super admin only | Full school data export capability |

---

## 11. Billing & Subscription

| Decision | Choice | Notes |
|----------|--------|-------|
| **Pricing model** | Flexible per school: per-school, per-student, per-module, or combination | Super admin configures per school |
| **Payment gateway** | Razorpay | India-focused |
| **Billing dashboard** | In-app (admin portal) | Usage, invoices, payment history |
| **Trial/demo** | No | Not needed |

---

## 12. CI/CD & DevOps

| Decision | Choice | Notes |
|----------|--------|-------|
| **CI/CD tool** | GitHub Actions | Repo on GitHub |
| **Environments** | Local, Staging, Production | Staging mirrors prod |
| **Frontend deploy** | S3 sync + CloudFront invalidation | Automated via GH Actions |
| **Backend deploy** | Serverless Framework via GH Actions | Per-service deployment |
| **Mobile deploy** | Expo EAS Update (OTA) + Store releases | OTA for JS changes, store release for native changes |
| **Local auth** | Mock auth (current approach continues) | No dev Cognito pool needed |

---

## 13. Monitoring & Observability

| Need | Tool | Status |
|------|------|--------|
| **Logging** | CloudWatch Logs Insights | Free with Lambda, upgrade to Datadog later as customer base grows |
| **Error tracking** | Sentry | Free tier (5k events/month), scale to paid as needed |
| **Uptime monitoring** | AWS CloudWatch Synthetics or BetterUptime | $7-20/month |
| **APM** | AWS X-Ray | Free at current scale (100k traces/month free) |

---

## 14. Real-time Features

TBD after feature list is finalized. Current WebSocket service exists for timetable generation progress.

---

## 15. Modules (Future)

Module list TBD. Current module: Timetable Management (complete).
Potential modules: Student Management, Fee/Finance, Exam/Grades, Communication, HR/Staff, Transport, Library.
Will be finalized based on feature requirements.

---

## 16. Admin Portal Roles

| Role | Permissions |
|------|------------|
| **Super Admin** | Everything -- create/deactivate schools, view all data, impersonate, billing, manage staff |
| **Support Agent** | View any school's data, impersonate school admins, read-only. No create/delete/billing |
| **Onboarding Manager** | Create schools, initial config, assign admin. No post-handover data access |

---

## 17. AI Agent & MCP Server

| Decision | Choice | Notes |
|----------|--------|-------|
| **Target users** | School admins, teachers, students, parents + Zyphr internal | All user types except no mobile for super admin |
| **Auth** | MCP server must respect user roles and school tenant scope | A teacher can only query their own school's data |
| **Architecture** | MCP server exposing school data as tools/resources | Details TBD |
| **Zyphr internal access** | Separate MCP tools for admin-level queries | Cross-school analytics, revenue, etc. |

### MCP Auth Flow (planned)

```
User (teacher at Don Bosco) --> AI Agent --> MCP Server
  MCP Server checks:
    1. User's Cognito token (which school pool?)
    2. User's role (teacher -- can view own timetable, class data)
    3. School scope (only Don Bosco data)
    4. Operation permission (read-only for most, write for specific actions)
```

---

## 18. Shared UI Component Library

| Decision | Choice | Notes |
|----------|--------|-------|
| **Package** | `packages/ui/` | Shared tokens, types, hooks |
| **Web components** | shadcn/ui based (existing) | Used by `apps/web/` and `apps/admin/` |
| **Mobile components** | React Native equivalents | Used by `apps/mobile/` |
| **Platform strategy** | Platform-specific files where needed (`.tsx` / `.native.tsx`) | Bundler auto-selects |
| **Shared across all** | Design tokens (colors, spacing, typography), hooks, types | Single source of truth |

---

## 19. Audit Log Storage

| Decision | Choice | Notes |
|----------|--------|-------|
| **Storage** | DynamoDB | Write-heavy, read-occasionally, infinite scale, cheap |
| **Write audit** | PostgreSQL triggers → DynamoDB stream | Auto-capture all INSERT/UPDATE/DELETE |
| **Read audit** | Application-level → DynamoDB | "Teacher X viewed Student Y's grades" |
| **Query** | Admin portal queries DynamoDB | Filter by user, school, date, action type |
| **Retention** | Never delete (consistent with data retention policy) | |

### Audit Log DynamoDB Schema (planned)

```
Table: sms-audit-logs
  PK: SCHOOL#{schoolId}
  SK: {timestamp}#{actionId}
  Attributes:
    userId, userEmail, userRole
    action (CREATE, READ, UPDATE, DELETE)
    resource (teacher, student, timetable, etc.)
    resourceId
    details (before/after for writes, query params for reads)
    ipAddress
    userAgent
```

---

## 20. School Branding

| Decision | Choice | Notes |
|----------|--------|-------|
| **Configured by** | School admin (self-service in school settings) | |
| **Customization scope** | Logo, primary color, login background, report headers | |
| **Storage** | School's S3 bucket (presigned URLs) | |

### Branding Config (stored in `schools` table as JSONB)

```json
{
  "logo": {
    "url": "s3://sms-files-don-bosco/branding/logo.png",
    "guidelines": "Recommended: 200x200px, PNG/SVG, transparent background, max 500KB"
  },
  "loginBackground": {
    "url": "s3://sms-files-don-bosco/branding/bg.jpg",
    "guidelines": "Recommended: 1920x1080px, JPG/PNG, max 2MB"
  },
  "primaryColor": "#1E40AF",
  "reportHeader": {
    "schoolName": "Don Bosco Higher Secondary School",
    "address": "Irinjalakuda, Thrissur, Kerala",
    "affiliation": "CBSE Affiliation No: 930393",
    "contactPhone": "+91-480-2825XXX",
    "contactEmail": "office@donboscoijk.edu.in"
  }
}
```

Admin portal shows upload forms with clear size/format guidelines for school admins.

---

## 21. Scaling Strategy

| Parameter | Current | Target (25 schools) | Notes |
|-----------|---------|-------------------|-------|
| **RDS instance** | db.t4g.micro (2 vCPU, 1GB) | db.t4g.small (2 vCPU, 2GB) | Upgrade when DB size > 15GB or CPU > 70% |
| **Lambda concurrency** | Default 1000 | Default 1000 (sufficient) | Monitor; request increase if needed |
| **Cognito pools** | 1 | ~27 (25 schools + admin + current) | Well within 1000 pool soft limit |
| **S3 buckets** | 2 (frontend + exports) | ~28 (+ 1 per school) | Well within limits |
| **CloudFront** | 1 distribution | 1 distribution (shared) | Origin limit: 25 (consolidate API GWs to stay under) |

**Design principle:** Code is written tenant-agnostic from day one. Scaling is infrastructure-only (instance size, read replicas, caching). No code changes required.

---

## 22. Don Bosco Migration

| Item | Approach |
|------|----------|
| **Database** | Add `slug='don-bosco'` to existing school record, add branding JSONB column |
| **Cognito** | Create new school-specific pool `sms-don-bosco`, migrate existing users from current shared pool |
| **Frontend** | Same app served at `don-bosco.sms.zyphr.co.in`, existing data accessible |
| **Timetables** | No change -- all existing timetables, assignments, config preserved |
| **Old URL** | `d25i05v9hwcs8q.cloudfront.net` redirects to `don-bosco.sms.zyphr.co.in` |

---

## Open Decisions

| # | Topic | Blocked By |
|---|-------|-----------|
| 1 | Academic year rollover -- what data carries forward | Feature list |
| 2 | Module list and feature set | Pending user input |
| 3 | Granular permission roles per user type | Feature list |
| 4 | Mobile app feature set per role | Feature list |
| 5 | Real-time features beyond push notifications | Feature list |
| 6 | Offline support -- which operations | Feature list |
| 7 | Notification channel providers (email, SMS, WhatsApp) | Provider evaluation |
| 8 | Mobile role-specific color themes | Design phase |
| 9 | Parent-student linking model | Feature list |
| 10 | MCP server detailed design (tools, resources, auth) | After feature list |
