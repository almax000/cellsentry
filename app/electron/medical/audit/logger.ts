/**
 * Append-only audit log (security-assessment P2#8).
 *
 * Every stage of the pipeline emits an AuditEntry. Logs persist as JSONL at
 * `{archive_dir}/audit.log.jsonl`. Never logs raw PII — only a content hash
 * (sha256 first 16 chars) so the user can correlate without leakage.
 *
 * Real implementation in W4 (with orchestrator).
 */

import type { AuditEntry } from '../types'

export async function appendAuditEntry(_entry: AuditEntry, _archiveDir: string): Promise<void> {
  throw new Error('TODO: W4 — audit log writer not implemented')
}

export async function readAuditLog(_archiveDir: string, _limit?: number): Promise<AuditEntry[]> {
  throw new Error('TODO: W4 — audit log reader not implemented')
}
