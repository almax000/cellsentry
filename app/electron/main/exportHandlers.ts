import { BrowserWindow, dialog } from 'electron'
import { copyFile, writeFile } from 'fs/promises'
import { basename, extname, parse } from 'path'
import { assertDistinctOutput } from '../exportSafety'
import type {
  AuditExportRequest,
  ExportResult,
  PiiRedactionRequest,
} from '../../shared/export'
import { generateReport } from '../report/generator'
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

export async function exportAudit(request: AuditExportRequest): Promise<ExportResult> {
  try {
    const extension = request.format === 'xlsx' ? 'xlsx' : request.format
    const outputPath = await chooseSavePath(
      `${stem(request.fileName)}-audit.${extension}`,
      [{ name: extension.toUpperCase(), extensions: [extension] }],
    )
    if (!outputPath) return { success: false, cancelled: true }

    await assertDistinctOutput(request.filePath, outputPath)
    if (request.format === 'html') {
      await writeFile(outputPath, generateReport(request.issues.map((issue) => ({
        sheet_name: issue.sheetName,
        cell_address: issue.cell,
        severity: issue.severity,
        message: issue.message,
        suggestion: issue.suggestion,
      })), request.fileName), 'utf8')
      return { success: true, outputPath }
    }

    if (request.format === 'pdf') {
      const html = generateReport(request.issues.map((issue) => ({
        sheet_name: issue.sheetName,
        cell_address: issue.cell,
        severity: issue.severity,
        message: issue.message,
        suggestion: issue.suggestion,
      })), request.fileName)
      const window = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      try {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        await writeFile(outputPath, await window.webContents.printToPDF({ printBackground: true }))
      } finally {
        if (!window.isDestroyed()) window.destroy()
      }
      return { success: true, outputPath }
    }

    if (extname(request.filePath).toLowerCase() !== '.xlsx') {
      return { success: false, error: 'Marked Excel export requires an .xlsx source file' }
    }
    await copyFile(request.filePath, outputPath)
    const markers: CellMarker[] = request.issues.map((issue) => ({
      sheetName: issue.sheetName,
      cellAddress: issue.cell,
      severity: toMarkerSeverity(issue.severity),
      ruleId: issue.ruleId,
      message: issue.message,
      suggestion: issue.suggestion,
      confidence: issue.confidence,
    }))
    const result = await new ExcelMarker().markIssues(outputPath, markers, false)
    if (!result.success) return { success: false, error: result.errors?.join('; ') || 'Failed to mark workbook' }
    return { success: true, outputPath, count: result.markedCount }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
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
