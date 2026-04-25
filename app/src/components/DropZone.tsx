import { useTranslation } from 'react-i18next'
import './DropZone.css'

// v2 W1 stub. The drag/drop scan flow was removed in W1 Step 1.1; v2's
// medical pseudonymization UI lands in W4 (Mapping editor + audit diff).

export default function DropZone(): JSX.Element {
  const { t } = useTranslation('dropzone')

  return (
    <div className="drop-zone-container view-enter">
      <div className="drop-zone" data-testid="dropzone-area">
        <div className="drop-zone-icon">🛡️</div>
        <div className="drop-zone-title">
          {t('v2.title', 'CellSentry v2.0 — Medical Pseudonymization')}
        </div>
        <div className="drop-zone-subtitle">
          {t('v2.subtitle', 'Pivot in progress. Scan UI returns in W4 (Mapping editor + audit diff).')}
        </div>
        <div className="drop-zone-formats">
          {['.pdf', '.jpg', '.png', '.heic'].map((ext) => (
            <span key={ext} className="format-badge">{ext}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
