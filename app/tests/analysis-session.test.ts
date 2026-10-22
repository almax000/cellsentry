import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { AnalysisSessionManager } from '../electron/main/analysisSession'

const owner = () => ({ isDestroyed: () => false })
const eventOwner = () => Object.assign(new EventEmitter(), { isDestroyed: () => false })

describe('analysis IPC session ownership and release', () => {
  it('rejects a cancellation from a different renderer or scan identity', async () => {
    let stops = 0
    const sessions = new AnalysisSessionManager(async () => { stops++ })
    const first = owner(), other = owner()
    const scan = sessions.begin(first, 'scan-1')!
    expect(await sessions.cancel(other, 'scan-1')).toBe(false)
    expect(await sessions.cancel(first, 'scan-2')).toBe(false)
    expect(stops).toBe(0)
    expect(sessions.isActive(scan)).toBe(true)
  })

  it('holds a new scan until the cancelled task has settled', async () => {
    let releaseStop!: () => void
    const sessions = new AnalysisSessionManager(() => new Promise<void>((resolve) => { releaseStop = resolve }))
    const first = owner(), second = owner()
    const scan = sessions.begin(first, 'batch-1')!
    const cancelling = sessions.cancel(first, 'batch-1')
    expect(sessions.begin(second, 'scan-2')).toBeNull()
    releaseStop()
    await Promise.resolve()
    expect(sessions.begin(second, 'scan-2')).toBeNull()
    await sessions.settle(scan)
    expect(await cancelling).toBe(true)
    expect(sessions.begin(second, 'scan-2')?.scanId).toBe('scan-2')
  })

  it('makes late work inactive after cancellation, including legacy PII/extraction work', async () => {
    const sessions = new AnalysisSessionManager(async () => {})
    const first = owner()
    const scan = sessions.begin(first, 'legacy-pii')!
    const cancellation = sessions.cancel(first, 'legacy-pii')
    expect(sessions.isActive(scan)).toBe(false)
    await sessions.settle(scan)
    expect(await cancellation).toBe(true)
    expect(sessions.hasActive).toBe(false)
  })
  it('cancels native inference when its initiating renderer is destroyed', async () => {
    let stops = 0
    const sessions = new AnalysisSessionManager(async () => { stops++ })
    const first = eventOwner()
    const scan = sessions.begin(first, 'window-close')!
    expect(first.listenerCount('destroyed')).toBe(1)

    first.emit('destroyed')
    await Promise.resolve()
    expect(stops).toBe(1)
    expect(sessions.isActive(scan)).toBe(false)
    await sessions.settle(scan)
    expect(sessions.hasActive).toBe(false)
  })
  it('removes the renderer listener when a scan settles normally', async () => {
    let stops = 0
    const sessions = new AnalysisSessionManager(async () => { stops++ })
    const first = eventOwner()
    const scan = sessions.begin(first, 'normal-finish')!
    expect(first.listenerCount('destroyed')).toBe(1)

    await sessions.settle(scan)
    expect(first.listenerCount('destroyed')).toBe(0)
    first.emit('destroyed')
    await Promise.resolve()
    expect(stops).toBe(0)
  })
  it('keeps the session locked if stop fails even when the task finishes, until a successful retry', async () => {
    let fail = true
    const sessions = new AnalysisSessionManager(async () => { if (fail) throw new Error('stop failed') })
    const first = owner()
    const scan = sessions.begin(first, 'scan-fail')!
    await expect(sessions.cancel(first, 'scan-fail')).rejects.toThrow('stop failed')
    await sessions.settle(scan)
    expect(sessions.begin(first, 'next')).toBeNull()
    fail = false
    expect(await sessions.cancel(first, 'scan-fail')).toBe(true)
    expect(sessions.begin(first, 'next')).not.toBeNull()
  })

})
