# School Timetable Management System
## Data Collection Guide — Don Bosco School (Reference Data)

**Version**: 1.1  
**Date**: March 11, 2026 (updated April 20, 2026)  
**Purpose**: Reference checklist for collecting all data required to set up the timetable management tool. This document contains the **Don Bosco school's data** used to seed the development database. Use as a template when collecting data from a new school during onboarding.

> **Note on elective data quality**: Cross-division elective assignments must have **identical teacher sets** across all participating divisions. Ensure `parallel_sections` in `elective_group_subjects` correctly reflects how many simultaneous classes run per subject (e.g., 2 for two parallel Maths teachers, 1 for alternating IP teachers).

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
| Start date | 01 June 2026 | First working day of the year |
| End date | 31 March 2027 | Last working day of the year |

---

## 2. Bell Schedule (Period & Break Timings)

Collect from: **Admin Office / School Notice Board**

List every slot in the school day in chronological order:

| Slot | Slot Type | Start Time | End Time | Notes |
|------|-----------|-----------|---------|-------|
| Period 1 | Period | 9:20 | 10:00 | |
| Period 2 | Period | 10:00 | 10:40 | |
| Interval | Interval | 10:40 | 10:50 | After Period 2 |
| Period 3 | Period | 10:50 | 11:30 | |
| Period 4 | Period | 11:30 | 12:10 | |
| Lunch Break | Lunch Break | 12:10 | 12:50 | After Period 4 |
| Period 5 | Period | 12:50 | 13:30 | |
| Period 6 | Period | 13:30 | 14:10 | |
| Interval | Interval | 14:10 | 14:15 | After Period 6 |
| Period 7 | Period | 14:15 | 14:55 | |
| Period 8 | Period | 14:55 | 15:30 | |

> **Note**: The same timings apply to all days of the week (Monday–Friday).

---

## 3. Classes & Divisions

Collect from: **Admin Office / Class Register**

For each class from I to XII, list all active divisions. Delete rows for divisions that do not exist in your school.

> **Note**: Classes I–X require only a division letter (Stream column is not applicable). Classes XI–XII require both a division letter and a stream/group name (e.g., Science, Commerce, Humanities). Stream names are free-form — enter exactly as you want them to appear on the timetable.

**Classes I–X** — enter all division letters for each class as a comma-separated list:

| Class | Divisions (comma-separated) |
|-------|-----------------------------|
| Class I | A, B, C |
| Class II | A, B, C |
| Class III | A, B, C |
| Class IV | A, B, C |
| Class V | A, B |
| Class VI | A, B, C |
| Class VII | A, B |
| Class VIII | A, B, C |
| Class IX | A, B, C |
| Class X | A, B, C |

---

**Classes XI & XII** — each division needs a separate row because of the stream/group name:

| Class | Division Letter | Stream / Group Name |
|-------|----------------|---------------------|
| Class XI | A | Science |
| Class XI | B | Science |
| Class XI | C | Science |
| Class XI | D | Commerce & Humanities |
| Class XII | A | Science |
| Class XII | B | Science |
| Class XII | C | Commerce & Humanities |

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
| 6 | Social Science | SOC | ✓ |
| 7 | Environmental Studies | EVS | ✓ |
| 8 | Physics | PHY | ✓ |
| 9 | Chemistry | CHEM | ✓ |
| 10 | Biology | BIO | ✓ |
| 11 | Computer Science | CS | ✓ |
| 12 | Informatics Practices | IP | ✓ |
| 13 | Information Technology | IT | ✓ |
| 14 | Business Studies | BS | ✓ |
| 15 | Accountancy | ACC | ✓ |
| 16 | Economics | ECO | ✓ |
| 17 | History | HIS | ✓ |
| 18 | Political Science | PS | ✓ |
| 19 | Psychology | PSY | ✓ |
| 20 | General Knowledge | GK | ✓ |
| 22 | Life Skills | LS | ✓ |
| 23 | Physical Training | PT | ✓ |
| 24 | Drawing | DRW | ✓ |
| 25 | Dance | DAN | ✓ |
| 26 | Music | MUS | ✓ |
| 27 | Library | LIB | ✓ |
| 28 | STEAM | STEAM | ✓ |
| 29 | Little Prodigy | LP | ✓ |
| 30 | Co-Curricular Activities | CCA | ✓ |
| 31 | Artificial Intelligence | AI | ✓ |
| 32 | Physics Lab | PHY-L | ✓ |
| 33 | Chemistry Lab | CHEM-L | ✓ |

