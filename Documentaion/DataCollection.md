# School Timetable Management System
## Data Collection Guide

**Version**: 1.0  
**Date**: March 11, 2026  
**Purpose**: Reference checklist for collecting all data required to set up the timetable management tool.

---

## Collection Sequence

Collect data in the order below. Items 1–5 are independent and can be gathered in parallel. Items 6 and 7 depend on 4 and 5 being complete.

| Order | Item | Depends On |
|-------|------|-----------|
| 1 | Academic Year | 2026-2027 |
| 2 | Bell Schedule | — |
| 3 | Classes & Divisions | — |
| 4 | Subjects | — |
| 5 | Teachers | — |
| 6 | Teacher Unavailability | 5 |
| 7 | Division Assignments | 3, 4, 5 |

---

## 1. Academic Year

Collect from: **Principal / Admin Office**

| Field | Example | Notes |
|-------|---------|-------|
| Academic year label | 2026–27 | As used officially by the school |
| Start date | 01 May 2026 | First working day of the year |
| End date | 31 March 2027 | Last working day of the year |

---

## 2. Bell Schedule (Period & Break Timings)

Collect from: **Admin Office / School Notice Board**

List every slot in the school day in chronological order:

| Slot | Slot Type | Start Time | End Time | Notes |
|------|-----------|-----------|---------|-------|
| Period 1 | Period | | | |
| Period 2 | Period | | | |
| Interval | Interval | | | After Period 2 |
| Period 3 | Period | | | |
| Period 4 | Period | | | |
| Lunch Break | Lunch Break | | | After Period 4 |
| Period 5 | Period | | | |
| Period 6 | Period | | | |
| Interval | Interval | | | After Period 6 |
| Period 7 | Period | | | |
| Period 8 | Period | | | |
| Period 9 | Period | | | **Classes X–XII only** |

> **Note**: The same timings apply to all days of the week (Monday–Friday).

---

## 3. Classes & Divisions

Collect from: **Admin Office / Class Register**

For each class from I to XII, list all active divisions. Delete rows for divisions that do not exist in your school.

> **Note**: Classes I–X require only a division letter (Stream column is not applicable). Classes XI–XII require both a division letter and a stream/group name (e.g., Science, Commerce, Humanities). Stream names are free-form — enter exactly as you want them to appear on the timetable.

**Classes I–X** — enter all division letters for each class as a comma-separated list:

| Class | Divisions (comma-separated) |
|-------|-----------------------------|
| KG | *(single class, no divisions)* |
| Class I | A, B, C |
| Class II | A, B |
| Class III | A, B |
| Class IV | A, B |
| Class V | A, B, C |
| Class VI | A, B |
| Class VII | A, B, C |
| Class VIII | A, B, C |
| Class IX | A, B, C |
| Class X | A, B |

---

**Classes XI & XII** — each division needs a separate row because of the stream/group name:

| Class | Division Letter | Stream / Group Name |
|-------|----------------|---------------------|
| Class XI | A | Science |
| Class XI | B | Science |
| Class XI | C | Commerce |
| Class XI | D | Humanities |
| Class XII | A | Science |
| Class XII | B | Science |
| Class XII | C | Commerce |
| Class XII | D | Humanities |

---

## 4. Subjects

Collect from: **Academic Coordinator**

> **Note**: Each subject must have a unique name. Include all subjects taught across all classes in the school. Add any missing subjects in the blank rows at the bottom.

