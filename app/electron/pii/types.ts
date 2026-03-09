/**
 * PII detection types for CellSentry.
 */

export enum PiiType {
  SSN = 'ssn',
  PHONE = 'phone',
  EMAIL = 'email',
  ID_NUMBER = 'id_number',
  CREDIT_CARD = 'credit_card',
  NAME = 'name',
  ADDRESS = 'address',
  IBAN = 'iban',
  BANK_CARD = 'bank_card',
  PASSPORT = 'passport',
}

export interface PiiPattern {
  type: PiiType
  regex: RegExp
  locale: string // 'universal' | 'cn' | 'us' | 'eu'
  label: string
  validator?: (match: string) => boolean
}

export interface PiiFinding {
  sheet_name: string
  cell: string
  pii_type: string
  original_value: string
  masked_value: string
  confidence: number
  pattern: string
}

export interface PiiScanResult {
  success: boolean
  findings: PiiFinding[]
  duration: number
  scannedAt: string
  error?: string
}