---

## 5. Teachers

Collect from: **HR / Academic Coordinator**

> **Note**: Subjects are pre-filled based on the groupings provided during data collection. Verify and update each row — a teacher may qualify to teach multiple subjects across different classes. Subject names must exactly match those listed in Section 4.

| # | Full Name | Subjects Qualified to Teach *(verify & update)* | Contact *(optional)* |
|---|-----------|------------------------------------------------|----------------------|
| 1 | Ashamol P B | Science, Biology | |
| 2 | Roshni Daniel | Science, Biology | |
| 3 | Lin Maria | Science, Chemistry | |
| 4 | Asha Susan Jacob | Science, Chemistry | |
| 5 | Amalu Mathew | Science, Physics | |
| 6 | Manju R | Science, Physics | |
| 7 | Anu Mathew | Science, Physics | |
| 8 | Bibitha A B | Science, Environmental Studies, Biology | |
| 9 | Bini Treesa Antony | English, General Knowledge | |
| 10 | Siya Thomas | English | |
| 11 | Deepa G Nair | English | |
| 12 | Siju Samuel | English | |
| 13 | Aleena Maria Kuriachen | English | |
| 14 | Anju Maria Joseph | English | |
| 15 | Aleena Josy | English | |
| 16 | Ansu | English | |
| 17 | Devassia | Social Science, History, Political Science, Economics | |
| 18 | Saritha Mohan | Social Science, History, Political Science, Economics | |
| 19 | Sonu Mathew | Social Science, History, Political Science, Economics, Accountancy | |
| 20 | Albin Benny | Social Science, History, Political Science, Economics, Business Studies | |
| 21 | Athira | Social Science, History, Political Science, Economics | |
| 22 | Aleena Joseph | Social Science, Environmental Studies, General Knowledge, Physical Training | |
| 23 | Aleesha Varghese | Social Science, Political Science, Environmental Studies | |
| 24 | Niji Abraham | Malayalam | |
| 25 | Ambily | Malayalam | |
| 26 | Jayasree | Malayalam | |
| 27 | Prabha | Malayalam | |
| 28 | Julie Scaria | Mathematics | |
| 29 | Amrutha Saji | Mathematics | |
| 30 | Saritha K | Mathematics, STEAM | |
| 31 | Rajani R | Mathematics | |
| 32 | Remya Nair | Mathematics | |
| 33 | Smitha K V | Mathematics | |
| 34 | Sahana | Mathematics | |
| 35 | Gopikadas | Psychology, General Knowledge, Life Skills | |
| 36 | Gowri P G | Psychology, Life Skills | |
| 37 | Shridevi | Mathematics, Hindi | |
| 38 | Jaya | Hindi | |
| 39 | Anjumol Anil | Malayalam | |
| 40 | Sreethu | Hindi | |
| 41 | Fr. Josh Kanjooparambil | Life Skills | |
| 42 | Fr. Antony | Life Skills | |
| 43 | Fr. Jyothis | Life Skills | |
| 44 | Br. Jiss | Life Skills, Social Science | |
| 45 | Sulajamma | Library | |
| 46 | Sreejesh | Drawing | |
| 47 | Akash | Physical Training | |
| 48 | Anand Santosh | Physical Training | |
| 49 | Nayana | Dance | |
| 50 | Mahesh Chandran | Music | |
| 51 | Anitha | Informatics Practices, Information Technology | |
| 52 | Swetha | Computer Science, Information Technology | |
| 53 | Ann John | Computer Science, Information Technology | |
| 54 | Shijo C Mathew | Informatics Practices, Information Technology | |
| 55 | Ashish Kurian | Chemistry, Science | |
| 56 | Silpa N Raju | Chemistry, Science | |
| 57 | Shobitha Lakshmi | Social Science | |
| 58 | Soly | Little Prodigy | |
| 59 | Neethu | Malayalam | |
| 60 | Anakha | Hindi | |
| 61 | Sujatha | Hindi | |
| 62 | Akhil | Library, STEAM | |

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
> - Total weightage per division: **40/week** (8 periods × 5 days for Classes I–IX; Classes X–XII have a 9th period but total remains 40 due to elective overlap).

