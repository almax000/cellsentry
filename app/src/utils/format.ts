import type { SeverityLevel } from '../types'

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatConfidence(value: number): string {
  const n = typeof value === 'number' && !isNaN(value) ? value : 0
  return `${Math.round(n * 100)}%`
}

export function severityColor(level: SeverityLevel): string {
  switch (level) {
    case 'error':
      return 'var(--danger)'
    case 'warning':
      return 'var(--warning)'
    case 'info':
      return 'var(--info)'
  }
}

export function severityLabel(level: SeverityLevel): string {
  switch (level) {
    case 'error':
      return 'Critical'
    case 'warning':
      return 'Warning'
    case 'info':
      return 'Info'
  }
}

/** Map sidecar severity (high/medium/low) to our SeverityLevel */
export function mapSeverity(raw: string): SeverityLevel {
  switch (raw) {
    case 'high':
      return 'error'
    case 'medium':
      return 'warning'
    case 'low':
      return 'info'
    default:
      return 'warning'
  }
}
