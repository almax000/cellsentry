import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PiiCategory, Profile, ProfilePerson } from '../../../shared/redact'
import { MAX_PEOPLE } from '../../../shared/redact/ipc'
import { useRedact } from '../../redact/RedactContext'
import { maskValue, newPersonId, personCode } from './redactFormat'

const FIELDS: Array<{ key: 'name' | 'idNumber' | 'phone' | 'address' | 'socialSecurity'; category: PiiCategory }> = [
  { key: 'name', category: 'name' },
  { key: 'idNumber', category: 'id_number' },
  { key: 'phone', category: 'phone' },
  { key: 'address', category: 'address' },
  { key: 'socialSecurity', category: 'social_security' },
]

function PersonEditor({ person, onSave, onCancel, onRemove }: {
  person: ProfilePerson
  onSave: (person: ProfilePerson) => void
  onCancel: () => void
  onRemove?: () => void
}): JSX.Element {
  const { t } = useTranslation('redact')
  const [draft, setDraft] = useState<ProfilePerson>(person)
  const set = (key: keyof ProfilePerson, value: string): void => setDraft((current) => ({ ...current, [key]: value }))
  return (
    <form
      className="myinfo-editor"
      data-testid={`myinfo-editor-${person.role}`}
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      {person.role === 'family' && (
        <label className="myinfo-field">
          <span>{t('myInfo.relation')}</span>
          <input value={draft.relation ?? ''} placeholder={t('myInfo.relationPlaceholder')} maxLength={40}
            onChange={(event) => set('relation', event.target.value)} data-testid="myinfo-input-relation" />
        </label>
      )}
      {FIELDS.map(({ key }) => (
        <label key={key} className="myinfo-field">
          <span>{t(`myInfo.${key}`)}</span>
          <input value={draft[key] ?? ''} maxLength={200} autoComplete="off" spellCheck={false}
            onChange={(event) => set(key, event.target.value)} data-testid={`myinfo-input-${key}`} />
        </label>
      ))}
      <div className="myinfo-editor-actions">
        {onRemove && <button type="button" className="btn btn-ghost myinfo-remove" onClick={onRemove}>{t('myInfo.remove')}</button>}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('myInfo.cancel')}</button>
        <button type="submit" className="btn btn-primary" data-testid="myinfo-save">{t('myInfo.save')}</button>
      </div>
    </form>
  )
}

function PersonCard({ profile, person, onEdit }: { profile: Profile; person: ProfilePerson; onEdit: () => void }): JSX.Element {
  const { t } = useTranslation('redact')
  const { locale } = useRedact()
  const filled = FIELDS.filter(({ key }) => person[key])
  return (
    <div className="myinfo-person" data-testid={`myinfo-person-${person.role}`}>
      <div className="myinfo-person-head">
        <span className="myinfo-who">{person.role === 'self' ? t('myInfo.me') : person.relation || t('myInfo.family')}</span>
        <span className="redact-code">{t('myInfo.codeAs', { code: personCode(profile, person.id, locale) })}</span>
        <button type="button" className="btn btn-ghost myinfo-edit" onClick={onEdit} data-testid={`myinfo-edit-${person.role}`}>
          {t('myInfo.edit')}
        </button>
      </div>
      {filled.length === 0 ? (
        <p className="myinfo-empty">{t('myInfo.empty')}</p>
      ) : (
        <dl className="myinfo-values">
          {filled.map(({ key, category }) => (
            <div key={key}>
              <dt>{t(`myInfo.${key}`)}</dt>
              <dd>{maskValue(category, person[key] as string)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** "My info": optional, but everything in it is found exactly instead of guessed. */
export default function MyInfoPanel(): JSX.Element {
  const { t } = useTranslation('redact')
  const { profile, profilePersisted, profileError, saveProfile } = useRedact()
  const [editing, setEditing] = useState<string | null>(null)
  const [draftPerson, setDraftPerson] = useState<ProfilePerson | null>(null)

  const self = profile.people.find((person) => person.role === 'self') ?? null
  const family = profile.people.filter((person) => person.role === 'family')

  const save = async (person: ProfilePerson): Promise<void> => {
    const exists = profile.people.some((item) => item.id === person.id)
    const people = exists ? profile.people.map((item) => (item.id === person.id ? person : item)) : [...profile.people, person]
    const ok = await saveProfile({ people })
    if (ok) {
      setEditing(null)
      setDraftPerson(null)
    }
  }
  const remove = async (id: string): Promise<void> => {
    await saveProfile({ people: profile.people.filter((person) => person.id !== id) })
    setEditing(null)
    setDraftPerson(null)
  }
  const startNew = (role: 'self' | 'family'): void => {
    const person: ProfilePerson = { id: newPersonId(), role }
    setDraftPerson(person)
    setEditing(person.id)
  }

  const renderPerson = (person: ProfilePerson): JSX.Element => editing === person.id
    ? <PersonEditor key={person.id} person={person} onSave={save} onCancel={() => { setEditing(null); setDraftPerson(null) }}
        onRemove={profile.people.some((item) => item.id === person.id) ? () => void remove(person.id) : undefined} />
    : <PersonCard key={person.id} profile={profile} person={person} onEdit={() => setEditing(person.id)} />

  return (
    <section className="myinfo" data-testid="myinfo-panel">
      <header className="myinfo-header">
        <h2>{t('myInfo.title')}</h2>
        <span className="myinfo-optional">{t('myInfo.optional')}</span>
      </header>
      <p className="myinfo-intro">{t('myInfo.intro')}</p>
      {profileError === 'unreadable' && <p className="redact-alert">{t('myInfo.unreadable')}</p>}
      {profileError === 'save_failed' && <p className="redact-alert">{t('myInfo.saveFailed')}</p>}

      {self ? renderPerson(self) : draftPerson?.role === 'self' ? renderPerson(draftPerson) : (
        <div className="myinfo-person" data-testid="myinfo-person-self">
          <div className="myinfo-person-head">
            <span className="myinfo-who">{t('myInfo.me')}</span>
            <button type="button" className="btn btn-ghost myinfo-edit" onClick={() => startNew('self')} data-testid="myinfo-edit-self">
              {t('myInfo.edit')}
            </button>
          </div>
          <p className="myinfo-empty">{t('myInfo.empty')}</p>
        </div>
      )}
      {family.map(renderPerson)}
      {draftPerson?.role === 'family' && renderPerson(draftPerson)}

      <button type="button" className="btn btn-ghost myinfo-add" onClick={() => startNew('family')} data-testid="myinfo-add-family"
        disabled={profile.people.length + (draftPerson ? 1 : 0) >= MAX_PEOPLE}>
        {t('myInfo.addFamily')}
      </button>
      <p className="myinfo-tip">{t('myInfo.tip')}</p>
      <p className="myinfo-storage">{profilePersisted ? t('myInfo.saved') : t('myInfo.memoryOnly')}</p>
    </section>
  )
}
