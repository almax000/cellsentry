/**
 * Generates the deterministic, rules-only workbook used by golden-functional.spec.ts.
 *
 * Run from app/: npx tsx e2e/fixtures/generate-golden-fixture.ts
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import ExcelJS from 'exceljs'

const FIXTURE_DIR = fileURLToPath(new URL('.', import.meta.url))
const workbookPath = join(FIXTURE_DIR, 'golden-three-workflows.xlsx')
const manifestPath = join(FIXTURE_DIR, 'golden-three-workflows.manifest.json')

async function generate(): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CellSentry Golden Fixture'
  workbook.created = new Date('2026-10-16T00:00:00.000Z')
  workbook.modified = new Date('2026-10-16T00:00:00.000Z')

  const invoice = workbook.addWorksheet('Invoice Audit')
  invoice.getCell('A1').value = 'Sales Invoice'
  invoice.getCell('A3').value = 'Invoice Number'
  invoice.getCell('B3').value = 'INV-GOLD-001'
  invoice.getCell('A4').value = 'Date'
  invoice.getCell('B4').value = '2026-10-16'
  invoice.getCell('A5').value = 'Vendor'
  invoice.getCell('B5').value = 'Golden Widgets LLC'
  invoice.getCell('G3').value = { formula: 'G3+1', result: 1 }

  invoice.getRow(8).values = ['Item', 'Description', 'Quantity', 'Unit Price', 'Amount']
  invoice.getRow(9).values = ['Widget A', '=1+1', 2, 50, { formula: 'C9*D9', result: 100 }]
  invoice.getRow(10).values = ['Widget B', '@SUM(A1:A2)', 2, 100, { formula: 'C10*D10', result: 200 }]
  invoice.getRow(11).values = ['Widget C', '-12', 1, 300, { formula: 'C11+D11', result: 301 }]
  invoice.getCell('A12').value = 'Subtotal'
  invoice.getCell('E12').value = { formula: 'SUM(E9:E10)', result: 300 }
  invoice.getCell('A13').value = 'Total'
  invoice.getCell('E13').value = 601

  const pii = workbook.addWorksheet('PII Review')
  pii.getRow(1).values = ['Email', 'US Phone', 'SSN', 'CN Phone', 'Multiple emails']
  pii.getRow(2).values = [
    'jane.doe@example.com',
    '+1 415-555-2671',
    '123-45-6789',
    '13912345678',
    'first@example.com and second@example.com',
  ]

  await workbook.xlsx.writeFile(workbookPath)
  const sourceSha256 = createHash('sha256').update(readFileSync(workbookPath)).digest('hex')
  const manifest = {
    version: 1,
    fixture: 'golden-three-workflows.xlsx',
    sourceSha256,
    rulesOnly: true,
    modelAccuracyVerified: false,
    audit: {
      requiredIssues: [
        { sheet: 'Invoice Audit', cell: 'G3', ruleId: 'CIRCULAR_REFERENCE', severity: 'error' },
        { sheet: 'Invoice Audit', cell: 'E11', ruleId: 'INCONSISTENT_FORMULA', severity: 'warning' },
        { sheet: 'Invoice Audit', cell: 'E12', ruleId: 'SUM_RANGE_INCOMPLETE', severity: 'error' },
        { sheet: 'Invoice Audit', cell: 'E13', ruleId: 'HARDCODED_SUMMARY', severity: 'warning' },
      ],
    },
    pii: {
      expectedFindings: [
        { sheet: 'PII Review', cell: 'A2', type: 'email', masked: 'j***@example.com' },
        { sheet: 'PII Review', cell: 'B2', type: 'phone', masked: '141****2671' },
        { sheet: 'PII Review', cell: 'C2', type: 'ssn', masked: '***-**-6789' },
        { sheet: 'PII Review', cell: 'D2', type: 'phone', masked: '139****5678' },
        { sheet: 'PII Review', cell: 'E2', type: 'email', masked: 'f***@example.com and s***@example.com' },
      ],
    },
    extraction: {
      documentType: 'invoice',
      fields: [
        { key: 'invoice_number', value: 'INV-GOLD-001', cell: 'B3', sheet: 'Invoice Audit' },
        { key: 'date', value: '2026-10-16', cell: 'B4', sheet: 'Invoice Audit' },
        { key: 'vendor', value: 'Golden Widgets LLC', cell: 'B5', sheet: 'Invoice Audit' },
        { key: 'subtotal', value: '300', cell: 'E12', sheet: 'Invoice Audit' },
        { key: 'total', value: '601', cell: 'E13', sheet: 'Invoice Audit' },
      ],
      table: {
        sheet: 'Invoice Audit',
        headerRow: 8,
        startCell: 'A8',
        endCell: 'E13',
        headers: ['Item', 'Description', 'Quantity', 'Unit Price', 'Amount'],
        rows: [
          ['Widget A', '=1+1', '2', '50', '100'],
          ['Widget B', '@SUM(A1:A2)', '2', '100', '200'],
          ['Widget C', '-12', '1', '300', '301'],
          ['Subtotal', '', '', '', '300'],
          ['Total', '', '', '', '601'],
        ],
      },
      csvRows: [
        "Widget A,'=1+1,2,50,100",
        "Widget B,'@SUM(A1:A2),2,100,200",
        'Widget C,-12,1,300,301',
        'Subtotal,,,,300',
        'Total,,,,601',
      ],
    },
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Generated ${workbookPath}`)
  console.log(`SHA-256 ${sourceSha256}`)
}

generate().catch((error) => {
  console.error(error)
  process.exit(1)
})
