import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Issue } from '../types'
import { ExternalLinkIcon } from './icons'
import './SpreadsheetPreview.css'

interface SpreadsheetPreviewProps {
  issues: Issue[]
  selectedIssue: Issue | null
  sheets: string[]
  filePath: string
}

interface CellTooltip {
  x: number
  y: number
  formula?: string
  issue?: Issue
}

interface CellRow {
  [col: string]: string
}

const DEFAULT_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export default function SpreadsheetPreview({
  issues,
  selectedIssue,
  sheets,
  filePath,
}: SpreadsheetPreviewProps): JSX.Element {
  const { t } = useTranslation('results')
  const gridRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<CellTooltip | null>(null)
  const [activeSheet, setActiveSheet] = useState(sheets[0] || 'Sheet1')
  const [cellData, setCellData] = useState<CellRow[]>([])
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLS)

  const [loadError, setLoadError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const sheetKey = JSON.stringify(sheets)
  useEffect(() => {
    setActiveSheet((current) => selectedIssue?.sheetName && sheets.includes(selectedIssue.sheetName)
      ? selectedIssue.sheetName
      : sheets.includes(current) ? current : sheets[0] || 'Sheet1')
  }, [selectedIssue, filePath, sheetKey])
  const selectedCell = selectedIssue?.sheetName === activeSheet ? parseCell(selectedIssue.cell) : null
  const startRow = selectedCell && selectedCell.row > 50 ? Math.max(1, selectedCell.row - 12) : 1
  const selectedColumn = selectedCell ? columnNumber(selectedCell.col) : 1
  const startColumn = selectedColumn > 26 ? Math.max(1, selectedColumn - 8) : 1
  const range = `${columnLetter(startColumn)}${startRow}:${columnLetter(Math.min(16384, startColumn + 25))}${Math.min(1048576, startRow + 49)}`
  const requestKey = JSON.stringify([filePath, activeSheet, range])

  // Include the sheet in lookup and selection; identical addresses on other sheets are different cells.
  const issueCellMap = useMemo(() => {
    const map = new Map<string, Issue>()
    for (const issue of issues) {
      if (!issue.sheetName || issue.sheetName === activeSheet) {
        map.set(issue.cell, issue)
      }
    }
    return map
  }, [issues, activeSheet])

  // Fetch cell data from sidecar
  useEffect(() => {
    if (!filePath || !window.api?.getFileCells) {
      // Use empty grid as fallback
      setCellData([])
      setLoadError(t('previewFailed'))
      setLoadedKey(requestKey)
      return
    }

    let cancelled = false
    setLoadError('')
    setTooltip(null)
    async function loadCells(): Promise<void> {
      try {
        const result = await window.api.getFileCells(filePath, activeSheet, range)
        if (cancelled) return
        if (!result.success) {
          setCellData([])
          setLoadError(t('previewFailed'))
          setLoadedKey(requestKey)
          return
        }

        setColumns(result.columns || DEFAULT_COLS)
        const rows: CellRow[] = (result.rows || []).map(
          (row: Array<{ value: string; formula: string }>) => {
            const rowObj: CellRow = {}
            ;(result.columns || DEFAULT_COLS).forEach((col: string, i: number) => {
              rowObj[col] = row[i]?.value || ''
              if (row[i]?.formula) {
                rowObj[`_formula_${col}`] = row[i].formula
              }
            })
            return rowObj
          }
        )
        setCellData(rows)
        setLoadedKey(requestKey)
      } catch {
        if (cancelled) return
        setCellData([])
        setLoadError(t('previewFailed'))
        setLoadedKey(requestKey)
      }
    }

    loadCells()
    return () => { cancelled = true }
  }, [filePath, activeSheet, range, requestKey, t])

  // Scroll to selected cell
  useEffect(() => {
    if (!selectedIssue || selectedIssue.sheetName !== activeSheet || loadedKey !== requestKey || !gridRef.current) return
    const parsed = parseCell(selectedIssue.cell)
    if (!parsed) return
    const cellEl = gridRef.current.querySelector(`[data-cell="${parsed.col}${parsed.row}"]`)
    if (cellEl) {
      cellEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
  }, [selectedIssue, activeSheet, loadedKey, requestKey])

  const handleCellHover = useCallback(
    (e: React.MouseEvent, col: string, rowNum: number) => {
      const cellKey = `${col}${rowNum}`
      const issue = issueCellMap.get(cellKey)
      const row = cellData[rowNum - startRow]
      const formula = row?.[`_formula_${col}`]

      if (formula || issue) {
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        setTooltip({ x: rect.left, y: rect.bottom + 4, formula, issue })
      }
    },
    [cellData, startRow, issueCellMap]
  )

  const getCellClass = useCallback(
    (col: string, rowNum: number): string => {
      const classes = ['ss-cell']
      const cellKey = `${col}${rowNum}`
      const row = cellData[rowNum - startRow]
      const val = row?.[col] || ''

      // Numeric detection
      if (col !== 'A' && val && !isNaN(Number(val.replace(/[,%\-\s]/g, ''))) && val !== '') {
        classes.push('num')
      } else {
        classes.push('text')
      }

      if (row?.[`_formula_${col}`]) classes.push('formula')
      if (!val) classes.push('empty')

      const issue = issueCellMap.get(cellKey)
      if (issue) {
        classes.push('issue-marker')
        const markerClass = issue.severity === 'error' ? 'critical' : issue.severity
        classes.push(`${markerClass}-marker`)
        if (selectedIssue?.cell === cellKey && selectedIssue?.sheetName === activeSheet) {
          classes.push('selected-cell')
        }
      }

      return classes.join(' ')
    },
    [cellData, selectedIssue, startRow, activeSheet, issueCellMap]
  )

  const displayRows = loadedKey === requestKey && !loadError ? cellData : []

  return (
    <>
      <div className="spreadsheet-toolbar">
        {(sheets.length > 0 ? sheets : ['Sheet1']).map((sheet) => (
          <button
            key={sheet}
            type="button"
            aria-pressed={activeSheet === sheet}
            className={`sheet-tab ${activeSheet === sheet ? 'active' : ''}`}
            onClick={() => setActiveSheet(sheet)}
          >
            {sheet}
          </button>
        ))}
        <span className="preview-range" data-testid="preview-range">{range}</span>
        <div className="toolbar-spacer" />
        <button className="open-excel-btn" onClick={() => window.api?.openFilePath?.(filePath)}>
          <ExternalLinkIcon size={12} /> {t('openInExcel')}
        </button>
      </div>

      <div className="spreadsheet-grid" ref={gridRef} aria-busy={loadedKey !== requestKey}>
        {loadedKey !== requestKey && <p className="preview-status" role="status">{t('previewLoading')}</p>}
        {loadedKey === requestKey && loadError && <p className="preview-status" role="alert">{loadError}</p>}
        <table className="ss-table">
          <thead>
            <tr>
              <th></th>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const rowNum = idx + startRow
              return (
                <tr key={rowNum}>
                  <td className="ss-row-num">{rowNum}</td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className={getCellClass(col, rowNum)}
                      data-cell={`${col}${rowNum}`}
                      onMouseEnter={(e) => handleCellHover(e, col, rowNum)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {row[col] || ''}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div className="ss-cell-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.formula && <div className="tt-formula">{tooltip.formula}</div>}
          {tooltip.issue && <div className="tt-issue">⚠ {tooltip.issue.message}</div>}
        </div>
      )}
    </>
  )
}

function parseCell(ref: string): { col: string; row: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { col: match[1], row: parseInt(match[2]) }
}

function columnNumber(column: string): number {
  return [...column].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0)
}

function columnLetter(column: number): string {
  let result = ''
  while (column > 0) {
    result = String.fromCharCode(65 + (column - 1) % 26) + result
    column = Math.floor((column - 1) / 26)
  }
  return result
}
