/** Serializes spreadsheet analyses and binds cancellation to the initiating renderer. */
export type AnalysisSessionOwner = {
  isDestroyed(): boolean
  once?(event: 'destroyed', listener: () => void): unknown
  removeListener?(event: 'destroyed', listener: () => void): unknown
}
export type AnalysisSession = {
  owner: AnalysisSessionOwner
  scanId: string
  cancelled: boolean
  stopFailed?: boolean
  stopped: boolean
  cancelPromise: Promise<void> | null
  taskFinished: Promise<void>
  finishTask(): void
  removeDestroyedListener(): void
}

export class AnalysisSessionManager {
  private active: AnalysisSession | null = null
  constructor(private readonly stopInference: () => Promise<void>) {}
  get hasActive(): boolean { return this.active !== null }

  begin(owner: AnalysisSessionOwner, scanId: string): AnalysisSession | null {
    if (this.active || !scanId) return null
    let finishTask!: () => void
    const taskFinished = new Promise<void>(resolve => { finishTask = resolve })
    let removeDestroyedListener = (): void => {}
    const session: AnalysisSession = {
      owner, scanId, cancelled: false, stopped: false, cancelPromise: null, taskFinished, finishTask, removeDestroyedListener,
    }
    this.active = session
    const onDestroyed = (): void => {
      // Renderer teardown has no IPC caller left. Reuse the owner/scan-bound
      // cancellation path and keep a failed stop locked for an explicit retry.
      void this.cancel(owner, scanId).catch(() => {})
    }
    if (owner.once && owner.removeListener) {
      owner.once('destroyed', onDestroyed)
      removeDestroyedListener = () => owner.removeListener?.('destroyed', onDestroyed)
      session.removeDestroyedListener = removeDestroyedListener
    }
    return session
  }

  isActive(session: AnalysisSession): boolean {
    return this.active === session && !session.cancelled && !session.owner.isDestroyed()
  }

  /** Internal deadline cleanup failed: retain ownership until an explicit stop retry succeeds. */
  retainAfterStopFailure(session: AnalysisSession): void {
    if (this.active !== session) return
    session.cancelled = true
    session.stopFailed = true
  }

  async cancel(owner: AnalysisSessionOwner, scanId: unknown): Promise<boolean> {
    const session = this.active
    // A completed scan or a cancelled preflight has no backend left to stop.
    if (!session) return true
    if (session.owner !== owner || session.scanId !== scanId) return false
    session.cancelled = true
    session.cancelPromise ??= this.stopInference()
    try { await session.cancelPromise } catch (error) {
      session.cancelPromise = null // Permit an explicit retry; never claim it stopped.
      throw error
    }
    session.stopped = true
    await session.taskFinished
    this.release(session)
    return true
  }

  async settle(session: AnalysisSession): Promise<void> {
    session.finishTask()
    try { await session.cancelPromise } catch { return } // keep locked until stop succeeds
    if (this.active === session && (!session.cancelled || session.stopped)) this.release(session)
  }

  private release(session: AnalysisSession): void {
    if (this.active !== session) return
    this.active = null
    session.removeDestroyedListener()
  }
}
