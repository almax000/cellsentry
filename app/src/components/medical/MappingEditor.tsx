/**
 * MappingEditor — plain textarea wrapper (lean rebuild, post-CodeMirror).
 *
 * Per ADR § revised D19, the mapping format reduces to a literal-string list,
 * so the syntax-highlighting overhead of CodeMirror buys nothing. Plain
 * textarea + monospace font + on-blur save callback keeps the API surface
 * intact for IngestWorkspace while shedding ~570 KB of bundle size.
 */

import { useEffect, useRef } from 'react'

interface MappingEditorProps {
  value: string
  onChange: (next: string) => void
  /** Fired when the editor loses focus — IngestWorkspace persists here. */
  onSave?: (value: string) => void
}

export default function MappingEditor({ value, onChange, onSave }: MappingEditorProps): JSX.Element {
  const lastSavedRef = useRef(value)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (onSave && value !== lastSavedRef.current) {
          onSave(value)
          lastSavedRef.current = value
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [value, onSave])

  return (
    <div className="mapping-editor" data-testid="mapping-editor">
      <textarea
        className="mapping-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (onSave && value !== lastSavedRef.current) {
            onSave(value)
            lastSavedRef.current = value
          }
        }}
        spellCheck={false}
        aria-label="Pseudonym mapping editor"
      />
    </div>
  )
}
