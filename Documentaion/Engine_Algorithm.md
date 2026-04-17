# Timetable Generation Engine — Algorithm Flow

## Overview

The engine generates timetables for an entire school (or selected divisions) using a 5-step constraint propagation pipeline with cross-division elective awareness and block-atomic placement for adjacent-period subjects.

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
│    │   ├── Mark period_after_break: (day_idx, period_idx)      │
│    │   │   set for periods preceded by INTERVAL or LUNCH_BREAK │
│    │   └── Used for break-aware adjacency enforcement          │
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
│          For adjacency subjects: valid_slots = count of        │
│            valid BLOCK starting positions (not individual       │
│            slots), accounting for breaks between periods.       │
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

For **block-mode** assignments (adjacency + minPeriodsPerDay), `valid_slots` counts the number of valid contiguous block starting positions — not individual slots. This gives them appropriately higher priority since a block of 2 on Senior Block P2-P8 has only 3 valid pairs per day (P3+P4, P5+P6, P7+P8) vs 7 individual slots.

**Teacher contention adjustment:** For teachers who teach across multiple divisions, `valid_slots` is reduced by their other-division load. If Aleena teaches 17pw across 7 divisions and Library (w=1) in XI B has 40 raw valid slots, the effective valid slots is `40 - 16 = 24` (16 periods in other divisions will consume those time slots). This prevents low-weightage assignments like Library from being ranked as "very flexible" and placed last, when their teacher will actually be busy in most time slots.

```
Example:
  Library (Aleena, w=1) in XI B
  Raw valid_slots = 40 (no HARD prefs)
  Aleena's other-division load = 16pw
  Effective valid_slots = 40 - 16 = 24
  → Ranked HIGHER than a subject with 30 raw valid slots
  → Placed earlier, before other subjects fill XI B's slots
```

**Division constraint pressure:** Each division gets a pressure score (0.0–1.0) based on how many of its assignment-periods carry HARD constraints (adjacency, period range, excluded days, maxPeriodsPerDay, minPeriodsPerDay, or teacher in 3+ divisions). High-pressure divisions have their assignments' `valid_slots` further reduced by `valid_slots / (1 + pressure)`, ensuring ALL assignments in hard-to-schedule divisions get placed before equivalent ones in easier divisions.

```
Division pressure calculation:
  For each assignment: check if ANY HARD constraint is set
  pressure = constrained_periods / total_periods

Example:
  XI B: 32 of 40 periods have HARD constraints → pressure = 0.80
  VI B:  6 of 40 periods have HARD constraints → pressure = 0.15

  Library (Aleena) in XI B:
    After teacher contention: valid_slots = 24
    After pressure (÷1.80):  valid_slots = 13
    
  Library in VI B:
    After teacher contention: valid_slots = 30
    After pressure (÷1.15):  valid_slots = 26
    
  → XI B Library placed BEFORE VI B Library
```

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

## Step 2c: Elective Teacher Conflict Detection

**File:** `greedy.py` → `_build_elective_slot_reserves()`

```
┌──────────────────────────────────────────────────────────────┐
│        STEP 2c: ELECTIVE TEACHER CONFLICT DETECTION           │
│                                                                │
│  For each division, scan per-division elective groups:         │
│                                                                │
│  If two per-division electives in the SAME division share a    │
│  teacher (e.g., Devassia teaches History in Acc/His AND        │
│  Political Science in Bs/Polsci in XII C):                     │
│                                                                │
│    → Record the conflict pair                                  │
│    → During slot scoring, add demand penalty (+5) when         │
│      placing one elective on a day where the conflicting       │
│      elective hasn't placed yet (spreads them across days)     │
│                                                                │
│  This is SOFT scoring, not hard filtering — the constraint     │
│  is too tight for hard enforcement when combined with          │
│  period preferences and maxPeriodsPerDay.                      │
└──────────────────────────────────────────────────────────────┘
```

---

## Step 3: Demand-Driven Placement

**File:** `greedy.py` → `schedule_all()` main loop

The core scheduling step. Always resolves the tightest bottleneck first. Supports two placement modes: **single-mode** (1 slot at a time) and **block-mode** (N contiguous slots at once).

### Block-Atomic Placement

Assignments are classified into placement modes based on scheduling preferences:

