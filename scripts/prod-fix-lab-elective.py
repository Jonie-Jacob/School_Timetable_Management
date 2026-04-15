"""One-shot script to split Phy/Chem Lab elective in production."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL", "postgresql://timetable_admin:Zyphr2026Prod!@timetable-prod-postgres.c186gu8203df.ap-south-1.rds.amazonaws.com:5432/timetable_prod")
conn = psycopg2.connect(DB)
cur = conn.cursor()

cur.execute("UPDATE elective_groups SET name='Class XII A Phy / Chem Lab' WHERE id='a0120a7d-1004-4ba3-8eed-d59f7be380b5'")
cur.execute("INSERT INTO elective_groups (id,name,school_id,academic_year_id,periods_per_week,created_at,updated_at) VALUES ('b0b0b0b0-1111-2222-3333-444444444444','Class XII B Phy / Chem Lab','17760dca-2a11-43fd-a2ef-0acc0083747c','dac23aff-c5b7-4625-b0d8-aa81607f60e7',4,NOW(),NOW())")
cur.execute("INSERT INTO elective_group_subjects (id,school_id,elective_group_id,subject_id,parallel_sections) VALUES (gen_random_uuid(),'17760dca-2a11-43fd-a2ef-0acc0083747c','b0b0b0b0-1111-2222-3333-444444444444','77ca12b4-4888-43e5-a614-b9faaf79c519',1),(gen_random_uuid(),'17760dca-2a11-43fd-a2ef-0acc0083747c','b0b0b0b0-1111-2222-3333-444444444444','27195015-2b69-4ee7-9f93-ea4913c3ae6a',1)")
cur.execute("UPDATE division_assignments SET elective_group_id='b0b0b0b0-1111-2222-3333-444444444444' WHERE elective_group_id='a0120a7d-1004-4ba3-8eed-d59f7be380b5' AND division_id='6e962947-e4f6-47a0-88a3-413f6a1b8a68' AND deleted_at IS NULL")
conn.commit()

cur.execute("SELECT eg.name,COUNT(DISTINCT da.division_id) FROM elective_groups eg JOIN division_assignments da ON da.elective_group_id=eg.id AND da.deleted_at IS NULL WHERE eg.name LIKE '%Phy%Chem%Lab%' OR eg.name LIKE '%Phy%Chem / Lab%' GROUP BY eg.name")
print("Result:", cur.fetchall())
conn.close()
print("Done!")
