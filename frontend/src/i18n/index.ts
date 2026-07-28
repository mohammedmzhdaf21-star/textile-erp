import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ckb from './locales/ckb.json';

export const LANGUAGE_STORAGE_KEY = 'textile-erp-language';
export type AppLanguage = 'en' | 'ckb';

const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as AppLanguage | null;
const initialLanguage: AppLanguage = savedLanguage === 'ckb' ? 'ckb' : 'en';

const applyDocumentLanguage = (language: AppLanguage) => {
  document.documentElement.lang = language === 'ckb' ? 'ckb' : 'en';
  document.documentElement.dir = language === 'ckb' ? 'rtl' : 'ltr';
};

applyDocumentLanguage(initialLanguage);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ckb: { translation: ckb },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  const next = language === 'ckb' ? 'ckb' : 'en';
  localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  applyDocumentLanguage(next);
});

export default i18n;
