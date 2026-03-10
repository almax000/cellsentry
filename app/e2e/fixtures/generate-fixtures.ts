/**
 * Generate deterministic .xlsx test fixtures for PII and extraction E2E tests.
 *
 * Run: npx tsx e2e/fixtures/generate-fixtures.ts
 */

import ExcelJS from 'exceljs'
import { join } from 'path'

const FIXTURES_DIR = __dirname

async function generatePiiFixture(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Employees')

  // Headers
  ws.addRow(['Name', 'Email', 'Phone', 'SSN', 'Notes'])

  // Row 2: John Smith — email, US phone, US SSN
  ws.addRow([
    'John Smith',
    'john.smith@example.com',
    '(555) 123-4567',
    '123-45-6789',
    'Sales manager',
  ])

  // Row 3: Jane Doe — email, CN mobile phone
  ws.addRow([
    'Jane Doe',
    'jane@company.org',
    '13912345678',
    '',
    'Engineering lead',
  ])

  const outPath = join(FIXTURES_DIR, 'pii-test-data.xlsx')
  await wb.xlsx.writeFile(outPath)
  console.log(`Generated: ${outPath}`)
}

async function generateInvoiceFixture(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Invoice')

  // Document type trigger — needs 2+ identifier matches for detection threshold
  ws.getCell('A1').value = 'Sales Invoice'

  // Fields
  ws.getCell('A3').value = 'Invoice Number'
  ws.getCell('B3').value = 'INV-2024-001'

  ws.getCell('A4').value = 'Date'
  ws.getCell('B4').value = '2024-03-15'

  ws.getCell('A5').value = 'Vendor'
  ws.getCell('B5').value = 'Acme Corp'

  ws.getCell('A6').value = 'Total'
  ws.getCell('B6').value = 1500.00

  // Table headers (row 8)
  ws.getCell('A8').value = 'Item'
  ws.getCell('B8').value = 'Description'
  ws.getCell('C8').value = 'Quantity'
  ws.getCell('D8').value = 'Unit Price'
  ws.getCell('E8').value = 'Amount'

  // Table data rows
  ws.getCell('A9').value = 'Widget A'
  ws.getCell('B9').value = 'Standard widget'
  ws.getCell('C9').value = 10
  ws.getCell('D9').value = 50.00
  ws.getCell('E9').value = 500.00

  ws.getCell('A10').value = 'Widget B'
  ws.getCell('B10').value = 'Premium widget'
  ws.getCell('C10').value = 10
  ws.getCell('D10').value = 100.00
  ws.getCell('E10').value = 1000.00

  const outPath = join(FIXTURES_DIR, 'invoice-test-data.xlsx')
  await wb.xlsx.writeFile(outPath)
  console.log(`Generated: ${outPath}`)
}

async function main(): Promise<void> {
  await generatePiiFixture()
  await generateInvoiceFixture()
  console.log('All fixtures generated.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
