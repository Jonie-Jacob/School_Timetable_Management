import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, auth: enAuth },
    },
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
