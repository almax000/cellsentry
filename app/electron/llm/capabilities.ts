import type { LlmAnalysisMode } from './types'

export const ALL_LLM_ANALYSIS_MODES: readonly LlmAnalysisMode[] = ['audit', 'pii', 'extraction']

export function supportsModelTask(
  supportedTasks: readonly LlmAnalysisMode[],
  task: LlmAnalysisMode,
): boolean {
  return supportedTasks.includes(task)
}

export function unsupportedTaskReason(
  modelName: string,
  supportedTasks: readonly LlmAnalysisMode[],
  task: LlmAnalysisMode,
): string {
  const supported = supportedTasks.join(', ') || 'none'
  return `Unsupported task "${task}": ${modelName} is configured only for ${supported}. Deterministic fallback remains in use; no model inference was run.`
}
