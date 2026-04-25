// Renderer-side type declarations for CellSentry v2.0.
//
// v1.x types (Issue / AnalysisResult / PiiResult / ExtractionResult / ScanState
// / ScanMode / FileInfo / Batch* / Queued*) removed in W1 Step 1.1.
// Medical-pipeline types will be re-introduced in W1 Step 1.2 under
// `src/types/medical.ts` once the scaffold lands.

declare global {
  interface Window {
    api: SidecarAPI
    __TEST_API__?: TestAPI
  }
}

export {}