---

### CLASS I A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siya | 6 | |
| 2 | Malayalam | Neethu | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Mathematics | Sahana | 6 | |
| 5 | Environmental Studies | Aleena Joseph | 5 | |
| 6 | General Knowledge | Ansu | 2 | |
| 7 | Life Skills | Siya | 2 | |
| 8 | Information Technology | Swetha | 2 | |
| 9 | Physical Training | Akash | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Mahesh | 1 | |
| 14 | Little Prodigy | Soly | 2 | |
| | **Total** | | **40** | |

---

### CLASS I B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siya | 6 | |
| 2 | Malayalam | Prabha | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Mathematics | Saritha K | 6 | |
| 5 | Environmental Studies | Bibitha A B | 5 | |
| 6 | General Knowledge | Aleena Joseph | 2 | |
| 7 | Life Skills | Gopikadas | 2 | |
| 8 | Information Technology | Ann | 2 | |
| 9 | Physical Training | Akash | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Mahesh Chandran | 1 | |
| 14 | Little Prodigy | Soly | 2 | |
| | **Total** | | **40** | |

---

### CLASS I C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Ansu | 6 | |
| 2 | Malayalam | Anjumol | 5 | |
| 3 | Hindi | Anakha | 4 | |
| 4 | Mathematics | Shridevi | 6 | |
| 5 | Environmental Studies | Aleesha Varghese | 5 | |
| 6 | General Knowledge | Gopikadas | 2 | |
| 7 | Life Skills | Gowri P G | 2 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | Akash | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Nayana | 1 | |
| 14 | Little Prodigy | Soly | 2 | |
| | **Total** | | **40** | |

---