| # | Subject Name | Abbreviation | Verify / Confirm |
|---|-------------|--------------|------------------|
| 1 | English | ENG | ✓ |
| 2 | Hindi | HIN | ✓ |
| 3 | Malayalam | MAL | ✓ |
| 4 | Mathematics | MATHS | ✓ |
| 5 | Science | SCI | ✓ |
| 6 | Social Studies | SOC | ✓ |
| 7 | Environmental Studies | EVS | ✓ |
| 8 | Physics | PHY | ✓ |
| 9 | Chemistry | CHEM | ✓ |
| 10 | Biology | BIO | ✓ |
| 11 | Computer Science | CS | ✓ |
| 12 | Informatics Practices | IP | ✓ |
| 13 | Information Technology | IT | ✓ |
| 14 | Business Studies | BST | ✓ |
| 15 | Accountancy | ACC | ✓ |
| 16 | Economics | ECO | ✓ |
| 17 | History | HIST | ✓ |
| 18 | Political Science | POL SCI | ✓ |
| 19 | Psychology | PSY | ✓ |
| 20 | Informatics Practices / Psychology | IP/PSY | ✓ | *XI D & XII D only* |
| 21 | General Knowledge | GK | ✓ |
| 22 | Life Skills | LS | ✓ |
| 23 | Physical Training | PT | ✓ |
| 24 | Drawing | DRW | ✓ |
| 25 | Dance / Music | DAN/MUS | ✓ |
| 26 | Library | LIB | ✓ |
| 27 | STEAM | STEAM | ✓ |
| 28 | Little Prodigy | LP | ✓ |
| 29 | Co-Curricular Activities | CCA | ✓ |
| 30 | Maths/IP | MATHS/IP | ✓ | *Combined period for XI & XII* |
| 31 | Maths/IP/PSY | MATHS/IP/PSY | ✓ | *Combined period for XI & XII* |
| 32 | | | |
| 33 | | | |
| 34 | | | |
| 35 | | | |

---

## 5. Teachers

Collect from: **HR / Academic Coordinator**

> **Note**: Subjects are pre-filled based on the groupings provided during data collection. Verify and update each row — a teacher may qualify to teach multiple subjects across different classes. Subject names must exactly match those listed in Section 4.

| # | Full Name | Subjects Qualified to Teach *(verify & update)* | Contact *(optional)* |
|---|-----------|------------------------------------------------|----------------------|
| 1 | Ashamol | Science, Physics, Chemistry, Biology | |
| 2 | Roshni | Science, Physics, Chemistry, Biology | |
| 3 | Lin Maria | Science, Physics, Chemistry, Biology | |
| 4 | Asha Susan Jacob | Science, Physics, Chemistry, Biology | |
| 5 | Anu S Nair | Science, Physics, Chemistry, Biology | |
| 6 | Manju | Science, Physics, Chemistry, Biology | |
| 7 | Anu Mathew | Science, Physics, Chemistry, Biology | |
| 8 | Renila Mary John | Science, Environmental Studies, Physical Training, Co-Curricular Activities | |
| 9 | Dominic Saj Jose | English | |
| 10 | Siya | English | |
| 11 | Deepa | English | |
| 12 | Siju Samuel | English | |
| 13 | Anju Sebastian | English | |
| 14 | Anju Maria Joseph | English | |
| 15 | Aleena Josy | English | |
| 16 | Ansu | English | |
| 17 | Devassia | Social Studies, History, Political Science, Economics | |
| 18 | Saritha Mohan | Social Studies, History, Political Science, Economics | |
| 19 | Sonu Mathew | Social Studies, History, Political Science, Economics | |
| 20 | Albin Benny | Social Studies, History, Political Science, Economics | |
| 21 | Athira | Social Studies, History, Political Science, Economics | |
| 22 | Aleena Joseph | Social Studies, Environmental Studies, General Knowledge, Physical Training | |
| 23 | Reshma P Nair | Social Studies, Political Science, Environmental Studies | |
| 24 | Niji Abraham | Malayalam | |
| 25 | Ambily | Malayalam | |
| 26 | Jayasree | Malayalam | |
| 27 | Prabha | Malayalam | |
| 28 | Julie | Mathematics | |
| 29 | Amrutha | Mathematics | |
| 30 | Saritha K | Mathematics, STEAM | |
| 31 | Rajani | Mathematics | |
| 32 | Remya | Mathematics | |
| 33 | Smitha | Mathematics | |
| 34 | Sahana | Mathematics | |
| 35 | Gopikadas | Psychology | |
| 36 | Anumol | Psychology | |
| 37 | Aneesha | Hindi | |
| 38 | Jaya | Hindi | |
| 39 | Deepthi | Hindi | |
| 40 | Sreethu | Hindi | |
| 41 | Fr. Josh Kanjooparambil | Life Skills | |
| 42 | Fr. Antony | Life Skills | |
| 43 | Fr. Jyothis | Life Skills | |
| 44 | Br. Jiss | Life Skills, Social Studies | |
| 45 | Sulajamma | Library | |
| 46 | Sreejesh | Drawing | |
| 47 | Akash | Life Skills, Physical Training, STEAM, Library | |
| 48 | Akhil | Physical Training, Library, STEAM | |
| 49 | Nayana | Library, Mathematics, STEAM | |
| 50 | Mahesh Chandran | Library, STEAM, Mathematics | |
| 51 | Anitha | Informatics Practices, Information Technology, Life Skills, STEAM | |
| 52 | Swetha | Computer Science, Information Technology | |
| 53 | Ann | Computer Science, Information Technology | |
| 54 | Shijo C Mathew | Informatics Practices, Information Technology | |
| 55 | | | |
| 56 | | | |
| 57 | | | |

