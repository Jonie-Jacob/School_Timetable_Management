"""Check Aleena Josy's assignments and conflicts."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

# Find Aleena Josy
cur.execute("SELECT id, name FROM teachers WHERE name LIKE '%Aleena Josy%' AND deleted_at IS NULL")
teacher = cur.fetchone()
print(f"Teacher: {teacher[1]} ({teacher[0][:8]})")

# Her assignments
cur.execute("""
    SELECT c.name || ' ' || d.label as division, s.name as subject, da.weightage,
           da.elective_group_id
    FROM division_assignments da
    JOIN subjects s ON s.id = da.subject_id
    JOIN divisions d ON d.id = da.division_id
    JOIN classes c ON c.id = d.class_id
    WHERE da.teacher_id = %s AND da.deleted_at IS NULL
    ORDER BY c.sort_order, d.label, s.name
""", (teacher[0],))

total = 0
print("\nAssignments:")
for row in cur.fetchall():
    eg = ' (elective)' if row[3] else ''
    print(f"  {row[0]:<15} {row[1]:<15} w={row[2]}{eg}")
    total += row[2]
print(f"  RAW TOTAL: {total}pw")

# Check cross-div elective dedup
cur.execute("""
    SELECT da.elective_group_id, eg.name, eg.periods_per_week,
           COUNT(DISTINCT da.division_id) as num_divs
    FROM division_assignments da
    JOIN elective_groups eg ON eg.id = da.elective_group_id
    WHERE da.teacher_id = %s AND da.deleted_at IS NULL
    GROUP BY da.elective_group_id, eg.name, eg.periods_per_week
    HAVING COUNT(DISTINCT da.division_id) > 1
""", (teacher[0],))
cross = cur.fetchall()
if cross:
    print("\nCross-div electives:")
    for row in cross:
        print(f"  {row[1]}: pw={row[2]}, spans {row[3]} divisions")

# Check timetable conflicts — slots where she's in 2+ divisions at same time
cur.execute("""
    SELECT wd.day_of_week, s.start_time, s.slot_number,
           STRING_AGG(DISTINCT c.name || ' ' || d.label, ', ') as divisions,
           STRING_AGG(DISTINCT sub.name, ', ') as subjects,
           COUNT(DISTINCT ts.id) as slot_count
    FROM timetable_slots ts
    JOIN timetables tt ON tt.id = ts.timetable_id
    JOIN division_assignments da ON da.id = ts.division_assignment_id
    JOIN divisions d ON d.id = tt.division_id
    JOIN classes c ON c.id = d.class_id
    JOIN subjects sub ON sub.id = da.subject_id
    JOIN working_days wd ON wd.id = ts.working_day_id
    JOIN slots s ON s.id = ts.slot_id
    WHERE da.teacher_id = %s
      AND s.slot_type = 'PERIOD'
    GROUP BY wd.day_of_week, s.start_time, s.slot_number
    HAVING COUNT(DISTINCT tt.division_id) > 1
    ORDER BY wd.day_of_week, s.start_time
""", (teacher[0],))

conflicts = cur.fetchall()
if conflicts:
    days = ['Mon','Tue','Wed','Thu','Fri']
    print(f"\nDouble-bookings ({len(conflicts)} conflicts):")
    for row in conflicts:
        d = days[row[0]] if row[0] < 5 else f"D{row[0]}"
        print(f"  {d} P{row[2]} ({str(row[1])[:5]}): {row[3]} — {row[4]}")

conn.close()
