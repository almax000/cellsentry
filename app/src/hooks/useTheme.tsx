import { createContext, useContext, useEffect, type ReactNode } from 'react'

interface ThemeContextValue {
  theme: 'light'
  resolvedTheme: 'light'
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
})

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.removeItem('cellsentry-theme')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: 'light', resolvedTheme: 'light' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
