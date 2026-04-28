/**
 * LLM lifecycle management — lazy start, graceful shutdown.
 *
 * The bridge starts on first request (not at app launch). When OCR is
 * disabled (default per 2026-04-28 audit), `start()` short-circuits and the
 * Python subprocess is never spawned. v1-era helpers (analyzeWithLlm /
 * analyzeWithLlmPii / analyzeWithLlmExtraction / mergeJudgments) were deleted
 * in this audit — they belonged to the old spreadsheet engine that's gone.
 */

import { app } from 'electron'
import { llmBridge } from './bridge'
import type { LlmStatus } from './types'

export function setupLlmLifecycle(): void {
  app.on('before-quit', async () => {
    await llmBridge.shutdown()
  })
}

export async function getLlmStatus(): Promise<LlmStatus> {
  // If the bridge hasn't started yet, try starting it to get real status.
  // bridge.start() short-circuits when OCR is disabled.
  if (!llmBridge.status.available && llmBridge.status.backend === 'none') {
    await llmBridge.start()
  }
  return llmBridge.status
}

/**
 * Start the LLM bridge explicitly.
 * Called after model download to warm up the bridge.
 */
export async function startLlm(): Promise<LlmStatus> {
  await llmBridge.start()
  return llmBridge.status
}
