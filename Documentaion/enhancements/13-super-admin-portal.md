# Enhancement 13: Super Admin Portal -- School & User Management

> Status: PLAN COMPLETE -- ready for implementation
> Created: April 30, 2026
> Depends on: Enhancement 7 (Role-Based Access)

## Overview

A separate frontend application for super admins to manage schools, users, subscriptions, and payments. Shares the same backend services as the main app, with SUPER_ADMIN role guards. Includes a revenue dashboard, school CRUD, user management, subscription tier management, payment tracking, and upgrade request workflow.

## Decisions Made

| Decision | Answer |
|----------|--------|
| App architecture | Separate frontend app, same backend services, shared tech stack |
| Hosting | Separate CloudFront distribution (no custom domain for now) |
| Tech stack | React + Vite + Tailwind + RTK Query, same glassmorphism design |
| Impersonation | Deferred to later |
| Support Agent / Onboarding Manager roles | Deferred to later |
| Payment gateway | Manual tracking for now, gateway integration later |
| Subscription billing | Yearly only |
| Downgrade | Not allowed -- only upgrade |
| School deactivation | Soft delete, users can't login, data preserved |
| Expired subscription | Read-only access for school admins; super admin can override |

---

## Subscription Model

### Tiers

| Tier | Name | Features | Limits |
|------|------|----------|--------|
| BASIC | Basic | Timetable generation (one-time), view/export timetables, edit data | 1 generation, 1 login (school admin only), no teacher accounts |
| ADVANCED | Advanced | Unlimited generations, continuous editing, multi-user | Unlimited generations, school admin + teacher logins |
| PREMIUM | Premium | All Advanced features + dedicated Zyphr support agent | Unlimited, assigned support agent contact |

### Feature Gating

| Feature | Basic | Advanced | Premium |
|---------|-------|----------|---------|
| Create/edit classes, teachers, subjects, assignments | Yes | Yes | Yes |
| Generate timetable | Once | Unlimited | Unlimited |
| Regenerate timetable | No | Yes | Yes |
| View & export timetables | Yes | Yes | Yes |
| Teacher user accounts | No | Yes | Yes |
| Viewer user accounts | No | Yes | Yes |
| Dedicated support agent | No | No | Yes |

### Enforcement Points

| Point | Service | Logic |
|-------|---------|-------|
| Timetable generation | `services/timetable/src/service.ts` | Check tier; if BASIC and `generationCount > 0` → reject |
| User creation | `services/auth/src/service.ts` | If BASIC, reject creating TEACHER/VIEWER users |
| Login | `services/auth/src/service.ts` | If subscription expired → return `readOnly: true` flag |

---

## Data Model Changes

### New Models

#### Subscription

```prisma
model Subscription {
  id          String             @id @default(uuid())
  schoolId    String             @unique @map("school_id")
  tier        SubscriptionTier
  status      SubscriptionStatus
  startDate   DateTime           @map("start_date")
  endDate     DateTime           @map("end_date")
  amount      Decimal            @db.Decimal(10, 2)
  currency    String             @default("INR") @db.VarChar(3)
  notes       String?            @db.Text
  createdAt   DateTime           @default(now()) @map("created_at")
  updatedAt   DateTime           @updatedAt @map("updated_at")

  school   School    @relation(fields: [schoolId], references: [id])
  payments Payment[]

  @@map("subscriptions")
}

enum SubscriptionTier {
  BASIC
  ADVANCED
  PREMIUM
}

enum SubscriptionStatus {
  ACTIVE
  EXPIRED
  SUSPENDED
}
```

#### Payment

```prisma
model Payment {
  id             String        @id @default(uuid())
  subscriptionId String        @map("subscription_id")
  amount         Decimal       @db.Decimal(10, 2)
  currency       String        @default("INR") @db.VarChar(3)
  paymentDate    DateTime      @map("payment_date")
  paymentMethod  String?       @map("payment_method") @db.VarChar(100)
  transactionRef String?       @map("transaction_ref") @db.VarChar(255)
  notes          String?       @db.Text
  recordedBy     String        @map("recorded_by")  // SchoolUser ID of super admin
  createdAt      DateTime      @default(now()) @map("created_at")

  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@map("payments")
}
```

