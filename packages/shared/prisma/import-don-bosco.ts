/**
 * Import script: Don Bosco School data from DataCollection.md
 *
 * Usage:
 *   npx tsx packages/shared/prisma/import-don-bosco.ts
 *
 * Set DATABASE_URL env var to target the correct database.
 */
import { PrismaClient, SlotType, AcademicYearStatus } from '@prisma/client';

const prisma = new PrismaClient();
const schoolUserModel = () => (prisma as any).schoolUser;

// ─── Subject list with abbreviations ────────────────────────
const SUBJECTS: Array<{ name: string; abbreviation: string }> = [
  { name: 'English', abbreviation: 'ENG' },
  { name: 'Hindi', abbreviation: 'HIN' },
  { name: 'Malayalam', abbreviation: 'MAL' },
  { name: 'Mathematics', abbreviation: 'MATHS' },
  { name: 'Science', abbreviation: 'SCI' },
  { name: 'Social Science', abbreviation: 'SOC' },
  { name: 'Environmental Studies', abbreviation: 'EVS' },
  { name: 'Physics', abbreviation: 'PHY' },
  { name: 'Chemistry', abbreviation: 'CHEM' },
  { name: 'Biology', abbreviation: 'BIO' },
  { name: 'Computer Science', abbreviation: 'CS' },
  { name: 'Informatics Practices', abbreviation: 'IP' },
  { name: 'Information Technology', abbreviation: 'IT' },
  { name: 'Business Studies', abbreviation: 'BS' },
  { name: 'Accountancy', abbreviation: 'ACC' },
  { name: 'Economics', abbreviation: 'ECO' },
  { name: 'History', abbreviation: 'HIS' },
  { name: 'Political Science', abbreviation: 'PS' },
  { name: 'Psychology', abbreviation: 'PSY' },
  { name: 'General Knowledge', abbreviation: 'GK' },
  { name: 'Life Skills', abbreviation: 'LS' },
  { name: 'Physical Training', abbreviation: 'PT' },
  { name: 'Drawing', abbreviation: 'DRW' },
  { name: 'Dance', abbreviation: 'DAN' },
  { name: 'Music', abbreviation: 'MUS' },
  { name: 'Library', abbreviation: 'LIB' },
  { name: 'STEAM', abbreviation: 'STEAM' },
  { name: 'Little Prodigy', abbreviation: 'LP' },
  { name: 'Co-Curricular Activities', abbreviation: 'CCA' },
  { name: 'Artificial Intelligence', abbreviation: 'AI' },
  { name: 'Physics Lab', abbreviation: 'PHY-L' },
  { name: 'Chemistry Lab', abbreviation: 'CHEM-L' },
];

// ─── Teachers with qualified subjects ───────────────────────
const TEACHERS: Array<{ name: string; subjects: string[] }> = [
  { name: 'Ashamol P B', subjects: ['Science', 'Biology'] },
  { name: 'Roshni Daniel', subjects: ['Science', 'Biology'] },
  { name: 'Lin Maria', subjects: ['Science', 'Chemistry'] },
  { name: 'Asha Susan Jacob', subjects: ['Science', 'Chemistry'] },
  { name: 'Amalu Mathew', subjects: ['Science', 'Physics'] },
  { name: 'Manju R', subjects: ['Science', 'Physics'] },
  { name: 'Anu Mathew', subjects: ['Science', 'Physics'] },
  { name: 'Bibitha A B', subjects: ['Science', 'Environmental Studies', 'Biology'] },
  { name: 'Bini Treesa Antony', subjects: ['English', 'General Knowledge'] },
  { name: 'Siya Thomas', subjects: ['English'] },
  { name: 'Deepa G Nair', subjects: ['English'] },
  { name: 'Siju Samuel', subjects: ['English'] },
  { name: 'Aleena Maria Kuriachen', subjects: ['English'] },
  { name: 'Anju Maria Joseph', subjects: ['English'] },
  { name: 'Aleena Josy', subjects: ['English'] },
  { name: 'Ansu', subjects: ['English'] },
  { name: 'Devassia', subjects: ['Social Science', 'History', 'Political Science', 'Economics'] },
  { name: 'Saritha Mohan', subjects: ['Social Science', 'History', 'Political Science', 'Economics'] },
  { name: 'Sonu Mathew', subjects: ['Social Science', 'History', 'Political Science', 'Economics', 'Accountancy'] },
  { name: 'Albin Benny', subjects: ['Social Science', 'History', 'Political Science', 'Economics', 'Business Studies'] },
  { name: 'Athira', subjects: ['Social Science', 'History', 'Political Science', 'Economics'] },
  { name: 'Aleena Joseph', subjects: ['Social Science', 'Environmental Studies', 'General Knowledge', 'Physical Training'] },
  { name: 'Aleesha Varghese', subjects: ['Social Science', 'Political Science', 'Environmental Studies'] },
  { name: 'Niji Abraham', subjects: ['Malayalam'] },
  { name: 'Ambily', subjects: ['Malayalam'] },
  { name: 'Jayasree', subjects: ['Malayalam'] },
  { name: 'Prabha', subjects: ['Malayalam'] },
  { name: 'Julie Scaria', subjects: ['Mathematics'] },
  { name: 'Amrutha Saji', subjects: ['Mathematics'] },
  { name: 'Saritha K', subjects: ['Mathematics', 'STEAM'] },
  { name: 'Rajani R', subjects: ['Mathematics'] },
  { name: 'Remya Nair', subjects: ['Mathematics'] },
  { name: 'Smitha K V', subjects: ['Mathematics'] },
  { name: 'Sahana', subjects: ['Mathematics'] },
  { name: 'Gopikadas', subjects: ['Psychology', 'General Knowledge', 'Life Skills'] },
  { name: 'Gowri P G', subjects: ['Psychology', 'Life Skills'] },
  { name: 'Shridevi', subjects: ['Mathematics', 'Hindi'] },
  { name: 'Jaya', subjects: ['Hindi'] },
  { name: 'Anjumol Anil', subjects: ['Malayalam'] },
  { name: 'Sreethu', subjects: ['Hindi'] },
  { name: 'Fr. Josh Kanjooparambil', subjects: ['Life Skills'] },
  { name: 'Fr. Antony', subjects: ['Life Skills'] },
  { name: 'Fr. Jyothis', subjects: ['Life Skills'] },
  { name: 'Br. Jiss', subjects: ['Life Skills', 'Social Science'] },
  { name: 'Sulajamma', subjects: ['Library'] },
  { name: 'Sreejesh', subjects: ['Drawing'] },
  { name: 'Akash', subjects: ['Physical Training'] },
  { name: 'Anand Santosh', subjects: ['Physical Training'] },
  { name: 'Nayana', subjects: ['Dance'] },
  { name: 'Mahesh Chandran', subjects: ['Music'] },
  { name: 'Anitha', subjects: ['Informatics Practices', 'Information Technology'] },
  { name: 'Swetha', subjects: ['Computer Science', 'Information Technology'] },
  { name: 'Ann John', subjects: ['Computer Science', 'Information Technology'] },
  { name: 'Shijo C Mathew', subjects: ['Informatics Practices', 'Information Technology'] },
  { name: 'Ashish Kurian', subjects: ['Chemistry', 'Science'] },
  { name: 'Silpa N Raju', subjects: ['Chemistry', 'Science'] },
  { name: 'Shobitha Lakshmi', subjects: ['Social Science'] },
  { name: 'Soly', subjects: ['Little Prodigy'] },
  { name: 'Neethu', subjects: ['Malayalam'] },
  { name: 'Anakha', subjects: ['Hindi'] },
  { name: 'Sujatha', subjects: ['Hindi'] },
  { name: 'Akhil', subjects: ['Library', 'STEAM'] },
];