### CLASS II A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 6 | |
| 2 | Malayalam | Niji | 4 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Mathematics | Rajani R | 6 | |
| 5 | Environmental Studies | Aleena Joseph | 5 | |
| 6 | General Knowledge | Athira | 2 | |
| 7 | Life Skills | Ansu | 1 | |
| 8 | Information Technology | Ann | 2 | |
| 9 | Physical Training | Anand Santosh | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Nayana | 1 | |
| 14 | Little Prodigy | Soly | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS II B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siya | 6 | |
| 2 | Malayalam | Prabha | 4 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Mathematics | Shridevi | 6 | |
| 5 | Environmental Studies | Aleesha Varghese | 5 | |
| 6 | General Knowledge | Bini Treesa | 2 | |
| 7 | Life Skills | Silpa N Raju | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | Anand Santosh | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Mahesh Chandran | 1 | |
| 14 | Little Prodigy | Soly | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS II C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Maria | 6 | |
| 2 | Malayalam | Jayasree | 4 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Mathematics | Saritha K | 6 | |
| 5 | Environmental Studies | Athira | 5 | |
| 6 | General Knowledge | Shobita Lakshmi | 2 | |
| 7 | Life Skills | Aleesha Varghese | 1 | |
| 8 | Information Technology | Swetha | 2 | |
| 9 | Physical Training | Anand Santosh | 2 | |
| 10 | Drawing | Sreejesh | 1 | |
| 11 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 12 | Library | Sulajamma | 1 | |
| 13 | STEAM | Mahesh Chandran | 1 | |
| 14 | Little Prodigy | Soly | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS III A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 7 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Science | Silpa N Raju | 4 | |
| 5 | Social Science | Athira | 4 | |
| 6 | Mathematics | Remya | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | Anitha | 1 | |
| 9 | Information Technology | Swetha | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Nayana | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS III B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Ansu | 7 | |
| 2 | Malayalam | Anjumol | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Science | Bibitha A B | 4 | |
| 5 | Social Science | Aleena Joseph | 4 | |
| 6 | Mathematics | Shridevi | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | Anand | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | *unassigned* | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS III C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Bini Treesa | 7 | |
| 2 | Malayalam | Niji | 5 | |
| 3 | Hindi | Jaya | 4 | |
| 4 | Science | Ashish Kurian | 4 | |
| 5 | Social Science | Shobitha Lakshmi | 4 | |
| 6 | Mathematics | Rajani | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Ann | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | *unassigned* | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | *unassigned* | 1 | |
| 14 | STEAM | *unassigned* | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS IV A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 7 | |
| 2 | Malayalam | Ambily | 5 | |
| 3 | Hindi | Anakha | 4 | |
| 4 | Science | Silpa N Raju | 4 | |
| 5 | Social Science | Shobitha | 4 | |
| 6 | Mathematics | Smitha | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Akhil | 1 | |
| 14 | STEAM | Akhil | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS IV B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Maria Kuriachen | 7 | |
| 2 | Malayalam | Prabha | 5 | |
| 3 | Hindi | Shridevi | 4 | |
| 4 | Science | Ashish Kurian | 4 | |
| 5 | Social Science | Aleesha Varghese | 4 | |
| 6 | Mathematics | Amrutha | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | Anand | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Akhil | 1 | |
| 14 | STEAM | Akhil | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS IV C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 7 | |
| 2 | Malayalam | Neethu | 5 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Science | Bibitha A B | 4 | |
| 5 | Social Science | Aleena Joseph | 4 | |
| 6 | Mathematics | Sahana | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | *unassigned* | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | *unassigned* | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | *unassigned* | 1 | |
| 14 | STEAM | *unassigned* | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS V A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 6 | |
| 2 | Malayalam | Jayasree | 5 | |
| 3 | Hindi | Shridevi | 4 | |
| 4 | Science | Amalu Mathew | 4 | |
| 5 | Social Science | Sonu Mathew | 4 | |
| 6 | Mathematics | Saritha K | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Swetha | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Akhil | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS V B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 6 | |
| 2 | Malayalam | Anjumol | 5 | |
| 3 | Hindi | Sujatha | 4 | |
| 4 | Science | Silpa N Raju | 4 | |
| 5 | Social Science | Sonu Mathew | 4 | |
| 6 | Mathematics | Saritha K | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | Anand | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VI A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Bini Treesa Antony | 6 | |
| 2 | Malayalam | Prabha | 5 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Science | Ashamol | 4 | |
| 5 | Social Science | Aleena Joseph | 4 | |
| 6 | Mathematics | Smitha | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Ann | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VI B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Maria | 6 | |
| 2 | Malayalam | Ambily | 5 | |
| 3 | Hindi | Shridevi | 4 | |
| 4 | Science | Roshni | 4 | |
| 5 | Social Science | Albin | 4 | |
| 6 | Mathematics | Remya | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Ann | 2 | |
| 10 | Physical Training | Anand | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VI C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 6 | |
| 2 | Malayalam | Niji | 5 | |
| 3 | Hindi | Anakha | 4 | |
| 4 | Science | Ashish Kurian | 4 | |
| 5 | Social Science | Athira | 4 | |
| 6 | Mathematics | Julie | 5 | |
| 7 | General Knowledge | *unassigned* | 1 | |
| 8 | Life Skills | *unassigned* | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Sulajamma | 1 | |
| 14 | STEAM | Mahesh Chandran | 2 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| | **Total** | | **40** | |

