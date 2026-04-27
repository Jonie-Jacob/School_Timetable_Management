"""Fix XII Maths/IP/Psy: consolidate Amrutha w=8, add Julie w=8, parallel_sections=2."""
import os,psycopg2
DB=os.environ.get("DATABASE_URL")
c=psycopg2.connect(DB)
x=c.cursor()
S='17760dca-2a11-43fd-a2ef-0acc0083747c'
EG='6769b4db-651f-4154-91ae-8127e3a6086b'
print(f"EG={EG}")
x.execute("SELECT id FROM subjects WHERE name='Mathematics' AND school_id=%s AND deleted_at IS NULL",(S,))
MS=x.fetchone()[0];print(f"MathSubj={MS}")
x.execute("SELECT id,name FROM teachers WHERE name LIKE '%%Amrutha%%' AND school_id=%s AND deleted_at IS NULL",(S,))
A=x.fetchone();print(f"Amrutha={A}")
x.execute("SELECT id,name FROM teachers WHERE name LIKE '%%Julie%%' AND school_id=%s AND deleted_at IS NULL",(S,))
J=x.fetchone();print(f"Julie={J}")
if not J:print("NO JULIE");c.close();exit(1)
x.execute("SELECT DISTINCT da.division_id,cl.name||' '||d.label FROM division_assignments da JOIN divisions d ON da.division_id=d.id JOIN classes cl ON d.class_id=cl.id WHERE da.elective_group_id=%s AND da.deleted_at IS NULL ORDER BY 2",(EG,))
divs=x.fetchall();print(f"Divs={[d[1] for d in divs]}")
x.execute("SELECT da.weightage,t.name,s.name,cl.name||' '||d.label FROM division_assignments da JOIN teachers t ON da.teacher_id=t.id JOIN subjects s ON da.subject_id=s.id JOIN divisions d ON da.division_id=d.id JOIN classes cl ON d.class_id=cl.id WHERE da.elective_group_id=%s AND da.subject_id=%s AND da.deleted_at IS NULL ORDER BY 4,2",(EG,MS))
print("BEFORE:");[print(f"  {r[3]}: {r[1]} w={r[0]}") for r in x.fetchall()]
for did,dn in divs:
    x.execute("SELECT id,weightage FROM division_assignments WHERE elective_group_id=%s AND subject_id=%s AND teacher_id=%s AND division_id=%s AND deleted_at IS NULL ORDER BY created_at",(EG,MS,A[0],did))
    ar=x.fetchall()
    if len(ar)>=2:
        x.execute("UPDATE division_assignments SET weightage=8,updated_at=NOW() WHERE id=%s",(ar[0][0],))
        for r in ar[1:]:x.execute("UPDATE division_assignments SET deleted_at=NOW(),updated_at=NOW() WHERE id=%s",(r[0],));print(f"  {dn}: del dup {r[0][:8]}")
        print(f"  {dn}: Amrutha->w=8")
    elif ar:x.execute("UPDATE division_assignments SET weightage=8,updated_at=NOW() WHERE id=%s",(ar[0][0],));print(f"  {dn}: Amrutha->w=8")
    x.execute("SELECT id FROM division_assignments WHERE elective_group_id=%s AND subject_id=%s AND teacher_id=%s AND division_id=%s AND deleted_at IS NULL",(EG,MS,J[0],did))
    jr=x.fetchall()
    if jr:x.execute("UPDATE division_assignments SET weightage=8,updated_at=NOW() WHERE id=%s",(jr[0][0],));print(f"  {dn}: Julie->w=8")
    else:x.execute("INSERT INTO division_assignments(id,school_id,division_id,subject_id,teacher_id,weightage,elective_group_id,academic_year_id,created_at,updated_at) SELECT gen_random_uuid(),%s,%s,%s,%s,8,%s,academic_year_id,NOW(),NOW() FROM division_assignments WHERE division_id=%s AND deleted_at IS NULL LIMIT 1",(S,did,MS,J[0],EG,did));print(f"  {dn}: Julie added w=8")
x.execute("UPDATE elective_group_subjects SET parallel_sections=2 WHERE elective_group_id=%s AND subject_id=%s",(EG,MS))
print("parallel_sections->2")
c.commit()
x.execute("SELECT da.weightage,t.name,cl.name||' '||d.label FROM division_assignments da JOIN teachers t ON da.teacher_id=t.id JOIN divisions d ON da.division_id=d.id JOIN classes cl ON d.class_id=cl.id WHERE da.elective_group_id=%s AND da.subject_id=%s AND da.deleted_at IS NULL ORDER BY 3,2",(EG,MS))
print("AFTER:");[print(f"  {r[2]}: {r[1]} w={r[0]}") for r in x.fetchall()]
x.execute("SELECT parallel_sections FROM elective_group_subjects WHERE elective_group_id=%s AND subject_id=%s",(EG,MS))
print(f"ps={x.fetchone()[0]}")
c.close();print("Done!")
