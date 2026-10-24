import type { ActiveView } from './types'

/** A user-facing task. Each task owns an entry page and maps onto one results view. */
export type TaskId = ActiveView

export interface TaskDef {
  id: TaskId
  route: string
  /** Audit supports batch and folder scans. */
  allowsBatch: boolean
}

export const TASKS: Record<TaskId, TaskDef> = {
  audit: { id: 'audit', route: '/audit', allowsBatch: true },
}

export const TASK_ORDER: TaskId[] = ['audit']

export function taskForRoute(pathname: string): TaskDef | null {
  return TASK_ORDER.map((id) => TASKS[id]).find((task) => task.route === pathname) ?? null
}

export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.csv']
export type DropKind = 'spreadsheet' | 'unsupported'

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.substring(dot).toLowerCase()
}

/** CellSentry accepts workbooks only; document products belong to Vibli. */
export function classifyFileName(name: string): DropKind {
  const ext = extensionOf(name)
  if (SPREADSHEET_EXTENSIONS.includes(ext)) return 'spreadsheet'
  return 'unsupported'
}

/**
 * Classify by MIME type while a drag is in progress; file names are not readable
 * before drop. Returns null when the type is unknown (common for .xlsx on macOS).
 */
export function classifyMimeType(type: string): DropKind | null {
  if (!type) return null
  if (type === 'text/csv' || type.includes('spreadsheetml')) return 'spreadsheet'
  return 'unsupported'
}