#### UpgradeRequest

```prisma
model UpgradeRequest {
  id            String               @id @default(uuid())
  schoolId      String               @map("school_id")
  currentTier   SubscriptionTier     @map("current_tier")
  requestedTier SubscriptionTier     @map("requested_tier")
  status        UpgradeRequestStatus @default(PENDING)
  requestedBy   String               @map("requested_by")  // SchoolUser ID
  requestedAt   DateTime             @default(now()) @map("requested_at")
  resolvedBy    String?              @map("resolved_by")    // Super admin SchoolUser ID
  resolvedAt    DateTime?            @map("resolved_at")
  notes         String?              @db.Text

  school School @relation(fields: [schoolId], references: [id])

  @@map("upgrade_requests")
}

enum UpgradeRequestStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### Modified Models

#### School (enhanced)

```prisma
model School {
  // Existing fields
  id            String   @id @default(uuid())
  name          String   @db.VarChar(255)
  adminEmail    String   @unique @map("admin_email")
  cognitoUserId String   @unique @map("cognito_user_id")

  // New fields
  phone         String?  @db.VarChar(50)
  address       String?  @db.Text
  city          String?  @db.VarChar(100)
  state         String?  @db.VarChar(100)
  pincode       String?  @db.VarChar(10)
  principalName String?  @map("principal_name") @db.VarChar(255)
  boardAffiliation String? @map("board_affiliation") @db.VarChar(100)  // CBSE, ICSE, State Board, etc.
  logoUrl       String?  @map("logo_url") @db.VarChar(500)
  studentCount  Int?     @map("student_count")
  deactivatedAt DateTime? @map("deactivated_at")
  supportAgentName  String? @map("support_agent_name") @db.VarChar(255)
  supportAgentEmail String? @map("support_agent_email") @db.VarChar(255)
  supportAgentPhone String? @map("support_agent_phone") @db.VarChar(50)
  generationCount   Int     @default(0) @map("generation_count")

  // New relations
  subscription     Subscription?
  upgradeRequests  UpgradeRequest[]

  // ... existing relations unchanged
}
```

---

## Implementation Phases

### Phase 1: Database Schema & Migrations

#### 1.1 Add new models to Prisma schema

**File:** `packages/shared/prisma/schema.prisma`

Add: `Subscription`, `Payment`, `UpgradeRequest` models, `SubscriptionTier`, `SubscriptionStatus`, `UpgradeRequestStatus` enums.

#### 1.2 Enhance School model

Add new fields: `phone`, `address`, `city`, `state`, `pincode`, `principalName`, `boardAffiliation`, `logoUrl`, `studentCount`, `deactivatedAt`, `supportAgentName`, `supportAgentEmail`, `supportAgentPhone`, `generationCount`.

Add new relations: `subscription`, `upgradeRequests`.

#### 1.3 Run migration

```bash
npx prisma migrate dev --name add-subscription-school-profile
```

---

### Phase 2: Backend -- School Management API

#### 2.1 New school management endpoints

**File:** `services/auth/src/service.ts` (or new `services/school-management/`)

Since this is called from the admin portal, these endpoints should be in the auth service (which already handles schools) or a new dedicated service. **Use auth service** for simplicity since it already has school queries.

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `GET /api/auth/schools` | GET | List all schools with subscription status | SUPER_ADMIN |
| `POST /api/auth/schools` | POST | Create school + school admin user + subscription | SUPER_ADMIN |
| `GET /api/auth/schools/{id}` | GET | Get school details with profile + subscription | SUPER_ADMIN, own SCHOOL_ADMIN |
| `PUT /api/auth/schools/{id}` | PUT | Update school profile | SUPER_ADMIN, own SCHOOL_ADMIN |
| `PUT /api/auth/schools/{id}/deactivate` | PUT | Soft-deactivate school | SUPER_ADMIN |
| `PUT /api/auth/schools/{id}/reactivate` | PUT | Reactivate school | SUPER_ADMIN |

#### 2.2 School creation flow

```typescript
async createSchool(input: CreateSchoolInput) {
  // 1. Validate unique email
  // 2. Create School record with profile fields
  // 3. Create Cognito user (auto-generated temp password)
  // 4. Create SchoolUser (SCHOOL_ADMIN role) linked to school
  // 5. Create Subscription (BASIC tier, ACTIVE status, 1 year from today)
  // 6. Send welcome email to school admin with:
  //    - Login URL
  //    - Temp password
  //    - School name
  //    - Subscription details
  // 7. Return created school + subscription
}
```

**CreateSchoolInput:**
```typescript
{
  name: string;              // required
  adminEmail: string;        // required
  adminName: string;         // required
  phone: string;             // required
  address: string;           // required
  city?: string;
  state?: string;
  pincode?: string;
  principalName: string;     // required
  boardAffiliation?: string;
  tier: 'BASIC' | 'ADVANCED' | 'PREMIUM';
  subscriptionAmount: number;
  notes?: string;
}
```

#### 2.3 School profile update

School admin can update their own school's profile (name, phone, address, principalName, etc.). Super admin can update any school.

Guard: `requirePermission('manage_schools')` for super admin, or `schoolId === own schoolId` for school admin.

#### 2.4 School deactivation

```typescript
async deactivateSchool(schoolId: string) {
  // 1. Set school.deactivatedAt = now()
  // 2. Set subscription.status = 'SUSPENDED'
  // 3. All users of this school will get readOnly on next login check
}
```

#### 2.5 Login guard for deactivated/expired schools

**File:** `services/auth/src/service.ts` → `login()` method

After login, check:
1. If `school.deactivatedAt` is set → return `{ readOnly: true, reason: 'DEACTIVATED' }`
2. If `subscription.status === 'EXPIRED'` → return `{ readOnly: true, reason: 'EXPIRED' }`
3. If `subscription.status === 'SUSPENDED'` → return `{ readOnly: true, reason: 'SUSPENDED' }`
4. Normal login otherwise

Frontend stores `readOnly` flag and reason in auth state. Enhancement 7's `useReadOnly()` hook checks this.

---

### Phase 3: Backend -- Subscription & Payment API

#### 3.1 Subscription endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `GET /api/auth/schools/{id}/subscription` | GET | Get subscription details | SUPER_ADMIN, own SCHOOL_ADMIN |
| `PUT /api/auth/schools/{id}/subscription` | PUT | Update tier, amount, dates | SUPER_ADMIN only |
| `PUT /api/auth/schools/{id}/subscription/override-readonly` | PUT | Toggle read-only override | SUPER_ADMIN only |

#### 3.2 Payment endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `GET /api/auth/schools/{id}/payments` | GET | List payment history | SUPER_ADMIN, own SCHOOL_ADMIN |
| `POST /api/auth/schools/{id}/payments` | POST | Record a payment | SUPER_ADMIN only |

**RecordPaymentInput:**
```typescript
{
  amount: number;
  paymentDate: string;       // ISO date
  paymentMethod?: string;    // "Bank Transfer", "UPI", "Cheque", etc.
  transactionRef?: string;   // reference number
  notes?: string;
}
```

#### 3.3 Upgrade request endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `POST /api/auth/schools/{id}/upgrade-requests` | POST | School admin requests upgrade | SCHOOL_ADMIN |
| `GET /api/auth/upgrade-requests` | GET | List all pending requests | SUPER_ADMIN |
| `PUT /api/auth/upgrade-requests/{id}/approve` | PUT | Approve + change tier | SUPER_ADMIN |
| `PUT /api/auth/upgrade-requests/{id}/reject` | PUT | Reject with reason | SUPER_ADMIN |

**Upgrade request flow:**
1. School admin clicks "Upgrade" → selects target tier → submits
2. Backend creates UpgradeRequest (PENDING)
3. Backend sends email to super admin(s) with school name, current tier, requested tier
4. Creates in-app notification for super admin dashboard
5. Super admin views request → contacts school → records payment → approves
6. On approval: update subscription tier + create payment record

---

### Phase 4: Backend -- Super Admin Dashboard Stats

#### 4.1 New endpoint: admin portal stats

**Endpoint:** `GET /api/dashboard/super-admin-stats`
**Access:** SUPER_ADMIN only

**Response:**
```typescript
interface SuperAdminDashboardStats {
  schools: {
    total: number;
    active: number;
    deactivated: number;
    byTier: Record<SubscriptionTier, number>;
    // e.g., { BASIC: 15, ADVANCED: 8, PREMIUM: 2 }
  };
  revenue: {
    totalCollected: number;       // sum of all payments ever
    currentYearRevenue: number;   // sum of payments this calendar year
    currentMonthRevenue: number;  // sum of payments this month
    mrr: number;                  // monthly recurring revenue (total active subscription amounts / 12)
    overdueCount: number;         // schools with EXPIRED status
  };
  revenueByMonth: Array<{
    month: string;    // "2026-01", "2026-02", etc.
    amount: number;
  }>;  // last 12 months for trend chart
  usage: {
    totalTeachers: number;        // across all active schools
    totalDivisions: number;
    totalGenerations: number;     // sum of all school generationCounts
    schoolsWithTimetables: number; // schools that have at least one generated timetable
  };
  pendingUpgradeRequests: number;
  recentPayments: Array<{
    schoolName: string;
    amount: number;
    paymentDate: string;
    tier: SubscriptionTier;
  }>;  // last 10 payments
}
```

#### 4.2 Tier enforcement on generation

**File:** `services/timetable/src/service.ts`

In `generateTimetable()`, before starting generation:
1. Load school's subscription
2. If tier === 'BASIC' and `school.generationCount > 0` → throw error: "Basic plan allows only one-time generation. Upgrade to continue."
3. After successful generation: increment `school.generationCount`

#### 4.3 Tier enforcement on user creation

**File:** `services/auth/src/service.ts`

In user creation endpoint:
1. Load school's subscription
2. If tier === 'BASIC' and role === 'TEACHER' or 'VIEWER' → throw error: "Basic plan does not support additional user accounts. Upgrade to Advanced."

---

### Phase 5: Admin Portal Frontend -- App Setup

#### 5.1 Create new frontend app

```
apps/admin-portal/
  ├── index.html
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts
  ├── tailwind.config.ts
  ├── src/
  │   ├── main.tsx
  │   ├── app/
  │   │   ├── router.tsx
  │   │   ├── store.ts
  │   │   └── hooks.ts
  │   ├── components/
  │   │   ├── ui/          (symlink or copy from main app)
  │   │   └── layout/
  │   │       ├── AdminLayout.tsx
  │   │       ├── Sidebar.tsx
  │   │       └── TopBar.tsx
  │   ├── features/
  │   │   ├── auth/
  │   │   ├── dashboard/
  │   │   ├── schools/
  │   │   ├── subscriptions/
  │   │   └── upgrade-requests/
  │   └── lib/
  │       ├── api.ts
  │       ├── cn.ts
  │       └── chartTheme.ts
  └── public/
