# Timetable Generation Engine — Algorithm Flow

## Overview

The engine generates timetables for an entire school (or selected divisions) using a 5-step constraint propagation pipeline with cross-division elective awareness.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      TIMETABLE GENERATION PIPELINE                        │
│                                                                           │
│  ┌────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────┐  ┌────┐ │
│  │ Step 1 │─▶│ Step 2   │─▶│  Step 2b  │─▶│ Step 3+4 │─▶│St.5 │─▶│ DB │ │
│  │ Load   │  │Partition │  │Cross-Div  │  │ Place +  │  │Opt. │  │    │ │
│  │ Data   │  │Teachers  │  │ Detect    │  │Backtrack │  │     │  │    │ │
│  └────────┘  └──────────┘  └───────────┘  └──────────┘  └─────┘  └────┘ │
│                                                                           │
│  Input: Division IDs            Output: Chromosomes (slot→assignment)     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Load School Data

**File:** `whole_school_loader.py` → `load_whole_school_data()`

```
┌──────────────────────────────────────────────────────────────┐
│                       STEP 1: LOAD                            │
│                                                                │
│  For each division:                                            │
│    ├── Load period structure (slots, days, start/end times)    │
│    ├── Load assignments (subject, teacher, weightage)          │
│    ├── Load elective groups + parallel_sections                │
│    ├── Build logical assignments                               │
│    │   ├── Non-elective: 1 assignment = 1 LogicalAssignment    │
│    │   └── Elective: all members → 1 LogicalAssignment         │
│    │       with subject_teacher_map for parallel scheduling    │
│    └── Merge teacher info into global pool                     │
│                                                                │
│  Then:                                                         │
│    ├── Load teacher unavailability (global)                     │
│    │   normalized to (teacher_id, day_of_week, start_time)     │
│    │                                                           │
│    └── Compute flexibility score per assignment                 │
│        Returns (valid_slots, teacher_load) tuple:              │
│          valid_slots = count of slots satisfying:              │
│            - Day not excluded (HARD prefs)                      │
│            - Period not excluded (HARD prefs)                   │
│            - Teacher available                                  │
│          teacher_load = total weightage across all divisions   │
│            (tiebreaker only — busier teacher placed first       │
│             when valid_slots are equal)                         │
│                                                                │
│  Output:                                                       │
│    WholeSchoolData {                                           │
│      divisions: { div_id → SchoolData }                        │
│      teachers: { teacher_id → TeacherInfo }                    │
│      teacher_unavailable_times: set<(tid, dow, start_time)>    │
│      flexibility_scores: { div_id → [(la_idx, (slots, load))] }│
│    }                                                           │
└──────────────────────────────────────────────────────────────┘
```

### Flexibility Sorting (Two-Level)

Assignments are sorted for placement priority using two keys:

1. **Primary: `valid_slots` (ascending)** — fewer valid slots = more constrained = placed first
2. **Secondary: `teacher_load` (descending)** — busier teacher = placed first when slots are equal
3. **Tertiary: `class_sort_order` (descending)** — higher classes (XII) before lower (XI) as tiebreaker

This prevents the problem where heavily-shared-but-unconstrained teachers (e.g., English teacher in 14 divisions) get artificially prioritized over genuinely-restricted assignments (e.g., Life Skills with only 6 valid slots).

---

## Step 2: Teacher Time Partitioning

**File:** `whole_school_loader.py` → `compute_teacher_partitions()`

