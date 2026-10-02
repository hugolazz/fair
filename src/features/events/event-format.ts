const formatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** « 12 mai 2027 » ou « 12 – 14 mai 2027 » ; null si aucune date. */
export function formatEventDates(startsOn: string | null, endsOn: string | null): string | null {
  if (!startsOn && !endsOn) return null
  if (startsOn && endsOn && startsOn !== endsOn) {
    return formatter.formatRange(parse(startsOn), parse(endsOn))
  }
  return formatter.format(parse((startsOn ?? endsOn)!))
}