---

### CLASS VII A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Maria Joseph | 6 | |
| 2 | Malayalam | Neethu | 4 | |
| 3 | Hindi | Sujatha | 4 | |
| 4 | Physics | Manju | 2 | |
| 5 | Social Science | Aleena Joseph | 4 | |
| 6 | Mathematics | Sahana | 5 | |
| 7 | General Knowledge | Gopikadas | 2 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Shijo C Mathew | 2 | |
| 10 | Physical Training | Akash | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Mahesh Chandran | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| 16 | Chemistry | Lin | 1 | |
| 17 | Biology | Ashamol | 2 | |
| | **Total** | | **40** | |

---

### CLASS VII B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Bini Treesa | 6 | |
| 2 | Malayalam | Ambily | 4 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Physics | Manju | 2 | |
| 5 | Social Science | Sonu Mathew | 4 | |
| 6 | Mathematics | Saritha K | 5 | |
| 7 | General Knowledge | Gopikadas | 2 | |
| 8 | Life Skills | Br. Jiss | 1 | |
| 9 | Information Technology | Anitha | 2 | |
| 10 | Physical Training | Anand | 1 | |
| 11 | Drawing | Sreejesh | 1 | |
| 12 | Dance | Nayana | 1 | Elective with Music (same division) |
| | Music | Mahesh Chandran | 1 | Elective with Dance (same division) |
| 13 | Library | Nayana | 1 | |
| 14 | STEAM | Akhil | 1 | |
| 15 | Co-Curricular Activities | *unassigned* | 2 | |
| 16 | Chemistry | Asha Susan | 1 | |
| 17 | Biology | Roshni | 2 | |
| | **Total** | | **40** | |

---

### CLASS VIII A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 5 | |
| 2 | Malayalam | Ambily | 4 | |
| 3 | Hindi | Sujatha | 4 | |
| 4 | Physics | Manju | 2 | |
| 5 | Social Science | Albin | 5 | |
| 6 | Mathematics | Amrutha | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Anitha | 2 | |
| 9 | Physical Training | Akash | 1 | |
| 10 | General Knowledge | *unassigned* | 2 | |
| 11 | Library | Sulajamma | 1 | |
| 12 | STEAM | Mahesh Chandran | 1 | |
| 13 | Co-Curricular Activities | *unassigned* | 2 | |
| 14 | Chemistry | Silpa | 2 | |
| 15 | Biology | Bibitha | 2 | |
| | **Total** | | **40** | |

---

### CLASS VIII B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Maria | 5 | |
| 2 | Malayalam | Anjumol | 4 | |
| 3 | Hindi | Anakha | 4 | |
| 4 | Physics | Anu Mathew | 2 | |
| 5 | Social Science | Athira | 5 | |
| 6 | Mathematics | Smitha | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Shijo C Mathew | 2 | |
| 9 | Physical Training | Anand | 1 | |
| 10 | General Knowledge | *unassigned* | 2 | |
| 11 | Library | Sulajamma | 1 | |
| 12 | STEAM | Remya | 1 | |
| 13 | Co-Curricular Activities | *unassigned* | 2 | |
| 14 | Chemistry | Silpa | 2 | |
| 15 | Biology | Bibitha | 2 | |
| | **Total** | | **40** | |

---

### CLASS VIII C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 5 | |
| 2 | Malayalam | Niji | 4 | |
| 3 | Hindi | Sreethu | 4 | |
| 4 | Physics | Manju | 2 | |
| 5 | Social Science | Saritha Mohan | 5 | |
| 6 | Mathematics | Saritha K | 6 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Ann | 2 | |
| 9 | Physical Training | Anand | 1 | |
| 10 | General Knowledge | Gopikadas | 2 | |
| 11 | Library | Sulajamma | 1 | |
| 12 | STEAM | Smitha | 1 | |
| 13 | Co-Curricular Activities | *unassigned* | 2 | |
| 14 | Chemistry | Silpa | 2 | |
| 15 | Biology | Bibitha | 2 | |
| | **Total** | | **40** | |

