"""Set scheduling preferences for all Physical Training assignments."""
import os,psycopg2,json
DB=os.environ.get("DATABASE_URL")
c=psycopg2.connect(DB)
x=c.cursor()
S='17760dca-2a11-43fd-a2ef-0acc0083747c'
prefs=json.dumps({"constraintType":"HARD","maxPeriodsPerDay":1,"preferredPeriodRange":{"min":2,"max":7}})
x.execute("SELECT id FROM subjects WHERE name='Physical Training' AND school_id=%s AND deleted_at IS NULL",(S,))
subj=x.fetchone()
if not subj:print("No PT subject found");c.close();exit(1)
print(f"PT subject: {subj[0]}")
x.execute("""UPDATE division_assignments SET scheduling_preferences=%s::jsonb, updated_at=NOW()
WHERE subject_id=%s AND school_id=%s AND deleted_at IS NULL""",(prefs,subj[0],S))
cnt=x.rowcount
print(f"Updated {cnt} assignments")
c.commit()
x.execute("""SELECT da.id,cl.name||' '||d.label as div,t.name,da.weightage,da.scheduling_preferences
FROM division_assignments da JOIN divisions d ON da.division_id=d.id JOIN classes cl ON d.class_id=cl.id
LEFT JOIN teachers t ON da.teacher_id=t.id
WHERE da.subject_id=%s AND da.school_id=%s AND da.deleted_at IS NULL ORDER BY cl.sort_order,d.label""",(subj[0],S))
print("AFTER:")
for r in x.fetchall():print(f"  {r[1]}: {r[2]} w={r[3]} prefs={r[4]}")
c.close();print("Done!")
