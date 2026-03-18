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

async function generateCombinedFixture(): Promise<void> {
  const wb = new ExcelJS.Workbook()

  // Sheet 1: Sales Invoice — triggers audit (formula errors) + extraction (invoice structure)
  const ws1 = wb.addWorksheet('Sales Invoice')
  ws1.getCell('A1').value = 'Sales Invoice'
  ws1.getCell('A3').value = 'Invoice Number'
  ws1.getCell('B3').value = 'INV-2024-042'
  ws1.getCell('A4').value = 'Date'
  ws1.getCell('B4').value = '2024-06-15'
  ws1.getCell('A5').value = 'Vendor'
  ws1.getCell('B5').value = 'Acme Corp'

  // Table with formula errors
  ws1.getCell('A7').value = 'Item'
  ws1.getCell('B7').value = 'Qty'
  ws1.getCell('C7').value = 'Price'
  ws1.getCell('D7').value = 'Amount'

  ws1.getCell('A8').value = 'Widget A'
  ws1.getCell('B8').value = 5
  ws1.getCell('C8').value = 100
  ws1.getCell('D8').value = { formula: 'B8*C8' }

  ws1.getCell('A9').value = 'Widget B'
  ws1.getCell('B9').value = 3
  ws1.getCell('C9').value = 200
  ws1.getCell('D9').value = { formula: 'B9*C9' }

  ws1.getCell('A10').value = 'Widget C'
  ws1.getCell('B10').value = 7
  ws1.getCell('C10').value = 50
  ws1.getCell('D10').value = { formula: 'B10*C10' }

  // Total row — hardcoded value instead of formula (audit finding: hardcoded_summary)
  ws1.getCell('A12').value = 'Total'
  ws1.getCell('D12').value = 1450

  // Sheet 2: Contacts — triggers PII (email, phone, SSN)
  const ws2 = wb.addWorksheet('Contacts')
  ws2.addRow(['Name', 'Email', 'Phone', 'SSN', 'Department'])
  ws2.addRow(['Alice Johnson', 'alice.johnson@example.com', '(555) 234-5678', '987-65-4321', 'Engineering'])
  ws2.addRow(['Bob Chen', 'bob.chen@corp.io', '13800138000', '', 'Sales'])

  const outPath = join(FIXTURES_DIR, 'combined-test-data.xlsx')
  await wb.xlsx.writeFile(outPath)
  console.log(`Generated: ${outPath}`)
}

async function main(): Promise<void> {
  await generatePiiFixture()
  await generateInvoiceFixture()
  await generateCombinedFixture()
  console.log('All fixtures generated.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
