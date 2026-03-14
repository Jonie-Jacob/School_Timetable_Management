import { PrismaClient, SlotType, AcademicYearStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. School ──────────────────────────────────────────
  const school = await prisma.school.create({
    data: {
      name: 'Sacred Heart School',
      adminEmail: 'admin@sacredheart.edu',
      cognitoUserId: 'local-dev-user-001',
    },
  });
  console.log(`  ✓ School: ${school.name}`);

  // ─── 2. Academic Year ───────────────────────────────────
  const ay = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      label: '2026-27',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2027-03-31'),
      status: AcademicYearStatus.ACTIVE,
    },
  });
  console.log(`  ✓ Academic Year: ${ay.label}`);

  // ─── 3. Subjects (31 unique subjects) ───────────────────
  const subjectNames = [
    'English', 'Hindi', 'Malayalam', 'Mathematics', 'Science',
    'Social Studies', 'Environmental Studies', 'Physics', 'Chemistry',
    'Biology', 'Computer Science', 'Informatics Practices',
    'Information Technology', 'Business Studies', 'Accountancy',
    'Economics', 'History', 'Political Science', 'Psychology',
    'Informatics Practices / Psychology', 'General Knowledge',
    'Life Skills', 'Physical Training', 'Drawing', 'Dance / Music',
    'Library', 'STEAM', 'Little Prodigy', 'Co-Curricular Activities',
    'Maths/IP', 'Maths/IP/PSY',
  ];
  const subjectMap = new Map<string, string>();
  for (const name of subjectNames) {
    const s = await prisma.subject.create({
      data: { schoolId: school.id, academicYearId: ay.id, name },
    });
    subjectMap.set(name, s.id);
  }
  console.log(`  ✓ Subjects: ${subjectMap.size}`);

  // ─── 4. Teachers (54) ──────────────────────────────────
  const teacherData: { name: string; subjects: string[] }[] = [
    { name: 'Ashamol', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Roshni', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Lin Maria', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Asha Susan Jacob', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Anu S Nair', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Manju', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Anu Mathew', subjects: ['Science', 'Physics', 'Chemistry', 'Biology'] },
    { name: 'Renila Mary John', subjects: ['Science', 'Environmental Studies', 'Physical Training', 'Co-Curricular Activities'] },
    { name: 'Dominic Saj Jose', subjects: ['English'] },
    { name: 'Siya', subjects: ['English'] },
    { name: 'Deepa', subjects: ['English'] },
    { name: 'Siju Samuel', subjects: ['English'] },
    { name: 'Anju Sebastian', subjects: ['English'] },
    { name: 'Anju Maria Joseph', subjects: ['English'] },
    { name: 'Aleena Josy', subjects: ['English'] },
    { name: 'Ansu', subjects: ['English'] },
    { name: 'Devassia', subjects: ['Social Studies', 'History', 'Political Science', 'Economics'] },
    { name: 'Saritha Mohan', subjects: ['Social Studies', 'History', 'Political Science', 'Economics'] },
    { name: 'Sonu Mathew', subjects: ['Social Studies', 'History', 'Political Science', 'Economics'] },
    { name: 'Albin Benny', subjects: ['Social Studies', 'History', 'Political Science', 'Economics'] },
    { name: 'Athira', subjects: ['Social Studies', 'History', 'Political Science', 'Economics'] },
    { name: 'Aleena Joseph', subjects: ['Social Studies', 'Environmental Studies', 'General Knowledge', 'Physical Training'] },
    { name: 'Reshma P Nair', subjects: ['Social Studies', 'Political Science', 'Environmental Studies'] },
    { name: 'Niji Abraham', subjects: ['Malayalam'] },
    { name: 'Ambily', subjects: ['Malayalam'] },
    { name: 'Jayasree', subjects: ['Malayalam'] },
    { name: 'Prabha', subjects: ['Malayalam'] },
    { name: 'Julie', subjects: ['Mathematics'] },
    { name: 'Amrutha', subjects: ['Mathematics'] },
    { name: 'Saritha K', subjects: ['Mathematics', 'STEAM'] },
    { name: 'Rajani', subjects: ['Mathematics'] },
    { name: 'Remya', subjects: ['Mathematics'] },
    { name: 'Smitha', subjects: ['Mathematics'] },
    { name: 'Sahana', subjects: ['Mathematics'] },
    { name: 'Gopikadas', subjects: ['Psychology'] },
    { name: 'Anumol', subjects: ['Psychology'] },
    { name: 'Aneesha', subjects: ['Hindi'] },
    { name: 'Jaya', subjects: ['Hindi'] },
    { name: 'Deepthi', subjects: ['Hindi'] },
    { name: 'Sreethu', subjects: ['Hindi'] },
    { name: 'Fr. Josh Kanjooparambil', subjects: ['Life Skills'] },
    { name: 'Fr. Antony', subjects: ['Life Skills'] },
    { name: 'Fr. Jyothis', subjects: ['Life Skills'] },
    { name: 'Br. Jiss', subjects: ['Life Skills', 'Social Studies'] },
    { name: 'Sulajamma', subjects: ['Library'] },
    { name: 'Sreejesh', subjects: ['Drawing'] },
    { name: 'Akash', subjects: ['Life Skills', 'Physical Training', 'STEAM', 'Library'] },
    { name: 'Akhil', subjects: ['Physical Training', 'Library', 'STEAM'] },
    { name: 'Nayana', subjects: ['Library', 'Mathematics', 'STEAM'] },
    { name: 'Mahesh Chandran', subjects: ['Library', 'STEAM', 'Mathematics'] },
    { name: 'Anitha', subjects: ['Informatics Practices', 'Information Technology', 'Life Skills', 'STEAM'] },
    { name: 'Swetha', subjects: ['Computer Science', 'Information Technology'] },
    { name: 'Ann', subjects: ['Computer Science', 'Information Technology'] },
    { name: 'Shijo C Mathew', subjects: ['Informatics Practices', 'Information Technology'] },
  ];

  const teacherMap = new Map<string, string>();
  for (const td of teacherData) {
    const teacher = await prisma.teacher.create({
      data: { schoolId: school.id, academicYearId: ay.id, name: td.name },
    });
    teacherMap.set(td.name, teacher.id);
    // Create teacher-subject links
    for (const subjectName of td.subjects) {
      const subjectId = subjectMap.get(subjectName);
      if (subjectId) {
        await prisma.teacherSubject.create({
          data: { schoolId: school.id, teacherId: teacher.id, subjectId },
        });
      }
    }
  }
  console.log(`  ✓ Teachers: ${teacherMap.size} (with subject links)`);

  // ─── 5. Classes & Divisions ─────────────────────────────
  const classesData: {
    name: string;
    sortOrder: number;
    requiresStream: boolean;
    divisions: { label: string; streamName?: string }[];
  }[] = [
    { name: 'Class I', sortOrder: 1, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { name: 'Class II', sortOrder: 2, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
    { name: 'Class III', sortOrder: 3, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
    { name: 'Class IV', sortOrder: 4, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
    { name: 'Class V', sortOrder: 5, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { name: 'Class VI', sortOrder: 6, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
    { name: 'Class VII', sortOrder: 7, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { name: 'Class VIII', sortOrder: 8, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { name: 'Class IX', sortOrder: 9, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
    { name: 'Class X', sortOrder: 10, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
    {
      name: 'Class XI', sortOrder: 11, requiresStream: true,
      divisions: [
        { label: 'A', streamName: 'Science' },
        { label: 'B', streamName: 'Science' },
        { label: 'C', streamName: 'Commerce' },
        { label: 'D', streamName: 'Humanities' },
      ],
    },
    {
      name: 'Class XII', sortOrder: 12, requiresStream: true,
      divisions: [
        { label: 'A', streamName: 'Science' },
        { label: 'B', streamName: 'Science' },
        { label: 'C', streamName: 'Commerce' },
        { label: 'D', streamName: 'Humanities' },
      ],
    },
  ];

  // divisionMap key format: "Class I-A" or "Class XI-A-Science"
  const divisionMap = new Map<string, string>();
  const classMap = new Map<string, string>();
  for (const cd of classesData) {
    const cls = await prisma.class.create({
      data: {
        schoolId: school.id,
        academicYearId: ay.id,
        name: cd.name,
        sortOrder: cd.sortOrder,
        requiresStream: cd.requiresStream,
      },
    });
    classMap.set(cd.name, cls.id);

    for (const d of cd.divisions) {
      const div = await prisma.division.create({
        data: {
          schoolId: school.id,
          classId: cls.id,
          academicYearId: ay.id,
          label: d.label,
          streamName: d.streamName ?? null,
        },
      });
      const key = d.streamName
        ? `${cd.name}-${d.label}-${d.streamName}`
        : `${cd.name}-${d.label}`;
      divisionMap.set(key, div.id);
    }
  }
  console.log(`  ✓ Classes: ${classMap.size}, Divisions: ${divisionMap.size}`);

  // ─── 6. Period Structures ───────────────────────────────
  // Two structures: "Standard (8 periods)" for I-IX, "Extended (9 periods)" for X-XII
  const ps8 = await prisma.periodStructure.create({
    data: {
      schoolId: school.id,
      academicYearId: ay.id,
      name: 'Standard (8 periods)',
    },
  });
  const ps9 = await prisma.periodStructure.create({
    data: {
      schoolId: school.id,
      academicYearId: ay.id,
      name: 'Extended (9 periods)',
    },
  });

  // Link classes to period structures
  for (const [className, classId] of classMap) {
    const sortOrder = classesData.find((c) => c.name === className)!.sortOrder;
    const psId = sortOrder >= 10 ? ps9.id : ps8.id; // Class X(10), XI(11), XII(12) → 9 periods
    await prisma.periodStructureClass.create({
      data: { schoolId: school.id, periodStructureId: psId, classId },
    });
  }
  console.log(`  ✓ Period Structures: 2 (Standard 8, Extended 9)`);

  // ─── 7. Working Days + Slots ────────────────────────────
  const days = [
    { dayOfWeek: 1, label: 'Monday' },
    { dayOfWeek: 2, label: 'Tuesday' },
    { dayOfWeek: 3, label: 'Wednesday' },
    { dayOfWeek: 4, label: 'Thursday' },
    { dayOfWeek: 5, label: 'Friday' },
  ];

  // Slot template for 8-period structure
  const slotTemplate8: { slotType: SlotType; slotNumber: number | null; startTime: string; endTime: string }[] = [
    { slotType: 'PERIOD', slotNumber: 1, startTime: '08:30', endTime: '09:10' },
    { slotType: 'PERIOD', slotNumber: 2, startTime: '09:10', endTime: '09:50' },
    { slotType: 'INTERVAL', slotNumber: null, startTime: '09:50', endTime: '10:00' },
    { slotType: 'PERIOD', slotNumber: 3, startTime: '10:00', endTime: '10:40' },
    { slotType: 'PERIOD', slotNumber: 4, startTime: '10:40', endTime: '11:20' },
    { slotType: 'LUNCH_BREAK', slotNumber: null, startTime: '11:20', endTime: '11:50' },
    { slotType: 'PERIOD', slotNumber: 5, startTime: '11:50', endTime: '12:30' },
    { slotType: 'PERIOD', slotNumber: 6, startTime: '12:30', endTime: '13:10' },
    { slotType: 'INTERVAL', slotNumber: null, startTime: '13:10', endTime: '13:20' },
    { slotType: 'PERIOD', slotNumber: 7, startTime: '13:20', endTime: '14:00' },
    { slotType: 'PERIOD', slotNumber: 8, startTime: '14:00', endTime: '14:40' },
  ];

  // Slot template for 9-period structure (adds period 9 after period 8)
  const slotTemplate9 = [
    ...slotTemplate8,
    { slotType: 'PERIOD' as SlotType, slotNumber: 9, startTime: '14:40', endTime: '15:20' },
  ];

  const toTimeOnly = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

  for (const ps of [ps8, ps9]) {
    const template = ps.id === ps8.id ? slotTemplate8 : slotTemplate9;
    for (let di = 0; di < days.length; di++) {
      const d = days[di];
      const wd = await prisma.workingDay.create({
        data: {
          schoolId: school.id,
          periodStructureId: ps.id,
          dayOfWeek: d.dayOfWeek,
          label: d.label,
          sortOrder: di + 1,
        },
      });

      for (let si = 0; si < template.length; si++) {
        const t = template[si];
        await prisma.slot.create({
          data: {
            schoolId: school.id,
            workingDayId: wd.id,
            slotType: t.slotType,
            slotNumber: t.slotNumber,
            startTime: toTimeOnly(t.startTime),
            endTime: toTimeOnly(t.endTime),
            sortOrder: si + 1,
          },
        });
      }
    }
  }
  console.log(`  ✓ Working Days: ${days.length * 2} (5 per structure)`);
  console.log(`  ✓ Slots: ${slotTemplate8.length * 5 + slotTemplate9.length * 5}`);

  // ─── 8. Division Assignments (representative sample) ────
  // Helper to create assignments for a division
  const assign = async (
    divKey: string,
    assignments: { subject: string; teacher: string; weightage: number }[],
  ) => {
    const divisionId = divisionMap.get(divKey);
    if (!divisionId) {
      console.warn(`  ⚠ Division not found: ${divKey}`);
      return;
    }
    for (const a of assignments) {
      const sub = subjectMap.get(a.subject);
      const tch = teacherMap.get(a.teacher);
      if (!sub || !tch) {
        // Skip entries with *verify* placeholder teachers
        continue;
      }
      await prisma.divisionAssignment.create({
        data: {
          schoolId: school.id,
          divisionId,
          subjectId: sub,
          teacherId: tch,
          weightage: a.weightage,
          academicYearId: ay.id,
        },
      });
    }
  };

  // Class I A
  await assign('Class I-A', [
    { subject: 'English', teacher: 'Siya', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Niji Abraham', weightage: 5 },
    { subject: 'Hindi', teacher: 'Jaya', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Julie', weightage: 7 },
    { subject: 'Environmental Studies', teacher: 'Renila Mary John', weightage: 5 },
    { subject: 'General Knowledge', teacher: 'Ansu', weightage: 1 },
    { subject: 'Life Skills', teacher: 'Akash', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Akash', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Akhil', weightage: 1 },
    { subject: 'Little Prodigy', teacher: 'Anumol', weightage: 2 },
  ]);

  // Class I B
  await assign('Class I-B', [
    { subject: 'English', teacher: 'Siya', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Niji Abraham', weightage: 5 },
    { subject: 'Hindi', teacher: 'Sreethu', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Julie', weightage: 7 },
    { subject: 'Environmental Studies', teacher: 'Renila Mary John', weightage: 5 },
    { subject: 'General Knowledge', teacher: 'Ansu', weightage: 1 },
    { subject: 'Life Skills', teacher: 'Akash', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Akash', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 1 },
    { subject: 'Little Prodigy', teacher: 'Anumol', weightage: 2 },
  ]);

  // Class I C (verified teachers only)
  await assign('Class I-C', [
    { subject: 'English', teacher: 'Ansu', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Niji Abraham', weightage: 5 },
    { subject: 'Hindi', teacher: 'Sreethu', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Julie', weightage: 7 },
    { subject: 'Environmental Studies', teacher: 'Renila Mary John', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
  ]);

  // Class II A
  await assign('Class II-A', [
    { subject: 'English', teacher: 'Ansu', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Prabha', weightage: 4 },
    { subject: 'Hindi', teacher: 'Sreethu', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Sahana', weightage: 7 },
    { subject: 'Environmental Studies', teacher: 'Aleena Joseph', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Nayana', weightage: 1 },
    { subject: 'Little Prodigy', teacher: 'Anumol', weightage: 2 },
  ]);

  // Class II B
  await assign('Class II-B', [
    { subject: 'English', teacher: 'Ansu', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Prabha', weightage: 4 },
    { subject: 'Hindi', teacher: 'Sreethu', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Sahana', weightage: 7 },
    { subject: 'Environmental Studies', teacher: 'Renila Mary John', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 1 },
    { subject: 'Little Prodigy', teacher: 'Anumol', weightage: 2 },
  ]);

  // Class III A
  await assign('Class III-A', [
    { subject: 'English', teacher: 'Deepa', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 5 },
    { subject: 'Hindi', teacher: 'Jaya', weightage: 4 },
    { subject: 'Science', teacher: 'Anu Mathew', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Athira', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Remya', weightage: 5 },
    { subject: 'Life Skills', teacher: 'Anitha', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Shijo C Mathew', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Nayana', weightage: 1 },
  ]);

  // Class III B
  await assign('Class III-B', [
    { subject: 'English', teacher: 'Anu Mathew', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 5 },
    { subject: 'Hindi', teacher: 'Jaya', weightage: 4 },
    { subject: 'Science', teacher: 'Manju', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Athira', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Remya', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Shijo C Mathew', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
  ]);

  // Class IV A
  await assign('Class IV-A', [
    { subject: 'English', teacher: 'Siju Samuel', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 5 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Anu Mathew', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Athira', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Remya', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Shijo C Mathew', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Akhil', weightage: 1 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Akhil', weightage: 1 },
    { subject: 'STEAM', teacher: 'Akhil', weightage: 1 },
  ]);

  // Class IV B
  await assign('Class IV-B', [
    { subject: 'English', teacher: 'Siju Samuel', weightage: 7 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 5 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Anu S Nair', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Athira', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Remya', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Akhil', weightage: 1 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Akhil', weightage: 1 },
    { subject: 'STEAM', teacher: 'Akhil', weightage: 1 },
  ]);

  // Class V A
  await assign('Class V-A', [
    { subject: 'English', teacher: 'Aleena Josy', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 5 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Manju', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Sonu Mathew', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Saritha K', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Akhil', weightage: 1 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Nayana', weightage: 1 },
    { subject: 'STEAM', teacher: 'Akhil', weightage: 2 },
  ]);

  // Class V B
  await assign('Class V-B', [
    { subject: 'English', teacher: 'Deepa', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 5 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Manju', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Sonu Mathew', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Saritha K', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Nayana', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 2 },
  ]);

  // Class V C
  await assign('Class V-C', [
    { subject: 'English', teacher: 'Aleena Josy', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 5 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Roshni', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Sonu Mathew', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Saritha K', weightage: 5 },
    { subject: 'Life Skills', teacher: 'Br. Jiss', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Akhil', weightage: 2 },
  ]);

  // Class VI A
  await assign('Class VI-A', [
    { subject: 'English', teacher: 'Anju Sebastian', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Prabha', weightage: 5 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 4 },
    { subject: 'Science', teacher: 'Ashamol', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Aleena Joseph', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Smitha', weightage: 5 },
    { subject: 'Life Skills', teacher: 'Br. Jiss', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Ann', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Aleena Joseph', weightage: 1 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 2 },
  ]);

  // Class VI B
  await assign('Class VI-B', [
    { subject: 'English', teacher: 'Anju Sebastian', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Prabha', weightage: 5 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 4 },
    { subject: 'Science', teacher: 'Roshni', weightage: 4 },
    { subject: 'Social Studies', teacher: 'Aleena Joseph', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Smitha', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Swetha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 2 },
  ]);

  // Class VII A
  await assign('Class VII-A', [
    { subject: 'English', teacher: 'Anju Maria Joseph', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Prabha', weightage: 4 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 4 },
    { subject: 'Science', teacher: 'Anu S Nair', weightage: 5 },
    { subject: 'Social Studies', teacher: 'Aleena Joseph', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Sahana', weightage: 5 },
    { subject: 'General Knowledge', teacher: 'Gopikadas', weightage: 1 },
    { subject: 'Life Skills', teacher: 'Br. Jiss', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Shijo C Mathew', weightage: 2 },
    { subject: 'Physical Training', teacher: 'Akhil', weightage: 1 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Nayana', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 2 },
  ]);

  // Class VII B
  await assign('Class VII-B', [
    { subject: 'English', teacher: 'Anju Maria Joseph', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 4 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 4 },
    { subject: 'Science', teacher: 'Lin Maria', weightage: 5 },
    { subject: 'Social Studies', teacher: 'Sonu Mathew', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Nayana', weightage: 5 },
    { subject: 'General Knowledge', teacher: 'Gopikadas', weightage: 1 },
    { subject: 'Life Skills', teacher: 'Br. Jiss', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Swetha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Nayana', weightage: 1 },
    { subject: 'STEAM', teacher: 'Akhil', weightage: 2 },
  ]);

  // Class VII C
  await assign('Class VII-C', [
    { subject: 'English', teacher: 'Dominic Saj Jose', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 4 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Manju', weightage: 5 },
    { subject: 'Social Studies', teacher: 'Albin Benny', weightage: 4 },
    { subject: 'Mathematics', teacher: 'Sahana', weightage: 5 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 2 },
    { subject: 'Drawing', teacher: 'Sreejesh', weightage: 1 },
    { subject: 'Dance / Music', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Anitha', weightage: 2 },
  ]);

  // Class VIII A
  await assign('Class VIII-A', [
    { subject: 'English', teacher: 'Dominic Saj Jose', weightage: 5 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 4 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Ashamol', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Sonu Mathew', weightage: 5 },
    { subject: 'Mathematics', teacher: 'Amrutha', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Fr. Jyothis', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Swetha', weightage: 2 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Mahesh Chandran', weightage: 2 },
  ]);

  // Class VIII B
  await assign('Class VIII-B', [
    { subject: 'English', teacher: 'Anju Sebastian', weightage: 5 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 4 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Roshni', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Sonu Mathew', weightage: 5 },
    { subject: 'Mathematics', teacher: 'Smitha', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Fr. Jyothis', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Shijo C Mathew', weightage: 2 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Remya', weightage: 2 },
  ]);

  // Class VIII C
  await assign('Class VIII-C', [
    { subject: 'English', teacher: 'Aleena Josy', weightage: 5 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 4 },
    { subject: 'Hindi', teacher: 'Aneesha', weightage: 4 },
    { subject: 'Science', teacher: 'Renila Mary John', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Albin Benny', weightage: 5 },
    { subject: 'Mathematics', teacher: 'Smitha', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Fr. Jyothis', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Ann', weightage: 2 },
    { subject: 'General Knowledge', teacher: 'Gopikadas', weightage: 1 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
    { subject: 'STEAM', teacher: 'Smitha', weightage: 2 },
  ]);

  // Class IX A
  await assign('Class IX-A', [
    { subject: 'English', teacher: 'Anju Sebastian', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 5 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 5 },
    { subject: 'Science', teacher: 'Asha Susan Jacob', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Albin Benny', weightage: 6 },
    { subject: 'Mathematics', teacher: 'Rajani', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Fr. Jyothis', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Shijo C Mathew', weightage: 5 },
  ]);

  // Class IX B
  await assign('Class IX-B', [
    { subject: 'English', teacher: 'Deepa', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Jayasree', weightage: 5 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 5 },
    { subject: 'Science', teacher: 'Manju', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Albin Benny', weightage: 6 },
    { subject: 'Mathematics', teacher: 'Rajani', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Fr. Jyothis', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Ann', weightage: 5 },
  ]);

  // Class IX C
  await assign('Class IX-C', [
    { subject: 'English', teacher: 'Anju Maria Joseph', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Ambily', weightage: 5 },
    { subject: 'Hindi', teacher: 'Deepthi', weightage: 5 },
    { subject: 'Science', teacher: 'Anu Mathew', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Reshma P Nair', weightage: 6 },
    { subject: 'Mathematics', teacher: 'Amrutha', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Fr. Jyothis', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Swetha', weightage: 5 },
  ]);

  // Class X A
  await assign('Class X-A', [
    { subject: 'English', teacher: 'Dominic Saj Jose', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Niji Abraham', weightage: 5 },
    { subject: 'Hindi', teacher: 'Jaya', weightage: 5 },
    { subject: 'Science', teacher: 'Asha Susan Jacob', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Saritha Mohan', weightage: 6 },
    { subject: 'Mathematics', teacher: 'Amrutha', weightage: 6 },
    { subject: 'Life Skills', teacher: 'Anitha', weightage: 1 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 5 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
  ]);

  // Class X B
  await assign('Class X-B', [
    { subject: 'English', teacher: 'Siju Samuel', weightage: 6 },
    { subject: 'Malayalam', teacher: 'Niji Abraham', weightage: 5 },
    { subject: 'Hindi', teacher: 'Jaya', weightage: 5 },
    { subject: 'Science', teacher: 'Anu S Nair', weightage: 6 },
    { subject: 'Social Studies', teacher: 'Saritha Mohan', weightage: 6 },
    { subject: 'Mathematics', teacher: 'Amrutha', weightage: 6 },
    { subject: 'Information Technology', teacher: 'Anitha', weightage: 5 },
    { subject: 'Library', teacher: 'Sulajamma', weightage: 1 },
  ]);

  // Class XI A Science
  await assign('Class XI-A-Science', [
    { subject: 'English', teacher: 'Dominic Saj Jose', weightage: 7 },
    { subject: 'Physics', teacher: 'Lin Maria', weightage: 9 },
    { subject: 'Chemistry', teacher: 'Roshni', weightage: 9 },
    { subject: 'Mathematics', teacher: 'Julie', weightage: 9 },
    { subject: 'Informatics Practices', teacher: 'Shijo C Mathew', weightage: 9 },
    { subject: 'Life Skills', teacher: 'Fr. Antony', weightage: 1 },
  ]);

  // Class XI B Science
  await assign('Class XI-B-Science', [
    { subject: 'English', teacher: 'Aleena Josy', weightage: 7 },
    { subject: 'Physics', teacher: 'Asha Susan Jacob', weightage: 9 },
    { subject: 'Chemistry', teacher: 'Ashamol', weightage: 9 },
    { subject: 'Mathematics', teacher: 'Julie', weightage: 9 },
    { subject: 'Computer Science', teacher: 'Ann', weightage: 9 },
    { subject: 'Life Skills', teacher: 'Fr. Josh Kanjooparambil', weightage: 1 },
  ]);

  // Class XI C Commerce
  await assign('Class XI-C-Commerce', [
    { subject: 'English', teacher: 'Siya', weightage: 7 },
  ]);

  // Class XI D Humanities
  await assign('Class XI-D-Humanities', [
    { subject: 'History', teacher: 'Devassia', weightage: 9 },
    { subject: 'Political Science', teacher: 'Reshma P Nair', weightage: 9 },
    { subject: 'Informatics Practices / Psychology', teacher: 'Gopikadas', weightage: 9 },
    { subject: 'Life Skills', teacher: 'Fr. Josh Kanjooparambil', weightage: 1 },
  ]);

  // Class XII A Science
  await assign('Class XII-A-Science', [
    { subject: 'English', teacher: 'Anju Maria Joseph', weightage: 7 },
    { subject: 'Physics', teacher: 'Lin Maria', weightage: 9 },
    { subject: 'Chemistry', teacher: 'Roshni', weightage: 9 },
    { subject: 'Mathematics', teacher: 'Rajani', weightage: 9 },
    { subject: 'Life Skills', teacher: 'Fr. Antony', weightage: 1 },
  ]);

  // Class XII B Science
  await assign('Class XII-B-Science', [
    { subject: 'English', teacher: 'Siju Samuel', weightage: 7 },
    { subject: 'Physics', teacher: 'Asha Susan Jacob', weightage: 9 },
    { subject: 'Chemistry', teacher: 'Ashamol', weightage: 9 },
    { subject: 'Mathematics', teacher: 'Rajani', weightage: 9 },
    { subject: 'Life Skills', teacher: 'Fr. Josh Kanjooparambil', weightage: 1 },
  ]);

  // Class XII D Humanities
  await assign('Class XII-D-Humanities', [
    { subject: 'History', teacher: 'Devassia', weightage: 9 },
    { subject: 'Political Science', teacher: 'Reshma P Nair', weightage: 9 },
    { subject: 'Informatics Practices / Psychology', teacher: 'Gopikadas', weightage: 9 },
  ]);

  const assignmentCount = await prisma.divisionAssignment.count();
  console.log(`  ✓ Division Assignments: ${assignmentCount}`);

  // ─── Summary ────────────────────────────────────────────
  const counts = {
    schools: await prisma.school.count(),
    academicYears: await prisma.academicYear.count(),
    classes: await prisma.class.count(),
    divisions: await prisma.division.count(),
    subjects: await prisma.subject.count(),
    teachers: await prisma.teacher.count(),
    teacherSubjects: await prisma.teacherSubject.count(),
    periodStructures: await prisma.periodStructure.count(),
    periodStructureClasses: await prisma.periodStructureClass.count(),
    workingDays: await prisma.workingDay.count(),
    slots: await prisma.slot.count(),
    divisionAssignments: await prisma.divisionAssignment.count(),
  };
  console.log('\n📊 Seed Summary:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`   ${table}: ${count}`);
  }
  console.log('\n✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
