import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enApproval from './locales/en/approval.json';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enWorkflow from './locales/en/workflow.json';
import zhApproval from './locales/zh-CN/approval.json';
import zhCommon from './locales/zh-CN/common.json';
import zhErrors from './locales/zh-CN/errors.json';
import zhWorkflow from './locales/zh-CN/workflow.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: zhCommon, workflow: zhWorkflow, approval: zhApproval, errors: zhErrors },
      en: { common: enCommon, workflow: enWorkflow, approval: enApproval, errors: enErrors }
    },
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    ns: ['common', 'workflow', 'approval', 'errors'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'aww-lang',
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
