import { CODE_PREFIX, type CodeLocale, type PiiCategory, type Profile } from '../../../shared/redact'

const NUMERIC: ReadonlySet<PiiCategory> = new Set(['phone', 'id_number', 'social_security', 'bank_card', 'record_number'])

/**
 * Shorten a value for list views, so a screen recording or a glance over the
 * shoulder shows less. The full value is still shown where the user decides.
 */
export function maskValue(category: PiiCategory, value: string): string {
  const compact = value.replace(/[\s-]/g, '')
  if (NUMERIC.has(category) && compact.length >= 8) {
    const head = compact.length >= 15 ? 4 : 3
    const middle = compact.length >= 15 ? ' **** **** ' : ' **** '
    return `${compact.slice(0, head)}${middle}${compact.slice(-4)}`
  }
  if (category === 'email') {
    const at = value.indexOf('@')
    return at > 1 ? `${value[0]}***${value.slice(at)}` : value
  }
  if (category === 'address' && value.length > 8) return `${value.slice(0, 6)}……`
  return value
}

/** The fixed letter code a "My info" person gets: the user is always A, family follow in order. */
export function personCode(profile: Profile, personId: string, locale: CodeLocale): string {
  const self = profile.people.find((person) => person.role === 'self')
  const order = [...(self ? [self] : []), ...profile.people.filter((person) => person !== self)]
  const index = order.findIndex((person) => person.id === personId)
  const person = order[index]
  const prefix = person?.role === 'self' ? CODE_PREFIX[locale].patient : CODE_PREFIX[locale].family
  let n = Math.max(0, index)
  let letters = ''
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${prefix}${letters}`
}

export function newPersonId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
