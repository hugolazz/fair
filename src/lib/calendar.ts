// Dates « jour » au format ISO local (aaaa-mm-jj), sans fuseau : c'est le format des champs de date.

const pad = (n: number) => String(n).padStart(2, '0')

export const toIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** `null` si la chaîne n'est pas une date valide (31 février compris). */
export function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return toIso(d) === iso ? d : null
}

export const todayIso = (): string => toIso(new Date())

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/** Même jour du mois suivant / précédent, ramené au dernier jour si le mois est plus court (31 janv. → 28 févr.). */
export function addMonths(iso: string, months: number): string {
  const d = parseIso(iso) ?? new Date()
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toIso(d)
}

/** Semaines d'un mois en commençant le lundi ; `null` pour les cases hors du mois. */
export function monthWeeks(year: number, month0: number): (string | null)[][] {
  const first = new Date(year, month0, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month0 + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => toIso(new Date(year, month0, i + 1))),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
