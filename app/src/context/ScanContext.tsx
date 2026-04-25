// v2 minimal stub. The v1.x scan/audit/PII/extraction state model was deleted
// in W1 Step 1.1; the v2 medical-pipeline state model will be re-introduced in
// W1 Step 1.2 (medical/ scaffold) and W3 (mapping + safety-net wiring).

import { createContext, useContext, useState, type ReactNode } from 'react'

interface ScanContextValue {
  filePath: string | null
  setFilePath: (path: string | null) => void
}

const ScanContext = createContext<ScanContextValue>({
  filePath: null,
  setFilePath: () => {},
})

export function ScanProvider({ children }: { children: ReactNode }): JSX.Element {
  const [filePath, setFilePath] = useState<string | null>(null)
  return (
    <ScanContext.Provider value={{ filePath, setFilePath }}>
      {children}
    </ScanContext.Provider>
  )
}

export function useScan(): ScanContextValue {
  return useContext(ScanContext)
}
