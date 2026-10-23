import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { ModelSetupStatus } from '../../shared/api'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface SidecarContextValue {
  status: ConnectionStatus
  modelLoaded: boolean
  modelName: string
  modelExists: boolean
  modelSize: string
  modelError?: string
  modelSetup: ModelSetupStatus
  refreshModelStatus: () => Promise<void>
  version: string
  analyzeFile: (filePath: string) => Promise<AnalysisResult>
  getFileInfo: (filePath: string) => Promise<FileInfo>
  openFileDialog: () => Promise<string | null>
}

const SidecarContext = createContext<SidecarContextValue>({
  status: 'connecting',
  modelLoaded: false,
  modelName: '', modelExists: false, modelSize: '', modelSetup: { phase: 'idle' }, refreshModelStatus: async () => {},
  version: '',
  analyzeFile: async () => ({ success: false, issues: [] }),
  getFileInfo: async () => ({ exists: false, name: '', size: '', sheets: [], cellCount: 0 }),
  openFileDialog: async () => null
})

export function SidecarProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [modelLoaded, setModelLoaded] = useState(false)
  const [modelName, setModelName] = useState('')
  const [modelExists, setModelExists] = useState(false)
  const [modelSize, setModelSize] = useState('')
  const [modelError, setModelError] = useState<string>()
  const [modelSetup, setModelSetup] = useState<ModelSetupStatus>({ phase: 'idle' })
  const refreshModelStatus = useCallback(async (): Promise<void> => {
    const model = await window.api?.getModelStatus()
    if (!model) return
    setModelLoaded(model.loaded)
    setModelName(model.name)
    setModelSize(model.size)
    setModelExists(model.exists)
    setModelError(model.error)
    setModelSetup(model.setup ?? { phase: 'idle' })
  }, [])
  const [version, setVersion] = useState('')

  useEffect(() => {
    let mounted = true
    let retryTimeout: ReturnType<typeof setTimeout>

    async function checkHealth(): Promise<void> {
      try {
        if (!window.api) {
          // Running in browser dev mode without Electron
          if (mounted) setStatus('disconnected')
          return
        }
        const health = await window.api.getHealth()
        if (mounted && health.status === 'ok') {
          setStatus('connected')
          setVersion(health.version)
          // Check model status
          if (mounted) await refreshModelStatus()
        }
      } catch {
        if (mounted) {
          setStatus('disconnected')
          // Retry in 3 seconds
          retryTimeout = setTimeout(checkHealth, 3000)
        }
      }
    }

    checkHealth()

    return (): void => {
      mounted = false
      clearTimeout(retryTimeout)
    }
  }, [])

  // Startup warms an installed model asynchronously; update the visible status
  // when that load finishes instead of keeping the initial rules-only snapshot.
  useEffect(() => {
    const preparing = modelSetup.phase === 'copying' || modelSetup.phase === 'verifying'
    if (status !== 'connected' || (!preparing && (!modelExists || modelLoaded || modelError))) return
    const timer = setInterval(() => { void refreshModelStatus().catch(() => {}) }, 2000)
    return () => clearInterval(timer)
  }, [status, modelExists, modelLoaded, modelError, modelSetup.phase, refreshModelStatus])

  const analyzeFile = useCallback(async (filePath: string): Promise<AnalysisResult> => {
    if (!window.api) throw new Error('Sidecar not available')
    return window.api.analyzeFile(filePath, `legacy-${Date.now()}`)
  }, [])

  const getFileInfo = useCallback(async (filePath: string): Promise<FileInfo> => {
    if (!window.api) throw new Error('Sidecar not available')
    return window.api.getFileInfo(filePath)
  }, [])

  const openFileDialog = useCallback(async (): Promise<string | null> => {
    if (!window.api) return null
    return window.api.openFileDialog()
  }, [])

  return (
    <SidecarContext.Provider
      value={{ status, modelLoaded, modelName, modelExists, modelSize, modelError, modelSetup, refreshModelStatus, version, analyzeFile, getFileInfo, openFileDialog }}
    >
      {children}
    </SidecarContext.Provider>
  )
}

export function useSidecar(): SidecarContextValue {
  return useContext(SidecarContext)
}