// ─── Teacher alias map (short name → full name) ─────────────
const TEACHER_ALIAS: Record<string, string> = {
  'Deepa': 'Deepa G Nair',
  'Silpa': 'Silpa N Raju',
  'Silpa N Raju': 'Silpa N Raju',
  'Ashamol': 'Ashamol P B',
  'Roshni': 'Roshni Daniel',
  'Bibitha': 'Bibitha A B',
  'Ashish': 'Ashish Kurian',
  'Rajani': 'Rajani R',
  'Remya': 'Remya Nair',
  'Smitha': 'Smitha K V',
  'Aleena Maria': 'Aleena Maria Kuriachen',
  'Julie': 'Julie Scaria',
  'Amrutha': 'Amrutha Saji',
  'Lin': 'Lin Maria',
  'Asha Susan': 'Asha Susan Jacob',
  'Albin': 'Albin Benny',
  'Shijo': 'Shijo C Mathew',
  'Ann': 'Ann John',
  'Anand': 'Anand Santosh',
  'Mahesh': 'Mahesh Chandran',
  'Bini Treesa': 'Bini Treesa Antony',
  'Sonu': 'Sonu Mathew',
  'Shobitha': 'Shobitha Lakshmi',
  'Shobita': 'Shobitha Lakshmi',
  'Shobita Lakshmi': 'Shobitha Lakshmi',
  'Anjumol': 'Anjumol Anil',
  'Anju Maria': 'Anju Maria Joseph',
  'Gopika': 'Gopikadas',
  'Fr. Josh': 'Fr. Josh Kanjooparambil',
  'Amalu': 'Amalu Mathew',
  'Manju': 'Manju R',
  'Siya': 'Siya Thomas',
  'Niji': 'Niji Abraham',
  'IP': 'Informatics Practices',
};

function resolveTeacher(name: string): string {
  return TEACHER_ALIAS[name] || name;
}

function resolveSubject(name: string): string {
  if (name === 'IP') return 'Informatics Practices';
  return name;
}

// ─── Classes and Divisions ──────────────────────────────────
interface ClassDef {
  name: string;
  sortOrder: number;
  requiresStream: boolean;
  divisions: Array<{ label: string; streamName?: string }>;
}

