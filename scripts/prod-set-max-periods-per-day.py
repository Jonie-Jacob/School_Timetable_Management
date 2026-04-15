"""Set maxPeriodsPerDay=2 on all assignments that don't already have a stricter limit."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

# Merge maxPeriodsPerDay=2 into existing prefs (skip if already <= 2)
cur.execute("""
    UPDATE division_assignments
    SET scheduling_preferences = scheduling_preferences || '{"maxPeriodsPerDay": 2}'::jsonb
    WHERE deleted_at IS NULL
      AND scheduling_preferences IS NOT NULL
      AND (scheduling_preferences->>'maxPeriodsPerDay' IS NULL
           OR (scheduling_preferences->>'maxPeriodsPerDay')::int > 2)
""")
print(f"Updated existing prefs: {cur.rowcount}")

# Set fresh prefs for assignments without any
cur.execute("""
    UPDATE division_assignments
    SET scheduling_preferences = '{"constraintType": "HARD", "maxPeriodsPerDay": 2}'::jsonb
    WHERE deleted_at IS NULL
      AND scheduling_preferences IS NULL
""")
print(f"Set new prefs: {cur.rowcount}")

conn.commit()

# Verify
cur.execute("""
    SELECT
      COUNT(*) FILTER (WHERE (scheduling_preferences->>'maxPeriodsPerDay')::int = 2) as max_2,
      COUNT(*) FILTER (WHERE (scheduling_preferences->>'maxPeriodsPerDay')::int = 1) as max_1,
      COUNT(*) FILTER (WHERE scheduling_preferences->>'maxPeriodsPerDay' IS NULL) as no_max,
      COUNT(*) as total
    FROM division_assignments WHERE deleted_at IS NULL
""")
print("Result:", cur.fetchone())
conn.close()
print("Done!")
