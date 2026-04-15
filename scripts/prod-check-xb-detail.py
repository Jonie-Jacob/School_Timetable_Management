"""Check X B assignments in detail."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

cur.execute("""
    SELECT s.name as subject, t.name as teacher, da.weightage, da.elective_group_id,
           da.id, da.deleted_at
    FROM division_assignments da
    JOIN subjects s ON s.id = da.subject_id
    LEFT JOIN teachers t ON t.id = da.teacher_id
    JOIN divisions d ON d.id = da.division_id
    JOIN classes c ON c.id = d.class_id
    WHERE c.name = 'Class X' AND d.label = 'B'
      AND da.deleted_at IS NULL
    ORDER BY s.name, t.name
""")
total = 0
print("Class X B assignments (deleted_at IS NULL):")
for row in cur.fetchall():
    eg = row[3][:8] if row[3] else 'none'
    print(f"  {row[0]:<25} {row[1] or '(none)':<20} w={row[2]} eg={eg} id={row[4][:8]}")
    total += row[2]
print(f"TOTAL: {total}pw")

# Also check the Mal/Hin elective — is it counting correctly?
cur.execute("""
    SELECT eg.name, eg.periods_per_week,
           COUNT(*) as member_count,
           SUM(da.weightage) as sum_weightage
    FROM division_assignments da
    JOIN elective_groups eg ON eg.id = da.elective_group_id
    JOIN divisions d ON d.id = da.division_id
    JOIN classes c ON c.id = d.class_id
    WHERE c.name = 'Class X' AND d.label = 'B'
      AND da.deleted_at IS NULL
    GROUP BY eg.id, eg.name, eg.periods_per_week
""")
print("\nElective groups in X B:")
for row in cur.fetchall():
    print(f"  {row[0]}: periods_per_week={row[1]}, members={row[2]}, sum_weightage={row[3]}")

conn.close()
