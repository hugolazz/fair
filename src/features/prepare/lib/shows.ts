import type { Tag } from '@/db/schemas/prepare'

// Salons d'une entreprise (pastilles) : le nom d'un salon porte souvent sa date, « NRF 09/26 » ou
// « One to One Monaco (03/27) » ; on la lit pour dire si l'entreprise y était (passé) ou y sera (à venir).

export type ShowTiming = 'past' | 'upcoming'

const FULL_DATE = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/
const MONTH_YEAR = /(?<!\d)(\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/** Date (mois, ou jour précis) lue dans le libellé ; `null` si le nom n'en porte pas. */
function dateOf(label: string): { year: number; month: number; day: number | null } | null {
  const full = FULL_DATE.exec(label)
  if (full) {
    const day = Number(full[1])
    const month = Number(full[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return { year: fullYear(full[3]!), month, day }
  }
  const my = MONTH_YEAR.exec(label)
  if (my) {
    const month = Number(my[1])
    if (month >= 1 && month <= 12) return { year: fullYear(my[2]!), month, day: null }
  }
  return null
}

/**
 * « past » = le salon est passé (l'entreprise y était), « upcoming » = il est à venir ou en cours ce mois-ci
 * (elle y sera) ; `null` sans date lisible dans le nom.
 */
export function showTiming(label: string, today: Date = new Date()): ShowTiming | null {
  const d = dateOf(label)
  if (!d) return null
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  if (d.day !== null) {
    const when = new Date(d.year, d.month - 1, d.day)
    const start = new Date(y, m - 1, today.getDate())
    return when < start ? 'past' : 'upcoming'
  }
  return d.year < y || (d.year === y && d.month < m) ? 'past' : 'upcoming'
}

/** Instant utilisé pour trier : la date du libellé (les salons sans date en dernier). */
function sortKey(label: string): number {
  const d = dateOf(label)
  return d ? new Date(d.year, d.month - 1, d.day ?? 1).getTime() : Number.POSITIVE_INFINITY
}

/** Nom du salon sans sa date : « NRF 09/26 » → « NRF » (sert aux pastilles courtes du tableau). */
export function showShortName(label: string): string {
  const short = label
    .replace(/\(?\s*(?<!\d)\d{1,2}[/.-](?:\d{1,2}[/.-])?(?:\d{4}|\d{2})(?!\d)\s*\)?/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return short || label
}

/** Les pastilles « salon » d'une entreprise, du plus ancien au plus récent (sans date : à la fin, par nom). */
export function showsOf(tagIds: readonly string[], shows: readonly Tag[]): Tag[] {
  const ids = new Set(tagIds)
  return shows
    .filter((s) => ids.has(s.id))
    .sort(
      (a, b) =>
        sortKey(a.label) - sortKey(b.label) ||
        a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
    )
}
