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

import jaCommon from './locales/ja/common.json'
import jaDropzone from './locales/ja/dropzone.json'
import jaScanning from './locales/ja/scanning.json'
import jaResults from './locales/ja/results.json'
import jaSettings from './locales/ja/settings.json'
import jaModals from './locales/ja/modals.json'
import jaPii from './locales/ja/pii.json'
import jaExtraction from './locales/ja/extraction.json'

import koCommon from './locales/ko/common.json'
import koDropzone from './locales/ko/dropzone.json'
import koScanning from './locales/ko/scanning.json'
import koResults from './locales/ko/results.json'
import koSettings from './locales/ko/settings.json'
import koModals from './locales/ko/modals.json'
import koPii from './locales/ko/pii.json'
import koExtraction from './locales/ko/extraction.json'

import deCommon from './locales/de/common.json'
import deDropzone from './locales/de/dropzone.json'
import deScanning from './locales/de/scanning.json'
import deResults from './locales/de/results.json'
import deSettings from './locales/de/settings.json'
import deModals from './locales/de/modals.json'
import dePii from './locales/de/pii.json'
import deExtraction from './locales/de/extraction.json'

import frCommon from './locales/fr/common.json'
import frDropzone from './locales/fr/dropzone.json'
import frScanning from './locales/fr/scanning.json'
import frResults from './locales/fr/results.json'
import frSettings from './locales/fr/settings.json'
import frModals from './locales/fr/modals.json'
import frPii from './locales/fr/pii.json'
import frExtraction from './locales/fr/extraction.json'

import esCommon from './locales/es/common.json'
import esDropzone from './locales/es/dropzone.json'
import esScanning from './locales/es/scanning.json'
import esResults from './locales/es/results.json'
import esSettings from './locales/es/settings.json'
import esModals from './locales/es/modals.json'
import esPii from './locales/es/pii.json'
import esExtraction from './locales/es/extraction.json'

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
      },
      ja: {
        common: jaCommon,
        dropzone: jaDropzone,
        scanning: jaScanning,
        results: jaResults,
        settings: jaSettings,
        modals: jaModals,
        pii: jaPii,
        extraction: jaExtraction,
      },
      ko: {
        common: koCommon,
        dropzone: koDropzone,
        scanning: koScanning,
        results: koResults,
        settings: koSettings,
        modals: koModals,
        pii: koPii,
        extraction: koExtraction,
      },
      de: {
        common: deCommon,
        dropzone: deDropzone,
        scanning: deScanning,
        results: deResults,
        settings: deSettings,
        modals: deModals,
        pii: dePii,
        extraction: deExtraction,
      },
      fr: {
        common: frCommon,
        dropzone: frDropzone,
        scanning: frScanning,
        results: frResults,
        settings: frSettings,
        modals: frModals,
        pii: frPii,
        extraction: frExtraction,
      },
      es: {
        common: esCommon,
        dropzone: esDropzone,
        scanning: esScanning,
        results: esResults,
        settings: esSettings,
        modals: esModals,
        pii: esPii,
        extraction: esExtraction,
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
