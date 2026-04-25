import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface SidecarContextValue {
  status: ConnectionStatus
  modelLoaded: boolean
  version: string
  openFileDialog: () => Promise<string | null>
}

const SidecarContext = createContext<SidecarContextValue>({
  status: 'connecting',
  modelLoaded: false,
  version: '',
  openFileDialog: async () => null,
})

export function SidecarProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [modelLoaded, setModelLoaded] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    let mounted = true
    let retryTimeout: ReturnType<typeof setTimeout>

    async function checkHealth(): Promise<void> {
      try {
        if (!window.api) {
          if (mounted) setStatus('disconnected')
          return
        }
        const health = await window.api.getHealth()
        if (mounted && health.status === 'ok') {
          setStatus('connected')
          setVersion(health.version)
          const model = await window.api.getModelStatus()
          if (mounted) setModelLoaded(model.loaded)
        }
      } catch {
        if (mounted) {
          setStatus('disconnected')
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

  async function openFileDialog(): Promise<string | null> {
    if (!window.api) return null
    return window.api.openFileDialog()
  }

  return (
    <SidecarContext.Provider value={{ status, modelLoaded, version, openFileDialog }}>
      {children}
    </SidecarContext.Provider>
  )
}

export function useSidecar(): SidecarContextValue {
  return useContext(SidecarContext)
}