```
┌─────────────────────────────────────────────────────────────┐
│              STEP 2: TEACHER PARTITIONING                     │
│                                                               │
│  Purpose: Prevent shared teachers from being consumed         │
│  entirely by early-processed divisions                        │
│                                                               │
│  For each teacher:                                            │
│    │                                                          │
│    ├── Single-division teacher?                                │
│    │   YES → Give ALL available slots (no partition needed)    │
│    │                                                          │
│    └── Shared across 2+ divisions?                             │
│        │                                                      │
│        ├── Collect all available time slots                     │
│        │   (excluding unavailability)                           │
│        │                                                      │
│        ├── Division HAS HARD prefs for this teacher?            │
│        │   → Partition = only HARD-preferred slots              │
│        │                                                      │
│        └── Division has NO HARD prefs?                           │
│            → Partition = ALL available slots (non-exclusive)    │
│                                                               │
│  Output:                                                      │
│    teacher_partitions: {                                       │
│      teacher_id → { div_id → set of (day_of_week, start_time) }│
│    }                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 2b: Cross-Division Elective Detection

**File:** `whole_school_loader.py` → `_detect_cross_div_electives()`

```
┌──────────────────────────────────────────────────────────────┐
│           STEP 2b: CROSS-DIVISION ELECTIVE DETECTION          │
│                                                                │
│  For each elective group, count how many divisions it spans:   │
│                                                                │
│    num_divisions == 1 → PER-DIVISION (independent)             │
│      Scheduled per division, different slots allowed.           │
│      Examples: Dance/Music, Phy/Chem Lab, Acc/His              │
│                                                                │
│    num_divisions >= 2 → CROSS-DIVISION (shared)                │
│      Placed ONCE, stamped into ALL divisions simultaneously.   │
│      Teachers marked busy ONCE (they teach all divisions       │
│      at the same slot).                                        │
│      Examples: XII Maths/IP/Psy (3 divs),                      │
│                XI Maths/IP/Psy (3 divs),                       │
│                XII Bio/Cs (2 divs),                             │
│                X Mal/Hin (3 divs), IX Mal/Hin (3 divs)         │
│                                                                │
│  Output:                                                       │
│    cross_div_electives: { eg_id → [div_id, ...] }              │
│    cross_div_la_map: { (div_id, la_idx) → eg_id }              │
└──────────────────────────────────────────────────────────────┘
```

---

## Step 3: Demand-Driven Placement

**File:** `greedy.py` → `schedule_all()` main loop

The core scheduling step. Always resolves the tightest bottleneck first.

```
┌───────────────────────────────────────────────────────────────────┐
│                STEP 3: DEMAND-DRIVEN PLACEMENT                     │
│                                                                     │
│  Initialize:                                                        │
│    - Empty chromosome per division (all slots = -1)                  │
│    - teacher_busy = {} (global set)                                  │
│    - remaining = all items (cross-div electives appear ONCE)         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────┐          │
│  │  MAIN LOOP (repeat until all placed)                   │          │
│  │                                                         │          │
│  │  1. For EACH unplaced assignment-period:                 │          │
│  │     ├── Is it a cross-div elective?                      │          │
│  │     │   YES → _find_valid_slots_cross_div()              │          │
│  │     │         (slot must be empty in ALL divisions)       │          │
│  │     │                                                    │          │
│  │     └── NO  → _find_valid_slots()                        │          │
│  │               (per-division check)                       │          │
│  │                                                         │          │
│  │  2. Pick assignment with FEWEST valid slots              │          │
│  │     (most constrained = highest priority)                │          │
│  │                                                         │          │
│  │  3. valid_count > 0?                                      │          │
│  │     │                                                    │          │
│  │     ├── YES: Score each valid slot by demand              │          │
│  │     │   │    Place in slot with LOWEST demand             │          │
│  │     │   │                                                 │          │
│  │     │   ├── Cross-div? → _place_cross_div()               │          │
│  │     │   │   Stamp ALL divisions, mark teachers ONCE       │          │
│  │     │   │                                                 │          │
│  │     │   └── Per-div?  → _place_assignment()               │          │
│  │     │       Stamp one division, mark picked teachers      │          │
│  │     │                                                    │          │
│  │     └── NO (0 valid slots): → Go to STEP 4 (Backtrack)   │          │
│  │                                                         │          │
│  └───────────────────────────────────────────────────────┘          │
│                                                                     │
│  Output: chromosomes { div_id → numpy array }                       │
│  Stats: placed_ok, backtracked, fallback counts                     │
└───────────────────────────────────────────────────────────────────┘
```

### Slot Validity Checks

A slot is VALID for placement if ALL of the following pass:

```
┌──────────────────────────────────────────────────────────────┐
│              SLOT VALIDITY (_find_valid_slots)                 │
│                                                                │
│  ✓ Slot is empty (chromosome[gi] == -1)                        │
│  ✓ HARD day constraint: day not in excludedDays                │
│  ✓ HARD day constraint: day in preferredDays (if set)          │
│  ✓ HARD period constraint: period in preferredPeriodRange      │
│  ✓ HARD period constraint: period not in excludedPeriodRange   │
│  ✓ HARD maxPeriodsPerDay: not already at max for this day      │
│  ✓ HARD adjacency: if preferAdjacentPeriods + already placed,  │
│    slot MUST be adjacent to an existing placement              │
│  ✓ Teacher check via pick_available_teachers():                │
│    - For non-elective: ALL teachers must be free               │
│    - For elective: min(parallel_sections, unique_teachers)     │
│      teachers per subject must be free                         │
│    Checks: not unavailable, not busy, in partition             │
│                                                                │
│  For CROSS-DIVISION electives, additionally:                   │
│  ✓ Slot must be empty in ALL participating divisions           │
└──────────────────────────────────────────────────────────────┘
```

### Slot Scoring (Demand)

Among valid slots, the engine picks the one with the LOWEST score:

```
┌──────────────────────────────────────────────────────────────┐
│                    SLOT SCORING                                │
│                                                                │
│  demand = count of OTHER unplaced assignments that could       │
│           use this slot (via pick_available_teachers)           │
│                                                                │
│  Higher demand = more contested = WORSE choice                 │
│  (save this slot for someone who needs it more)                │
│                                                                │
│  Then adjust:                                                  │
│                                                                │
│  HARD adjacency (preferAdjacentPeriods + HARD):                │
│    Non-adjacent slots SKIPPED entirely (not just penalized)    │
│                                                                │
│  SOFT adjacency (preferAdjacentPeriods or global flag):        │
│    Adjacent to same subject?    → demand -= 10 (bonus)         │
│    Already placed, not adjacent → demand += 5  (penalty)       │
│                                                                │
│  SOFT day preferences (constraintType != HARD):                │
│    Day not in preferredDays → demand += 3                      │
│    Day in excludedDays      → demand += 3                      │
│                                                                │
│  SOFT period preferences:                                      │
│    Period outside preferredPeriodRange → demand += 3            │
│    Period in excludedPeriodRange       → demand += 3            │
│                                                                │
│  Spread penalty:                                               │
│    +2 per existing placement of this subject on same day       │
│                                                                │
│  Pick slot with LOWEST final score                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Step 4: Backtracking

