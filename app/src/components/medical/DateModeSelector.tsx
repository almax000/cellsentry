/**
 * DateModeSelector — radio group for date handling per AD4 (W3 Step 3.6).
 *
 * Three modes:
 *   - preserve (default): leave dates unchanged
 *   - offset_days: shift every date by N days (stable per patient)
 *   - bucket_month: round to YYYY-MM-01
 */

import { useTranslation } from 'react-i18next'

type DateMode = 'preserve' | 'offset_days' | 'bucket_month'

interface DateModeSelectorProps {
  mode: DateMode
  onChange: (mode: DateMode) => void
  offsetDays: number
  onOffsetChange: (days: number) => void
}

export default function DateModeSelector({
  mode,
  onChange,
  offsetDays,
  onOffsetChange,
}: DateModeSelectorProps): JSX.Element {
  const { t } = useTranslation('medical')

  return (
    <fieldset className="date-mode-selector" data-testid="date-mode-selector">
      <legend className="date-mode-legend">{t('dateMode.legend')}</legend>

      <label className="date-mode-option">
        <input
          type="radio"
          name="date-mode"
          value="preserve"
          checked={mode === 'preserve'}
          onChange={() => onChange('preserve')}
        />
        <span>{t('dateMode.preserve')}</span>
      </label>

      <label className="date-mode-option">
        <input
          type="radio"
          name="date-mode"
          value="offset_days"
          checked={mode === 'offset_days'}
          onChange={() => onChange('offset_days')}
        />
        <span>{t('dateMode.offsetDays')}</span>
        <input
          type="number"
          className="date-mode-offset"
          value={offsetDays}
          onChange={(e) => onOffsetChange(parseInt(e.target.value, 10) || 0)}
          disabled={mode !== 'offset_days'}
          min={1}
          max={3650}
          aria-label={t('dateMode.offsetDaysAria')}
        />
      </label>

      <label className="date-mode-option">
        <input
          type="radio"
          name="date-mode"
          value="bucket_month"
          checked={mode === 'bucket_month'}
          onChange={() => onChange('bucket_month')}
        />
        <span>{t('dateMode.bucketMonth')}</span>
      </label>
    </fieldset>
  )
}