---

### CLASS IX A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Deepa | 6 | |
| 2 | Malayalam | Jayasree And Prabha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 3 | Hindi | Sujatha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 4 | Physics | Manju | 3 | |
| 5 | Social Science | Albin Benny / Shobita | 6 | |
| 6 | Mathematics | Rajani / Remya | 7 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Shijo C Mathew | 4 | |
| 9 | Physical Training | Anand | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | Co-Curricular Activities | *unassigned* | 2 | |
| 12 | Chemistry | Lin | 2 | |
| 13 | Biology | Roshni | 2 | |
| | **Total** | | **40** | |

---

### CLASS IX B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 6 | |
| 2 | Malayalam | Jayasree And Prabha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 3 | Hindi | Sujatha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 4 | Physics | Manju | 3 | |
| 5 | Social Science | Athira / Ashish Kurian | 6 | |
| 6 | Mathematics | Smitha / Sahana | 7 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Ann | 4 | |
| 9 | Physical Training | Akash | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | Co-Curricular Activities | *unassigned* | 2 | |
| 12 | Chemistry | Lin | 2 | |
| 13 | Biology | Roshni | 2 | |
| | **Total** | | **40** | |

---

### CLASS IX C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Anju Maria Joseph | 6 | |
| 2 | Malayalam | Jayasree And Prabha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 3 | Hindi | Sujatha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 4 | Physics | Manju | 3 | |
| 5 | Social Science | Shobitha / Saritha Mohan | 6 | |
| 6 | Mathematics | Remya / Smitha | 7 | |
| 7 | Life Skills | Fr. Jyothis | 1 | |
| 8 | Information Technology | Swetha | 4 | |
| 9 | Physical Training | Anand | 1 | |
| 10 | Library | *unassigned* | 1 | |
| 11 | Co-Curricular Activities | *unassigned* | 2 | |
| 12 | Chemistry | Ashish Kurian | 2 | |
| 13 | Biology | Bibitha | 2 | |
| | **Total** | | **40** | |

---

### CLASS X A

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 6 | |
| 2 | Malayalam | Neethu And Ambily | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 3 | Hindi | Sujatha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 4 | Physics | Manju | 3 | |
| 5 | Social Science | Saritha Mohan / Athira | 6 | |
| 6 | Mathematics | Remya / Rajani | 7 | |
| 7 | Life Skills | Anitha | 1 | |
| 8 | Information Technology | Shijo | 4 | |
| 9 | Physical Training | Akash | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | Co-Curricular Activities | *unassigned* | 2 | |
| 12 | Chemistry | Lin | 2 | |
| 13 | Biology | Roshni | 2 | |
| | **Total** | | **40** | |

---

### CLASS X B

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 6 | |
| 2 | Malayalam | Neethu And Ambily | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 3 | Hindi | Sujatha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 4 | Physics | Manju | 3 | |
| 5 | Social Science | Saritha Mohan / Shobitha | 6 | |
| 6 | Mathematics | Smitha / Rajani | 7 | |
| 7 | Life Skills | *unassigned* | 1 | |
| 8 | Information Technology | Ann | 5 | |
| 9 | Physical Training | Anand | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | Co-Curricular Activities | *unassigned* | 2 | |
| 12 | Chemistry | Asha Susan | 2 | |
| 13 | Biology | Ashamol | 2 | |
| | **Total** | | **40** | |

---

