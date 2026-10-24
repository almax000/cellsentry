// Preload contracts share the renderer's canonical API definitions.
import type { SidecarAPI as SharedSidecarAPI, TestAPI as SharedTestAPI } from '../../shared/api'

declare global {
  interface SidecarAPI extends SharedSidecarAPI {}
  interface TestAPI extends SharedTestAPI {}
}

export {}
