import type { ActiveView, ScanMode } from './types'

/** A user-facing task. Each task owns an entry page and maps onto one results view. */
export type TaskId = ActiveView

export interface TaskDef {
  id: TaskId
  route: string
  /** Mode passed to startScan. Audit keeps the unified scan, which runs all three engines. */
  scanMode?: ScanMode
  /** Only the audit engine supports batch and folder scans. */
  allowsBatch: boolean
}

export const TASKS: Record<TaskId, TaskDef> = {
  pii: { id: 'pii', route: '/pii', scanMode: 'pii', allowsBatch: false },
  audit: { id: 'audit', route: '/audit', allowsBatch: true },
  extraction: { id: 'extraction', route: '/extract', scanMode: 'extraction', allowsBatch: false },
}

/** Sidebar and home-page order: redaction is the lead task. */
export const TASK_ORDER: TaskId[] = ['pii', 'audit', 'extraction']

export function taskForRoute(pathname: string): TaskDef | null {
  return TASK_ORDER.map((id) => TASKS[id]).find((task) => task.route === pathname) ?? null
}

export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.csv']
const DOCUMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff', '.bmp', '.webp']

export type DropKind = 'spreadsheet' | 'document' | 'unsupported'

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.substring(dot).toLowerCase()
}

/** Classify a file by name. PDFs and photos are recognised so we can say they are coming, not "unsupported". */
export function classifyFileName(name: string): DropKind {
  const ext = extensionOf(name)
  if (SPREADSHEET_EXTENSIONS.includes(ext)) return 'spreadsheet'
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document'
  return 'unsupported'
}

/**
 * Classify by MIME type while a drag is in progress; file names are not readable
 * before drop. Returns null when the type is unknown (common for .xlsx on macOS).
 */
export function classifyMimeType(type: string): DropKind | null {
  if (!type) return null
  if (type === 'text/csv' || type.includes('spreadsheetml')) return 'spreadsheet'
  if (type === 'application/pdf' || type.startsWith('image/')) return 'document'
  return 'unsupported'
}
