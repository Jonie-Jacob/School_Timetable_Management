"""Check period structures and time overlaps for Aleena Josy."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

# Get all period structures in use
cur.execute("""
    SELECT DISTINCT ps.id, ps.name,
           c.name || ' ' || d.label as sample_division
    FROM divisions d
    JOIN classes c ON c.id = d.class_id
    JOIN period_structures ps ON ps.id = d.period_structure_id
    WHERE d.deleted_at IS NULL
    ORDER BY ps.name, sample_division
""")
print("Period structures in use:")
for row in cur.fetchall():
    print(f"  {row[1]:<30} used by {row[2]}")

# Get slot times for each period structure
cur.execute("""
    SELECT DISTINCT ps.name, s.slot_number, s.start_time, s.end_time, s.slot_type
    FROM period_structures ps
    JOIN working_days wd ON wd.period_structure_id = ps.id
    JOIN slots s ON s.working_day_id = wd.id
    WHERE s.slot_type = 'PERIOD'
    ORDER BY ps.name, s.slot_number
    LIMIT 40
""")

structures = {}
for row in cur.fetchall():
    structures.setdefault(row[0], []).append(row)

print("\nSlot times per structure:")
for name, slots in structures.items():
    print(f"\n  {name}:")
    for s in slots[:10]:
        print(f"    P{s[1]}: {str(s[2])[:5]} - {str(s[3])[:5]}")

# Check overlaps between structures
print("\n\nTime overlap analysis:")
struct_names = list(structures.keys())
if len(struct_names) >= 2:
    a_slots = structures[struct_names[0]]
    b_slots = structures[struct_names[1]]
    for a in a_slots[:8]:
        for b in b_slots[:8]:
            a_start, a_end = str(a[2]), str(a[3])
            b_start, b_end = str(b[2]), str(b[3])
            # Check time overlap
            if a_start < b_end and b_start < a_end:
                match = "EXACT" if a_start == b_start else "OVERLAP"
                print(f"  {struct_names[0]} P{a[1]} ({a_start[:5]}-{a_end[:5]}) vs "
                      f"{struct_names[1]} P{b[1]} ({b_start[:5]}-{b_end[:5]}) -> {match}")

# How does the engine track teacher_busy?
# It uses (teacher_id, day_of_week, start_time)
# If two structures have DIFFERENT start times for the same period number,
# the engine treats them as different slots — a teacher could be placed in both!
print("\n\nEngine teacher_busy key: (teacher_id, day_of_week, start_time)")
print("If start_times differ between structures, the engine WON'T detect the conflict!")

# Count Aleena's actual unique time slots needed
cur.execute("""
    SELECT id FROM teachers WHERE name LIKE '%Aleena Josy%' AND deleted_at IS NULL
""")
teacher_id = cur.fetchone()[0]

cur.execute("""
    SELECT DISTINCT wd.day_of_week, s.start_time, s.end_time
    FROM division_assignments da
    JOIN divisions d ON d.id = da.division_id
    JOIN period_structures ps ON ps.id = d.period_structure_id
    JOIN working_days wd ON wd.period_structure_id = ps.id
    JOIN slots s ON s.working_day_id = wd.id
    WHERE da.teacher_id = %s AND da.deleted_at IS NULL
      AND s.slot_type = 'PERIOD'
    ORDER BY wd.day_of_week, s.start_time
""", (teacher_id,))
unique_slots = cur.fetchall()
print(f"\nAleena Josy's available unique (day, start_time) slots: {len(unique_slots)}")
days = ['Mon','Tue','Wed','Thu','Fri']
for s in unique_slots[:20]:
    d = days[s[0]] if s[0] < 5 else f"D{s[0]}"
    print(f"  {d} {str(s[1])[:5]}-{str(s[2])[:5]}")

conn.close()