```
┌──────────────────────────────────────────────────────────────┐
│              PLACEMENT MODE CLASSIFICATION                     │
│                                                                │
│  preferAdjacentPeriods=true AND minPeriodsPerDay >= 2 (HARD)?  │
│                                                                │
│    YES → BLOCK MODE                                            │
│    │   block_size = minPeriodsPerDay (e.g., 2, 3, 4)           │
│    │   full_blocks = weightage // block_size                   │
│    │   remainder = weightage % block_size                      │
│    │                                                           │
│    │   Examples:                                               │
│    │     Physics w=8, minPerDay=2 → 4 block placements         │
│    │     English w=7, minPerDay=2 → 3 blocks + 1 single        │
│    │     Lab w=4, minPerDay=4 → 1 block of 4 slots             │
│    │     CCA w=2, minPerDay=2 → 1 block of 2 slots             │
│    │                                                           │
│    NO → SINGLE MODE                                            │
│        Place 1 slot at a time (standard behavior)              │
│        Examples: Economics w=8, English w=6 (no adjacency)     │
│                                                                │
│  Block-mode guarantees:                                        │
│    • No isolated single periods (block is atomic)              │
│    • No breaks/intervals within the block                      │
│    • All N slots on the SAME day                               │
│    • minPeriodsPerDay satisfied by construction                 │
└──────────────────────────────────────────────────────────────┘
```

### Auto-Relaxation of Blocks

**File:** `greedy.py` → `_auto_relax_blocks()`

Before placement begins, the engine checks each division for block capacity overflows and automatically demotes the minimum number of blocks to single-mode.

```
┌──────────────────────────────────────────────────────────────┐
│              AUTO-RELAXATION OF BLOCKS                         │
│                                                                │
│  For each division:                                            │
│    1. Count total blocks needed (all block-mode assignments)   │
│    2. Count available block positions in period structure       │
│       (contiguous break-free slots per day × num_days)         │
│    3. If demand > supply (deficit exists):                     │
│                                                                │
│       Relaxation priority (relax first → last):                │
│         ① Per-division non-elective subjects (most flexible)   │
│         ② Per-division elective subjects                       │
│         ③ Cross-division electives (NEVER relax)               │
│                                                                │
│       Within same tier: relax the subject with highest         │
│       weightage (most periods = most flexibility as singles)   │
│                                                                │
│       For each subject to relax:                               │
│         Move 1 block entry → block_size single entries         │
│         Repeat until deficit = 0                               │
│                                                                │
│  Example — XI A (Senior Block, P2-P8):                         │
│    Valid block pairs per day: P3+P4, P5+P6, P7+P8 = 3          │
│    Available: 3 × 5 days = 15 positions                        │
│    Demand: Maths(4) + Physics(4) + Chemistry(4) + Biology(4)   │
│          = 16 blocks → deficit = 1                             │
│                                                                │
│    Auto-relax: Chemistry (8pw, highest weightage in tier ①)    │
│      → 3 blocks + 2 singles (was 4 blocks)                    │
│    Result: 15 blocks needed = 15 available ✓                   │
│                                                                │
│  The relaxed periods still get placed — just not as            │
│  adjacent pairs. SOFT adjacency scoring still tries to         │
│  place them near other periods of the same subject.            │
│                                                                │
│  TWO-LEVEL RELAXATION:                                         │
│                                                                │
│  Level 1 (Pre-placement): structural capacity check.           │
│    Fires before the loop when block demand > positions.        │
│                                                                │
│  Level 2 (Runtime demotion): if a block-mode item has 0        │
│    valid block positions during placement (other subjects       │
│    consumed the positions), demote it to singles on the fly.   │
│    The singles re-enter the demand-driven loop with proper     │
│    constraint checking — NOT force-placed in random slots.     │
│    This handles cases where structural capacity was enough     │
│    but runtime contention consumed the valid positions.        │
└──────────────────────────────────────────────────────────────┘
```

### Subject-Level maxPeriodsPerDay

The `maxPeriodsPerDay` constraint applies to the **subject** across all teachers, not per-assignment. If Maths has two teachers (Smitha w=4, Sahana w=3) and `maxPerDay=2`, a day can have at most 2 Maths periods total — regardless of which teacher.

```
Without subject-level:  Mon could get Smitha P1 + Smitha P3 + Sahana P5 = 3 Maths
With subject-level:     Mon gets at most 2 Maths (from any combination of teachers)
```

This prevents day-starvation for split-teacher subjects (e.g., Maths w=7 with maxPerDay=2 needs 4 days, not 3).

### Main Placement Loop

