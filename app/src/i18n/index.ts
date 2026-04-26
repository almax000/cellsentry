import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import enSettings from './locales/en/settings.json'
import enModals from './locales/en/modals.json'
import enMedical from './locales/en/medical.json'

import zhCommon from './locales/zh/common.json'
import zhSettings from './locales/zh/settings.json'
import zhModals from './locales/zh/modals.json'
import zhMedical from './locales/zh/medical.json'

// v2 W1 Step 1.1: removed scanning/results/pii/extraction namespaces.
// v2 W3 Step 3.6: added medical namespace; deleted dropzone (replaced by
// medical/IngestWorkspace which uses its own copy in medical.json).

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        settings: enSettings,
        modals: enModals,
        medical: enMedical,
      },
      zh: {
        common: zhCommon,
        settings: zhSettings,
        modals: zhModals,
        medical: zhMedical,
      },
    },
    ns: ['common', 'settings', 'modals', 'medical'],
    defaultNS: 'common',
    fallbackLng: 'en',
    detection: {
      lookupLocalStorage: 'cellsentry-language',
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
