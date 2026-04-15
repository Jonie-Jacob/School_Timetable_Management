"""Check IT weightage in X B and X C, and total logical assignment weightage."""
import os, sys, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

for label in ['B', 'C']:
    cur.execute("""
        SELECT s.name, t.name, da.weightage, da.elective_group_id
        FROM division_assignments da
        JOIN subjects s ON s.id = da.subject_id
        LEFT JOIN teachers t ON t.id = da.teacher_id
        JOIN divisions d ON d.id = da.division_id
        JOIN classes c ON c.id = d.class_id
        WHERE c.name = 'Class X' AND d.label = %s
          AND da.deleted_at IS NULL
        ORDER BY s.name, t.name
    """, (label,))

    rows = cur.fetchall()
    # Calculate like the engine does: elective members share periods_per_week
    eg_ids = set(r[3] for r in rows if r[3])

    non_elective_total = sum(r[2] for r in rows if not r[3])

    # Get elective periods_per_week
    elective_total = 0
    for eg_id in eg_ids:
        cur.execute("SELECT periods_per_week FROM elective_groups WHERE id = %s", (eg_id,))
        pw = cur.fetchone()
        if pw:
            elective_total += pw[0]

    effective = non_elective_total + elective_total

    print(f"=== Class X {label} ===")
    for r in rows:
        eg = 'elective' if r[3] else ''
        print(f"  {r[0]:<25} {r[1] or '(none)':<20} w={r[2]} {eg}")
    print(f"  Non-elective sum: {non_elective_total}")
    print(f"  Elective sum: {elective_total}")
    print(f"  EFFECTIVE TOTAL: {effective}pw")
    print()

conn.close()