```
┌───────────────────────────────────────────────────────────────────┐
│                STEP 3: DEMAND-DRIVEN PLACEMENT                     │
│                                                                     │
│  Initialize:                                                        │
│    - Empty chromosome per division (all slots = -1)                  │
│    - TeacherBusyTracker (time-range overlap detection)               │
│    - remaining items:                                                │
│      Block-mode: full_blocks entries of size N + optional remainder  │
│      Single-mode: weightage entries of size 1                        │
│    - Cross-div electives appear ONCE (first division)                │
│                                                                     │
│  ┌───────────────────────────────────────────────────────┐          │
│  │  MAIN LOOP (repeat until all placed)                   │          │
│  │                                                         │          │
│  │  1. For EACH unplaced item:                              │          │
│  │     ├── Is it a cross-div elective?                      │          │
│  │     │   YES → _find_valid_slots_cross_div()              │          │
│  │     │         (slot must be empty in ALL divisions)       │          │
│  │     │                                                    │          │
│  │     └── NO  → _find_valid_slots()                        │          │
│  │               ├── Block-mode? Find valid BLOCK positions  │          │
│  │               │   (N contiguous empty + break-free slots) │          │
│  │               └── Single-mode? Find valid individual slots│          │
│  │                                                         │          │
│  │  2. Pick item with FEWEST valid positions                │          │
│  │     (most constrained = highest priority)                │          │
│  │                                                         │          │
│  │  3. valid_count > 0?                                      │          │
│  │     │                                                    │          │
│  │     ├── YES: Score each valid position by demand          │          │
│  │     │   │                                                 │          │
│  │     │   │  LOOKAHEAD (single-mode, non-cross-div):        │          │
│  │     │   │  For top 5 candidates (by demand):              │          │
│  │     │   │    1. Tentatively place assignment at slot       │          │
│  │     │   │    2. Check: do ALL other remaining assignments  │          │
│  │     │   │       in THIS division still have ≥1 valid slot?│          │
│  │     │   │    3. YES → commit this slot (safe choice)       │          │
│  │     │   │       NO  → undo, try next candidate            │          │
│  │     │   │  This prevents "stranding" — e.g. placing       │          │
│  │     │   │  English in a slot that blocks Library's only    │          │
│  │     │   │  remaining teacher availability.                │          │
│  │     │   │                                                 │          │
│  │     │   ├── Block-mode: stamp N consecutive slots         │          │
│  │     │   │   + mark teacher busy for all N                 │          │
│  │     │   │                                                 │          │
│  │     │   ├── Cross-div? → _place_cross_div()               │          │
│  │     │   │   Stamp ALL divisions, mark teachers ONCE       │          │
│  │     │   │                                                 │          │
│  │     │   └── Per-div single? → _place_assignment()         │          │
│  │     │       Stamp one slot, mark picked teachers          │          │
│  │     │                                                    │          │
│  │     └── NO (0 valid positions): → Step 4 (Backtrack)      │          │
│  │                                                         │          │
│  └───────────────────────────────────────────────────────┘          │
│                                                                     │
│  Output: chromosomes { div_id → numpy array }                       │
│  Stats: placed_ok, backtracked, fallback counts                     │
│  Failure analysis: actionable diagnoses for each fallback           │
└───────────────────────────────────────────────────────────────────┘
```

### Slot Validity Checks

A slot (or block starting position) is VALID if ALL of the following pass:

```
┌──────────────────────────────────────────────────────────────┐
│          SLOT VALIDITY (_find_valid_slots)                     │
│                                                                │
│  For SINGLE MODE:                                              │
│  ✓ Slot is empty (chromosome[gi] == -1)                        │
│  ✓ HARD day constraint: day not in excludedDays                │
│  ✓ HARD day constraint: day in preferredDays (if set)          │
│  ✓ HARD period constraint: period in preferredPeriodRange      │
│  ✓ HARD period constraint: period not in excludedPeriodRange   │
│  ✓ HARD maxPeriodsPerDay: not already at max for this day      │
│  ✓ HARD adjacency: if preferAdjacentPeriods + already placed,  │
│    slot MUST be adjacent to an existing placement              │
│    (break-aware: no interval/lunch between them)               │
│  ✓ Teacher check via pick_available_teachers()                 │
│                                                                │
│  For BLOCK MODE (size N):                                      │
│  ✓ ALL N consecutive slots are empty                           │
│  ✓ NO breaks/intervals between any consecutive pair            │
│    (uses period_after_break set from period structure)          │
│  ✓ ALL N slots on the same day                                 │
│  ✓ ALL N slots within HARD period range                        │
│  ✓ ALL N slots satisfy HARD day constraints                    │
│  ✓ existing_count + N <= maxPeriodsPerDay for that day         │
│  ✓ Teacher(s) available at ALL N slot times                    │
│                                                                │
│  For CROSS-DIVISION electives, additionally:                   │
│  ✓ Slot(s) must be empty in ALL participating divisions        │
└──────────────────────────────────────────────────────────────┘
```

