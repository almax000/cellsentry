// v1.x severity helpers (severityColor / severityLabel / mapSeverity / SeverityLevel)
// removed in W1 Step 1.1. v2 medical pipeline uses a different audit-log model
// that will be re-introduced in W3 along with Mapping editor + diff viewer UI.

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