> **Action required**: Verify subject assignments for all rows. A teacher may cover additional or different subjects than listed.

---

## 6. Teacher Unavailability

Collect from: **Each Teacher / Head of Department**

For each teacher who has restricted availability:

| Teacher Name | Day | Period(s) Unavailable | Reason (optional) |
|-------------|-----|-----------------------|------------------|
| | e.g., Monday | e.g., Period 1, Period 2 | e.g., Part-time, shared campus |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |


> **Note**: Teachers with no restrictions need not be listed here — the system assumes full availability by default. Availability is scoped to the academic year.

---

## 7. Division Assignments (Subject–Teacher–Weightage)

Collect from: **Each Class Teacher / Head of Department**

> **Data Source**: Extracted from previous year class-wise timetables and subject weightage tables. Teachers are cross-referenced from teacher timetables. **Verify subject-teacher mappings and update for the new academic year.**

> **Important rules**:
> - Subject and teacher names must exactly match those in Sections 4 and 5.
> - The same subject may appear more than once per division with a **different teacher**.
> - Weightage = number of periods **per week**.
> - Total weightage per division: **40/week** (Classes I–IX, 8 periods × 5 days) or **45/week** (Classes X–XII, 9 periods × 5 days).

---

### CLASS I A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siya | 7 | |
| 2 | Malayalam | Niji Abraham | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Mathematics | Julie | 7 | |
| 5 | Environmental Studies | Renila Mary John | 5 | |
| 6 | General Knowledge | Ansu | 1 | |
| 7 | Life Skills | Akash | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | Akash | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance / Music | Sulajamma | 1 | |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Akhil | 1 | |
| 14 | Little Prodigy | Anumol | 2 | |
| | **Total** | | **40** | |

---

### CLASS I B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siya | 7 | |
| 2 | Malayalam | Niji Abraham | 5 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Mathematics | Julie | 7 | |
| 5 | Environmental Studies | Renila Mary John | 5 | |
| 6 | General Knowledge | Ansu | 1 | |
| 7 | Life Skills | Akash | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | Akash | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance / Music | Sulajamma | 1 | |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Mahesh Chandran | 1 | |
| 14 | Little Prodigy | Anumol | 2 | |
| | **Total** | | **40** | |

---

