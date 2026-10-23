import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const transport = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('electron', () => ({ net: transport }))
import { DEFAULT_MODEL, ModelDownloader, type ModelInfo } from '../electron/model/downloader'
import { modelDownloadFailure } from '../electron/model/downloadFailure'

let directory: string
class Request extends EventEmitter {
  setHeader = vi.fn()
  end = vi.fn()
  abort = vi.fn()
}
class Response extends EventEmitter {
  destroy = vi.fn()
  pause = vi.fn()
  resume = vi.fn()
  constructor(statusCode: number, headers: Record<string, string> = {}) {
    super()
    Object.assign(this, { statusCode, headers })
  }
}
let requests: Request[]
const data = Buffer.from('GGUF-test-model')
const model: ModelInfo = { name: 'fixture', filename: 'fixture.gguf', version: '1', size: data.length,
  sha256: createHash('sha256').update(data).digest('hex'), downloadUrl: 'https://example.invalid/model', description: '' }
beforeEach(async () => {
  transport.request.mockClear()
  const base = resolve(__dirname, '../../tmp/tests')
  await mkdir(base, { recursive: true })
  directory = await mkdtemp(join(base, 'download-'))
  requests = []
  transport.request.mockImplementation(() => { const request = new Request(); requests.push(request); return request })
})
afterEach(async () => { vi.useRealTimers(); await rm(directory, { recursive: true, force: true }) })

describe('model download recovery', () => {
  it.each(['en', 'zh'])('never opens a remote request before an official source is configured (%s)', async (locale) => {
    const downloader = new ModelDownloader(directory, undefined, locale)
    expect(downloader.canDownload()).toBe(false)
    expect(DEFAULT_MODEL.downloadUrl).toBeUndefined()
    await expect(downloader.download().catch(modelDownloadFailure)).resolves.toMatchObject({
      success: false, failureReason: 'not_configured',
    })
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('does not follow redirects from a configured source', async () => {
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download()
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({ redirect: 'error' }))
    downloader.cancel()
    await expect(result).resolves.toBe(false)
  })

  it.each([401, 403, 404])('does not retry the same unavailable source on HTTP %i', async (statusCode) => {
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download().catch(modelDownloadFailure)
    const response = new Response(statusCode)
    requests[0].emit('response', response)
    await expect(result).resolves.toMatchObject({
      success: false, failureReason: statusCode === 404 ? 'source_unavailable' : 'access_denied',
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].abort).toHaveBeenCalledOnce()
    expect(response.destroy).toHaveBeenCalledOnce()
  })
  it('aborts rejected Electron-shaped responses without destroy and handles a late response error', async () => {
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download().catch(modelDownloadFailure)
    const response = Object.assign(new EventEmitter(), { statusCode: 403, headers: {} })
    requests[0].emit('response', response)
    expect(() => response.emit('error', new Error('fixture late response error'))).not.toThrow()
    await expect(result).resolves.toMatchObject({ success: false, failureReason: 'access_denied' })
    expect(requests).toHaveLength(1)
    expect(requests[0].abort).toHaveBeenCalled()
  })
  it('settles immediately when cancelled before a response, without retrying', async () => {
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download()
    downloader.cancel()
    await expect(result).resolves.toBe(false)
    expect(requests).toHaveLength(1)
    expect(requests[0].abort).toHaveBeenCalledOnce()
  })
  it('does not restart the request after cancellation during retry delay', async () => {
    vi.useFakeTimers()
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download()
    requests[0].emit('error', new Error('fixture network failure'))
    await Promise.resolve()
    await Promise.resolve()
    downloader.cancel()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(false)
    expect(requests).toHaveLength(1)
  })
  it('validates and preserves a complete resumed download on HTTP 416', async () => {
    await writeFile(join(directory, 'fixture.gguf.downloading'), data)
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download()
    const response = Object.assign(new EventEmitter(), { statusCode: 416, headers: {} })
    requests[0].emit('response', response)
    await expect(result).resolves.toBe(true)
    expect(requests[0].abort).toHaveBeenCalledOnce()
    expect(() => response.emit('error', new Error('fixture late body error'))).not.toThrow()
    expect(await readFile(downloader.getModelPath())).toEqual(data)
  })
  it('deletes a complete but invalid temporary file after HTTP 416, then retries from byte zero', async () => {
    vi.useFakeTimers()
    const corrupt = Buffer.from('GGUF-corrupt-vx') // same byte length as the fixture
    expect(corrupt).toHaveLength(data.length)
    await writeFile(join(directory, 'fixture.gguf.downloading'), corrupt)
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download()

    requests[0].emit('response', new Response(416))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(requests).toHaveLength(2)
    expect(requests[1].setHeader).not.toHaveBeenCalledWith('Range', expect.anything())

    const response = new Response(200, { 'content-length': String(data.length) })
    requests[1].emit('response', response)
    response.emit('data', data)
    response.emit('end')
    await expect(result).resolves.toBe(true)
    expect(await readFile(downloader.getModelPath())).toEqual(data)
  })
  it('pauses a response when the model write stream applies backpressure', async () => {
    const largeData = Buffer.alloc(2 * 1024 * 1024, 7)
    const largeModel: ModelInfo = {
      ...model,
      filename: 'large.gguf',
      size: largeData.length,
      sha256: createHash('sha256').update(largeData).digest('hex'),
    }
    const downloader = new ModelDownloader(directory, largeModel)
    const result = downloader.download()
    const response = new Response(200, { 'content-length': String(largeData.length) })
    requests[0].emit('response', response)
    response.emit('data', largeData)
    expect(response.pause).toHaveBeenCalledOnce()
    response.emit('end')
    await expect(result).resolves.toBe(true)
  })
  it('aborts a stalled response body and permits recovery instead of hanging forever', async () => {
    vi.useFakeTimers()
    const downloader = new ModelDownloader(directory, model)
    const result = downloader.download()
    const response = new Response(200, { 'content-length': String(data.length) })
    requests[0].emit('response', response)
    await vi.advanceTimersByTimeAsync(32_000)
    expect(requests[0].abort).toHaveBeenCalledOnce()
    expect(requests).toHaveLength(2)
    downloader.cancel()
    await expect(result).resolves.toBe(false)
  })

})