### Break-Aware Adjacency

The engine uses `period_after_break` (computed from the period structure) to determine which periods are truly contiguous. Two periods are only considered adjacent if there is no INTERVAL, LUNCH_BREAK, or any non-PERIOD slot between them.

```
Senior Block example (Monday):
  P1  09:00-09:45
  P2  09:45-10:30      ← P1+P2 adjacent (no break)
  -- INTERVAL 10:30-10:45 --
  P3  10:45-11:30      ← P2+P3 NOT adjacent (interval between)
  P4  11:30-12:15      ← P3+P4 adjacent
  -- LUNCH 12:15-12:45 --
  P5  12:45-13:30      ← P4+P5 NOT adjacent (lunch between)
  P6  13:30-14:15      ← P5+P6 adjacent
  -- INTERVAL 14:15-14:30 --
  P7  14:30-15:15      ← P6+P7 NOT adjacent (interval between)
  P8  15:15-16:00      ← P7+P8 adjacent

Valid block-of-2 positions (P2-P8 range): P3+P4, P5+P6, P7+P8
                                          (3 per day × 5 days = 15)
Invalid: P2+P3 (interval), P4+P5 (lunch), P6+P7 (interval)
```

### Slot Scoring (Demand)

Among valid positions, the engine picks the one with the LOWEST score:

```
┌──────────────────────────────────────────────────────────────┐
│                    SLOT SCORING                                │
│                                                                │
│  Base demand = count of OTHER unplaced assignments that could  │
│                use this slot (via pick_available_teachers)      │
│  For block-mode: average demand across all N slots in block    │
│                                                                │
│  Higher demand = more contested = WORSE choice                 │
│  (save this slot for someone who needs it more)                │
│                                                                │
│  Then adjust:                                                  │
│                                                                │
│  HARD adjacency (HARD + preferAdjacentPeriods):                │
│    Non-adjacent slots SKIPPED entirely (not just penalized)    │
│    (only applies to single-mode; block-mode is always valid)   │
│                                                                │
│  SOFT adjacency (SOFT preferAdjacentPeriods or global flag):   │
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
│  maxPeriodsPerDay-aware scoring:                               │
│    Days running low on room for this subject → +20             │
│    Days about to hit the cap → +10                             │
│    (prevents day starvation for subjects needing many days)     │
│                                                                │
│  Scarcity-aware P2-P8 scoring:                                 │
│    Unrestricted subjects penalized for using P2-P8 slots       │
│    when restricted subjects still need them                    │
│                                                                │
│  Elective teacher conflict scoring:                            │
│    Per-div elective sharing teacher with another elective       │
│    in same division → +5 on days where partner hasn't placed   │
│                                                                │
│  Pick position with LOWEST final score                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Step 4: Backtracking

**File:** `greedy.py` → `_try_backtrack()`

Triggered when Step 3 finds 0 valid positions for an assignment.

```
┌──────────────────────────────────────────────────────────────┐
│                  STEP 4: BACKTRACKING                          │
│                                                                │
│  Assignment X has 0 valid positions. Why?                      │
│  → Teacher is busy everywhere (placed in other divisions)      │
│                                                                │
│  1. Get teacher IDs from stuck assignment X                     │
│                                                                │
│  2. Search ALL placement history for entries involving          │
│     the SAME teacher(s). Pick up to 5 candidates.              │
│     (History entries store full block for block-mode items)     │
│                                                                │
│  3. For each candidate:                                         │
│     ┌──────────────────────────────────────────┐               │
│     │  a. UNDO the candidate placement          │               │
│     │     (remove from chromosome, free teacher) │               │
│     │     For blocks: undo all N slots atomically│               │
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
│     → Failure analysis generated (actionable suggestion)        │
│     → Violation reported in audit_violations()                  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Failure Analysis

When a placement fails and falls back, the engine generates a structured failure analysis with:

- **Type**: `TEACHER_OVERLOAD`, `TEACHER_BUSY`, `ELECTIVE_TEACHER_CONFLICT`, `PERIOD_PREFERENCE_CONFLICT`, `MAX_PER_DAY_CONFLICT`, `DAY_PREFERENCE_CONFLICT`, `DIVISION_FULL`, `PLACEMENT_FAILED`
- **Division and subject names** (human-readable)
- **Teacher names and loads** (total pw across all divisions)
- **Message**: what went wrong
- **Suggestion**: actionable data fix the user can make
- **Details**: slot breakdown (full, dayBlocked, periodBlocked, maxPerDayBlocked, teacherBusy, etc.)

