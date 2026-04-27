"""Fix XII IP and CS duplicates: add Shijo for IP, Swetha for CS."""
import os,psycopg2
DB=os.environ.get("DATABASE_URL")
c=psycopg2.connect(DB)
x=c.cursor()
S='17760dca-2a11-43fd-a2ef-0acc0083747c'
x.execute("SELECT id FROM elective_groups WHERE name LIKE '%%XII%%Maths%%Psy%%' AND school_id=%s",(S,))
EG_MIP=x.fetchone()[0]
x.execute("SELECT id FROM elective_groups WHERE name LIKE '%%XII%%Bio%%Cs%%' AND school_id=%s",(S,))
EG_BIO=x.fetchone()[0]
x.execute("SELECT id FROM subjects WHERE name='Informatics Practices' AND school_id=%s AND deleted_at IS NULL",(S,))
IP=x.fetchone()[0]
x.execute("SELECT id FROM subjects WHERE name='Computer Science' AND school_id=%s AND deleted_at IS NULL",(S,))
CS=x.fetchone()[0]
x.execute("SELECT id FROM teachers WHERE name LIKE '%%Anitha%%' AND school_id=%s AND deleted_at IS NULL",(S,))
AN=x.fetchone()[0]
x.execute("SELECT id FROM teachers WHERE name LIKE '%%Shijo%%' AND school_id=%s AND deleted_at IS NULL",(S,))
SH=x.fetchone()[0]
x.execute("SELECT id FROM teachers WHERE name LIKE '%%Ann John%%' AND school_id=%s AND deleted_at IS NULL",(S,))
AJ=x.fetchone()[0]
x.execute("SELECT id FROM teachers WHERE name LIKE '%%Swetha%%' AND school_id=%s AND deleted_at IS NULL",(S,))
SW=x.fetchone()[0]
print(f"EG_MIP={EG_MIP} EG_BIO={EG_BIO} IP={IP} CS={CS} AN={AN} SH={SH} AJ={AJ} SW={SW}")
def fix(eg,subj,old_t,new_t,old_n,new_n):
    x.execute("SELECT DISTINCT da.division_id,cl.name||' '||d.label FROM division_assignments da JOIN divisions d ON da.division_id=d.id JOIN classes cl ON d.class_id=cl.id WHERE da.elective_group_id=%s AND da.deleted_at IS NULL ORDER BY 2",(eg,))
    for did,dn in x.fetchall():
        x.execute("SELECT id FROM division_assignments WHERE elective_group_id=%s AND subject_id=%s AND teacher_id=%s AND division_id=%s AND deleted_at IS NULL ORDER BY created_at",(eg,subj,old_t,did))
        rows=x.fetchall()
        if len(rows)>=2:
            x.execute("UPDATE division_assignments SET weightage=4,updated_at=NOW() WHERE id=%s",(rows[0][0],))
            for r in rows[1:]:x.execute("UPDATE division_assignments SET deleted_at=NOW(),updated_at=NOW() WHERE id=%s",(r[0],))
            print(f"  {dn}: {old_n} consolidated w=4, deleted {len(rows)-1} dups")
        elif rows:x.execute("UPDATE division_assignments SET weightage=4,updated_at=NOW() WHERE id=%s",(rows[0][0],));print(f"  {dn}: {old_n} w=4")
        x.execute("SELECT id FROM division_assignments WHERE elective_group_id=%s AND subject_id=%s AND teacher_id=%s AND division_id=%s AND deleted_at IS NULL",(eg,subj,new_t,did))
        if not x.fetchall():
            x.execute("INSERT INTO division_assignments(id,school_id,division_id,subject_id,teacher_id,weightage,elective_group_id,academic_year_id,created_at,updated_at) SELECT gen_random_uuid(),%s,%s,%s,%s,4,%s,academic_year_id,NOW(),NOW() FROM division_assignments WHERE division_id=%s AND deleted_at IS NULL LIMIT 1",(S,did,subj,new_t,eg,did))
            print(f"  {dn}: {new_n} added w=4")
print("--- IP fix ---")
fix(EG_MIP,IP,AN,SH,"Anitha","Shijo")
print("--- CS fix ---")
fix(EG_BIO,CS,AJ,SW,"Ann John","Swetha")
c.commit()
print("--- VERIFY ---")
for eg in [EG_MIP,EG_BIO]:
    x.execute("SELECT t.name,s.name,da.weightage,cl.name||' '||d.label FROM division_assignments da JOIN teachers t ON da.teacher_id=t.id JOIN subjects s ON da.subject_id=s.id JOIN divisions d ON da.division_id=d.id JOIN classes cl ON d.class_id=cl.id WHERE da.elective_group_id=%s AND da.subject_id IN (%s,%s) AND da.deleted_at IS NULL ORDER BY 4,2,1",(eg,IP,CS))
    for r in x.fetchall():print(f"  {r[3]}: {r[1]} - {r[0]} w={r[2]}")
c.close();print("Done!")