```

#### 5.2 Shared UI components

Option A: Copy `components/ui/` from main app (simpler, independent).
Option B: Extract to a shared package `packages/ui/` (cleaner, more maintenance).

**Use Option A** for speed. Copy the needed shadcn/ui components.

#### 5.3 Auth flow

Admin portal login:
1. Login page with email/password
2. Call `POST /api/auth/login`
3. If `userRole !== 'SUPER_ADMIN'` → show "Access denied" message
4. If `userRole === 'SUPER_ADMIN'` → store token, navigate to dashboard

#### 5.4 Sidebar navigation

```
┌────────────────────┐
│  Zyphr Admin       │
│                    │
│  Dashboard         │
│  Schools           │
│  Upgrade Requests  │
│  Settings          │
│                    │
│  ────────────────  │
│  admin@zyphr.co.in │
│  Logout            │
└────────────────────┘
```

Same dark sidebar style as main app (`#1C1917`).

---

### Phase 6: Admin Portal Frontend -- Dashboard Page

#### 6.1 Super admin dashboard layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 25       │ │ 20       │ │ 5        │ │ 3        │           │
│  │ Total    │ │ Active   │ │ Deact.   │ │ Pending  │           │
│  │ Schools  │ │ Schools  │ │ Schools  │ │ Upgrades │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │  Revenue Summary     │  │  Schools by Tier              │     │
│  │                      │  │                                │     │
│  │  MRR: ₹1,20,000     │  │  ┌─────────────────────────┐  │     │
│  │  This Month: ₹45,000│  │  │ ██████████ Basic: 15    │  │     │
│  │  This Year: ₹5,40,000│  │  │ ██████  Advanced: 8    │  │     │
│  │  Overdue: 2 schools  │  │  │ ██  Premium: 2          │  │     │
│  └──────────────────────┘  │  └─────────────────────────┘  │     │
│                             └──────────────────────────────┘     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Revenue Trend (Last 12 Months)            [area chart]   │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │          ╱─╲                                      │     │   │
│  │  │    ╱────╱   ╲────╲          ╱────                 │     │   │
│  │  │───╱                ╲──────╱                       │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Jan  Feb  Mar  │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐     │
│  │  Usage Stats         │  │  Recent Payments              │     │
│  │                      │  │                                │     │
│  │  1,200 Teachers      │  │  Don Bosco - ₹15,000 - Apr 28│     │
│  │  350 Divisions       │  │  Emmaus - ₹25,000 - Apr 25   │     │
│  │  150 Generations     │  │  St. Mary's - ₹10,000 - Apr 20│    │
│  │  18 with Timetables  │  │  ...                          │     │
│  └──────────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

