import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import enDropzone from './locales/en/dropzone.json'
import enScanning from './locales/en/scanning.json'
import enResults from './locales/en/results.json'
import enSettings from './locales/en/settings.json'
import enModals from './locales/en/modals.json'
import enPii from './locales/en/pii.json'
import enExtraction from './locales/en/extraction.json'

import zhCommon from './locales/zh/common.json'
import zhDropzone from './locales/zh/dropzone.json'
import zhScanning from './locales/zh/scanning.json'
import zhResults from './locales/zh/results.json'
import zhSettings from './locales/zh/settings.json'
import zhModals from './locales/zh/modals.json'
import zhPii from './locales/zh/pii.json'
import zhExtraction from './locales/zh/extraction.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        dropzone: enDropzone,
        scanning: enScanning,
        results: enResults,
        settings: enSettings,
        modals: enModals,
        pii: enPii,
        extraction: enExtraction,
      },
      zh: {
        common: zhCommon,
        dropzone: zhDropzone,
        scanning: zhScanning,
        results: zhResults,
        settings: zhSettings,
        modals: zhModals,
        pii: zhPii,
        extraction: zhExtraction,
      }
    },
    ns: ['common', 'dropzone', 'scanning', 'results', 'settings', 'modals', 'pii', 'extraction'],
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
