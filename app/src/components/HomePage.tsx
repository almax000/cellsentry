import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { TASKS, SPREADSHEET_EXTENSIONS, type TaskId } from '../tasks'
import { OCR_ENABLED } from '../../shared/redact'
import { TaskIcon } from './icons/taskIcons'
import { LocalOnlyStrip } from './LocalOnly'
import './HomePage.css'

function TaskCard({ task, lead = false }: { task: TaskId; lead?: boolean }): JSX.Element {
  const { t } = useTranslation('home')
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className={`home-task${lead ? ' lead' : ''}`}
      data-testid={`home-task-${task}`}
      onClick={() => navigate(TASKS[task].route)}
    >
      {/* A button may only hold phrasing content, so the card is built from spans. */}
      <span className="home-task-head">
        <span className="home-task-icon" aria-hidden="true"><TaskIcon task={task} size={lead ? 24 : 20} /></span>
        <span className="home-task-title">{t(`tasks.${task}.title`)}</span>
      </span>
      <span className="home-task-desc">{t(`tasks.${task}.desc`)}</span>
      <span className="home-task-foot">
        <span className="home-task-formats">
          {task === 'pii'
            ? <span className="format-badge">{t('tasks.pii.formats', { context: OCR_ENABLED ? 'ocr' : undefined })}</span>
            : SPREADSHEET_EXTENSIONS.map((ext) => <span key={ext} className="format-badge">{ext}</span>)}
        </span>
        <span className={lead ? 'btn btn-primary home-task-start' : 'home-task-start'}>{t('start')} →</span>
      </span>
    </button>
  )
}

export default function HomePage(): JSX.Element {
  const { t } = useTranslation('home')
  return (
    <div className="home-page view-enter" data-testid="home-page">
      <div className="home-inner">
        <h1 className="home-title">{t('title')}</h1>
        <p className="home-subtitle">{t('subtitle')}</p>
        <div className="home-grid">
          <TaskCard task="pii" lead />
          <TaskCard task="audit" />
          <TaskCard task="extraction" />
        </div>
        <LocalOnlyStrip />
      </div>
    </div>
  )
}