const CLASSES: ClassDef[] = [
  { name: 'Class I', sortOrder: 1, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class II', sortOrder: 2, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class III', sortOrder: 3, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class IV', sortOrder: 4, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class V', sortOrder: 5, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
  { name: 'Class VI', sortOrder: 6, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class VII', sortOrder: 7, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }] },
  { name: 'Class VIII', sortOrder: 8, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class IX', sortOrder: 9, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class X', sortOrder: 10, requiresStream: false, divisions: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] },
  { name: 'Class XI', sortOrder: 11, requiresStream: true, divisions: [
    { label: 'A', streamName: 'Science' },
    { label: 'B', streamName: 'Science' },
    { label: 'C', streamName: 'Science' },
    { label: 'D', streamName: 'Commerce & Humanities' },
  ]},
  { name: 'Class XII', sortOrder: 12, requiresStream: true, divisions: [
    { label: 'A', streamName: 'Science' },
    { label: 'B', streamName: 'Science' },
    { label: 'C', streamName: 'Commerce & Humanities' },
  ]},
];

// ─── Bell Schedule ──────────────────────────────────────────
interface SlotDef { type: 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK'; startTime: string; endTime: string; }
const BELL_SCHEDULE: SlotDef[] = [
  { type: 'PERIOD', startTime: '09:20', endTime: '10:00' },
  { type: 'PERIOD', startTime: '10:00', endTime: '10:40' },
  { type: 'INTERVAL', startTime: '10:40', endTime: '10:50' },
  { type: 'PERIOD', startTime: '10:50', endTime: '11:30' },
  { type: 'PERIOD', startTime: '11:30', endTime: '12:10' },
  { type: 'LUNCH_BREAK', startTime: '12:10', endTime: '12:50' },
  { type: 'PERIOD', startTime: '12:50', endTime: '13:30' },
  { type: 'PERIOD', startTime: '13:30', endTime: '14:10' },
  { type: 'INTERVAL', startTime: '14:10', endTime: '14:15' },
  { type: 'PERIOD', startTime: '14:15', endTime: '14:55' },
  { type: 'PERIOD', startTime: '14:55', endTime: '15:30' },
];

// ─── Division Assignments ───────────────────────────────────
// [className, divLabel, subject, teacher, weightage]
// teacher = '*unassigned*' means skip
type AssignmentRow = [string, string, string, string, number];

// Elective group tag — assignments with the same tag in the same division are grouped
type TaggedAssignment = AssignmentRow & { electiveTag?: string };

interface Assignment {
  className: string;
  divLabel: string;
  subject: string;
  teacher: string;
  weightage: number;
  electiveTag?: string;
}

const ASSIGNMENTS: Assignment[] = [
  // ── CLASS I A ──
  ...[
    ['Class I', 'A', 'English', 'Siya', 6],
    ['Class I', 'A', 'Malayalam', 'Neethu', 5],
    ['Class I', 'A', 'Hindi', 'Jaya', 4],
    ['Class I', 'A', 'Mathematics', 'Sahana', 6],
    ['Class I', 'A', 'Environmental Studies', 'Aleena Joseph', 5],
    ['Class I', 'A', 'General Knowledge', 'Ansu', 2],
    ['Class I', 'A', 'Life Skills', 'Siya', 2],
    ['Class I', 'A', 'Information Technology', 'Swetha', 2],
    ['Class I', 'A', 'Physical Training', 'Akash', 2],
    ['Class I', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class I', 'A', 'Library', 'Sulajamma', 1],
    ['Class I', 'A', 'STEAM', 'Mahesh', 1],
    ['Class I', 'A', 'Little Prodigy', 'Soly', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  // Dance/Music elective
  { className: 'Class I', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class I', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS I B ──
  ...[
    ['Class I', 'B', 'English', 'Siya', 6],
    ['Class I', 'B', 'Malayalam', 'Prabha', 5],
    ['Class I', 'B', 'Hindi', 'Jaya', 4],
    ['Class I', 'B', 'Mathematics', 'Saritha K', 6],
    ['Class I', 'B', 'Environmental Studies', 'Bibitha A B', 5],
    ['Class I', 'B', 'General Knowledge', 'Aleena Joseph', 2],
    ['Class I', 'B', 'Life Skills', 'Gopikadas', 2],
    ['Class I', 'B', 'Information Technology', 'Ann', 2],
    ['Class I', 'B', 'Physical Training', 'Akash', 2],
    ['Class I', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class I', 'B', 'Library', 'Sulajamma', 1],
    ['Class I', 'B', 'STEAM', 'Mahesh Chandran', 1],
    ['Class I', 'B', 'Little Prodigy', 'Soly', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class I', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class I', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS I C ──
  ...[
    ['Class I', 'C', 'English', 'Ansu', 6],
    ['Class I', 'C', 'Malayalam', 'Anjumol', 5],
    ['Class I', 'C', 'Hindi', 'Anakha', 4],
    ['Class I', 'C', 'Mathematics', 'Shridevi', 6],
    ['Class I', 'C', 'Environmental Studies', 'Aleesha Varghese', 5],
    ['Class I', 'C', 'General Knowledge', 'Gopikadas', 2],
    ['Class I', 'C', 'Life Skills', 'Gowri P G', 2],
    ['Class I', 'C', 'Information Technology', 'Anitha', 2],
    ['Class I', 'C', 'Physical Training', 'Akash', 2],
    ['Class I', 'C', 'Drawing', 'Sreejesh', 1],
    ['Class I', 'C', 'Library', 'Sulajamma', 1],
    ['Class I', 'C', 'STEAM', 'Nayana', 1],
    ['Class I', 'C', 'Little Prodigy', 'Soly', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class I', divLabel: 'C', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class I', divLabel: 'C', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS II A ──
  ...[
    ['Class II', 'A', 'English', 'Deepa', 6],
    ['Class II', 'A', 'Malayalam', 'Niji', 4],
    ['Class II', 'A', 'Hindi', 'Jaya', 4],
    ['Class II', 'A', 'Mathematics', 'Rajani', 6],
    ['Class II', 'A', 'Environmental Studies', 'Aleena Joseph', 5],
    ['Class II', 'A', 'General Knowledge', 'Athira', 2],
    ['Class II', 'A', 'Life Skills', 'Ansu', 1],
    ['Class II', 'A', 'Information Technology', 'Ann', 2],
    ['Class II', 'A', 'Physical Training', 'Anand', 2],
    ['Class II', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class II', 'A', 'Library', 'Sulajamma', 1],
    ['Class II', 'A', 'STEAM', 'Nayana', 1],
    ['Class II', 'A', 'Little Prodigy', 'Soly', 2],
    ['Class II', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class II', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class II', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS II B ──
  ...[
    ['Class II', 'B', 'English', 'Siya', 6],
    ['Class II', 'B', 'Malayalam', 'Prabha', 4],
    ['Class II', 'B', 'Hindi', 'Sreethu', 4],
    ['Class II', 'B', 'Mathematics', 'Shridevi', 6],
    ['Class II', 'B', 'Environmental Studies', 'Aleesha Varghese', 5],
    ['Class II', 'B', 'General Knowledge', 'Bini Treesa', 2],
    ['Class II', 'B', 'Life Skills', 'Silpa N Raju', 1],
    ['Class II', 'B', 'Information Technology', 'Anitha', 2],
    ['Class II', 'B', 'Physical Training', 'Anand', 2],
    ['Class II', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class II', 'B', 'Library', 'Sulajamma', 1],
    ['Class II', 'B', 'STEAM', 'Mahesh Chandran', 1],
    ['Class II', 'B', 'Little Prodigy', 'Soly', 2],
    ['Class II', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class II', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class II', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS II C ──
  ...[
    ['Class II', 'C', 'English', 'Aleena Maria', 6],
    ['Class II', 'C', 'Malayalam', 'Jayasree', 4],
    ['Class II', 'C', 'Hindi', 'Jaya', 4],
    ['Class II', 'C', 'Mathematics', 'Saritha K', 6],
    ['Class II', 'C', 'Environmental Studies', 'Athira', 5],
    ['Class II', 'C', 'General Knowledge', 'Shobitha', 2],
    ['Class II', 'C', 'Life Skills', 'Aleesha Varghese', 1],
    ['Class II', 'C', 'Information Technology', 'Swetha', 2],
    ['Class II', 'C', 'Physical Training', 'Anand', 2],
    ['Class II', 'C', 'Drawing', 'Sreejesh', 1],
    ['Class II', 'C', 'Library', 'Sulajamma', 1],
    ['Class II', 'C', 'STEAM', 'Mahesh Chandran', 1],
    ['Class II', 'C', 'Little Prodigy', 'Soly', 2],
    ['Class II', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class II', divLabel: 'C', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class II', divLabel: 'C', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS III A ──
  ...[
    ['Class III', 'A', 'English', 'Deepa', 7],
    ['Class III', 'A', 'Malayalam', 'Jayasree', 5],
    ['Class III', 'A', 'Hindi', 'Jaya', 4],
    ['Class III', 'A', 'Science', 'Silpa N Raju', 4],
    ['Class III', 'A', 'Social Science', 'Athira', 4],
    ['Class III', 'A', 'Mathematics', 'Remya', 5],
    ['Class III', 'A', 'General Knowledge', '*unassigned*', 1],
    ['Class III', 'A', 'Life Skills', 'Anitha', 1],
    ['Class III', 'A', 'Information Technology', 'Swetha', 2],
    ['Class III', 'A', 'Physical Training', 'Akash', 1],
    ['Class III', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class III', 'A', 'Library', 'Sulajamma', 1],
    ['Class III', 'A', 'STEAM', 'Nayana', 1],
    ['Class III', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class III', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class III', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS III B ──
  ...[
    ['Class III', 'B', 'English', 'Ansu', 7],
    ['Class III', 'B', 'Malayalam', 'Anjumol', 5],
    ['Class III', 'B', 'Hindi', 'Jaya', 4],
    ['Class III', 'B', 'Science', 'Bibitha A B', 4],
    ['Class III', 'B', 'Social Science', 'Aleena Joseph', 4],
    ['Class III', 'B', 'Mathematics', 'Shridevi', 5],
    ['Class III', 'B', 'General Knowledge', '*unassigned*', 1],
    ['Class III', 'B', 'Life Skills', '*unassigned*', 1],
    ['Class III', 'B', 'Information Technology', 'Shijo', 2],
    ['Class III', 'B', 'Physical Training', 'Anand', 1],
    ['Class III', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class III', 'B', 'Library', 'Sulajamma', 1],
    ['Class III', 'B', 'STEAM', '*unassigned*', 1],
    ['Class III', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class III', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class III', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS III C ──
  ...[
    ['Class III', 'C', 'English', 'Bini Treesa', 7],
    ['Class III', 'C', 'Malayalam', 'Niji', 5],
    ['Class III', 'C', 'Hindi', 'Jaya', 4],
    ['Class III', 'C', 'Science', 'Ashish', 4],
    ['Class III', 'C', 'Social Science', 'Shobitha Lakshmi', 4],
    ['Class III', 'C', 'Mathematics', 'Rajani', 5],
    ['Class III', 'C', 'General Knowledge', '*unassigned*', 1],
    ['Class III', 'C', 'Life Skills', '*unassigned*', 1],
    ['Class III', 'C', 'Information Technology', 'Ann', 2],
    ['Class III', 'C', 'Physical Training', 'Akash', 1],
    ['Class III', 'C', 'Drawing', '*unassigned*', 1],
    ['Class III', 'C', 'Library', '*unassigned*', 1],
    ['Class III', 'C', 'STEAM', '*unassigned*', 1],
    ['Class III', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class III', divLabel: 'C', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class III', divLabel: 'C', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS IV A ──
  ...[
    ['Class IV', 'A', 'English', 'Siju Samuel', 7],
    ['Class IV', 'A', 'Malayalam', 'Ambily', 5],
    ['Class IV', 'A', 'Hindi', 'Anakha', 4],
    ['Class IV', 'A', 'Science', 'Silpa N Raju', 4],
    ['Class IV', 'A', 'Social Science', 'Shobitha', 4],
    ['Class IV', 'A', 'Mathematics', 'Smitha', 5],
    ['Class IV', 'A', 'General Knowledge', '*unassigned*', 1],
    ['Class IV', 'A', 'Life Skills', '*unassigned*', 1],
    ['Class IV', 'A', 'Information Technology', 'Shijo', 2],
    ['Class IV', 'A', 'Physical Training', 'Akash', 1],
    ['Class IV', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class IV', 'A', 'Library', 'Akhil', 1],
    ['Class IV', 'A', 'STEAM', 'Akhil', 1],
    ['Class IV', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class IV', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class IV', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS IV B ──
  ...[
    ['Class IV', 'B', 'English', 'Aleena Maria', 7],
    ['Class IV', 'B', 'Malayalam', 'Prabha', 5],
    ['Class IV', 'B', 'Hindi', 'Shridevi', 4],
    ['Class IV', 'B', 'Science', 'Ashish', 4],
    ['Class IV', 'B', 'Social Science', 'Aleesha Varghese', 4],
    ['Class IV', 'B', 'Mathematics', 'Amrutha', 5],
    ['Class IV', 'B', 'General Knowledge', '*unassigned*', 1],
    ['Class IV', 'B', 'Life Skills', '*unassigned*', 1],
    ['Class IV', 'B', 'Information Technology', 'Anitha', 2],
    ['Class IV', 'B', 'Physical Training', 'Anand', 1],
    ['Class IV', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class IV', 'B', 'Library', 'Akhil', 1],
    ['Class IV', 'B', 'STEAM', 'Akhil', 1],
    ['Class IV', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class IV', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class IV', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS IV C ──
  ...[
    ['Class IV', 'C', 'English', 'Aleena Josy', 7],
    ['Class IV', 'C', 'Malayalam', 'Neethu', 5],
    ['Class IV', 'C', 'Hindi', 'Sreethu', 4],
    ['Class IV', 'C', 'Science', 'Bibitha A B', 4],
    ['Class IV', 'C', 'Social Science', 'Aleena Joseph', 4],
    ['Class IV', 'C', 'Mathematics', 'Sahana', 5],
    ['Class IV', 'C', 'General Knowledge', '*unassigned*', 1],
    ['Class IV', 'C', 'Life Skills', '*unassigned*', 1],
    ['Class IV', 'C', 'Information Technology', '*unassigned*', 2],
    ['Class IV', 'C', 'Physical Training', 'Akash', 1],
    ['Class IV', 'C', 'Drawing', '*unassigned*', 1],
    ['Class IV', 'C', 'Library', '*unassigned*', 1],
    ['Class IV', 'C', 'STEAM', '*unassigned*', 1],
    ['Class IV', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class IV', divLabel: 'C', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class IV', divLabel: 'C', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS V A ──
  ...[
    ['Class V', 'A', 'English', 'Aleena Josy', 6],
    ['Class V', 'A', 'Malayalam', 'Jayasree', 5],
    ['Class V', 'A', 'Hindi', 'Shridevi', 4],
    ['Class V', 'A', 'Science', 'Amalu', 4],
    ['Class V', 'A', 'Social Science', 'Sonu', 4],
    ['Class V', 'A', 'Mathematics', 'Saritha K', 5],
    ['Class V', 'A', 'General Knowledge', '*unassigned*', 1],
    ['Class V', 'A', 'Life Skills', '*unassigned*', 1],
    ['Class V', 'A', 'Information Technology', 'Swetha', 2],
    ['Class V', 'A', 'Physical Training', 'Akash', 1],
    ['Class V', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class V', 'A', 'Library', 'Nayana', 1],
    ['Class V', 'A', 'STEAM', 'Akhil', 2],
    ['Class V', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class V', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class V', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS V B ──
  ...[
    ['Class V', 'B', 'English', 'Deepa', 6],
    ['Class V', 'B', 'Malayalam', 'Anjumol', 5],
    ['Class V', 'B', 'Hindi', 'Sujatha', 4],
    ['Class V', 'B', 'Science', 'Silpa N Raju', 4],
    ['Class V', 'B', 'Social Science', 'Sonu', 4],
    ['Class V', 'B', 'Mathematics', 'Saritha K', 5],
    ['Class V', 'B', 'General Knowledge', '*unassigned*', 1],
    ['Class V', 'B', 'Life Skills', '*unassigned*', 1],
    ['Class V', 'B', 'Information Technology', 'Anitha', 2],
    ['Class V', 'B', 'Physical Training', 'Anand', 1],
    ['Class V', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class V', 'B', 'Library', 'Nayana', 1],
    ['Class V', 'B', 'STEAM', 'Mahesh Chandran', 2],
    ['Class V', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class V', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class V', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS VI A ──
  ...[
    ['Class VI', 'A', 'English', 'Bini Treesa', 6],
    ['Class VI', 'A', 'Malayalam', 'Prabha', 5],
    ['Class VI', 'A', 'Hindi', 'Sreethu', 4],
    ['Class VI', 'A', 'Science', 'Ashamol', 4],
    ['Class VI', 'A', 'Social Science', 'Aleena Joseph', 4],
    ['Class VI', 'A', 'Mathematics', 'Smitha', 5],
    ['Class VI', 'A', 'General Knowledge', '*unassigned*', 1],
    ['Class VI', 'A', 'Life Skills', 'Br. Jiss', 1],
    ['Class VI', 'A', 'Information Technology', 'Ann', 2],
    ['Class VI', 'A', 'Physical Training', 'Akash', 1],
    ['Class VI', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class VI', 'A', 'Library', 'Sulajamma', 1],
    ['Class VI', 'A', 'STEAM', 'Mahesh Chandran', 2],
    ['Class VI', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class VI', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class VI', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS VI B ──
  ...[
    ['Class VI', 'B', 'English', 'Aleena Maria', 6],
    ['Class VI', 'B', 'Malayalam', 'Ambily', 5],
    ['Class VI', 'B', 'Hindi', 'Shridevi', 4],
    ['Class VI', 'B', 'Science', 'Roshni', 4],
    ['Class VI', 'B', 'Social Science', 'Albin', 4],
    ['Class VI', 'B', 'Mathematics', 'Remya', 5],
    ['Class VI', 'B', 'General Knowledge', '*unassigned*', 1],
    ['Class VI', 'B', 'Life Skills', '*unassigned*', 1],
    ['Class VI', 'B', 'Information Technology', 'Ann', 2],
    ['Class VI', 'B', 'Physical Training', 'Anand', 1],
    ['Class VI', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class VI', 'B', 'Library', 'Sulajamma', 1],
    ['Class VI', 'B', 'STEAM', 'Mahesh Chandran', 2],
    ['Class VI', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class VI', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class VI', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS VI C ──
  ...[
    ['Class VI', 'C', 'English', 'Deepa', 6],
    ['Class VI', 'C', 'Malayalam', 'Niji', 5],
    ['Class VI', 'C', 'Hindi', 'Anakha', 4],
    ['Class VI', 'C', 'Science', 'Ashish', 4],
    ['Class VI', 'C', 'Social Science', 'Athira', 4],
    ['Class VI', 'C', 'Mathematics', 'Julie', 5],
    ['Class VI', 'C', 'General Knowledge', '*unassigned*', 1],
    ['Class VI', 'C', 'Life Skills', '*unassigned*', 1],
    ['Class VI', 'C', 'Information Technology', 'Anitha', 2],
    ['Class VI', 'C', 'Physical Training', 'Akash', 1],
    ['Class VI', 'C', 'Drawing', 'Sreejesh', 1],
    ['Class VI', 'C', 'Library', 'Sulajamma', 1],
    ['Class VI', 'C', 'STEAM', 'Mahesh Chandran', 2],
    ['Class VI', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class VI', divLabel: 'C', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class VI', divLabel: 'C', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS VII A ──
  ...[
    ['Class VII', 'A', 'English', 'Anju Maria', 6],
    ['Class VII', 'A', 'Malayalam', 'Neethu', 4],
    ['Class VII', 'A', 'Hindi', 'Sujatha', 4],
    ['Class VII', 'A', 'Physics', 'Manju', 2],
    ['Class VII', 'A', 'Social Science', 'Aleena Joseph', 4],
    ['Class VII', 'A', 'Mathematics', 'Sahana', 5],
    ['Class VII', 'A', 'General Knowledge', 'Gopikadas', 2],
    ['Class VII', 'A', 'Life Skills', 'Br. Jiss', 1],
    ['Class VII', 'A', 'Information Technology', 'Shijo', 2],
    ['Class VII', 'A', 'Physical Training', 'Akash', 1],
    ['Class VII', 'A', 'Drawing', 'Sreejesh', 1],
    ['Class VII', 'A', 'Library', 'Nayana', 1],
    ['Class VII', 'A', 'STEAM', 'Mahesh Chandran', 1],
    ['Class VII', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class VII', 'A', 'Chemistry', 'Lin', 1],
    ['Class VII', 'A', 'Biology', 'Ashamol', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class VII', divLabel: 'A', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class VII', divLabel: 'A', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS VII B ──
  ...[
    ['Class VII', 'B', 'English', 'Bini Treesa', 6],
    ['Class VII', 'B', 'Malayalam', 'Ambily', 4],
    ['Class VII', 'B', 'Hindi', 'Sreethu', 4],
    ['Class VII', 'B', 'Physics', 'Manju', 2],
    ['Class VII', 'B', 'Social Science', 'Sonu', 4],
    ['Class VII', 'B', 'Mathematics', 'Saritha K', 5],
    ['Class VII', 'B', 'General Knowledge', 'Gopikadas', 2],
    ['Class VII', 'B', 'Life Skills', 'Br. Jiss', 1],
    ['Class VII', 'B', 'Information Technology', 'Anitha', 2],
    ['Class VII', 'B', 'Physical Training', 'Anand', 1],
    ['Class VII', 'B', 'Drawing', 'Sreejesh', 1],
    ['Class VII', 'B', 'Library', 'Nayana', 1],
    ['Class VII', 'B', 'STEAM', 'Akhil', 1],
    ['Class VII', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class VII', 'B', 'Chemistry', 'Asha Susan', 1],
    ['Class VII', 'B', 'Biology', 'Roshni', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class VII', divLabel: 'B', subject: 'Dance', teacher: 'Nayana', weightage: 1, electiveTag: 'dance-music' },
  { className: 'Class VII', divLabel: 'B', subject: 'Music', teacher: 'Mahesh Chandran', weightage: 1, electiveTag: 'dance-music' },

  // ── CLASS VIII A ──
  ...[
    ['Class VIII', 'A', 'English', 'Deepa', 5],
    ['Class VIII', 'A', 'Malayalam', 'Ambily', 4],
    ['Class VIII', 'A', 'Hindi', 'Sujatha', 4],
    ['Class VIII', 'A', 'Physics', 'Manju', 2],
    ['Class VIII', 'A', 'Social Science', 'Albin', 5],
    ['Class VIII', 'A', 'Mathematics', 'Amrutha', 6],
    ['Class VIII', 'A', 'Life Skills', 'Fr. Jyothis', 1],
    ['Class VIII', 'A', 'Information Technology', 'Anitha', 2],
    ['Class VIII', 'A', 'Physical Training', 'Akash', 1],
    ['Class VIII', 'A', 'General Knowledge', '*unassigned*', 2],
    ['Class VIII', 'A', 'Library', 'Sulajamma', 1],
    ['Class VIII', 'A', 'STEAM', 'Mahesh Chandran', 1],
    ['Class VIII', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class VIII', 'A', 'Chemistry', 'Silpa', 2],
    ['Class VIII', 'A', 'Biology', 'Bibitha', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),

  // ── CLASS VIII B ──
  ...[
    ['Class VIII', 'B', 'English', 'Aleena Maria', 5],
    ['Class VIII', 'B', 'Malayalam', 'Anjumol', 4],
    ['Class VIII', 'B', 'Hindi', 'Anakha', 4],
    ['Class VIII', 'B', 'Physics', 'Anu Mathew', 2],
    ['Class VIII', 'B', 'Social Science', 'Athira', 5],
    ['Class VIII', 'B', 'Mathematics', 'Smitha', 6],
    ['Class VIII', 'B', 'Life Skills', 'Fr. Jyothis', 1],
    ['Class VIII', 'B', 'Information Technology', 'Shijo', 2],
    ['Class VIII', 'B', 'Physical Training', 'Anand', 1],
    ['Class VIII', 'B', 'General Knowledge', '*unassigned*', 2],
    ['Class VIII', 'B', 'Library', 'Sulajamma', 1],
    ['Class VIII', 'B', 'STEAM', 'Remya', 1],
    ['Class VIII', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class VIII', 'B', 'Chemistry', 'Silpa', 2],
    ['Class VIII', 'B', 'Biology', 'Bibitha', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),

  // ── CLASS VIII C ──
  ...[
    ['Class VIII', 'C', 'English', 'Aleena Josy', 5],
    ['Class VIII', 'C', 'Malayalam', 'Niji', 4],
    ['Class VIII', 'C', 'Hindi', 'Sreethu', 4],
    ['Class VIII', 'C', 'Physics', 'Manju', 2],
    ['Class VIII', 'C', 'Social Science', 'Saritha Mohan', 5],
    ['Class VIII', 'C', 'Mathematics', 'Saritha K', 6],
    ['Class VIII', 'C', 'Life Skills', 'Fr. Jyothis', 1],
    ['Class VIII', 'C', 'Information Technology', 'Ann', 2],
    ['Class VIII', 'C', 'Physical Training', 'Anand', 1],
    ['Class VIII', 'C', 'General Knowledge', 'Gopikadas', 2],
    ['Class VIII', 'C', 'Library', 'Sulajamma', 1],
    ['Class VIII', 'C', 'STEAM', 'Smitha', 1],
    ['Class VIII', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class VIII', 'C', 'Chemistry', 'Silpa', 2],
    ['Class VIII', 'C', 'Biology', 'Bibitha', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),

  // ── CLASS IX A ──
  ...[
    ['Class IX', 'A', 'English', 'Deepa', 6],
    ['Class IX', 'A', 'Physics', 'Manju', 3],
    ['Class IX', 'A', 'Life Skills', 'Fr. Jyothis', 1],
    ['Class IX', 'A', 'Information Technology', 'Shijo', 4],
    ['Class IX', 'A', 'Physical Training', 'Anand', 1],
    ['Class IX', 'A', 'Library', 'Sulajamma', 1],
    ['Class IX', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class IX', 'A', 'Chemistry', 'Lin', 2],
    ['Class IX', 'A', 'Biology', 'Roshni', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  // Social Science split
  { className: 'Class IX', divLabel: 'A', subject: 'Social Science', teacher: 'Albin Benny', weightage: 3 },
  { className: 'Class IX', divLabel: 'A', subject: 'Social Science', teacher: 'Shobitha', weightage: 3 },
  // Maths split
  { className: 'Class IX', divLabel: 'A', subject: 'Mathematics', teacher: 'Rajani', weightage: 4 },
  { className: 'Class IX', divLabel: 'A', subject: 'Mathematics', teacher: 'Remya', weightage: 3 },
  // Malayalam/Hindi elective
  { className: 'Class IX', divLabel: 'A', subject: 'Malayalam', teacher: 'Jayasree', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class IX', divLabel: 'A', subject: 'Malayalam', teacher: 'Prabha', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class IX', divLabel: 'A', subject: 'Hindi', teacher: 'Sujatha', weightage: 5, electiveTag: 'mal-hin' },

  // ── CLASS IX B ──
  ...[
    ['Class IX', 'B', 'English', 'Aleena Josy', 6],
    ['Class IX', 'B', 'Physics', 'Manju', 3],
    ['Class IX', 'B', 'Life Skills', 'Fr. Jyothis', 1],
    ['Class IX', 'B', 'Information Technology', 'Ann', 4],
    ['Class IX', 'B', 'Physical Training', 'Akash', 1],
    ['Class IX', 'B', 'Library', 'Sulajamma', 1],
    ['Class IX', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class IX', 'B', 'Chemistry', 'Lin', 2],
    ['Class IX', 'B', 'Biology', 'Roshni', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class IX', divLabel: 'B', subject: 'Social Science', teacher: 'Athira', weightage: 3 },
  { className: 'Class IX', divLabel: 'B', subject: 'Social Science', teacher: 'Ashish', weightage: 3 },
  { className: 'Class IX', divLabel: 'B', subject: 'Mathematics', teacher: 'Smitha', weightage: 4 },
  { className: 'Class IX', divLabel: 'B', subject: 'Mathematics', teacher: 'Sahana', weightage: 3 },
  { className: 'Class IX', divLabel: 'B', subject: 'Malayalam', teacher: 'Jayasree', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class IX', divLabel: 'B', subject: 'Malayalam', teacher: 'Prabha', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class IX', divLabel: 'B', subject: 'Hindi', teacher: 'Sujatha', weightage: 5, electiveTag: 'mal-hin' },

  // ── CLASS IX C ──
  ...[
    ['Class IX', 'C', 'English', 'Anju Maria', 6],
    ['Class IX', 'C', 'Physics', 'Manju', 3],
    ['Class IX', 'C', 'Life Skills', 'Fr. Jyothis', 1],
    ['Class IX', 'C', 'Information Technology', 'Swetha', 4],
    ['Class IX', 'C', 'Physical Training', 'Anand', 1],
    ['Class IX', 'C', 'Library', '*unassigned*', 1],
    ['Class IX', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class IX', 'C', 'Chemistry', 'Ashish', 2],
    ['Class IX', 'C', 'Biology', 'Bibitha', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class IX', divLabel: 'C', subject: 'Social Science', teacher: 'Shobitha', weightage: 3 },
  { className: 'Class IX', divLabel: 'C', subject: 'Social Science', teacher: 'Saritha Mohan', weightage: 3 },
  { className: 'Class IX', divLabel: 'C', subject: 'Mathematics', teacher: 'Remya', weightage: 4 },
  { className: 'Class IX', divLabel: 'C', subject: 'Mathematics', teacher: 'Smitha', weightage: 3 },
  { className: 'Class IX', divLabel: 'C', subject: 'Malayalam', teacher: 'Jayasree', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class IX', divLabel: 'C', subject: 'Malayalam', teacher: 'Prabha', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class IX', divLabel: 'C', subject: 'Hindi', teacher: 'Sujatha', weightage: 5, electiveTag: 'mal-hin' },

  // ── CLASS X A ──
  ...[
    ['Class X', 'A', 'English', 'Siju Samuel', 6],
    ['Class X', 'A', 'Physics', 'Manju', 3],
    ['Class X', 'A', 'Life Skills', 'Anitha', 1],
    ['Class X', 'A', 'Information Technology', 'Shijo', 4],
    ['Class X', 'A', 'Physical Training', 'Akash', 1],
    ['Class X', 'A', 'Library', 'Sulajamma', 1],
    ['Class X', 'A', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class X', 'A', 'Chemistry', 'Lin', 2],
    ['Class X', 'A', 'Biology', 'Roshni', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class X', divLabel: 'A', subject: 'Social Science', teacher: 'Saritha Mohan', weightage: 3 },
  { className: 'Class X', divLabel: 'A', subject: 'Social Science', teacher: 'Athira', weightage: 3 },
  { className: 'Class X', divLabel: 'A', subject: 'Mathematics', teacher: 'Remya', weightage: 4 },
  { className: 'Class X', divLabel: 'A', subject: 'Mathematics', teacher: 'Rajani', weightage: 3 },
  { className: 'Class X', divLabel: 'A', subject: 'Malayalam', teacher: 'Neethu', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class X', divLabel: 'A', subject: 'Malayalam', teacher: 'Ambily', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class X', divLabel: 'A', subject: 'Hindi', teacher: 'Sujatha', weightage: 5, electiveTag: 'mal-hin' },

  // ── CLASS X B ──
  ...[
    ['Class X', 'B', 'English', 'Siju Samuel', 6],
    ['Class X', 'B', 'Physics', 'Manju', 3],
    ['Class X', 'B', 'Life Skills', '*unassigned*', 1],
    ['Class X', 'B', 'Information Technology', 'Ann', 5],
    ['Class X', 'B', 'Physical Training', 'Anand', 1],
    ['Class X', 'B', 'Library', 'Sulajamma', 1],
    ['Class X', 'B', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class X', 'B', 'Chemistry', 'Asha Susan', 2],
    ['Class X', 'B', 'Biology', 'Ashamol', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class X', divLabel: 'B', subject: 'Social Science', teacher: 'Saritha Mohan', weightage: 3 },
  { className: 'Class X', divLabel: 'B', subject: 'Social Science', teacher: 'Shobitha', weightage: 3 },
  { className: 'Class X', divLabel: 'B', subject: 'Mathematics', teacher: 'Smitha', weightage: 4 },
  { className: 'Class X', divLabel: 'B', subject: 'Mathematics', teacher: 'Rajani', weightage: 3 },
  { className: 'Class X', divLabel: 'B', subject: 'Malayalam', teacher: 'Neethu', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class X', divLabel: 'B', subject: 'Malayalam', teacher: 'Ambily', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class X', divLabel: 'B', subject: 'Hindi', teacher: 'Sujatha', weightage: 5, electiveTag: 'mal-hin' },

  // ── CLASS X C ──
  ...[
    ['Class X', 'C', 'English', 'Siju Samuel', 6],
    ['Class X', 'C', 'Physics', 'Manju', 3],
    ['Class X', 'C', 'Life Skills', '*unassigned*', 1],
    ['Class X', 'C', 'Information Technology', 'Ann', 5],
    ['Class X', 'C', 'Physical Training', 'Akash', 1],
    ['Class X', 'C', 'Library', 'Sulajamma', 1],
    ['Class X', 'C', 'Co-Curricular Activities', '*unassigned*', 2],
    ['Class X', 'C', 'Chemistry', 'Asha Susan', 2],
    ['Class X', 'C', 'Biology', 'Ashamol', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class X', divLabel: 'C', subject: 'Social Science', teacher: 'Saritha Mohan', weightage: 3 },
  { className: 'Class X', divLabel: 'C', subject: 'Social Science', teacher: 'Athira', weightage: 3 },
  { className: 'Class X', divLabel: 'C', subject: 'Mathematics', teacher: 'Smitha', weightage: 4 },
  { className: 'Class X', divLabel: 'C', subject: 'Mathematics', teacher: 'Remya', weightage: 3 },
  { className: 'Class X', divLabel: 'C', subject: 'Malayalam', teacher: 'Neethu', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class X', divLabel: 'C', subject: 'Malayalam', teacher: 'Ambily', weightage: 5, electiveTag: 'mal-hin' },
  { className: 'Class X', divLabel: 'C', subject: 'Hindi', teacher: 'Sujatha', weightage: 5, electiveTag: 'mal-hin' },

  // ── CLASS XI A SCIENCE ──
  ...[
    ['Class XI', 'A', 'English', 'Aleena Josy', 2],
    ['Class XI', 'A', 'English', 'Anju Maria', 2],
    ['Class XI', 'A', 'Physics', 'Anu Mathew', 4],
    ['Class XI', 'A', 'Physics', 'Amalu', 4],
    ['Class XI', 'A', 'Chemistry', 'Lin', 4],
    ['Class XI', 'A', 'Chemistry', 'Asha Susan', 4],
    ['Class XI', 'A', 'Biology', 'Roshni', 4],
    ['Class XI', 'A', 'Biology', 'Ashamol', 4],
    ['Class XI', 'A', 'Mathematics', 'Julie', 4],
    ['Class XI', 'A', 'Mathematics', 'Amrutha', 4],
    ['Class XI', 'A', 'Life Skills', 'Fr. Antony', 2],
    ['Class XI', 'A', 'Physical Training', 'Anand', 1],
    ['Class XI', 'A', 'Library', 'Anju Maria', 1],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),

  // ── CLASS XI B SCIENCE ──
  ...[
    ['Class XI', 'B', 'English', 'Aleena Josy', 2],
    ['Class XI', 'B', 'English', 'Anju Maria', 2],
    ['Class XI', 'B', 'Physics', 'Anu Mathew', 4],
    ['Class XI', 'B', 'Physics', 'Amalu', 4],
    ['Class XI', 'B', 'Chemistry', 'Lin', 4],
    ['Class XI', 'B', 'Chemistry', 'Asha Susan', 4],
    ['Class XI', 'B', 'Computer Science', 'Swetha', 4],
    ['Class XI', 'B', 'Computer Science', 'Ann', 4],
    ['Class XI', 'B', 'Life Skills', 'Fr. Antony', 2],
    ['Class XI', 'B', 'Physical Training', 'Anand', 1],
    ['Class XI', 'B', 'Library', 'Aleena Josy', 1],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  // Maths/IP/PSY elective in XI B
  { className: 'Class XI', divLabel: 'B', subject: 'Mathematics', teacher: 'Julie', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'B', subject: 'Mathematics', teacher: 'Amrutha', weightage: 4, electiveTag: 'maths-ip-psy' },

  // ── CLASS XI C SCIENCE ──
  ...[
    ['Class XI', 'C', 'English', 'Aleena Josy', 2],
    ['Class XI', 'C', 'English', 'Anju Maria', 2],
    ['Class XI', 'C', 'Physics', 'Anu Mathew', 4],
    ['Class XI', 'C', 'Physics', 'Amalu', 4],
    ['Class XI', 'C', 'Chemistry', 'Lin', 4],
    ['Class XI', 'C', 'Chemistry', 'Asha Susan', 4],
    ['Class XI', 'C', 'Biology', 'Roshni', 4],
    ['Class XI', 'C', 'Biology', 'Ashamol', 4],
    ['Class XI', 'C', 'Life Skills', 'Fr. Antony', 2],
    ['Class XI', 'C', 'Physical Training', 'Anand', 1],
    ['Class XI', 'C', 'Library', 'Anju Maria', 1],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  // Maths/IP/PSY elective in XI C
  { className: 'Class XI', divLabel: 'C', subject: 'Informatics Practices', teacher: 'Shijo', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'C', subject: 'Informatics Practices', teacher: 'Anitha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'C', subject: 'Psychology', teacher: 'Gopikadas', weightage: 8, electiveTag: 'maths-ip-psy' },

  // ── CLASS XI D COMMERCE & HUMANITIES ──
  ...[
    ['Class XI', 'D', 'English', 'Aleena Josy', 2],
    ['Class XI', 'D', 'English', 'Anju Maria', 2],
    ['Class XI', 'D', 'Economics', 'Saritha Mohan', 8],
    ['Class XI', 'D', 'Life Skills', 'Fr. Antony', 2],
    ['Class XI', 'D', 'Physical Training', 'Anand', 1],
    ['Class XI', 'D', 'Library', 'Anju Maria', 1],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  // Accountancy/History elective
  { className: 'Class XI', divLabel: 'D', subject: 'Accountancy', teacher: 'Sonu', weightage: 8, electiveTag: 'acc-his' },
  { className: 'Class XI', divLabel: 'D', subject: 'History', teacher: 'Devassia', weightage: 8, electiveTag: 'acc-his' },
  // BS/PolSci elective
  { className: 'Class XI', divLabel: 'D', subject: 'Business Studies', teacher: 'Albin', weightage: 4, electiveTag: 'bs-polsci' },
  { className: 'Class XI', divLabel: 'D', subject: 'Political Science', teacher: '*unassigned*', weightage: 4, electiveTag: 'bs-polsci' },
  // Maths/IP/PSY elective in XI D
  { className: 'Class XI', divLabel: 'D', subject: 'Mathematics', teacher: 'Julie', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'D', subject: 'Mathematics', teacher: 'Amrutha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'D', subject: 'Informatics Practices', teacher: 'Shijo', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'D', subject: 'Informatics Practices', teacher: 'Anitha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XI', divLabel: 'D', subject: 'Psychology', teacher: 'Gopikadas', weightage: 8, electiveTag: 'maths-ip-psy' },

  // ── CLASS XII A SCIENCE ──
  ...[
    ['Class XII', 'A', 'Chemistry', 'Lin', 2],
    ['Class XII', 'A', 'Chemistry', 'Asha Susan', 4],
    ['Class XII', 'A', 'Physics', 'Anu Mathew', 2],
    ['Class XII', 'A', 'Physics', 'Amalu', 4],
    ['Class XII', 'A', 'Life Skills', 'Fr. Josh', 2],
    ['Class XII', 'A', 'Physical Training', 'Anand', 1],
    ['Class XII', 'A', 'Library', 'Aleena Josy', 1],
    ['Class XII', 'A', 'English', 'Anju Maria', 2],
    ['Class XII', 'A', 'English', 'Aleena Josy', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  // Physics Lab / Chemistry Lab elective
  { className: 'Class XII', divLabel: 'A', subject: 'Physics Lab', teacher: 'Anu Mathew', weightage: 4, electiveTag: 'phy-chem-lab' },
  { className: 'Class XII', divLabel: 'A', subject: 'Chemistry Lab', teacher: 'Lin', weightage: 4, electiveTag: 'phy-chem-lab' },
  // Maths/IP/PSY elective
  { className: 'Class XII', divLabel: 'A', subject: 'Mathematics', teacher: 'Julie', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'A', subject: 'Mathematics', teacher: 'Amrutha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'A', subject: 'Informatics Practices', teacher: 'Shijo', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'A', subject: 'Informatics Practices', teacher: 'Anitha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'A', subject: 'Psychology', teacher: 'Gopikadas', weightage: 8, electiveTag: 'maths-ip-psy' },
  // Biology / CS cross-division elective
  { className: 'Class XII', divLabel: 'A', subject: 'Biology', teacher: 'Ashamol', weightage: 8, electiveTag: 'bio-cs' },
  { className: 'Class XII', divLabel: 'A', subject: 'Biology', teacher: 'Roshni', weightage: 8, electiveTag: 'bio-cs' },
  { className: 'Class XII', divLabel: 'A', subject: 'Computer Science', teacher: 'Swetha', weightage: 4, electiveTag: 'bio-cs' },
  { className: 'Class XII', divLabel: 'A', subject: 'Computer Science', teacher: 'Ann', weightage: 4, electiveTag: 'bio-cs' },

  // ── CLASS XII B SCIENCE ──
  ...[
    ['Class XII', 'B', 'Chemistry', 'Lin', 4],
    ['Class XII', 'B', 'Chemistry', 'Asha Susan', 2],
    ['Class XII', 'B', 'Physics', 'Anu Mathew', 2],
    ['Class XII', 'B', 'Physics', 'Amalu', 4],
    ['Class XII', 'B', 'Life Skills', 'Fr. Josh', 2],
    ['Class XII', 'B', 'Physical Training', 'Anand', 1],
    ['Class XII', 'B', 'Library', 'Anju Maria', 1],
    ['Class XII', 'B', 'English', 'Anju Maria', 2],
    ['Class XII', 'B', 'English', 'Aleena Josy', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class XII', divLabel: 'B', subject: 'Physics Lab', teacher: 'Anu Mathew', weightage: 4, electiveTag: 'phy-chem-lab' },
  { className: 'Class XII', divLabel: 'B', subject: 'Chemistry Lab', teacher: 'Asha Susan', weightage: 4, electiveTag: 'phy-chem-lab' },
  { className: 'Class XII', divLabel: 'B', subject: 'Mathematics', teacher: 'Julie', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'B', subject: 'Mathematics', teacher: 'Amrutha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'B', subject: 'Informatics Practices', teacher: 'Shijo', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'B', subject: 'Informatics Practices', teacher: 'Anitha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'B', subject: 'Psychology', teacher: 'Gopikadas', weightage: 8, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'B', subject: 'Biology', teacher: 'Ashamol', weightage: 8, electiveTag: 'bio-cs' },
  { className: 'Class XII', divLabel: 'B', subject: 'Biology', teacher: 'Roshni', weightage: 8, electiveTag: 'bio-cs' },
  { className: 'Class XII', divLabel: 'B', subject: 'Computer Science', teacher: 'Swetha', weightage: 4, electiveTag: 'bio-cs' },
  { className: 'Class XII', divLabel: 'B', subject: 'Computer Science', teacher: 'Ann', weightage: 4, electiveTag: 'bio-cs' },

  // ── CLASS XII C COMMERCE & HUMANITIES ──
  ...[
    ['Class XII', 'C', 'Economics', 'Saritha Mohan', 8],
    ['Class XII', 'C', 'Life Skills', 'Fr. Josh', 2],
    ['Class XII', 'C', 'Physical Training', 'Anand', 1],
    ['Class XII', 'C', 'Library', 'Aleena Josy', 1],
    ['Class XII', 'C', 'English', 'Anju Maria', 2],
    ['Class XII', 'C', 'English', 'Aleena Josy', 2],
  ].map(r => ({ className: r[0] as string, divLabel: r[1] as string, subject: r[2] as string, teacher: r[3] as string, weightage: r[4] as number })),
  { className: 'Class XII', divLabel: 'C', subject: 'Accountancy', teacher: 'Sonu', weightage: 8, electiveTag: 'acc-his' },
  { className: 'Class XII', divLabel: 'C', subject: 'History', teacher: 'Devassia', weightage: 8, electiveTag: 'acc-his' },
  { className: 'Class XII', divLabel: 'C', subject: 'Business Studies', teacher: 'Albin', weightage: 8, electiveTag: 'bs-polsci' },
  { className: 'Class XII', divLabel: 'C', subject: 'Political Science', teacher: 'Devassia', weightage: 8, electiveTag: 'bs-polsci' },
  { className: 'Class XII', divLabel: 'C', subject: 'Mathematics', teacher: 'Julie', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'C', subject: 'Mathematics', teacher: 'Amrutha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'C', subject: 'Informatics Practices', teacher: 'Shijo', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'C', subject: 'Informatics Practices', teacher: 'Anitha', weightage: 4, electiveTag: 'maths-ip-psy' },
  { className: 'Class XII', divLabel: 'C', subject: 'Psychology', teacher: 'Gopikadas', weightage: 8, electiveTag: 'maths-ip-psy' },
];

// ═════════════════════════════════════════════════════════════
// Main import function
// ═════════════════════════════════════════════════════════════
async function main() {
  console.log('🏫 Importing Don Bosco school data...\n');

  // ── 1. School ──
  const school = await prisma.school.create({
    data: {
      name: 'Don Bosco',
      adminEmail: 'manjursanal@gmail.com',
      cognitoUserId: 'cognito-manjursanal',
    },
  });
  console.log(`  ✓ School: ${school.name} (${school.id})`);

  // ── 2. SchoolUser records ──
  // SUPER_ADMIN for jonie (check if exists first — null schoolId needs special handling)
  const existingSuperAdmin = await schoolUserModel().findFirst({
    where: { email: 'jonie@zyphr.co.in', schoolId: null },
  });
  if (!existingSuperAdmin) {
    await schoolUserModel().create({
      data: { email: 'jonie@zyphr.co.in', schoolId: null, role: 'SUPER_ADMIN' },
    });
    console.log('  ✓ SchoolUser: jonie@zyphr.co.in (SUPER_ADMIN)');
  } else {
    console.log('  ✓ SchoolUser: jonie@zyphr.co.in (SUPER_ADMIN) — already exists');
  }

  // SCHOOL_ADMIN for manjursanal
  await schoolUserModel().create({
    data: { email: 'manjursanal@gmail.com', schoolId: school.id, role: 'SCHOOL_ADMIN' },
  });
  console.log('  ✓ SchoolUser: manjursanal@gmail.com (SCHOOL_ADMIN)');

  // ── 3. Academic Year ──
  const ay = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      label: '2026-27',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-03-31'),
      status: AcademicYearStatus.ACTIVE,
    },
  });
  console.log(`  ✓ Academic Year: ${ay.label}`);

  // ── 4. Subjects ──
  const subjectMap = new Map<string, string>(); // name → id
  for (const s of SUBJECTS) {
    const subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        academicYearId: ay.id,
        name: s.name,
        abbreviation: s.abbreviation,
      },
    });
    subjectMap.set(s.name, subject.id);
  }
  console.log(`  ✓ Subjects: ${subjectMap.size}`);

  // ── 5. Teachers + TeacherSubjects ──
  const teacherMap = new Map<string, string>(); // name → id
  for (const t of TEACHERS) {
    const teacher = await prisma.teacher.create({
      data: { schoolId: school.id, academicYearId: ay.id, name: t.name },
    });
    teacherMap.set(t.name, teacher.id);

    for (const subjectName of t.subjects) {
      const subjectId = subjectMap.get(subjectName);
      if (subjectId) {
        await prisma.teacherSubject.create({
          data: { schoolId: school.id, teacherId: teacher.id, subjectId },
        });
      } else {
        console.warn(`    ⚠ Subject not found for teacher ${t.name}: ${subjectName}`);
      }
    }
  }
  console.log(`  ✓ Teachers: ${teacherMap.size}`);

  // ── 6. Classes + Divisions ──
  const divisionMap = new Map<string, string>(); // "Class I-A" → divisionId
  const classMap = new Map<string, string>(); // "Class I" → classId
  for (const cls of CLASSES) {
    const classRecord = await prisma.class.create({
      data: {
        schoolId: school.id,
        academicYearId: ay.id,
        name: cls.name,
        sortOrder: cls.sortOrder,
        requiresStream: cls.requiresStream,
      },
    });
    classMap.set(cls.name, classRecord.id);

    for (const div of cls.divisions) {
      const division = await prisma.division.create({
        data: {
          schoolId: school.id,
          classId: classRecord.id,
          academicYearId: ay.id,
          label: div.label,
          streamName: div.streamName ?? null,
        },
      });
      divisionMap.set(`${cls.name}-${div.label}`, division.id);
    }
  }
  console.log(`  ✓ Classes: ${classMap.size}, Divisions: ${divisionMap.size}`);

  // ── 7. Period Structure + Working Days + Slots ──
  const periodsJson = BELL_SCHEDULE.map((slot, idx) => ({
    type: slot.type,
    order: idx + 1,
    startTime: slot.startTime,
    endTime: slot.endTime,
  }));

  const ps = await prisma.periodStructure.create({
    data: {
      schoolId: school.id,
      academicYearId: ay.id,
      name: 'Default (8 periods)',
      periods: periodsJson as any,
    },
  });

  const dayNames = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  // DayOfWeek enum: MONDAY=0, TUESDAY=1, ..., FRIDAY=4
  const dayMap: Record<string, number> = { MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4 };

  for (const dayName of dayNames) {
    const wd = await prisma.workingDay.create({
      data: {
        schoolId: school.id,
        periodStructureId: ps.id,
        dayOfWeek: dayMap[dayName],
        label: dayName.charAt(0) + dayName.slice(1).toLowerCase(),
        sortOrder: dayMap[dayName],
      },
    });

    let periodNumber = 0;
    for (let i = 0; i < BELL_SCHEDULE.length; i++) {
      const slot = BELL_SCHEDULE[i];
      if (slot.type === 'PERIOD') periodNumber++;
      await prisma.slot.create({
        data: {
          schoolId: school.id,
          workingDayId: wd.id,
          slotType: slot.type as SlotType,
          slotNumber: slot.type === 'PERIOD' ? periodNumber : null,
          startTime: new Date(`1970-01-01T${slot.startTime}:00Z`),
          endTime: new Date(`1970-01-01T${slot.endTime}:00Z`),
          sortOrder: i + 1,
        },
      });
    }
  }
  console.log(`  ✓ Period Structure: ${ps.name} (5 working days, ${BELL_SCHEDULE.length} slots/day)`);

  // ── 8. Assign period structure to all divisions ──
  for (const [_key, divId] of divisionMap) {
    await prisma.division.update({
      where: { id: divId },
      data: { periodStructureId: ps.id },
    });
  }
  console.log('  ✓ Period structure assigned to all divisions');

  // ── 9. Elective Groups ──
  // Track created elective groups
  // Cross-division electives (bio-cs, maths-ip-psy, mal-hin, acc-his, bs-polsci, phy-chem-lab)
  // share ONE group across all divisions of the same class.
  // Same-division electives (dance-music) get one group per division.
  const electiveGroupMap = new Map<string, string>();

  // Tags that should be shared across divisions of the same class
  const CROSS_DIVISION_TAGS = new Set(['mal-hin', 'maths-ip-psy', 'acc-his', 'bs-polsci', 'bio-cs', 'phy-chem-lab']);

  // Helper to get or create elective group
  async function getOrCreateElectiveGroup(className: string, divLabel: string, tag: string): Promise<string> {
    // Cross-division: key by className-tag (shared across divisions)
    // Same-division: key by className-divLabel-tag (per division)
    const key = CROSS_DIVISION_TAGS.has(tag)
      ? `${className}-${tag}`
      : `${className}-${divLabel}-${tag}`;

    if (electiveGroupMap.has(key)) return electiveGroupMap.get(key)!;

    const prettyTag = tag.replace(/-/g, ' / ').replace(/\b\w/g, c => c.toUpperCase());
    const groupName = CROSS_DIVISION_TAGS.has(tag)
      ? `${className} ${prettyTag}`
      : `${className} ${divLabel} ${prettyTag}`;
    const eg = await prisma.electiveGroup.create({
      data: {
        schoolId: school.id,
        academicYearId: ay.id,
        name: groupName,
      },
    });
    electiveGroupMap.set(key, eg.id);
    return eg.id;
  }

  // ── 10. Division Assignments ──
  let assignedCount = 0;
  let skippedCount = 0;
  const electiveSubjectsAdded = new Set<string>(); // track "groupId-subjectId" to avoid duplicates

  for (const a of ASSIGNMENTS) {
    const teacherName = resolveTeacher(a.teacher);
    const isUnassigned = teacherName === '*unassigned*';

    const subjectName = resolveSubject(a.subject);
    const subjectId = subjectMap.get(subjectName);
    if (!subjectId) {
      console.warn(`    ⚠ Subject not found: "${subjectName}" (original: "${a.subject}")`);
      skippedCount++;
      continue;
    }

    let teacherId: string | null = null;
    if (!isUnassigned) {
      teacherId = teacherMap.get(teacherName) ?? null;
      if (!teacherId) {
        console.warn(`    ⚠ Teacher not found: "${teacherName}" (original: "${a.teacher}") for ${a.className} ${a.divLabel} ${a.subject}`);
        skippedCount++;
        continue;
      }
    }

    const divId = divisionMap.get(`${a.className}-${a.divLabel}`);
    if (!divId) {
      console.warn(`    ⚠ Division not found: ${a.className}-${a.divLabel}`);
      skippedCount++;
      continue;
    }

    let electiveGroupId: string | null = null;
    if (a.electiveTag) {
      electiveGroupId = await getOrCreateElectiveGroup(a.className, a.divLabel, a.electiveTag);

      // Add subject to elective group if not already added
      const egSubKey = `${electiveGroupId}-${subjectId}`;
      if (!electiveSubjectsAdded.has(egSubKey)) {
        await prisma.electiveGroupSubject.create({
          data: {
            schoolId: school.id,
            electiveGroupId,
            subjectId,
          },
        });
        electiveSubjectsAdded.add(egSubKey);
      }
    }

    await prisma.divisionAssignment.create({
      data: {
        schoolId: school.id,
        academicYearId: ay.id,
        divisionId: divId,
        subjectId,
        teacherId,
        weightage: a.weightage,
        electiveGroupId,
      },
    });
    assignedCount++;
  }

  console.log(`  ✓ Division Assignments: ${assignedCount} created, ${skippedCount} skipped (unassigned/not found)`);
  console.log(`  ✓ Elective Groups: ${electiveGroupMap.size}`);

  console.log('\n✅ Don Bosco import complete!');
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
