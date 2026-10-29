import { BrowserWindow, dialog } from 'electron'
import { copyFile, readFile, rename, unlink, writeFile } from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { basename, dirname, extname, join, parse } from 'path'
import { assertDistinctOutput } from '../exportSafety'
import type {
  AuditExportRequest,
  ExportResult,
  PiiRedactionRequest,
} from '../../shared/export'
import { generateReport } from '../report/generator'
import { buildAuditSnapshot } from '../../shared/auditWorkspace'
import { ExcelMarker, MarkerSeverity, type CellMarker } from '../excel/marker'
import { redactFile } from '../pii/redactor'

function stem(fileName: string): string {
  return parse(basename(fileName || 'cellsentry')).name || 'cellsentry'
}
async function chooseSavePath(defaultPath: string, filters: Electron.FileFilter[]): Promise<string | null> {
  const response = await dialog.showSaveDialog({ defaultPath, filters })
  return response.canceled || !response.filePath ? null : response.filePath
}

function toMarkerSeverity(severity: string): MarkerSeverity {
  if (severity === 'error') return MarkerSeverity.HIGH
  if (severity === 'warning') return MarkerSeverity.MEDIUM
  return MarkerSeverity.LOW
}

async function assertSourceFingerprint(filePath: string, expected?: string): Promise<void> {
  if (!expected) return
  const actual = createHash('sha256').update(await readFile(filePath)).digest('hex')
  const normalized = expected.startsWith('sha256:') ? expected.slice('sha256:'.length) : expected
  if (actual !== normalized) throw new Error('The source workbook changed after review. Run a new scan before exporting.')
}

function temporaryOutputPath(outputPath: string): string {
  const parsed = parse(outputPath)
  return join(dirname(outputPath), `.${parsed.name}.cellsentry-${randomUUID()}${parsed.ext}`)
}

export async function exportAudit(request: AuditExportRequest): Promise<ExportResult> {
  let temporaryPath: string | undefined
  try {
    const snapshot = buildAuditSnapshot(request)
    const extension = request.format === 'xlsx' ? 'xlsx' : request.format
    const outputPath = await chooseSavePath(
      `${stem(request.fileName)}-audit.${extension}`,
      [{ name: extension.toUpperCase(), extensions: [extension] }],
    )
    if (!outputPath) return { success: false, cancelled: true }

    await assertDistinctOutput(request.filePath, outputPath)
    await assertSourceFingerprint(request.filePath, request.sourceFingerprint)
    const stagingPath = temporaryOutputPath(outputPath)
    temporaryPath = stagingPath
    if (request.format === 'html') {
      await writeFile(stagingPath, generateReport(snapshot), 'utf8')
      await rename(stagingPath, outputPath)
      temporaryPath = undefined
      return { success: true, outputPath }
    }

    if (request.format === 'pdf') {
      const html = generateReport(snapshot)
      const window = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      try {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        await writeFile(stagingPath, await window.webContents.printToPDF({ printBackground: true }))
      } finally {
        if (!window.isDestroyed()) window.destroy()
      }
      await rename(stagingPath, outputPath)
      temporaryPath = undefined
      return { success: true, outputPath }
    }

    if (extname(request.filePath).toLowerCase() !== '.xlsx') {
      return { success: false, error: 'Marked Excel export requires an .xlsx source file' }
    }
    await copyFile(request.filePath, stagingPath)
    await assertSourceFingerprint(stagingPath, request.sourceFingerprint)
    const markers: CellMarker[] = snapshot.rows.map((row) => ({
      sheetName: row.sheetName,
      cellAddress: row.cell,
      severity: toMarkerSeverity(row.rule.severity),
      ruleId: row.rule.ruleId,
      message: row.rule.message,
      suggestion: row.rule.suggestion,
      confidence: row.rule.confidence,
    }))
    const marker = new ExcelMarker()
    const result = await marker.markIssues(stagingPath, markers, false)
    if (!result.success) return { success: false, error: result.errors?.join('; ') || 'Failed to mark workbook' }
    const review = await marker.addReviewSheet(stagingPath, snapshot)
    if (!review.success) return { success: false, error: review.errors?.join('; ') || 'Failed to add review record' }
    await rename(stagingPath, outputPath)
    temporaryPath = undefined
    return { success: true, outputPath, count: result.markedCount }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined)
  }
}
export async function redactPii(request: PiiRedactionRequest): Promise<ExportResult> {
  try {
    const outputPath = await chooseSavePath(`${stem(request.fileName)}-redacted.xlsx`, [{ name: 'Excel Workbook', extensions: ['xlsx'] }])
    if (!outputPath) return { success: false, cancelled: true }
    if (extname(request.filePath).toLowerCase() !== '.xlsx') {
      return { success: false, error: 'PII redaction currently requires an .xlsx source file' }
    }
    const result = await redactFile(request.filePath, outputPath, request.findings.map((finding) => ({
      sheet_name: finding.sheetName,
      cell: finding.cell,
      pii_type: finding.piiType,
      original_value: finding.originalValue,
      masked_value: finding.maskedValue,
      confidence: 0,
      pattern: finding.pattern,
    })))
    return result.success
      ? { success: true, outputPath: result.outputPath, count: result.redactedCount }
      : { success: false, error: result.error }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
