import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enAcademicYears from './locales/en/academic-years.json';
import enPeriodStructures from './locales/en/period-structures.json';
import enSubjects from './locales/en/subjects.json';
import enTeachers from './locales/en/teachers.json';
import enClasses from './locales/en/classes.json';
import enAssignments from './locales/en/assignments.json';
import enTimetable from './locales/en/timetable.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        dashboard: enDashboard,
        'academic-years': enAcademicYears,
        'period-structures': enPeriodStructures,
        subjects: enSubjects,
        teachers: enTeachers,
        classes: enClasses,
        assignments: enAssignments,
        timetable: enTimetable,
      },
    },
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
