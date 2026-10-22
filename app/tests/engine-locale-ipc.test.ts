import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, language: unknown) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (_event: unknown, language: unknown) => unknown) => state.handlers.set(channel, handler) },
}))

import { getEngineLocale, setEngineLocale } from '../electron/engine/locale'
import { registerLocaleIpc, setRendererEngineLocale } from '../electron/main/localeIpc'

describe('renderer to engine locale IPC', () => {
  beforeEach(() => {
    state.handlers.clear()
    setEngineLocale('en')
  })

  it('accepts only exact supported locales and updates rule messages before scanning', () => {
    registerLocaleIpc()
    const handler = state.handlers.get('engine:set-locale')
    expect(handler?.({}, 'zh')).toEqual({ success: true, locale: 'zh' })
    expect(getEngineLocale()).toBe('zh')
    expect(handler?.({}, 'zh-CN')).toEqual({ success: false, error: 'Unsupported engine locale' })
    expect(handler?.({}, 'fr')).toEqual({ success: false, error: 'Unsupported engine locale' })
    expect(getEngineLocale()).toBe('zh')
  })

  it('does not coerce non-string renderer input', () => {
    expect(setRendererEngineLocale({ locale: 'zh' })).toEqual({ success: false, error: 'Unsupported engine locale' })
    expect(getEngineLocale()).toBe('en')
  })
})
