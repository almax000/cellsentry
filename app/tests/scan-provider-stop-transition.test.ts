import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScanProvider, useScan } from '../src/context/ScanContext'

const observed = vi.hoisted(() => ({ actions: [] as Array<{ type: string; stopRetryRequired?: boolean }> }))
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  return {
    ...original,
    useReducer: <S, A extends { type: string }>(reducer: (state: S, action: A) => S, initial: S) => {
      const [state, dispatch] = original.useReducer(reducer, initial)
      return [state, (action: A) => { observed.actions.push(action); dispatch(action) }] as const
    },
  }
})

vi.mock('../src/i18n', () => ({
  default: { language: 'en', resolvedLanguage: 'en', t: (key: string) => key },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Server rendering installs the real React hooks/context without a browser.
// These checks exercise the provider's async closures and IPC calls, not a
// copied reducer or a model/runtime stub pretending to be Electron evidence.
function provider() {
  let controls!: ReturnType<typeof useScan>
  function Capture() { controls = useScan(); return null }
  renderToString(createElement(ScanProvider, { children: createElement(Capture) }))
  return controls
}

function setup() {
  const scanEntered = deferred<void>()
  const scanResponse = deferred<{ success: boolean; error: string }>()
  const stopEntered = deferred<void>()
  const stopResponse = deferred<{ success: boolean }>()
  const api = {
    setEngineLocale: vi.fn(async () => ({ success: true })),
    getFileInfo: vi.fn(async (_filePath: string) => ({ success: true, name: 'synthetic.xlsx', sheets: [] })),
    analyzeAll: vi.fn((_filePath: string, _scanId: string) => { scanEntered.resolve(); return scanResponse.promise }),
    analyzeFile: vi.fn((_filePath: string, _scanId: string) => { scanEntered.resolve(); return scanResponse.promise }),
    cancelAnalysis: vi.fn((_scanId: string) => { stopEntered.resolve(); return stopResponse.promise }),
  }
  vi.stubGlobal('window', { api })
  return { api, controls: provider(), scanEntered, scanResponse, stopEntered, stopResponse }
}

beforeEach(() => { observed.actions.length = 0 })
afterEach(() => vi.unstubAllGlobals())

describe('ScanProvider transition stop ownership', () => {
  it('retries the original scan ID after its late response precedes a failed transition stop', async () => {
    const { api, controls, scanEntered, scanResponse, stopEntered, stopResponse } = setup()
    const scanning = controls.startScan('/synthetic/first.xlsx')
    await scanEntered.promise
    const scanId = api.analyzeAll.mock.calls[0][1]
    const resetting = controls.reset()
    await stopEntered.promise

    // This ordering formerly let startScan.finally clear the retry identity.
    scanResponse.resolve({ success: false, error: 'Analysis cancelled' })
    await scanning
    stopResponse.reject(new Error('Synthetic stop failure'))
    await resetting

    api.cancelAnalysis.mockResolvedValueOnce({ success: true })
    await expect(controls.cancelScan()).resolves.toBe(true)
    expect(api.cancelAnalysis.mock.calls.map(([id]) => id)).toEqual([scanId, scanId])
  })

  it('holds a new scan until the transition stop settles and preserves retry ownership on failure', async () => {
    const { api, controls, scanEntered, scanResponse, stopEntered, stopResponse } = setup()
    const scanning = controls.startScan('/synthetic/first.xlsx')
    await scanEntered.promise
    const scanId = api.analyzeAll.mock.calls[0][1]
    const resetting = controls.reset()
    await stopEntered.promise
    const replacement = controls.startScan('/synthetic/replacement.xlsx')
    await Promise.resolve()
    await Promise.resolve()
    expect(api.analyzeAll).toHaveBeenCalledTimes(1)

    scanResponse.resolve({ success: false, error: 'Analysis cancelled' })
    await scanning
    stopResponse.reject(new Error('Synthetic stop failure'))
    await Promise.all([resetting, replacement])
    expect(api.analyzeAll).toHaveBeenCalledTimes(1)
    expect(api.cancelAnalysis).toHaveBeenCalledTimes(1)

    api.cancelAnalysis.mockResolvedValueOnce({ success: true })
    await controls.cancelScan()
    expect(api.cancelAnalysis.mock.calls.map(([id]) => id)).toEqual([scanId, scanId])
  })

  it('keeps the failed-stop notice and retry ID when the old scan finishes after the stop failure', async () => {
    const { api, controls, scanEntered, scanResponse, stopEntered, stopResponse } = setup()
    const scanning = controls.startScan('/synthetic/first.xlsx')
    await scanEntered.promise
    const scanId = api.analyzeAll.mock.calls[0][1]
    const resetting = controls.reset()
    await stopEntered.promise
    stopResponse.reject(new Error('Synthetic stop failure'))
    await resetting
    const errorBeforeLateResponse = observed.actions.filter(action => action.type === 'SCAN_ERROR')

    scanResponse.resolve({ success: false, error: 'Analysis cancelled' })
    await scanning
    expect(observed.actions.filter(action => action.type === 'SCAN_ERROR')).toEqual(errorBeforeLateResponse)
    expect(errorBeforeLateResponse.at(-1)).toMatchObject({ stopRetryRequired: true })

    api.cancelAnalysis.mockResolvedValueOnce({ success: true })
    await controls.cancelScan()
    expect(api.cancelAnalysis.mock.calls.map(([id]) => id)).toEqual([scanId, scanId])
  })

  it('allows the replacement scan after a confirmed transition stop without retaining the old identity', async () => {
    const { api, controls, scanEntered, scanResponse, stopEntered, stopResponse } = setup()
    const scanning = controls.startScan('/synthetic/first.xlsx')
    await scanEntered.promise
    const originalId = api.analyzeAll.mock.calls[0][1]
    const replacement = controls.startScan('/synthetic/replacement.xlsx')
    await stopEntered.promise
    stopResponse.resolve({ success: true })
    scanResponse.resolve({ success: false, error: 'Analysis cancelled' })
    await Promise.all([scanning, replacement])

    expect(api.analyzeAll).toHaveBeenCalledTimes(2)
    expect(api.analyzeAll.mock.calls[1][1]).not.toBe(originalId)
    expect(observed.actions.some(action => action.stopRetryRequired)).toBe(false)
    await controls.cancelScan()
    expect(api.cancelAnalysis).toHaveBeenCalledTimes(1)
  })

  it('invalidates a batch before the current file responds while the stop is pending', async () => {
    const { api, controls, scanEntered, scanResponse, stopEntered, stopResponse } = setup()
    const scanning = controls.startBatchScan([
      { path: '/synthetic/first.xlsx', name: 'first.xlsx', size: 1 },
      { path: '/synthetic/second.xlsx', name: 'second.xlsx', size: 1 },
    ])
    await scanEntered.promise
    const scanId = api.analyzeFile.mock.calls[0][1]
    const resetting = controls.reset()
    await stopEntered.promise
    scanResponse.resolve({ success: false, error: 'Analysis cancelled' })
    await scanning
    expect(api.analyzeFile).toHaveBeenCalledTimes(1)

    stopResponse.reject(new Error('Synthetic stop failure'))
    await resetting
    api.cancelAnalysis.mockResolvedValueOnce({ success: true })
    await controls.cancelScan()
    expect(api.cancelAnalysis.mock.calls.map(([id]) => id)).toEqual([scanId, scanId])
  })
})
