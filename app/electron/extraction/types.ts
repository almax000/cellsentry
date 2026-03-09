/**
 * Data Extraction Engine — Type definitions.
 *
 * Defines document types, extraction fields, tables, templates, and results
 * for structured data extraction from Excel/spreadsheet files.
 */

export enum DocumentType {
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
  EXPENSE_REPORT = 'expense_report',
  PURCHASE_ORDER = 'purchase_order',
  PAYROLL = 'payroll',
  UNKNOWN = 'unknown',
}

export interface ExtractionField {
  key: string
  label: string
  value: string
  cell: string
  sheet_name: string
  confidence: number
}

export interface ExtractedTable {
  sheet_name: string
  header_row: number
  headers: string[]
  rows: string[][]
  start_cell: string
  end_cell: string
}

export interface FieldPattern {
  key: string
  label: string
  keywords: string[]
  position: 'right' | 'below'
}

export interface ExtractionTemplate {
  docType: DocumentType
  identifiers: string[]
  fieldPatterns: FieldPattern[]
  headerPatterns: string[]
}

export interface ExtractionResult {
  success: boolean
  document_type: string
  fields: ExtractionField[]
  tables: ExtractedTable[]
  duration: number
  scannedAt: string
  error?: string
}
