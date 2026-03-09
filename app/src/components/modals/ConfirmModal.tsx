import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './ConfirmModal.css'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps): JSX.Element {
  const { t } = useTranslation('modals')

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn btn-ghost" data-testid="confirm-modal-cancel" onClick={onCancel}>
            {cancelLabel || t('confirm.defaultCancel')}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            data-testid="confirm-modal-ok"
            onClick={onConfirm}
          >
            {confirmLabel || t('confirm.defaultConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
