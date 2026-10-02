// Export d'un rendez-vous au format iCalendar (.ics) avec rappel : le rappel est alors porté par
// l'agenda du commercial (Google, Apple, Outlook), même application fermée.

export type IcsEvent = {
  uid: string
  title: string
  start: Date
  durationMin: number
  reminderMin: number | null
  location?: string
  description?: string
  /** Date de création de l'export (injectable pour les tests). */
  now?: Date
}

const pad = (n: number) => String(n).padStart(2, '0')

function utc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Plie une ligne à 75 octets maximum (RFC 5545 §3.1), sans couper un caractère multi-octets. */
function fold(line: string): string[] {
  const enc = new TextEncoder()
  const out: string[] = []
  let current = ''
  let bytes = 0
  const limit = () => (out.length === 0 ? 75 : 74) // les lignes de suite commencent par un espace
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit()) {
      out.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += n
  }
  out.push(current)
  return out.map((l, i) => (i === 0 ? l : ` ${l}`))
}

export function buildIcs(e: IcsEvent): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//fair//rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@fair`,
    `DTSTAMP:${utc(e.now ?? new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    ...(e.reminderMin !== null
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(e.title)}`,
          `TRIGGER:-PT${e.reminderMin}M`,
          'END:VALARM',
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.flatMap(fold).join('\r\n') + '\r\n'
}

// --- Rappels dans l'application ------------------------------------------------------------------------------------

export type ReminderItem = {
  meetingId: string
  targetId: string
  plannedAt: string
  durationMin: number
  reminderMin: number | null
}

/** Rendez-vous dont le rappel est déclenché (de « début − rappel » jusqu'à la fin du créneau). */
export function dueReminders<T extends ReminderItem>(items: T[], now: Date): T[] {
  const t = now.getTime()
  return items
    .filter((i) => {
      if (i.reminderMin === null) return false
      const start = new Date(i.plannedAt).getTime()
      return t >= start - i.reminderMin * 60_000 && t < start + i.durationMin * 60_000
    })
    .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))
}
