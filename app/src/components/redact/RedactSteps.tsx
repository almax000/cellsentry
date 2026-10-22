import { useTranslation } from 'react-i18next'

const STEPS = ['files', 'review', 'share', 'restore'] as const
export type RedactStep = (typeof STEPS)[number]

/** The four steps stay visible so the user knows "restore" comes at the end. */
export default function RedactSteps({ current }: { current: RedactStep }): JSX.Element {
  const { t } = useTranslation('redact')
  const currentIndex = STEPS.indexOf(current)
  return (
    <ol className="redact-steps" data-testid="redact-steps">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'
        return (
          <li key={step} className={`redact-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="redact-step-dot" aria-hidden="true">{state === 'done' ? '✓' : index + 1}</span>
            <span className="redact-step-label">{t(`steps.${step}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}