### CLASS I C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Ansu | 7 | |
| 2 | Malayalam | Niji Abraham | 5 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Mathematics | Julie | 7 | |
| 5 | Environmental Studies | Renila Mary John | 5 | |
| 6 | General Knowledge | *verify* | 1 | |
| 7 | Life Skills | *verify* | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | *verify* | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance / Music | Sulajamma | 1 | |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | *verify* | 1 | |
| 14 | Little Prodigy | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS II A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Ansu | 6 | |
| 2 | Malayalam | Prabha | 4 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Mathematics | Sahana | 7 | |
| 5 | Environmental Studies | Aleena Joseph | 5 | |
| 6 | General Knowledge | *verify* | 1 | |
| 7 | Life Skills | *verify* | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | *verify* | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance / Music | Sulajamma | 1 | |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Nayana | 1 | |
| 14 | Little Prodigy | Anumol | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS II B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Ansu | 6 | |
| 2 | Malayalam | Prabha | 4 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Mathematics | Sahana | 7 | |
| 5 | Environmental Studies | Renila Mary John | 5 | |
| 6 | General Knowledge | *verify* | 1 | |
| 7 | Life Skills | *verify* | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | *verify* | 2 | |
| 10 | Drawing | *verify* | 1 | |
| 11 | Dance / Music | Sulajamma | 1 | |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Mahesh Chandran | 1 | |
| 14 | Little Prodigy | Anumol | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS III A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 7 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Science | Anu Mathew | 4 | |
| 5 | Social Studies | Athira | 4 | |
| 6 | Mathematics | Remya | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | Anitha | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Nayana | 1 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS III B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anu Mathew | 7 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Science | Manju | 4 | |
| 5 | Social Studies | Athira | 4 | |
| 6 | Mathematics | Remya | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | *verify* | 1 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS IV A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 7 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Anu Mathew | 4 | |
| 5 | Social Studies | Athira | 4 | |
| 6 | Mathematics | Remya | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | Akhil | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Akhil | 1 | |
| 14 | STEAM | Akhil | 1 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS IV B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 7 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Anu S Nair | 4 | |
| 5 | Social Studies | Athira | 4 | |
| 6 | Mathematics | Remya | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | Akhil | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Akhil | 1 | |
| 14 | STEAM | Akhil | 1 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS V A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 6 | |
| 2 | Malayalam | Ambily | 5 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Manju | 4 | |
| 5 | Social Studies | Sonu Mathew | 4 | |
| 6 | Mathematics | Saritha K | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | Akhil | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Akhil | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS V B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 6 | |
| 2 | Malayalam | Ambily | 5 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Manju | 4 | |
| 5 | Social Studies | Sonu Mathew | 4 | |
| 6 | Mathematics | Saritha K | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS V C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 6 | |
| 2 | Malayalam | Ambily | 5 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Roshni | 4 | |
| 5 | Social Studies | Sonu Mathew | 4 | |
| 6 | Mathematics | Saritha K | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | *verify* | 1 | |
| 14 | STEAM | Akhil | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VI A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Sebastian | 6 | |
| 2 | Malayalam | Prabha | 5 | |
| 3 | Hindi | Deepthi | 4 | |
| 4 | Science | Ashamol | 4 | |
| 5 | Social Studies | Aleena Joseph | 4 | |
| 6 | Mathematics | Smitha | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Ann | 2 | |
| 10 | Physical Training | Aleena Joseph | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VI B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Sebastian | 6 | |
| 2 | Malayalam | Prabha | 5 | |
| 3 | Hindi | Deepthi | 4 | |
| 4 | Science | Roshni | 4 | |
| 5 | Social Studies | Aleena Joseph | 4 | |
| 6 | Mathematics | Smitha | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Swetha | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VII A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Maria Joseph | 6 | |
| 2 | Malayalam | Prabha | 4 | |
| 3 | Hindi | Deepthi | 4 | |
| 4 | Science | Anu S Nair | 5 | |
| 5 | Social Studies | Aleena Joseph | 4 | |
| 6 | Mathematics | Sahana | 5 | |
| 7 | General Knowledge | Gopikadas | 1 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | Akhil | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VII B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Maria Joseph | 6 | |
| 2 | Malayalam | Jayasree | 4 | |
| 3 | Hindi | Deepthi | 4 | |
| 4 | Science | Lin Maria | 5 | |
| 5 | Social Studies | Sonu Mathew | 4 | |
| 6 | Mathematics | Nayana | 5 | |
| 7 | General Knowledge | Gopikadas | 1 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Swetha | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Akhil | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VII C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Dominic Saj Jose | 6 | |
| 2 | Malayalam | Ambily | 4 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Manju | 5 | |
| 5 | Social Studies | Albin Benny | 4 | |
| 6 | Mathematics | Sahana | 5 | |
| 7 | General Knowledge | *verify* | 1 | |
| 8 | Life Skills | *verify* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | *verify* | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance / Music | Sulajamma | 1 | |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Anitha | 2 | |
| 15 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VIII A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Dominic Saj Jose | 5 | |
| 2 | Malayalam | Ambily | 4 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Ashamol | 6 | |
| 5 | Social Studies | Sonu Mathew | 5 | |
| 6 | Mathematics | Amrutha | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Swetha | 2 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | General Knowledge | *verify* | 1 | |
| 11 | Library | Sulajamma | 1 | |
| 12 | STEAM | Mahesh Chandran | 2 | |
| 13 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VIII B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Sebastian | 5 | |
| 2 | Malayalam | Ambily | 4 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Roshni | 6 | |
| 5 | Social Studies | Sonu Mathew | 5 | |
| 6 | Mathematics | Smitha | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Shijo C Mathew | 2 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | General Knowledge | *verify* | 1 | |
| 11 | Library | Sulajamma | 1 | |
| 12 | STEAM | Remya | 2 | |
| 13 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VIII C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 5 | |
| 2 | Malayalam | Ambily | 4 | |
| 3 | Hindi | Aneesha | 4 | |
| 4 | Science | Renila Mary John | 6 | |
| 5 | Social Studies | Albin Benny | 5 | |
| 6 | Mathematics | Smitha | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Ann | 2 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | General Knowledge | Gopikadas | 1 | |
| 11 | Library | Sulajamma | 1 | |
| 12 | STEAM | Smitha | 2 | |
| 13 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | |

