import { describe, expect, it } from 'vitest'
import { analyzeExcelFromSheets } from '../electron/engine/ruleEngine'
import type { CellInfo, SheetContext } from '../electron/engine/types'

type Entry = unknown | { formula: string; result: unknown }
function sheet(name: string, entries: Record<string, Entry>): SheetContext {
  const cells: Record<string, CellInfo> = {}
  for (const [address, entry] of Object.entries(entries)) {
    const [, letters, digits] = address.match(/^([A-Z]+)(\d+)$/)!
    const column = [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0)
    const formula = typeof entry === 'object' && entry !== null && 'formula' in entry ? (entry as { formula: string; result: unknown }) : null
    const value = formula ? formula.result : entry
    cells[address] = { address, row: Number(digits), column, value, formula: formula?.formula ?? null,
      dataType: formula ? 'formula' : typeof value === 'number' ? 'number' : 'text', numberFormat: null,
      isMerged: false, lenVisible: String(value).length, lenActual: String(value).length, hasHiddenChars: false }
  }
  return { name, cells, maxRow: Math.max(...Object.values(cells).map(cell => cell.row)),
    maxColumn: Math.max(...Object.values(cells).map(cell => cell.column)), mergedRanges: [], headers: {}, rowLabels: {}, reportType: null }
}
const f = (formula: string, result: unknown) => ({ formula, result })
const consistencyIds = new Set(['INCONSISTENT_FORMULA', 'FORMULA_COL_INCONSISTENCY'])
async function consistency(context: SheetContext) {
  return (await analyzeExcelFromSheets([context])).issues.filter(issue => consistencyIds.has(issue.ruleId))
}

// Fresh development cases authored from business requirements, without reading
// the implementation or the prior diagnostic holdout. Cached results are literal
// hand-calculated answers; this fixture does not recalculate Excel formulas.
describe('business formula layout', () => {
  it('does not compare a freight total against the per-shipment multiplication pattern', async () => {
    expect(await consistency(sheet('FreightOct', {
      D2: 12, E2: 35, F2: f('=D2*E2', 420),
      D3: 8, E3: 50, F3: f('=D3*E3', 400),
      D4: 15, E4: 20, F4: f('=D4*E4', 300),
      F5: f('=SUM(F2:F4)', 1120),
    }))).toEqual([])
  })

  it('does not invent a copied-formula requirement for different equipment metrics', async () => {
    expect(await consistency(sheet('EquipmentMetrics', {
      A2: 'Operating hours', E2: 120, E3: 80, E4: 100, B2: f('=SUM(E2:E4)', 300),
      A3: 'Downtime hours', F2: 4, F3: 6, F4: 2, B3: f('=SUM(F2:F4)', 12),
      A4: 'Energy kWh', G2: 500, G3: 350, G4: 450, B4: f('=SUM(G2:G4)', 1300),
      A5: 'Completed maintenance', H2: 'done', H3: 'pending', H4: 'done', B5: f('=COUNTIF(H2:H4,"done")', 2),
    }))).toEqual([])
  })

  it('still flags the work order using another row hours and suggests the repeated detail expression', async () => {
    const issues = await consistency(sheet('WorkOrders', {
      E2: 6, F2: 120, G2: f('=E2*F2', 720), E3: 5, F3: 120, G3: f('=E3*F3', 600),
      E4: 7, F4: 120, G4: f('=E3*F4', 600),
    }))
    expect(issues.map(issue => issue.cell)).toEqual(['G4'])
    expect(issues[0]?.correctFormula).toBe('=E4*F4')
  })

  it('still flags a peak-rate calculation that lost its condition', async () => {
    const issues = await consistency(sheet('ElectricityTariff', {
      E2: 'peak', F2: 100, G2: f('=IF(E2="peak",F2*1.2,F2*0.8)', 120),
      E3: 'offpeak', F3: 100, G3: f('=IF(E3="peak",F3*1.2,F3*0.8)', 80),
      E4: 'peak', F4: 150, G4: f('=F4*0.8', 120),
    }))
    expect(issues.map(issue => issue.cell)).toEqual(['G4'])
    expect(issues[0]?.correctFormula).toBe('=IF(E4="peak",F4*1.2,F4*0.8)')
  })

  it('keeps auditing detail rows beside a subtotal without using the subtotal as the suggested repair', async () => {
    const issues = await consistency(sheet('HandlingGroups', {
      E2: 2, F2: 10, G2: f('=E2*F2', 20), E3: 3, F3: 10, G3: f('=E3*F3', 30),
      D4: 'Zone subtotal', E4: f('=SUM(E2:E3)', 5), G4: f('=SUM(G2:G3)', 50),
      E5: 7, F5: 3, G5: f('=E4*F5', 15), E6: 4, F6: 3, G6: f('=E6*F6', 12),
    }))
    expect(issues.some(issue => issue.cell === 'G4')).toBe(false)
    expect(issues.find(issue => issue.cell === 'G5')?.correctFormula).toBe('=E5*F5')
  })

  it('still checks a total itself for an omitted final item', async () => {
    const result = await analyzeExcelFromSheets([sheet('ShopSupplies', {
      D2: 18, D3: 25, D4: 12, D5: 30, D6: f('=SUM(D2:D4)', 55),
    })])
    expect(result.issues.some(issue => issue.ruleId === 'SUM_RANGE_INCOMPLETE' && issue.cell === 'D6')).toBe(true)
  })

  it('keeps a replaced detail constant visible to the hardcoded-formula rule', async () => {
    const result = await analyzeExcelFromSheets([sheet('RepairBilling', {
      E2: 2, F2: 90, G2: f('=E2*F2', 180), E3: 3, F3: 90, G3: f('=E3*F3', 270),
      E4: 4, F4: 90, G4: 350, E5: 5, F5: 90, G5: f('=E5*F5', 450), G6: f('=SUM(G2:G5)', 1250),
    })])
    expect(result.issues.some(issue => issue.ruleId === 'HARDCODED_IN_FORMULA_COL' && issue.cell === 'G4')).toBe(true)
  })

  it('does not exempt copied horizontal totals from vertical formula comparison', async () => {
    const issues = await consistency(sheet('WeeklyMeterTotals', {
      C2: 1, D2: 2, E2: 3, F2: 4, G2: f('=SUM(C2:F2)', 10),
      C3: 2, D3: 3, E3: 4, F3: 5, G3: f('=SUM(C3:F3)', 14),
      C4: 3, D4: 4, E4: 5, F4: 6, G4: f('=SUM(C4:E4)', 12),
      C5: 4, D5: 5, E5: 6, F5: 7, G5: f('=SUM(C5:F5)', 22),
    }))
    expect(issues.find(issue => issue.ruleId === 'INCONSISTENT_FORMULA' && issue.cell === 'G4')?.correctFormula).toBe('=SUM(C4:F4)')
  })
})
