import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface SidecarContextValue {
  status: ConnectionStatus
  modelLoaded: boolean
  modelName: string
  version: string
  analyzeFile: (filePath: string) => Promise<AnalysisResult>
  getFileInfo: (filePath: string) => Promise<FileInfo>
  openFileDialog: () => Promise<string | null>
}

const SidecarContext = createContext<SidecarContextValue>({
  status: 'connecting',
  modelLoaded: false,
  modelName: '',
  version: '',
  analyzeFile: async () => ({ success: false, issues: [], total_issues: 0 }),
  getFileInfo: async () => ({ exists: false, name: '', size: '', sheets: [], cellCount: 0 }),
  openFileDialog: async () => null
})

export function SidecarProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [modelLoaded, setModelLoaded] = useState(false)
  const [modelName, setModelName] = useState('')
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
          const model = await window.api.getModelStatus()
          if (mounted) {
            setModelLoaded(model.loaded)
            setModelName(model.name)
          }
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

  const analyzeFile = useCallback(async (filePath: string): Promise<AnalysisResult> => {
    if (!window.api) throw new Error('Sidecar not available')
    return window.api.analyzeFile(filePath)
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
      value={{ status, modelLoaded, modelName, version, analyzeFile, getFileInfo, openFileDialog }}
    >
      {children}
    </SidecarContext.Provider>
  )
}

export function useSidecar(): SidecarContextValue {
  return useContext(SidecarContext)
}
