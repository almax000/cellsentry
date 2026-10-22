export const ENGINE_LOCALES = ['en', 'zh'] as const
export type EngineLocale = typeof ENGINE_LOCALES[number]

/** Map i18n/browser language tags to the engine's two supported locales. */
export function toEngineLocale(language: string | undefined | null): EngineLocale {
  return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** IPC accepts only the exact renderer contract, never arbitrary locale tags. */
export function isEngineLocale(language: unknown): language is EngineLocale {
  return typeof language === 'string' && (language === 'en' || language === 'zh')
}
