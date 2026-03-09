import { useState, useEffect, useRef, useCallback } from 'react'
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

  // Build issue map for O(1) cell lookup
  const issueCellMap = useRef(new Map<string, Issue>())
  useEffect(() => {
    const map = new Map<string, Issue>()
    for (const issue of issues) {
      if (!issue.sheetName || issue.sheetName === activeSheet) {
        map.set(issue.cell, issue)
      }
    }
    issueCellMap.current = map
  }, [issues, activeSheet])

  // Fetch cell data from sidecar
  useEffect(() => {
    if (!filePath || !window.api?.getFileCells) {
      // Use empty grid as fallback
      setCellData([])
      return
    }

    let cancelled = false
    async function loadCells(): Promise<void> {
      try {
        const result = await window.api.getFileCells(filePath, activeSheet, 'A1:Z50')
        if (cancelled || !result.success) return

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
      } catch {
        setCellData([])
      }
    }

    loadCells()
    return () => { cancelled = true }
  }, [filePath, activeSheet])

  // Scroll to selected cell
  useEffect(() => {
    if (!selectedIssue || !gridRef.current) return
    const parsed = parseCell(selectedIssue.cell)
    if (!parsed) return
    const cellEl = gridRef.current.querySelector(`[data-cell="${parsed.col}${parsed.row}"]`)
    if (cellEl) {
      cellEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
  }, [selectedIssue])

  const handleCellHover = useCallback(
    (e: React.MouseEvent, col: string, rowNum: number) => {
      const cellKey = `${col}${rowNum}`
      const issue = issueCellMap.current.get(cellKey)
      const row = cellData[rowNum - 1]
      const formula = row?.[`_formula_${col}`]

      if (formula || issue) {
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        setTooltip({ x: rect.left, y: rect.bottom + 4, formula, issue })
      }
    },
    [cellData]
  )

  const getCellClass = useCallback(
    (col: string, rowNum: number): string => {
      const classes = ['ss-cell']
      const cellKey = `${col}${rowNum}`
      const row = cellData[rowNum - 1]
      const val = row?.[col] || ''

      // Numeric detection
      if (col !== 'A' && val && !isNaN(Number(val.replace(/[,%\-\s]/g, ''))) && val !== '') {
        classes.push('num')
      } else {
        classes.push('text')
      }

      if (row?.[`_formula_${col}`]) classes.push('formula')
      if (!val) classes.push('empty')

      const issue = issueCellMap.current.get(cellKey)
      if (issue) {
        classes.push('issue-marker')
        const markerClass = issue.severity === 'error' ? 'critical' : issue.severity
        classes.push(`${markerClass}-marker`)
        if (selectedIssue?.cell === cellKey) {
          classes.push('selected-cell')
        }
      }

      return classes.join(' ')
    },
    [cellData, selectedIssue]
  )

  const displayRows = cellData.length > 0 ? cellData : Array.from({ length: 25 }, () => {
    const row: CellRow = {}
    columns.forEach((col) => { row[col] = '' })
    return row
  })

  return (
    <>
      <div className="spreadsheet-toolbar">
        {(sheets.length > 0 ? sheets : ['Sheet1']).map((sheet) => (
          <span
            key={sheet}
            className={`sheet-tab ${activeSheet === sheet ? 'active' : ''}`}
            onClick={() => setActiveSheet(sheet)}
          >
            {sheet}
          </span>
        ))}
        <div className="toolbar-spacer" />
        <button className="open-excel-btn" onClick={() => window.api?.openFilePath?.(filePath)}>
          <ExternalLinkIcon size={12} /> {t('openInExcel')}
        </button>
      </div>

      <div className="spreadsheet-grid" ref={gridRef}>
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
              const rowNum = idx + 1
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
          {tooltip.issue && <div className="tt-issue">⚠ {tooltip.issue.ruleId}</div>}
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
