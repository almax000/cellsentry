/**
 * MappingEditor — CodeMirror 6 + YAML mode wrapper (W3 Step 3.6).
 *
 * Why CodeMirror 6 over Monaco: per plan v3 Warning #8, Monaco's bundle is
 * ~3MB; CodeMirror 6 is ~300KB with YAML grammar + lint. We don't need
 * IntelliSense (the YAML is plain config, not code), so the bundle savings
 * are clean.
 *
 * Lint: not yet wired. CodeMirror 6 has a `linter` extension we'd hook up
 * to the parser.ts validator in W4 polish, surfacing live error messages
 * inline. For W3, the editor accepts arbitrary text; validation happens at
 * "Save" time via the writer.ts call-stack.
 */

import { useEffect, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'

interface MappingEditorProps {
  value: string
  onChange: (next: string) => void
  /** Fired when the editor loses focus — IngestWorkspace persists here. */
  onSave?: (value: string) => void
}

export default function MappingEditor({ value, onChange, onSave }: MappingEditorProps): JSX.Element {
  const lastSavedRef = useRef(value)

  // Cmd+S triggers the same save path as blur.
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
      <CodeMirror
        value={value}
        height="100%"
        extensions={[yaml()]}
        onChange={onChange}
        onBlur={() => {
          if (onSave && value !== lastSavedRef.current) {
            onSave(value)
            lastSavedRef.current = value
          }
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: false, // YAML is plain config, no completion needed
          searchKeymap: true,
        }}
      />
    </div>
  )
}