**File:** `greedy.py` → `_try_backtrack()`

Triggered when Step 3 finds 0 valid slots for an assignment.

```
┌──────────────────────────────────────────────────────────────┐
│                  STEP 4: BACKTRACKING                          │
│                                                                │
│  Assignment X has 0 valid slots. Why?                          │
│  → Teacher is busy everywhere (placed in other divisions)      │
│                                                                │
│  1. Get teacher IDs from stuck assignment X                     │
│                                                                │
│  2. Search ALL placement history for entries involving          │
│     the SAME teacher(s). Pick up to 5 candidates.              │
│                                                                │
│  3. For each candidate:                                         │
│     ┌──────────────────────────────────────────┐               │
│     │  a. UNDO the candidate placement          │               │
│     │     (remove from chromosome, free teacher) │               │
│     │                                            │               │
│     │  b. Try placing X again                    │               │
│     │     (teacher now free at that slot)         │               │
│     │                                            │               │
│     │  c. X fits?                                │               │
│     │     ├── YES: Place X, then try re-placing  │               │
│     │     │   the undone candidate elsewhere      │               │
│     │     │   ├── Candidate fits? → SUCCESS        │               │
│     │     │   └── Doesn't fit? → Undo both,       │               │
│     │     │       try next candidate               │               │
│     │     │                                      │               │
│     │     └── NO: Restore candidate, try next     │               │
│     └──────────────────────────────────────────┘               │
│                                                                │
│  4. All candidates exhausted?                                   │
│     → FALLBACK: Place in any empty slot (accepts conflict)      │
│     → Violation reported in audit_violations()                  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Step 5: Local Optimization

**File:** `greedy.py` → `_local_optimize()`

After all assignments are placed, improve soft constraints via deterministic swaps.

```
┌──────────────────────────────────────────────────────────────┐
│              STEP 5: LOCAL OPTIMIZATION                        │
│                                                                │
│  For each division:                                            │
│    For each day:                                               │
│      For each pair of periods (i, j) in that day:              │
│                                                                │
│        Check: Would the swap create a teacher conflict?        │
│        YES → Skip                                              │
│                                                                │
│        NO → Compute soft score before and after swap:          │
│          - Adjacency (same subject adjacent? lower = better)   │
│          - Spread (>2 of same subject per day? penalty)        │
│          - Period preference (high-weightage in early periods) │
│                                                                │
│        Score improved? → KEEP swap                             │
│        Score same/worse? → REVERT swap                         │
│                                                                │
│  Result: Same hard constraints, better soft optimization       │
└──────────────────────────────────────────────────────────────┘
```

---

## Write to Database

**File:** `output_writer.py` → `write_timetable()`

```
┌──────────────────────────────────────────────────────────┐
│                    WRITE + AUDIT                           │
│                                                            │
│  For each division:                                        │
│    1. Upsert timetable record                               │
│    2. Delete old timetable_slots                            │
│    3. Insert new timetable_slots from chromosome            │
│       - Regular: 1 row per slot per member                  │
│       - Elective: distribute teachers across slots          │
│         based on parallel_sections (see below)              │
│    4. Mark generation_job as COMPLETED                      │
│    5. Run audit_violations() → list of                      │
│       human-readable, actionable constraint violations      │
│    6. Push division_completed via WebSocket                  │
│                                                            │
│  After all divisions:                                       │
│    Push generation_summary via WebSocket                     │
│                                                            │
│  Elective teacher distribution:                             │
│    For each subject in the elective:                        │
│      num_teachers <= parallel_sections:                     │
│        → ALL teachers in EVERY slot (parallel groups)       │
│      num_teachers > parallel_sections:                      │
│        → Teachers SPLIT the load across slots               │
│          (each gets `weightage` consecutive slots)          │
└──────────────────────────────────────────────────────────┘
```

---

## Elective Groups — Two Types

Elective groups come in two flavours. The engine handles them differently during scheduling.

### Differentiator

Query `division_assignments` grouped by `elective_group_id`: if an elective group has assignments in **more than one division**, it is **cross-division**. Otherwise it is **per-division**.

### Per-Division Electives (`num_divisions = 1`)

Each division schedules its elective independently. Different divisions can place the same elective group in different time slots.

**Examples:** Dance/Music (each class's own group), XI D Acc/His, XII C Bs/Polsci, XII A Phy/Chem Lab, XII B Phy/Chem Lab.

```
Class I A Dance/Music → only Class I A → placed independently
```

### Cross-Division Electives (`num_divisions > 1`)

All divisions in the group get the **same time slot**. The engine places the elective **once** and stamps all participating divisions' chromosomes simultaneously. Teachers teach students from all divisions in parallel at that slot, so teacher-busy is marked **once** (not per-division).

**Examples:**
- XII Maths/IP/Psy → XII A, XII B, XII C (3 divisions)
- XI Maths/IP/Psy → XI B, XI C, XI D (3 divisions)
- XII Bio/Cs → XII A, XII B (2 divisions)
- X Mal/Hin → X A, X B, X C (3 divisions)
- IX Mal/Hin → IX A, IX B, IX C (3 divisions)

```
XII Maths/IP/Psy placed at Mon P2:
  → XII A chromosome[Mon P2] = Maths/IP/Psy
  → XII B chromosome[Mon P2] = Maths/IP/Psy
  → XII C chromosome[Mon P2] = Maths/IP/Psy
  → Gopikadas (Psy) marked busy Mon P2 ONCE (not 3 times)