Charts: recharts `AreaChart` for revenue trend, `PieChart` or horizontal `BarChart` for tier distribution.

---

### Phase 7: Admin Portal Frontend -- Schools Management Page

#### 7.1 Schools list page

**Route:** `/schools`

DataTable with columns:

| Column | Content |
|--------|---------|
| School Name | Clickable → school detail page |
| Admin Email | School admin's email |
| Tier | Badge: Basic / Advanced / Premium |
| Status | Badge: Active / Expired / Suspended / Deactivated |
| Divisions | Count |
| Teachers | Count |
| Subscription End | Date |
| Actions | View, Deactivate/Reactivate |

Filters: Tier (multi-select), Status (multi-select), Search by name/email.

Mobile card view with same responsive pattern.

"+ Add School" button in header.

#### 7.2 Add School form

**Route:** `/schools/new`

Form with sections:

**Section 1: School Information (required)**
- School Name
- Phone
- Address (textarea)
- City, State, Pincode
- Principal Name
- School Email (becomes `adminEmail`)

**Section 2: School Admin Account**
- Admin Name
- Admin Email (pre-filled from school email, editable)
- Password: auto-generated, shown to super admin, sent to admin email

**Section 3: Subscription**
- Tier selector (Basic / Advanced / Premium) with feature comparison
- Subscription Amount (₹ input)
- Start Date (default: today)
- End Date (default: 1 year from today)
- Notes

