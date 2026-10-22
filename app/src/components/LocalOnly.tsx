import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LockIcon } from './icons/taskIcons'
import './LocalOnly.css'

/** The three facts behind "your files never leave this computer". Keep them true to the code. */
function LocalOnlyPoints(): JSX.Element {
  const { t } = useTranslation('home')
  return (
    <ul className="local-only-points">
      <li>{t('localOnly.p1')}</li>
      <li>{t('localOnly.p2')}</li>
      <li>{t('localOnly.p3')}</li>
    </ul>
  )
}

/** Persistent header badge; click opens a short explanation. */
export function LocalOnlyBadge(): JSX.Element {
  const { t } = useTranslation('home')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    // Capture and stop Escape so it closes only this popover, not a dialog underneath
    // (the assistant setup dialog cancels its download on Escape).
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return (): void => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className="local-only-badge-wrap" ref={ref}>
      <button
        type="button"
        className="local-only-badge"
        data-testid="local-only-badge"
        aria-expanded={open}
        aria-controls="local-only-popover"
        onClick={() => setOpen((value) => !value)}
      >
        <LockIcon size={12} />
        <span>{t('localOnly.badge')}</span>
      </button>
      {open && (
        <div className="local-only-popover" id="local-only-popover">
          <div className="local-only-popover-title">{t('localOnly.title')}</div>
          <LocalOnlyPoints />
        </div>
      )}
    </div>
  )
}

/** Home-page strip with an inline "how does this work?" expander. */
export function LocalOnlyStrip(): JSX.Element {
  const { t } = useTranslation('home')
  const [open, setOpen] = useState(false)
  return (
    <div className={`local-only-strip${open ? ' open' : ''}`} data-testid="local-only-strip">
      <div className="local-only-strip-row">
        <LockIcon size={15} />
        <span>{t('localOnly.strip')}</span>
        <button type="button" className="local-only-how" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? t('localOnly.hide') : t('localOnly.how')}
        </button>
      </div>
      {open && <LocalOnlyPoints />}
    </div>
  )
}