```

### parallel_sections and Teacher Scheduling

Within an elective group, each subject has a `parallel_sections` count (from `elective_group_subjects`). This determines how many teachers teach simultaneously:

- **parallel_sections >= num_unique_teachers**: ALL teachers teach simultaneously (e.g., Mal/Hin with 2 Malayalam + 1 Hindi teacher — all 3 in class at once).
- **parallel_sections < num_unique_teachers**: Teachers **split** the load. Only `parallel_sections` teachers need to be free per slot. The output writer distributes which teacher teaches which slot.

**Example: Maths/IP/Psy (parallel_sections=1 for each subject)**
- Maths: Julie + Amrutha, only 1 needed per slot → Julie teaches some slots, Amrutha others
- IP: Shijo + Anitha, only 1 needed per slot
- Psy: Gopikadas, only 1 (always him)
- **3 teachers needed simultaneously** (1 Maths + 1 IP + 1 Psy), not all 5

**Example: Mal/Hin (parallel_sections=2 for Malayalam)**
- Malayalam: Ambily + Neethu, parallel_sections=2 → both teach at once
- Hindi: Sujatha, parallel_sections=1 → she teaches at once
- **3 teachers needed simultaneously** (both Mal + Hindi)

---

## Scheduling Preferences

Each assignment can have scheduling preferences (JSONB column `scheduling_preferences`):

| Preference | HARD Behavior | SOFT Behavior |
|-----------|---------------|---------------|
| `preferredDays` | Slot filtered out if day not in list | +3 demand penalty |
| `excludedDays` | Slot filtered out if day in list | +3 demand penalty |
| `preferredPeriodRange` | Slot filtered out if outside range | +3 demand penalty |
| `excludedPeriodRange` | Slot filtered out if inside range | +3 demand penalty |
| `maxPeriodsPerDay` | Slot filtered out if day already at max | Not enforced |
| `preferAdjacentPeriods` | Non-adjacent slots SKIPPED entirely (after first placement) | -10 bonus if adjacent, +5 penalty if not |

For elective groups, preferences are **merged** across members:
- `constraintType`: HARD if ANY member is HARD
- `preferredDays`: intersection (days ALL members prefer)
- `excludedDays`: union (days ANY member excludes)
- `preferredPeriodRange`: tightest (max of mins, min of maxes)
- `preferAdjacentPeriods`: true if ANY member wants it

---

## Teacher Workload Calculation

The teacher list page shows `assignedPeriods / maxPeriodsPerWeek`. For cross-division elective teachers, the workload is calculated correctly:

- **Regular assignments**: `SUM(weightage)` per teacher
- **Per-division electives**: counted normally per assignment
- **Cross-division electives**: counted **once** per elective group per teacher (using `electiveGroup.periodsPerWeek`), not once per division

This prevents false "over limit" warnings for teachers like Gopikadas who appears in 5 divisions but teaches 16pw (not 48pw).

---

## End-to-End Flow

```
User clicks "Generate All"
        │
        ▼