**Section 4: Optional**
- Board Affiliation (dropdown: CBSE, ICSE, State Board, IGCSE, Other)
- Student Count
- Logo upload

On save → creates school + user + subscription + sends email.

#### 7.3 School detail page

**Route:** `/schools/{id}`

Tabbed layout:

**Tab 1: Profile**
- Editable school profile fields
- Logo display + upload

**Tab 2: Subscription**
- Current tier badge + status
- Start/end dates
- Amount
- Change tier button (opens dialog with tier selector)
- Override read-only toggle (for expired/suspended schools)

**Tab 3: Payments**
- Payment history table (date, amount, method, reference, recorded by)
- "+ Record Payment" button → form dialog

**Tab 4: Users**
- List of SchoolUser records for this school
- Role badge per user
- Reuses Enhancement 7's user management endpoints

**Tab 5: Stats**
- School-specific stats: classes, divisions, teachers, subjects, timetable status
- Reuses main app's dashboard stats endpoint scoped to this school

---

### Phase 8: Admin Portal Frontend -- Upgrade Requests Page

#### 8.1 Upgrade requests list

**Route:** `/upgrade-requests`

DataTable:

| Column | Content |
|--------|---------|
| School | School name |
| Current Tier | Badge |
| Requested Tier | Badge |
| Requested By | User name/email |
| Requested At | Date |
| Status | Badge: Pending / Approved / Rejected |
| Actions | Approve / Reject buttons (if pending) |