---

### CLASS IX A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Sebastian | 6 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Deepthi | 5 | |
| 4 | Science | Asha Susan Jacob | 6 | |
| 5 | Social Studies | Albin Benny | 6 | |
| 6 | Mathematics | Rajani | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Shijo C Mathew | 5 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | STEAM | *verify* | 1 | |
| 12 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | *verify IT weightage* |

---

### CLASS IX B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 6 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Deepthi | 5 | |
| 4 | Science | Manju | 6 | |
| 5 | Social Studies | Albin Benny | 6 | |
| 6 | Mathematics | Rajani | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Ann | 5 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | STEAM | *verify* | 1 | |
| 12 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | *verify IT weightage* |

---

### CLASS IX C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Maria Joseph | 6 | |
| 2 | Malayalam | Ambily | 5 | |
| 3 | Hindi | Deepthi | 5 | |
| 4 | Science | Anu Mathew | 6 | |
| 5 | Social Studies | Reshma P Nair | 6 | |
| 6 | Mathematics | Amrutha | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Swetha | 5 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | Library | *verify* | 1 | |
| 11 | STEAM | *verify* | 1 | |
| 12 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **40** | *verify IT weightage* |

---

### CLASS X A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Dominic Saj Jose | 6 | |
| 2 | Malayalam | Niji Abraham | 5 | |
| 3 | Hindi | Jaya | 5 | |
| 4 | Science | Asha Susan Jacob | 6 | |
| 5 | Social Studies | Saritha Mohan | 6 | |
| 6 | Mathematics | Amrutha | 6 | |
| 7 | Life Skills | Anitha | 1 | |
| 8 | Information Technology | Anitha | 5 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | STEAM | *verify* | 1 | |
| 12 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **45** | |

---

### CLASS X B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 6 | |
| 2 | Malayalam | Niji Abraham | 5 | |
| 3 | Hindi | Jaya | 5 | |
| 4 | Science | Anu S Nair | 6 | |
| 5 | Social Studies | Saritha Mohan | 6 | |
| 6 | Mathematics | Amrutha | 6 | |
| 7 | Life Skills | *verify* | 1 | |
| 8 | Information Technology | Anitha | 5 | |
| 9 | Physical Training | *verify* | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | STEAM | *verify* | 1 | |
| 12 | Co-Curricular Activities | *verify* | 2 | |
| | **Total** | | **45** | |

---

### CLASS XI A SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Dominic Saj Jose | 7 | |
| 2 | Physics | Lin Maria | 9 | |
| 3 | Chemistry | Roshni | 9 | |
| 4 | Biology / Computer Science | Anu S Nair / Swetha | 9 | *BIO/CS split — verify* |
| 5 | Mathematics | Julie | 9 | |
| 6 | Informatics Practices | Shijo C Mathew | 9 | |
| 7 | Life Skills | Fr. Antony | 1 | |
| 8 | Physical Training | *verify* | 1 | |
| 9 | STEAM | *verify* | 1 | |
| | **Total** | | **45** | *verify BIO/CS split* |

---

