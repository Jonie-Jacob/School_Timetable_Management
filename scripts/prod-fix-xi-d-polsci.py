"""Create XYZ Teacher and reassign XI D Political Science from Devassia."""
import os, psycopg2

DB = os.environ.get("DATABASE_URL")
conn = psycopg2.connect(DB)
cur = conn.cursor()

# Create XYZ teacher
cur.execute("""
    INSERT INTO teachers (id, school_id, academic_year_id, name, created_at, updated_at)
    VALUES ('xyz00000-0000-0000-0000-000000000001',
            '17760dca-2a11-43fd-a2ef-0acc0083747c',
            'dac23aff-c5b7-4625-b0d8-aa81607f60e7',
            'XYZ Teacher', NOW(), NOW())
""")

# Add Political Science as qualified subject
cur.execute("""
    INSERT INTO teacher_subjects (id, school_id, teacher_id, subject_id)
    VALUES (gen_random_uuid(),
            '17760dca-2a11-43fd-a2ef-0acc0083747c',
            'xyz00000-0000-0000-0000-000000000001',
            '99d065e8-6f04-4674-997c-af4f4b17ce9e')
""")

# Reassign XI D Political Science
cur.execute("""
    UPDATE division_assignments
    SET teacher_id = 'xyz00000-0000-0000-0000-000000000001'
    WHERE id = '8933c025-a6d2-49bc-ad9d-5c88ca52e870'
""")

conn.commit()

# Verify
cur.execute("""
    SELECT t.name, s.name, c.name || ' ' || d.label
    FROM division_assignments da
    JOIN teachers t ON t.id = da.teacher_id
    JOIN subjects s ON s.id = da.subject_id
    JOIN divisions d ON d.id = da.division_id
    JOIN classes c ON c.id = d.class_id
    WHERE da.id = '8933c025-a6d2-49bc-ad9d-5c88ca52e870'
""")
print("Result:", cur.fetchall())
conn.close()
print("Done!")