### CLASS X C

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Siju Samuel | 6 | |
| 2 | Malayalam | Neethu And Ambily | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 3 | Hindi | Sujatha | 5 | This is elective subject : Malayalam/Hindi. This is shared across all divisions. After splitting 2 teachers will take malayalam and one teacher will take Hindi |
| 4 | Physics | Manju | 3 | |
| 5 | Social Science | Saritha Mohan / Athira | 6 | |
| 6 | Mathematics | Smitha / Remya | 7 | |
| 7 | Life Skills | *unassigned* | 1 | |
| 8 | Information Technology | Ann | 5 | |
| 9 | Physical Training | Akash | 1 | |
| 10 | Library | Sulajamma | 1 | |
| 11 | Co-Curricular Activities | *unassigned* | 2 | |
| 12 | Chemistry | Asha Susan | 2 | |
| 13 | Biology | Ashamol | 2 | |
| | **Total** | | **40** | |

---

### CLASS XI A SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 2 | |
| 2 | English | Anju Maria | 2 | |
| 3 | Physics | Anu Mathew | 4 | |
| 4 | Physics | Amalu | 4 | |
| 5 | Chemistry | Lin | 4 | |
| 6 | Chemistry | Asha Susan | 4 | |
| 7 | Biology | Roshni | 4 | |
| 8 | Biology | Ashamol | 4 | |
| 9 | Mathematics | Julie | 4 | |
| 10 | Mathematics | Amrutha | 4 | |
| 11 | Life Skills | Fr. Antony | 2 | |
| 12 | Physical Training | Anand | 1 | |
| 13 | Library | Anju Maria | 1 | |
| | **Total** | | **40** | |

---

### CLASS XI B SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 2 | |
| 2 | English | Anju Maria | 2 | |
| 3 | Physics | Anu Mathew | 4 | |
| 4 | Physics | Amalu | 4 | |
| 5 | Chemistry | Lin | 4 | |
| 6 | Chemistry | Asha Susan | 4 | |
| 7 | Computer Science | Swetha | 4 | |
| 8 | Computer Science | Ann | 4 | |
| 9 | Mathematics | Julie | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 10 | Mathematics | Amrutha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 11 | Life Skills | Fr. Antony | 2 | |
| 12 | Physical Training | Anand | 1 | |
| 13 | Library | Aleena Josy | 1 | |
| | **Total** | | **40** | |

---

### CLASS XI C SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 2 | |
| 2 | English | Anju Maria | 2 | |
| 3 | Physics | Anu Mathew | 4 | |
| 4 | Physics | Amalu | 4 | |
| 5 | Chemistry | Lin | 4 | |
| 6 | Chemistry | Asha Susan | 4 | |
| 7 | Biology | Roshni | 4 | |
| 8 | Biology | Ashamol | 4 | |
| 9 | IP | Shijo | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 10 | IP | Anitha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 11 | Psychology | Gopikadas | 8 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 12 | Life Skills | Fr. Antony | 2 | |
| 13 | Physical Training | Anand | 1 | |
| 14 | Library | Anju Maria | 1 | |
| | **Total** | | **40** | |

---

### CLASS XI D Commerce & Humanities

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | English | Aleena Josy | 2 | |
| 2 | English | Anju Maria | 2 | |
| 3 | Economics | Saritha Mohan | 8 | |
| 4 | Accountancy | Sonu | 8 | Accountancy and History is a elective within this divison |
| 5 | History | Devassia | 8 | Accountancy and History is a elective within this divison |
| 6 | Business Studies | Albin | 4 | Business Studies and Political Science is a elective within this divison |
| 7 | Political Science | *unassigned* | 4 | Business Studies and Political Science is a elective within this divison |
| 8 | Mathematics | Julie | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 9 | Mathematics | Amrutha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 10 | IP | Shijo | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 11 | IP | Anitha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 12 | Psychology | Gopikadas | 8 | Mathematics,  IP,  and Psychology is a elective within this divison B,C,D |
| 13 | Life Skills | Fr. Antony | 2 | |
| 14 | Physical Training | Anand | 1 | |
| 15 | Library | Anju Maria | 1 | |
| | **Total** | | **40** | |

---

