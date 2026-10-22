const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * One user-facing size format, computed from bytes: decimal units with three
 * significant digits, which is how macOS Finder shows file sizes
 * (1_561_314_592 → "1.56 GB").
 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  let value = bytes
  let unit = 0
  while (unit < UNITS.length - 1 && Number(value.toPrecision(3)) >= 1000) {
    value /= 1000
    unit += 1
  }
  const shown = unit === 0 ? String(Math.round(value)) : String(Number(value.toPrecision(3)))
  return `${shown} ${UNITS[unit]}`
}

/** Exact byte count with thousands separators, for technical details only. */
export function formatExactBytes(bytes: number): string {
  return Math.round(bytes).toLocaleString('en-US')
}