Frontend → POST /api/timetables/generate { divisionIds: [...] }
        │
        ▼
Lambda creates generation_jobs, launches 1 ECS Fargate task
        │
        ▼
ECS Task runs main.py in batch mode
        │
        ▼
Step 1:  Load all 35 divisions' data ──────────────────── ~2s
         + compute flexibility (valid_slots, teacher_load)
        │
        ▼
Step 2:  Partition shared teachers ────────────────────── ~1s
         + detect cross-division electives (5 groups)
        │
        ▼
Step 3:  Demand-driven placement of ~1400 periods ────── ~5s
         • Cross-div electives placed once, stamped to all divs
         • parallel_sections: only needed teachers checked
         • HARD prefs: day, period, adjacency, maxPerDay enforced
         • SOFT prefs: demand penalties for preferred violations
         • Includes Step 4 backtracking on deadlocks
        │
        ▼
Step 5:  Local optimization for 35 divisions ──────────── ~3s
        │
        ▼
Write 35 timetables to database ──────────────────────── ~5s
         + audit violations per division (actionable messages)
        │
        ▼
Push generation_summary via WebSocket
        │
        ▼
Frontend shows results with per-division violation details
  • Hard violations: red badges (teacher conflicts, missing periods)
  • Soft violations: amber badges (adjacency gaps, spread issues)
  • Actionable messages: "reduce weightage or reassign teacher"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `data_loader.py` | Load single division, build SchoolData, LogicalAssignment with subject_teacher_map |
| `whole_school_loader.py` | Load all divisions, compute flexibility, partition teachers, detect cross-div electives |
| `ga/greedy.py` | Constraint propagation scheduler: demand-driven + backtracking + local optimization |
| `ga/fitness.py` | Evaluate solution (hard + soft constraints), audit_violations() for UI reporting |
| `output_writer.py` | Chromosome → database timetable_slots rows with elective teacher distribution |
| `main.py` | Entry points: single_division vs batch generation |
| `ws_pusher.py` | WebSocket progress events for real-time UI updates |