### CLASS XII A SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | Physics Lab | Anu Mathew | 4 | Physics and chemistry labs are elective within the same division |
| 2 | Chemistry Lab | Lin Maria | 4 | Physics and chemistry labs are elective within the same division |
| 3 | Mathematics | Julie | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 4 | Mathematics | Amrutha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 5 | IP | Shijo | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 6 | IP | Anitha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 7 | Psychology | Gopikadas | 8 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 8 | Chemistry | Lin Maria | 2 | |
| 9 | Chemistry | Asha Susan | 4 | |
| 10 | Physics | Anu Mathew | 2 | |
| 11 | Physics | Amalu Mathew | 4 | |
| 12 | Biology | Ashamol and Roshni | 8 | Biology and computer science is a elective subject across divisions A and B. There will be two biology classes and one computer class happening at same time for these two divisons |
| 13 | Computer Science | Swetha | 4 | Biology and computer science is a elective subject across divisions A and B. There will be two biology classes and one computer class happening at same time for these two divisons |
| 14 | Computer Science | Ann | 4 | Biology and computer science is a elective subject across divisions A and B. There will be two biology classes and one computer class happening at same time for these two divisons |
| 15 | Life Skills | Fr. Josh | 2 | |
| 16 | Physical Training | Anand | 1 | |
| 17 | Library | Aleena Josy | 1 | |
| 18 | English | Anju Maria | 2 | |
| 19 | English | Aleena Josy | 2 | |
| | **Total** | | **40** | |

---

### CLASS XII B SCIENCE

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | Physics Lab | Anu Mathew | 4 | Physics and chemistry labs are elective within the same division |
| 2 | Chemistry Lab | Asha Susan | 4 | Physics and chemistry labs are elective within the same division |
| 3 | Mathematics | Julie | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 4 | Mathematics | Amrutha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 5 | IP | Shijo | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 6 | IP | Anitha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 7 | Psychology | Gopikadas | 8 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 8 | Chemistry | Lin Maria | 4 | |
| 9 | Chemistry | Asha Susan | 2 | |
| 10 | Physics | Anu Mathew | 2 | |
| 11 | Physics | Amalu Mathew | 4 | |
| 12 | Biology | Ashamol and Roshni | 8 | Biology and computer science is a elective subject across divisions A and B. There will be two biology classes and one computer class happening at same time for these two divisons |
| 13 | Computer Science | Swetha | 4 | Biology and computer science is a elective subject across divisions A and B. There will be two biology classes and one computer class happening at same time for these two divisons |
| 14 | Computer Science | Ann | 4 | Biology and computer science is a elective subject across divisions A and B. There will be two biology classes and one computer class happening at same time for these two divisons |
| 15 | Life Skills | Fr. Josh | 2 | |
| 16 | Physical Training | Anand | 1 | |
| 17 | Library | Anju Maria | 1 | |
| 18 | English | Anju Maria | 2 | |
| 19 | English | Aleena Josy | 2 | |
| | **Total** | | **40** | |

---

### CLASS XII C 

| # | Subject | Teacher | Periods/Week | Notes |
|---|---------|---------|-------------|-------|
| 1 | Accountancy | Sonu | 8 | Accountancy and History are elective within the same division |
| 2 | History | Devassia | 8 | Accountancy and History are elective within the same division |
| 3 | Business Studies | Albin | 8 | Business Studies and Political Science are elective within the same division |
| 4 | Political Science | Devassia | 8 | Business Studies and Political Science are elective within the same division |
| 5 | Mathematics | Julie | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 6 | Mathematics | Amrutha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 7 | IP | Shijo | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 8 | IP | Anitha | 4 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 9 | Psychology | Gopikadas | 8 | Mathematics,  IP,  and Psychology is a elective within this divison A, B, C |
| 10 | Economics | Saritha Mohan | 8 | |
| 11 | Life Skills | Fr. Josh | 2 | |
| 12 | Physical Training | Anand | 1 | |
| 13 | Library | Aleena Josy | 1 | |
| 14 | English | Anju Maria | 2 | |
| 15 | English | Aleena Josy | 2 | |
| | **Total** | | **40** | |

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
