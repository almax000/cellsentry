/**
 * Renderer-side facts about the downloadable formula model ("公式助手" /
 * "Formula assistant"). The main process does not send the byte size to the
 * renderer, so these mirror `DEFAULT_MODEL` in electron/model/downloader.ts;
 * tests/formula-assistant-model.test.ts fails if they drift apart.
 */
export const FORMULA_ASSISTANT_MODEL = {
  fileName: 'cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf',
  sizeBytes: 1_561_314_592,
} as const