### CLASS XI B SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 7 | |
| 2 | Physics | Asha Susan Jacob | 9 | |
| 3 | Chemistry | Ashamol | 9 | |
| 4 | Biology / Computer Science | Anu S Nair / Ann | 9 | *BIO/CS split — verify* |
| 5 | Mathematics | Julie | 9 | |
| 6 | Computer Science | Ann | 9 | |
| 7 | Life Skills | Fr. Josh Kanjooparambil | 1 | |
| 8 | Physical Training | *verify* | 1 | |
| 9 | STEAM | *verify* | 1 | |
| | **Total** | | **45** | *verify BIO/CS split* |

---

### CLASS XI C COMMERCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siya | 7 | |
| 2 | Business Studies | *verify* | 9 | |
| 3 | Accountancy | *verify* | 9 | |
| 4 | Economics | *verify* | 9 | |
| 5 | Mathematics / Informatics Practices | *verify* | 9 | |
| 6 | Life Skills | *verify* | 1 | |
| 7 | Physical Training | *verify* | 1 | |
| | **Total** | | **45** | |

---

### CLASS XI D HUMANITIES

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | *verify* | 7 | |
| 2 | History | Devassia | 9 | |
| 3 | Political Science | Reshma P Nair | 9 | |
| 4 | Economics | *verify* | 9 | |
| 5 | Psychology / Informatics Practices | Gopikadas | 9 | *IP/PSY combined* |
| 6 | Life Skills | Fr. Josh Kanjooparambil | 1 | |
| 7 | Physical Training | *verify* | 1 | |
| | **Total** | | **45** | |

---

### CLASS XII A SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Maria Joseph | 7 | |
| 2 | Physics | Lin Maria | 9 | |
| 3 | Chemistry | Roshni | 9 | |
| 4 | Biology / Computer Science | Anu S Nair / Swetha | 9 | *BIO/CS split — verify* |
| 5 | Mathematics | Rajani | 9 | |
| 6 | Life Skills | Fr. Antony | 1 | |
| 7 | Physical Training | *verify* | 1 | |
| | **Total** | | **45** | |

---

### CLASS XII B SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 7 | |
| 2 | Physics | Asha Susan Jacob | 9 | |
| 3 | Chemistry | Ashamol | 9 | |
| 4 | Biology / Computer Science | *verify* | 9 | |
| 5 | Mathematics | Rajani | 9 | |
| 6 | Life Skills | Fr. Josh Kanjooparambil | 1 | |
| 7 | Physical Training | *verify* | 1 | |
| | **Total** | | **45** | |

---

### CLASS XII C COMMERCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | *verify* | 7 | |
| 2 | Business Studies | *verify* | 9 | |
| 3 | Accountancy | *verify* | 9 | |
| 4 | Economics | *verify* | 9 | |
| 5 | Mathematics / Informatics Practices | *verify* | 9 | |
| 6 | Life Skills | *verify* | 1 | |
| 7 | Physical Training | *verify* | 1 | |
| | **Total** | | **45** | |

---

### CLASS XII D HUMANITIES

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | *verify* | 7 | |
| 2 | History | Devassia | 9 | |
| 3 | Political Science | Reshma P Nair | 9 | |
| 4 | Economics | *verify* | 9 | |
| 5 | Psychology / Informatics Practices | Gopikadas | 9 | *IP/PSY combined* |
| 6 | Life Skills | *verify* | 1 | |
| 7 | Physical Training | *verify* | 1 | |
| | **Total** | | **45** | |

---

## Summary Checklist

| # | Data Item | Source | Status |
|---|-----------|--------|--------|
| 1 | Academic year label + dates | Principal / Admin Office | ☐ |
| 2 | Bell schedule (all period & break timings) | Admin Office / Notice Board | ☐ |
| 3 | Class list with division letters and stream names | Admin Office / Class Register | ☐ |
| 4 | Full subject list | Academic Coordinator | ☐ |
| 5 | Teacher list with subjects they teach | HR / Academic Coordinator | ☐ |
| 6 | Teacher unavailability (days/periods) | Each Teacher / HOD | ☐ |
| 7 | Subject–teacher–weightage per division | Each Class Teacher / HOD | ☐ |
