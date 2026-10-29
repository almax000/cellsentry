import { beforeEach, describe, expect, it, vi } from 'vitest'
const dependencies = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<any>>(),
  read: vi.fn(), bytes: vi.fn(), audit: vi.fn(), auditSheets: vi.fn(), pii: vi.fn(), extract: vi.fn(), llm: vi.fn(), stop: vi.fn(), ready: vi.fn(),
}))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: any[]) => Promise<any>) => dependencies.handlers.set(name, handler) } }))
vi.mock('fs/promises', () => ({ readFile: dependencies.bytes }))
vi.mock('../electron/engine/excelReader', () => ({ readWorkbook: dependencies.read }))
vi.mock('../electron/engine/ruleEngine', () => ({ analyzeExcel: dependencies.audit, analyzeExcelFromSheets: dependencies.auditSheets }))
vi.mock('../electron/pii/scanner', () => ({ scanForPiiFromSheets: dependencies.pii }))
vi.mock('../electron/extraction/extractor', () => ({ extractDocumentFromSheets: dependencies.extract }))
vi.mock('../electron/llm/lifecycle', async () => ({
  reviewAuditIssues: dependencies.llm, cancelLlmAnalysis: dependencies.stop, isLocalAiReadyFor: dependencies.ready,
  mergeJudgments: (await import('../electron/llm/reconcile')).mergeJudgments,
  AuditReviewStopError: class AuditReviewStopError extends Error {},
}))
import { registerAnalysisHandlers, hasActiveAnalysis, withModelMaintenance } from '../electron/main/analysisHandlers'

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const sender = () => ({ isDestroyed: () => false, send: vi.fn() })
const invoke = (name: string, ...args: any[]) => dependencies.handlers.get(name)! (...args)
const emptyAudit = { issues: [], summary: { total: 0, error: 0, warning: 0, info: 0 } }
beforeEach(() => {
  dependencies.handlers.clear()
  vi.clearAllMocks()
  registerAnalysisHandlers()
  dependencies.stop.mockResolvedValue(undefined)
  dependencies.ready.mockReturnValue(true)
  dependencies.read.mockResolvedValue({ sheets: [] })
  dependencies.bytes.mockResolvedValue(Buffer.from('fixture'))
  dependencies.audit.mockResolvedValue(emptyAudit)
  dependencies.auditSheets.mockResolvedValue(emptyAudit)
  dependencies.pii.mockResolvedValue({ success: true, findings: [] })
  dependencies.extract.mockResolvedValue({ success: true, fields: [], tables: [] })
  dependencies.llm.mockResolvedValue({ judgments: [], summary: { total: 0, selected: 0, attempted: 0, reviewed: 0, failed: 0, skipped: 0, stopReason: 'complete' } })
})