Failure analyses are:
1. Sent via WebSocket in the `generation_summary` event
2. Persisted to `generation_jobs.result_summary` JSONB column
3. Displayed in the frontend's Generation Progress panel

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
│          - Adjacency (break-aware: same subject adjacent       │
│            with no interval between? lower = better)           │
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
│    Save batch result_summary (including failure analyses)    │
│    to generation_jobs.result_summary JSONB column            │
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
| `maxPeriodsPerDay` | Slot filtered out if day already at max. Scoring: +20 if running low on days, +10 if day near cap | Not enforced as filter |
| `minPeriodsPerDay` | With adjacency ON: first placement on a day requires N contiguous break-free empty slots | Not enforced |
| `preferAdjacentPeriods` | Break-aware: non-adjacent slots SKIPPED (after first placement). With minPerDay: enables block-atomic placement mode | -10 bonus if adjacent, +5 penalty if not |

For elective groups, preferences are **merged** across members:
- `constraintType`: HARD if ANY member is HARD
- `preferredDays`: intersection (days ALL members prefer)
- `excludedDays`: union (days ANY member excludes)
- `preferredPeriodRange`: tightest (max of mins, min of maxes)
- `preferAdjacentPeriods`: true if ANY member wants it

---

## Teacher Busy Tracking

**File:** `greedy.py` → `TeacherBusyTracker`

The engine uses time-range overlap detection instead of exact start-time matching. This is critical for schools with multiple period structures (e.g., Default for I-IX and Senior Block for X-XII) where periods overlap in time but have different start/end times.

```
Default P1:  09:20-10:00
Senior P1:   09:00-09:45    ← overlaps with Default P1!

TeacherBusyTracker stores: (teacher_id, day_of_week) → [(start, end), ...]
Overlap check: s < end_time AND start_time < e
```

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
  • Clears old generation results from UI + localStorage
  • Shows progress immediately (loading phase)
        │
        ▼
Lambda creates generation_jobs, launches 1 ECS Fargate task
        │
        ▼
ECS Task runs main.py in batch mode
        │
        ▼
Step 1:  Load all 35 divisions' data ──────────────────── ~2s
         + compute flexibility (valid_slots / block_positions)
         + mark period_after_break for adjacency
        │
        ▼
Step 2:  Partition shared teachers ────────────────────── ~1s
         + detect cross-division electives (5 groups)
         + detect intra-division elective teacher conflicts
        │
        ▼
Step 3:  Demand-driven placement of ~1400 periods ────── ~5s
         • Block-mode: adjacent subjects placed as atomic blocks
         • Cross-div electives placed once, stamped to all divs
         • parallel_sections: only needed teachers checked
         • Break-aware adjacency: no blocks spanning intervals
         • HARD prefs: day, period, adjacency, maxPerDay enforced
         • SOFT prefs: demand penalties for preferred violations
         • Includes Step 4 backtracking on deadlocks
         • Failure analysis generated for each fallback
        │
        ▼
Step 5:  Local optimization for 35 divisions ──────────── ~3s
        │
        ▼
Write 35 timetables to database ──────────────────────── ~5s
         + audit violations per division (actionable messages)
         + save batch result_summary with failure analyses
        │
        ▼
Push generation_summary via WebSocket
        │
        ▼
Frontend shows results:
  • Per-division violation details (expandable)
  • Failure analysis section with actionable suggestions
    grouped by division, color-coded by type, with
    teacher load badges and green suggestion boxes
```

---

## Key Files

| File | Purpose |
|------|---------|
| `data_loader.py` | Load single division, build SchoolData with period_after_break, LogicalAssignment with subject_teacher_map |
| `whole_school_loader.py` | Load all divisions, compute flexibility (block-aware), partition teachers, detect cross-div electives |
| `ga/greedy.py` | Constraint propagation scheduler: block-atomic + single placement, demand-driven + backtracking + local optimization + failure analysis |
| `ga/fitness.py` | Evaluate solution (hard + soft constraints), audit_violations() for UI reporting |
| `output_writer.py` | Chromosome → database timetable_slots rows with elective teacher distribution + batch result summary |
| `main.py` | Entry points: single_division vs batch generation, orchestrates all steps |
| `ws_pusher.py` | WebSocket progress events for real-time UI updates including failure analysis |
