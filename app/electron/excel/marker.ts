import ExcelJS from 'exceljs'
import { copyFileSync, existsSync } from 'fs'
import { join, parse as parsePath } from 'path'

export enum MarkerSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface CellMarker {
  sheetName: string
  cellAddress: string
  severity: MarkerSeverity
  ruleId: string
  message: string
  suggestion: string
  confidence: number
}

const MARKER_COLORS: Record<MarkerSeverity, { fill: string; font: string; border: string }> = {
  [MarkerSeverity.CRITICAL]: {
    fill: 'FFCCCC',
    font: 'CC0000',
    border: 'FF0000'
  },
  [MarkerSeverity.HIGH]: {
    fill: 'FFCCCC',
    font: 'CC0000',
    border: 'FF0000'
  },
  [MarkerSeverity.MEDIUM]: {
    fill: 'FFFFC0',
    font: '996600',
    border: 'FFCC00'
  },
  [MarkerSeverity.LOW]: {
    fill: 'CCE5FF',
    font: '0066CC',
    border: '3399FF'
  }
}

const CELLSENTRY_COMMENT_PREFIX = '[CellSentry]'

const SEVERITY_NAMES: Record<string, Record<MarkerSeverity, string>> = {
  zh: {
    [MarkerSeverity.CRITICAL]: '\u7d27\u6025',
    [MarkerSeverity.HIGH]: '\u4e25\u91cd',
    [MarkerSeverity.MEDIUM]: '\u8b66\u544a',
    [MarkerSeverity.LOW]: '\u5efa\u8bae'
  },
  en: {
    [MarkerSeverity.CRITICAL]: 'Critical',
    [MarkerSeverity.HIGH]: 'High',
    [MarkerSeverity.MEDIUM]: 'Warning',
    [MarkerSeverity.LOW]: 'Info'
  }
}

export class ExcelMarker {
  private lang: string

  constructor(lang: string = 'en') {
    this.lang = lang
  }

  async markIssues(
    filePath: string,
    markers: CellMarker[],
    backup: boolean = true
  ): Promise<{ success: boolean; markedCount?: number; errors?: string[] }> {
    if (!existsSync(filePath)) {
      return { success: false, errors: ['File not found'] }
    }

    try {
      if (backup) this.createBackup(filePath)

      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(filePath)

      // Group markers by sheet
      const bySheet = new Map<string, CellMarker[]>()
      for (const m of markers) {
        const list = bySheet.get(m.sheetName) || []
        list.push(m)
        bySheet.set(m.sheetName, list)
      }

      let markedCount = 0
      const errors: string[] = []

      for (const [sheetName, sheetMarkers] of bySheet) {
        const ws = wb.getWorksheet(sheetName)
        if (!ws) {
          errors.push(`Sheet not found: ${sheetName}`)
          continue
        }
        for (const marker of sheetMarkers) {
          try {
            this.markCell(ws, marker)
            markedCount++
          } catch (e) {
            errors.push(`${sheetName}!${marker.cellAddress}: ${e}`)
          }
        }
      }

      await wb.xlsx.writeFile(filePath)

      return {
        success: true,
        markedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (e) {
      return { success: false, errors: [String(e)] }
    }
  }

  async clearMarkers(
    filePath: string,
    backup: boolean = true
  ): Promise<{ success: boolean; clearedCount?: number }> {
    if (!existsSync(filePath)) {
      return { success: false }
    }

    try {
      if (backup) this.createBackup(filePath)

      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(filePath)

      let clearedCount = 0
      wb.eachSheet((ws) => {
        ws.eachRow((row) => {
          row.eachCell((cell) => {
            const note = cell.note
            if (!note) return
            const noteText = typeof note === 'string' ? note : note.texts?.map(t =>
              typeof t === 'string' ? t : t.text
            ).join('') || ''
            if (noteText.startsWith(CELLSENTRY_COMMENT_PREFIX)) {
              cell.note = undefined as unknown as ExcelJS.Comment
              cell.fill = {} as ExcelJS.Fill
              cell.border = {}
              clearedCount++
            }
          })
        })
      })

      await wb.xlsx.writeFile(filePath)
      return { success: true, clearedCount }
    } catch {
      return { success: false }
    }
  }

  private markCell(ws: ExcelJS.Worksheet, marker: CellMarker): void {
    const cell = ws.getCell(marker.cellAddress)
    const colors = MARKER_COLORS[marker.severity] || MARKER_COLORS[MarkerSeverity.MEDIUM]

    // 1. Background fill
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + colors.fill }
    }

    // 2. Border
    const borderStyle: ExcelJS.Border = {
      style: 'thin',
      color: { argb: 'FF' + colors.border }
    }
    cell.border = {
      left: borderStyle,
      right: borderStyle,
      top: borderStyle,
      bottom: borderStyle
    }

    // 3. Comment/Note
    cell.note = this.buildCommentText(marker)
  }

  private buildCommentText(marker: CellMarker): string {
    const lines: string[] = [CELLSENTRY_COMMENT_PREFIX]
    const names = SEVERITY_NAMES[this.lang] || SEVERITY_NAMES.en
    const severityName = names[marker.severity] || marker.severity

    if (this.lang === 'zh') {
      lines.push(`\u4e25\u91cd\u7a0b\u5ea6: ${severityName}`)
      lines.push(`\u89c4\u5219: ${marker.ruleId}`)
      lines.push('')
      lines.push(marker.message)
      if (marker.suggestion) {
        lines.push('')
        lines.push(`\u5efa\u8bae: ${marker.suggestion}`)
      }
      if (marker.confidence < 1.0) {
        lines.push('')
        lines.push(`\u7f6e\u4fe1\u5ea6: ${Math.round(marker.confidence * 100)}%`)
      }
    } else {
      lines.push(`Severity: ${severityName}`)
      lines.push(`Rule: ${marker.ruleId}`)
      lines.push('')
      lines.push(marker.message)
      if (marker.suggestion) {
        lines.push('')
        lines.push(`Suggestion: ${marker.suggestion}`)
      }
      if (marker.confidence < 1.0) {
        lines.push('')
        lines.push(`Confidence: ${Math.round(marker.confidence * 100)}%`)
      }
    }

    return lines.join('\n')
  }

  private createBackup(filePath: string): string {
    const parsed = parsePath(filePath)
    let backupName = `${parsed.name}_backup${parsed.ext}`
    let backupPath = join(parsed.dir, backupName)

    let counter = 1
    while (existsSync(backupPath)) {
      backupName = `${parsed.name}_backup_${counter}${parsed.ext}`
      backupPath = join(parsed.dir, backupName)
      counter++
    }

    copyFileSync(filePath, backupPath)
    return backupPath
  }
}
