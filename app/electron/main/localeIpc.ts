import { ipcMain } from 'electron'
import { getEngineLocale, setEngineLocale } from '../engine/locale'
import { isEngineLocale, type EngineLocale } from '../../shared/locale'

export interface EngineLocaleUpdate {
  success: boolean
  locale?: EngineLocale
  error?: string
}

export function setRendererEngineLocale(language: unknown): EngineLocaleUpdate {
  if (!isEngineLocale(language)) return { success: false, error: 'Unsupported engine locale' }
  setEngineLocale(language)
  return { success: true, locale: getEngineLocale() }
}

export function registerLocaleIpc(): void {
  ipcMain.handle('engine:set-locale', (_event, language: unknown) => setRendererEngineLocale(language))
}
