// Mise en forme des dates et nombres (français, fuseau du salon). Fonctions pures, sans dépendance.

const parts = (iso: string, tz: string) => {
  const f = new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(new Date(iso))) o[p.type] = p.value
  return o
}

/**
 * Heure « murale » d'un instant dans un fuseau, encodée en UTC : Excel n'a pas de fuseau, il affiche donc
 * exactement l'heure du salon quel que soit l'ordinateur qui ouvre le fichier.
 */
export function wallClock(iso: string | null, tz: string): Date | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null
  const p = parts(iso, tz)
  return new Date(Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!))
}

/** « 12/05/2027 14:30 » (fuseau du salon). */
export function formatDateTime(iso: string | null, tz: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return ''
  const p = parts(iso, tz)
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** « 12/05/2027 » depuis un instant ou une date `YYYY-MM-DD`. */
export function formatDate(value: string | null, tz = 'UTC'): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  if (Number.isNaN(Date.parse(value))) return ''
  const p = parts(value, tz)
  return `${p.day}/${p.month}/${p.year}`
}

/** « du 12 au 13 mai 2027 » (ou une seule date, ou rien). */
export function formatEventDates(startsOn: string | null, endsOn: string | null): string {
  const long = (s: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${s}T00:00:00Z`))
  if (startsOn && endsOn && startsOn !== endsOn)
    return `du ${formatDate(startsOn)} au ${formatDate(endsOn)}`
  const one = startsOn ?? endsOn
  return one ? long(one) : ''
}

/** Pourcentage entier, « — » si le dénominateur est nul. */
export const percent = (n: number, total: number) =>
  total === 0 ? '—' : `${Math.round((n / total) * 100)} %`

/** Nom de fichier sûr : minuscules, sans accents, tirets. */
export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  )
}

/** Date `YYYY-MM-DD` d'un instant ISO (UTC) pour les noms de fichiers. */
export const isoDay = (iso: string) => iso.slice(0, 10)
