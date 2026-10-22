export interface Highlight {
  start: number
  end: number
  className: string
  title?: string
}

/** Plain text with marked ranges. Ranges must not overlap. */
export default function HighlightedText({ text, highlights, className, testId }: {
  text: string
  highlights: Highlight[]
  className?: string
  testId?: string
}): JSX.Element {
  const parts: JSX.Element[] = []
  let cursor = 0
  const sorted = [...highlights].sort((a, b) => a.start - b.start)
  sorted.forEach((highlight, index) => {
    if (highlight.start < cursor) return
    if (highlight.start > cursor) parts.push(<span key={`t${index}`}>{text.slice(cursor, highlight.start)}</span>)
    parts.push(
      <mark key={`m${index}`} className={highlight.className} title={highlight.title}>
        {text.slice(highlight.start, highlight.end)}
      </mark>,
    )
    cursor = highlight.end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <pre className={className} data-testid={testId}>{parts}</pre>
}
