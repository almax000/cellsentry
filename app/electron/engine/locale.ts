/**
 * Lightweight locale helper for the rule engine.
 * Call setEngineLocale() once at startup with app.getLocale() or i18next language.
 */

let locale: 'en' | 'zh' = 'en'

export function setEngineLocale(lang: string): void {
  locale = lang.startsWith('zh') ? 'zh' : 'en'
}

export function getEngineLocale(): 'en' | 'zh' {
  return locale
}

export function msg(en: string, zh: string): string {
  return locale === 'zh' ? zh : en
}
