import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  fallbackLng: 'zh-CN',
  defaultNS: 'common',
  resources: {
    'zh-CN': {
      common: {
        app_title: 'Agent Workflow Workspace'
      }
    },
    en: {
      common: {
        app_title: 'Agent Workflow Workspace'
      }
    }
  },
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
