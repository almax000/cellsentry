/**
 * Mock sidecar — minimal noop stub kept for the existing electron.setup.ts
 * contract. The v2 app no longer calls a mock HTTP sidecar (all IPC handlers
 * use the TypeScript engine directly), but launchApp() still constructs
 * a MockSidecar instance to preserve the test-context shape used by visual
 * + sidebar-ux + medical specs. If real sidecar fixtures come back later,
 * fill this in with an aiohttp-style server; otherwise it's a noop.
 */

export interface MockSidecar {
  port: number
  close: () => Promise<void>
}

export async function startMockSidecar(_port: number): Promise<MockSidecar> {
  return {
    port: 0,
    close: async () => {
      /* noop */
    },
  }
}
