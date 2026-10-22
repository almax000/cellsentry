import { useLayoutEffect, useRef, type RefObject } from 'react'

export interface ShareGuardOptions {
  /** Leftovers remain: nothing may leave. */
  blocked: boolean
  /** The user tried to copy or drag while blocked. */
  onBlocked: () => void
  /** Text may have left the app by hand (a copy, or the start of a drag): freeze the code list. */
  onShared: () => void
  /** False turns the guard off, for example while a preview shows the original text. */
  active?: boolean
}

/**
 * Guards copying, cutting and dragging text that shows the shareable version.
 *
 * Listening on the document catches selections that start elsewhere on the
 * page (Cmd+A, a drag from the title). Only the part of the selection inside
 * `ref` leaves the app, as plain text, so the local-only code list next to it
 * never goes along. While leftovers remain nothing leaves; otherwise a hand
 * copy or drag freezes the code list like the copy button does. A drag freezes
 * when it starts, since whether a drop landed in another app cannot be known
 * reliably; freezing a little early only keeps codes from changing.
 *
 * Known gap: the macOS Services menu reads the selection without any of these
 * events, so text sent that way does not freeze the code list. While
 * leftovers remain the text cannot be selected at all, so nothing unchecked
 * leaves that way.
 */
export function useShareGuard(ref: RefObject<HTMLElement>, options: ShareGuardOptions): void {
  const latest = useRef(options)
  latest.current = options

  // Attached before the page is painted, so there is no moment in which a copy goes unguarded.
  useLayoutEffect(() => {
    /** The selected text inside `ref`, or null when the selection does not touch it. */
    const selectedInside = (): string | null => {
      const node = ref.current
      const selection = window.getSelection()
      if (!node || !selection || selection.isCollapsed) return null
      const whole = document.createRange()
      whole.selectNodeContents(node)
      let text = ''
      for (let index = 0; index < selection.rangeCount; index++) {
        const range = selection.getRangeAt(index)
        if (!range.intersectsNode(node)) continue
        const part = range.cloneRange()
        if (part.compareBoundaryPoints(Range.START_TO_START, whole) < 0) part.setStart(whole.startContainer, whole.startOffset)
        if (part.compareBoundaryPoints(Range.END_TO_END, whole) > 0) part.setEnd(whole.endContainer, whole.endOffset)
        if (!part.collapsed) text += part.toString()
      }
      // A selection that only touches the edge carries none of the text; let the normal copy run.
      return text === '' ? null : text
    }

    const onCopy = (event: ClipboardEvent): void => {
      if (latest.current.active === false) return
      const text = selectedInside()
      if (text === null) return
      event.preventDefault()
      if (latest.current.blocked) {
        latest.current.onBlocked()
        return
      }
      event.clipboardData?.setData('text/plain', text)
      latest.current.onShared()
    }

    const onDragStart = (event: DragEvent): void => {
      if (latest.current.active === false) return
      const text = selectedInside()
      if (text === null) return
      if (latest.current.blocked) {
        event.preventDefault()
        latest.current.onBlocked()
        return
      }
      event.dataTransfer?.clearData()
      event.dataTransfer?.setData('text/plain', text)
      latest.current.onShared()
    }

    document.addEventListener('copy', onCopy, true)
    document.addEventListener('cut', onCopy, true)
    document.addEventListener('dragstart', onDragStart, true)
    return () => {
      document.removeEventListener('copy', onCopy, true)
      document.removeEventListener('cut', onCopy, true)
      document.removeEventListener('dragstart', onDragStart, true)
    }
  }, [ref])
}