Filter by status. Sort by date (newest first).

#### 8.2 Approve flow

1. Super admin clicks "Approve" on a pending request
2. Dialog opens: "Record payment for upgrade"
   - Amount (pre-filled from tier pricing if set)
   - Payment date
   - Payment method
   - Transaction reference
   - Notes
3. On confirm:
   - Updates subscription tier
   - Creates payment record
   - Updates upgrade request status to APPROVED
   - Sends email to school admin confirming upgrade

#### 8.3 Reject flow

1. Super admin clicks "Reject"
2. Dialog: reason textarea
3. On confirm:
   - Updates upgrade request status to REJECTED with notes
   - Sends email to school admin with rejection reason

---

### Phase 9: Main App -- School Admin Subscription View

#### 9.1 Subscription page for school admins

**Route (main app):** `/settings/subscription`

Added to the main app's Settings section (or as a new nav item).

```
┌─────────────────────────────────────────────────┐
│  Your Subscription                               │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Plan: Advanced                              │ │
│  │  Status: Active ✓                            │ │
│  │  Valid until: March 31, 2027                  │ │
│  │  Amount: ₹25,000/year                        │ │
│  │                                               │ │
│  │  [Upgrade to Premium]                         │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Support Contact                             │ │
│  │  Agent: Jonie Jacob                          │ │
│  │  Email: jonie@zyphr.co.in                    │ │
│  │  Phone: +91 98765 43210                      │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Payment History                             │ │
│  │  ┌────────┬──────────┬────────┬───────────┐ │ │
│  │  │ Date   │ Amount   │ Method │ Reference │ │ │
│  │  │ Apr 28 │ ₹25,000  │ UPI    │ TXN12345  │ │ │
│  │  │ Apr 28 │ ₹15,000  │ Bank   │ NEFT789   │ │ │
│  │  └────────┴──────────┴────────┴───────────┘ │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### 9.2 Upgrade request flow (school admin side)

1. School admin clicks "Upgrade to Premium" (or "Upgrade to Advanced" if on Basic)
2. Confirmation dialog: "Request upgrade to Premium? The Zyphr team will contact you for payment details."
3. On confirm → `POST /api/auth/schools/{id}/upgrade-requests`
4. Toast: "Upgrade request submitted. Our team will contact you soon."
5. Button changes to "Upgrade Requested (Pending)" (disabled)

#### 9.3 School profile editing (school admin)

**Route (main app):** `/settings/school-profile`

School admin can edit: name, phone, address, city, state, pincode, principalName, boardAffiliation, studentCount, logo.

Cannot edit: adminEmail (managed by super admin), subscription, deactivated status.

---

### Phase 10: Email Notifications -- HELPERS ALREADY BUILT (Enhancement 14, Phases 9-10)

> Email and subscription helpers were pre-built in Enhancement 14, Phases 9-10.
>
> **Already available from `@timetable/shared`:**
> ```typescript
> import {
>   sendEmail, EMAIL_TEMPLATES, type EmailParams,
>   checkTierAllows, checkSubscriptionStatus, TIER_LIMITS,
>   type SubscriptionTier, type TierLimits, type SubscriptionAction,
> } from '@timetable/shared';
> ```
>
> **Email templates pre-built:** `schoolWelcome`, `upgradeRequest`, `upgradeApproved`, `upgradeRejected`, `subscriptionExpiring`, `subscriptionExpired`
>
> **Tier limits pre-built:** BASIC (1 gen, no teacher/viewer), ADVANCED (unlimited), PREMIUM (+ support)
>
> **Subscription checks pre-built:** `checkTierAllows(action)`, `checkSubscriptionStatus(schoolId)`

#### 10.1 Wire email templates into trigger points

| Email | Template | Trigger | Where |
|-------|----------|---------|-------|
| Welcome | `EMAIL_TEMPLATES.schoolWelcome(...)` | School created | `auth/service.ts :: createSchool()` |
| Upgrade Request | `EMAIL_TEMPLATES.upgradeRequest(...)` | School admin requests upgrade | `auth/service.ts :: createUpgradeRequest()` |
| Upgrade Approved | `EMAIL_TEMPLATES.upgradeApproved(...)` | Super admin approves | `auth/service.ts :: approveUpgradeRequest()` |
| Upgrade Rejected | `EMAIL_TEMPLATES.upgradeRejected(...)` | Super admin rejects | `auth/service.ts :: rejectUpgradeRequest()` |
| Subscription Expiring | `EMAIL_TEMPLATES.subscriptionExpiring(...)` | 30 days before expiry | Cron job / scheduled Lambda |
| Subscription Expired | `EMAIL_TEMPLATES.subscriptionExpired(...)` | On expiry date | Cron job / scheduled Lambda |

#### 10.2 Wire tier enforcement

| Check | Where |
|-------|-------|
| `checkTierAllows({ schoolId, action: 'GENERATE_TIMETABLE' })` | `timetable/service.ts :: triggerGeneration()` |
| `checkTierAllows({ schoolId, action: 'CREATE_TEACHER_USER' })` | `auth/service.ts :: createUser()` |
| `checkTierAllows({ schoolId, action: 'CREATE_VIEWER_USER' })` | `auth/service.ts :: createUser()` |
| `checkSubscriptionStatus(schoolId)` | `auth/service.ts :: login()` -- return readOnly flag |

---

### Phase 11: Deployment

#### 11.1 Build admin portal

```bash
cd apps/admin-portal
npm run build
```

#### 11.2 Create S3 bucket

```
timetable-prod-admin-portal
```

#### 11.3 Create CloudFront distribution

- Origin: S3 bucket
- Default root: `index.html`
- 403/404 → `index.html` (SPA routing)
- API behaviors: same API Gateway origins as main app (shared backend)

#### 11.4 Deploy

```bash
aws s3 sync dist/ s3://timetable-prod-admin-portal --delete
aws cloudfront create-invalidation --distribution-id <ADMIN_DIST_ID> --paths "/*"
```

---

## File Changes Summary

### New Files

| File | Description | Phase |
|------|-------------|-------|
| `packages/shared/prisma/schema.prisma` | Add Subscription, Payment, UpgradeRequest models; enhance School | 1 |
| `services/auth/src/schoolService.ts` | School CRUD, profile management | 2 |
| `services/auth/src/subscriptionService.ts` | Subscription CRUD, payment recording | 3 |
| `services/auth/src/upgradeRequestService.ts` | Upgrade request workflow | 3 |
| `packages/shared/src/helpers/emailHelper.ts` | AWS SES email utility | 10 |
| `packages/shared/src/models/schemas/school.schema.ts` | Zod schemas for school CRUD | 2 |
| `packages/shared/src/models/schemas/subscription.schema.ts` | Zod schemas for subscription/payment | 3 |
| `apps/admin-portal/` | Entire new frontend app | 5-9 |

### Modified Files

| File | Change | Phase |
|------|--------|-------|
| `services/auth/src/router.ts` | Add school, subscription, payment, upgrade-request routes | 2, 3 |
| `services/auth/src/controller.ts` | Add controllers for new endpoints | 2, 3 |
| `services/auth/src/service.ts` | Login guard for deactivated/expired schools | 2 |
| `services/auth/serverless.yml` | Add new httpApi events | 2, 3 |
| `services/timetable/src/service.ts` | Generation count check for BASIC tier | 4 |
| `services/dashboard/src/service.ts` | Add `getSuperAdminStats()` | 4 |
| `services/dashboard/src/router.ts` | Add super-admin-stats route | 4 |
| `apps/frontend/src/app/router.tsx` | Add subscription + school profile routes | 9 |
| `apps/frontend/src/features/auth/authSlice.ts` | Add readOnly flag + reason | 2 |

---

## API Endpoints Summary

### School Management (auth service)

| Endpoint | Method | Access |
|----------|--------|--------|
| `GET /api/auth/schools` | GET | SUPER_ADMIN |
| `POST /api/auth/schools` | POST | SUPER_ADMIN |
| `GET /api/auth/schools/{id}` | GET | SUPER_ADMIN, own SCHOOL_ADMIN |
| `PUT /api/auth/schools/{id}` | PUT | SUPER_ADMIN, own SCHOOL_ADMIN |
| `PUT /api/auth/schools/{id}/deactivate` | PUT | SUPER_ADMIN |
| `PUT /api/auth/schools/{id}/reactivate` | PUT | SUPER_ADMIN |

### Subscription (auth service)

| Endpoint | Method | Access |
|----------|--------|--------|
| `GET /api/auth/schools/{id}/subscription` | GET | SUPER_ADMIN, own SCHOOL_ADMIN |
| `PUT /api/auth/schools/{id}/subscription` | PUT | SUPER_ADMIN |
| `PUT /api/auth/schools/{id}/subscription/override-readonly` | PUT | SUPER_ADMIN |
| `GET /api/auth/schools/{id}/payments` | GET | SUPER_ADMIN, own SCHOOL_ADMIN |
| `POST /api/auth/schools/{id}/payments` | POST | SUPER_ADMIN |

### Upgrade Requests (auth service)

| Endpoint | Method | Access |
|----------|--------|--------|
| `POST /api/auth/schools/{id}/upgrade-requests` | POST | SCHOOL_ADMIN |
| `GET /api/auth/upgrade-requests` | GET | SUPER_ADMIN |
| `PUT /api/auth/upgrade-requests/{id}/approve` | PUT | SUPER_ADMIN |
| `PUT /api/auth/upgrade-requests/{id}/reject` | PUT | SUPER_ADMIN |

### Dashboard (dashboard service)

| Endpoint | Method | Access |
|----------|--------|--------|
| `GET /api/dashboard/super-admin-stats` | GET | SUPER_ADMIN |

---

## Implementation Order

```
Phase 1:  Database schema + migration (Subscription, Payment, UpgradeRequest, School profile)
Phase 2:  Backend -- School management API (CRUD, deactivation, login guard)
Phase 3:  Backend -- Subscription + payment + upgrade request API
Phase 4:  Backend -- Super admin dashboard stats + tier enforcement
Phase 5:  Admin portal frontend -- app setup (Vite, routing, auth, layout)
Phase 6:  Admin portal frontend -- dashboard page (stats, charts, revenue)
Phase 7:  Admin portal frontend -- schools management (list, create, detail)
Phase 8:  Admin portal frontend -- upgrade requests page
Phase 9:  Main app -- school admin subscription view + school profile edit
Phase 10: Email notifications (SES, templates, triggers)
Phase 11: Deployment (S3, CloudFront, API routing)
```

**Prerequisites:**
- Enhancement 7 (RBAC) must be complete -- SUPER_ADMIN role enforcement, user management endpoints

---

## Appendix: Current Code Inventory

### Auth Service
- **File:** `services/auth/src/service.ts`
- `register()` -- creates School + SchoolUser (SCHOOL_ADMIN)
- `login()` -- resolves SchoolUser records, determines role, returns schools list
- SUPER_ADMIN gets all schools on login
- Cognito integration for production auth

### School Model
- **File:** `packages/shared/prisma/schema.prisma` (lines 61-90)
- Fields: id, name, adminEmail, cognitoUserId, timestamps
- Root tenant entity with 25+ one-to-many relations

### SchoolUser Model
- **File:** `packages/shared/prisma/schema.prisma` (lines 96-108)
- Fields: id, email, schoolId (nullable for SUPER_ADMIN), role
- Enhancement 7 will add: name, phone, profilePicUrl, disabled, emailVerified

### Frontend Auth State
- **File:** `apps/frontend/src/features/auth/authSlice.ts`
- `userRole`: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER' | null
- `schools`: array of {id, name} for school switching
- `schoolId`, `schoolName`: currently active school
