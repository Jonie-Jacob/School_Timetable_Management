"""Mark stuck RUNNING/PENDING generation jobs as FAILED."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

cur.execute("""
    UPDATE generation_jobs
    SET status = 'FAILED',
        error_message = 'Engine crashed — please retry',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE status IN ('RUNNING', 'PENDING')
""")
print(f"Failed {cur.rowcount} stuck jobs")
conn.commit()

cur.execute("SELECT status, COUNT(*) FROM generation_jobs GROUP BY status ORDER BY status")
print("Result:", cur.fetchall())
conn.close()
print("Done!")
