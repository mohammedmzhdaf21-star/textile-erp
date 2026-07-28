import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n';

const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { i18n, t } = useTranslation();

  const setLanguage = (language: AppLanguage) => {
    void i18n.changeLanguage(language);
  };

  const current = i18n.language === 'ckb' ? 'ckb' : 'en';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-semibold text-gray-500">{t('language.label')}</span>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
          current === 'en'
            ? 'bg-black text-white'
            : 'border border-gray-300 bg-white text-gray-700 hover:border-black'
        }`}
      >
        {t('language.english')}
      </button>
      <button
        type="button"
        onClick={() => setLanguage('ckb')}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
          current === 'ckb'
            ? 'bg-black text-white'
            : 'border border-gray-300 bg-white text-gray-700 hover:border-black'
        }`}
      >
        {t('language.kurdish')}
      </button>
    </div>
  );
};

export default LanguageSwitcher;
