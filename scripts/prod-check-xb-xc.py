"""Check X B and X C total weightage."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

cur.execute("""
    SELECT c.name || ' ' || d.label as division,
           SUM(da.weightage) as total_w,
           COUNT(*) as num_assignments
    FROM division_assignments da
    JOIN divisions d ON d.id = da.division_id
    JOIN classes c ON c.id = d.class_id
    WHERE da.deleted_at IS NULL
      AND c.name = 'Class X' AND d.label IN ('B', 'C')
    GROUP BY c.name, d.label
    ORDER BY d.label
""")
print("Division totals:", cur.fetchall())

# Also check I A
cur.execute("""
    SELECT s.name, t.name as teacher, da.weightage,
           da.scheduling_preferences->>'maxPeriodsPerDay' as max_pd
    FROM division_assignments da
    JOIN subjects s ON s.id = da.subject_id
    LEFT JOIN teachers t ON t.id = da.teacher_id
    JOIN divisions d ON d.id = da.division_id
    JOIN classes c ON c.id = d.class_id
    WHERE da.deleted_at IS NULL
      AND c.name = 'Class I' AND d.label = 'A'
    ORDER BY s.name
""")
print("\nClass I A assignments:")
for row in cur.fetchall():
    print(f"  {row[0]:<25} {row[1] or '(none)':<20} w={row[2]} max_pd={row[3]}")

conn.close()
