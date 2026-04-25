import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import enDropzone from './locales/en/dropzone.json'
import enSettings from './locales/en/settings.json'
import enModals from './locales/en/modals.json'

import zhCommon from './locales/zh/common.json'
import zhDropzone from './locales/zh/dropzone.json'
import zhSettings from './locales/zh/settings.json'
import zhModals from './locales/zh/modals.json'

// v2 W1 Step 1.1: removed scanning/results/pii/extraction namespaces.
// v2 medical-pipeline copy will be added under new namespaces in W2-W4.

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        dropzone: enDropzone,
        settings: enSettings,
        modals: enModals,
      },
      zh: {
        common: zhCommon,
        dropzone: zhDropzone,
        settings: zhSettings,
        modals: zhModals,
      },
    },
    ns: ['common', 'dropzone', 'settings', 'modals'],
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