describe('auditable bounded review integration', () => {
  it('does not register standalone PII or extraction analysis endpoints', () => {
    expect(dependencies.handlers.has('pii:analyze')).toBe(false)
    expect(dependencies.handlers.has('extraction:analyze')).toBe(false)
  })

  it('runs only the audit engine for a spreadsheet analysis', async () => {
    const owner = sender()

    expect((await invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'spreadsheet-only')).success).toBe(true)

    expect(dependencies.auditSheets).toHaveBeenCalledOnce()
    expect(dependencies.pii).not.toHaveBeenCalled()
    expect(dependencies.extract).not.toHaveBeenCalled()
    const engines = owner.send.mock.calls
      .filter(([channel]) => channel === 'analyze:engine-done')
      .map(([, event]) => event.engine)
      .sort()
    expect(engines).toEqual(['audit'])
  })

  it('passes evidence in stable severity order and preserves reviewed and unreviewed findings', async () => {
    const owner = sender()
    const issues = [
      { ruleId: 'warning', cell: 'A1', sheet: 'S', severity: 'warning', confidence: 0.7, context: 'observed A1', formula: '=1' },
      { ruleId: 'first-error', cell: 'A2', sheet: 'S', severity: 'error', confidence: 0.9, context: 'observed A2', formula: '=2' },
      { ruleId: 'second-error', cell: 'A3', sheet: 'S', severity: 'error', confidence: 0.9, context: 'observed A3', formula: '=3' },
    ]
    dependencies.auditSheets.mockResolvedValue({ ...emptyAudit, issues })
    dependencies.llm.mockImplementationOnce(async (input, options) => {
      expect(input.map((issue: any) => issue.cellAddress)).toEqual(['A2', 'A3', 'A1'])
      expect(input.map((issue: any) => issue.context)).toEqual(['observed A2', 'observed A3', 'observed A1'])
      const summary = { total: 3, selected: 3, attempted: 3, reviewed: 2, failed: 1, skipped: 0, stopReason: 'complete' }
      options.onProgress(summary)
      return { summary, judgments: input.slice(0, 2).map((issue: any, index: number) => ({
        sheetName: issue.sheetName, cellAddress: issue.cellAddress, ruleId: issue.ruleId,
        isValid: index > 0, adjustedConfidence: 0.8, reasoning: 'Test review',
      })) }
    })
    expect((await invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'scan-partial')).success).toBe(true)
    const auditEvents = owner.send.mock.calls.filter(([channel, event]) => channel === 'analyze:engine-done' && event.engine === 'audit')
    expect(auditEvents.map(([, event]) => event.stage)).toEqual(['rules', 'complete'])
    const result = auditEvents.at(-1)![1].result
    expect(result.issues).toHaveLength(3)
    expect(result.issues[0].llmVerified).toBeUndefined()
    expect(result.issues[1].llmDisputed).toBe(true)
    expect(result.issues[2].llmVerified).toBe(true)
    expect(result.auditReview).toMatchObject({ reviewed: 2, failed: 1, total: 3 })
    expect(owner.send).toHaveBeenCalledWith('sidecar:scan-progress', expect.objectContaining({ scanId: 'scan-partial', auditReview: expect.objectContaining({ reviewed: 2 }) }))
  })

  it('sends rule findings before optional AI enrichment and retains their identities', async () => {
    const owner = sender()
    const review = deferred<any>()
    const issues = [{ ruleId: 'r', cell: 'A1', sheet: 'S', severity: 'error', confidence: 1, formula: '=1' }]
    dependencies.auditSheets.mockResolvedValue({ ...emptyAudit, issues })
    dependencies.llm.mockReturnValueOnce(review.promise)
    const pending = invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'progressive')
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledWith('analyze:engine-done', expect.objectContaining({ scanId: 'progressive', stage: 'rules' })))
    const rules = owner.send.mock.calls.find(([channel, event]) => channel === 'analyze:engine-done' && event.stage === 'rules')![1].result
    expect(rules.issues).toEqual(issues)
    review.resolve({ judgments: [], summary: { total: 1, selected: 1, attempted: 1, reviewed: 0, failed: 1, skipped: 0, stopReason: 'complete' } })
    expect((await pending).success).toBe(true)
    const events = owner.send.mock.calls.filter(([channel]) => channel === 'analyze:engine-done')
    expect(events).toHaveLength(2)
    expect(events[1][1]).toMatchObject({ stage: 'complete', result: expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ ruleId: 'r', cell: 'A1' })]) }) })
  })

  it('invalidates all results when the workbook bytes change while scanning', async () => {
    const owner = sender()
    dependencies.bytes.mockResolvedValueOnce(Buffer.from('before')).mockResolvedValueOnce(Buffer.from('after'))

    const response = await invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'changed')

    expect(response.success).toBe(false)
    expect(dependencies.auditSheets).not.toHaveBeenCalled()
    expect(owner.send).toHaveBeenCalledWith('analyze:engine-done', expect.objectContaining({ scanId: 'changed', invalidate: true }))
  })

  it('locks the session after a failed deadline stop until explicit Cancel succeeds', async () => {
    const { AuditReviewStopError } = await import('../electron/llm/lifecycle')
    const owner = sender()
    dependencies.auditSheets.mockResolvedValue({ ...emptyAudit, issues: [{ ruleId: 'r', cell: 'A1', sheet: 'S', severity: 'error', confidence: 1 }] })
    // The boundary consumes the lifecycle's explicit stop-failure type, rather than an error-message match.
    const failure = Object.assign(Object.create(AuditReviewStopError.prototype), { message: 'stop failed' })
    dependencies.llm.mockRejectedValueOnce(failure)
    const result = await invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'stop-failed')
    expect(result).toMatchObject({ success: false, errorCode: 'model-stop-failed' })
    expect(hasActiveAnalysis()).toBe(true)
    expect((await invoke('analyze:all', { sender: owner }, '/other.xlsx', 'next')).success).toBe(false)
    expect(await invoke('analyze:cancel', { sender: owner }, 'stop-failed')).toEqual({ success: true })
    expect(hasActiveAnalysis()).toBe(false)
  })
})

