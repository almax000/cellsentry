import type { CellInfo } from './types'
import { columnToNumber } from './utils'

export type FormulaAxis = 'vertical' | 'horizontal'

/**
 * A direct local range aggregate consumes neighbouring results along its axis;
 * it is not a copied detail expression on that axis. Recognize only this small
 * unambiguous shape. Qualified/compound/structured formulas are not guessed.
 * This changes peer comparison only: other rules still audit the aggregate.
 */
export function isLocalAxisAggregate(cell: CellInfo, axis: FormulaAxis): boolean {
  const match = cell.formula?.match(/^=\s*(?:SUM|AVERAGE|MIN|MAX|COUNT|COUNTA|PRODUCT)\s*\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?([A-Z]{1,3})\$?(\d+)\s*\)\s*$/i)
  if (!match) return false
  const startColumn = columnToNumber(match[1].toUpperCase()), endColumn = columnToNumber(match[3].toUpperCase())
  const startRow = Number(match[2]), endRow = Number(match[4])
  if (startRow < 1 || endRow < 1) return false
  if (axis === 'vertical') {
    return startColumn === cell.column && endColumn === cell.column
      && (Math.max(startRow, endRow) < cell.row || Math.min(startRow, endRow) > cell.row)
  }
  return startRow === cell.row && endRow === cell.row
    && (Math.max(startColumn, endColumn) < cell.column || Math.min(startColumn, endColumn) > cell.column)
}