describe('audit when local AI cannot run', () => {
  const issues = [{ ruleId: 'r', cell: 'A1', sheet: 'S', severity: 'error', confidence: 1 }]
  const auditResult = async (channel: string, owner: ReturnType<typeof sender>, scanId: string) => {
    const response = await invoke(channel, { sender: owner }, '/fixture.xlsx', scanId)
    expect(response.success).toBe(true)
    if (channel === 'sidecar:analyze') return response
    return owner.send.mock.calls.filter(([name, event]) => name === 'analyze:engine-done' && event.engine === 'audit').at(-1)![1].result
  }

  for (const channel of ['analyze:all', 'sidecar:analyze']) {
    it(`${channel} returns the deterministic audit without review accounting, warning or AI progress`, async () => {
      dependencies.ready.mockReturnValue(false)
      dependencies.audit.mockResolvedValue({ ...emptyAudit, issues })
      dependencies.auditSheets.mockResolvedValue({ ...emptyAudit, issues })
      const owner = sender()
      const result = await auditResult(channel, owner, `no-model-${channel}`)
      expect(dependencies.ready).toHaveBeenCalledWith('audit')
      expect(dependencies.llm).not.toHaveBeenCalled()
      expect(result.issues).toEqual(issues)
      expect(result).not.toHaveProperty('auditReview')
      expect(result).not.toHaveProperty('aiWarning')
      expect(owner.send).not.toHaveBeenCalledWith('sidecar:scan-progress', expect.anything())
      expect(hasActiveAnalysis()).toBe(false)
    })
  }

  it('still reports a genuine failure as a warning when the model is installed', async () => {
    dependencies.auditSheets.mockResolvedValue({ ...emptyAudit, issues })
    dependencies.llm.mockRejectedValueOnce(new Error('Native runtime unavailable'))
    const owner = sender()
    const result = await auditResult('analyze:all', owner, 'installed-model-failure')
    expect(dependencies.llm).toHaveBeenCalledOnce()
    expect(result.issues).toEqual(issues)
    expect(result.aiWarning).toBe('Native runtime unavailable')
  })
})

describe('analysis cancellation through registered IPC handlers', () => {
  for (const channel of ['analyze:all', 'sidecar:analyze']) {
    it(`cancels ${channel} during workbook loading without starting late inference`, async () => {
      const owner = sender()
      const input = deferred<any>()
      if (channel === 'sidecar:analyze') dependencies.audit.mockReturnValue(input.promise)
      else dependencies.read.mockReturnValue(input.promise)
      const pending = invoke(channel, { sender: owner }, '/fixture.xlsx', 'scan-1')
      const cancellation = invoke('analyze:cancel', { sender: owner }, 'scan-1')
      expect(hasActiveAnalysis()).toBe(true)
      const blocked = await invoke('analyze:all', { sender: owner }, '/other.xlsx', 'scan-2')
      expect(blocked.success).toBe(false)
      input.resolve(channel === 'sidecar:analyze' ? emptyAudit : { sheets: [] })
      expect((await pending).success).toBe(false)
      expect((await cancellation).success).toBe(true)
      expect(hasActiveAnalysis()).toBe(false)
      expect(dependencies.llm).not.toHaveBeenCalled()
      expect(dependencies.pii).not.toHaveBeenCalled()
      expect(owner.send).not.toHaveBeenCalledWith('analyze:engine-done', expect.anything())
    })
  }
  it('retains the rule-stage result but suppresses the final AI update after cancellation', async () => {
    const owner = sender()
    const inference = deferred<any[]>()
    dependencies.auditSheets.mockResolvedValue({ ...emptyAudit, issues: [{ ruleId: 'r', cell: 'A1', sheet: 'S', confidence: 1 }] })
    dependencies.llm.mockReturnValue(inference.promise)
    const pending = invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'scan-ai')
    await vi.waitFor(() => expect(dependencies.llm).toHaveBeenCalledOnce())
    const rejected = await invoke('analyze:cancel', { sender: sender() }, 'scan-ai')
    expect(rejected.success).toBe(false)
    const cancellation = invoke('analyze:cancel', { sender: owner }, 'scan-ai')
    inference.resolve([])
    await pending
    await cancellation
    const audits = owner.send.mock.calls.filter(([channel, data]) => channel === 'analyze:engine-done' && data.engine === 'audit')
    expect(audits).toHaveLength(1)
    expect(audits[0][1]).toMatchObject({ stage: 'rules' })
    expect((await invoke('analyze:all', { sender: owner }, '/fixture.xlsx', 'scan-next')).success).toBe(true)
  })
  it('prevents a scan or second model mutation while model files are being replaced', async () => {
    const replacement = deferred<void>()
    const operation = withModelMaintenance(() => replacement.promise)
    expect((await invoke('analyze:all', { sender: sender() }, '/fixture.xlsx', 'busy')).success).toBe(false)
    await expect(withModelMaintenance(async () => {})).rejects.toThrow('active')
    replacement.resolve()
    await operation
    expect(hasActiveAnalysis()).toBe(false)
  })

})
