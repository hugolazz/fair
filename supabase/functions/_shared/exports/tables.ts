import { memberNames, showsNews, usesShows } from './select.ts'
import { newsTitleOf, statusLabel } from './labels.ts'
import { formatDate, formatDateTime, wallClock } from './format.ts'
import type { ContactRec, ExportData, MeetingRec, Priority } from './types.ts'

// Le fichier d'export : le fichier importé, enrichi de tout ce qui s'est passé pendant le salon.
// Une ligne par contact (une ligne seule pour une entreprise sans contact). Les 14 premières colonnes portent les mêmes
// intitulés que le fichier d'import : on peut le réimporter tel quel, il se mappe automatiquement.

export type CellValue = string | number | Date | null
export type ColumnKind = 'text' | 'longtext' | 'number' | 'date' | 'datetime' | 'priority'
export type Column = { key: string; label: string; kind: ColumnKind; width: number }
export type Row = { cells: Record<string, CellValue>; priority: Priority | null }
export type Table = { id: 'salon'; title: string; columns: Column[]; rows: Row[] }

const col = (key: string, label: string, kind: ColumnKind, width: number): Column => ({
  key,
  label,
  kind,
  width,
})

export const SALON_COLUMNS: Column[] = [
  // — Reprise du fichier d'import —
  col('name', 'Société', 'text', 28),
  col('website', 'Site web', 'text', 28),
  col('stand', 'Stand', 'text', 10),
  col('industry', 'Secteur', 'text', 18),
  col('country', 'Pays', 'text', 14),
  col('city', 'Ville', 'text', 16),
  col('priority', 'Priorité', 'priority', 10),
  col('tags', 'Type', 'text', 18),
  col('contact', 'Contact', 'text', 24),
  col('jobTitle', 'Fonction', 'text', 24),
  col('email', 'E-mail', 'text', 30),
  col('phone', 'Téléphone', 'text', 18),
  col('linkedin', 'LinkedIn', 'text', 30),
  col('history', 'Commentaire', 'longtext', 50),
  // — Ce qui s'est passé pendant le salon —
  col('assignees', 'Commerciaux', 'text', 22),
  col('status', 'Statut de la rencontre', 'text', 20),
  col('meetingAt', 'Date de la rencontre', 'datetime', 18),
  col('interest', 'Intérêt (1-5)', 'number', 12),
  col('recontact', 'À recontacter', 'text', 14),
  col('notes', 'Notes du salon', 'longtext', 70),
]

const newsColumn = (label: string) => col('news', newsTitleOf(label), 'text', 12)
const SHOWS_COLUMN = col('shows', 'Salons', 'text', 34)

/**
 * Les colonnes de l'export : celles du salon, plus « Salons » (juste après « Commentaire », donc après les 14 colonnes
 * de l'import) si des entreprises en ont, et « Actualité » (juste après « À recontacter ») si elle est utilisée.
 */
export function salonColumns(
  withNews: boolean,
  withShows = false,
  newsLabel = 'Actualité ?',
): Column[] {
  const out = [...SALON_COLUMNS]
  if (withNews)
    out.splice(out.findIndex((c) => c.key === 'recontact') + 1, 0, newsColumn(newsLabel))
  if (withShows) out.splice(IMPORT_COLUMNS.length, 0, SHOWS_COLUMN)
  return out
}

/** Les colonnes du fichier d'import : les 14 premières de l'export (même intitulés, donc mêmes réglages de mapping). */
export const IMPORT_COLUMNS: Column[] = SALON_COLUMNS.slice(0, 14)

const orNull = (s: string | null | undefined) => (s && s.trim() !== '' ? s : null)
const byText = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' })

/**
 * « À recontacter » d'un contact : Oui si une rencontre de son entreprise est marquée à recontacter et qu'elle concerne
 * ce contact (ou ne précise pas de contact) ; vide si l'entreprise n'a eu aucune rencontre.
 */
function contactRecontact(c: ContactRec | null, meetings: MeetingRec[]): string | null {
  if (meetings.length === 0) return null
  return meetings.some(
    (m) => m.recontact && (c === null || m.contactId === null || m.contactId === c.id),
  )
    ? 'Oui'
    : 'Non'
}

/** « Actualité » d'un contact : mêmes règles que « À recontacter » (une rencontre de l'entreprise le concernant). */
function contactNews(c: ContactRec | null, meetings: MeetingRec[]): string | null {
  if (meetings.length === 0) return null
  return meetings.some(
    (m) => m.news && (c === null || m.contactId === null || m.contactId === c.id),
  )
    ? 'Oui'
    : 'Non'
}

/** Construit l'unique table de l'export à partir des données du salon. */
export function buildSalonTable(data: ExportData): Table {
  const tz = data.event.timezone
  const owner = memberNames(data)
  const tagLabel = new Map(data.tags.filter((t) => t.kind === 'type').map((t) => [t.id, t.label]))
  const showLabel = new Map(data.tags.filter((t) => t.kind === 'show').map((t) => [t.id, t.label]))

  const contactsOf = new Map<string, ContactRec[]>()
  for (const c of data.contacts)
    if (c.companyId) contactsOf.set(c.companyId, [...(contactsOf.get(c.companyId) ?? []), c])
  const meetingsOf = new Map<string, MeetingRec[]>()
  for (const m of data.meetings)
    meetingsOf.set(m.targetId, [...(meetingsOf.get(m.targetId) ?? []), m])
  const targetOfMeeting = new Map(data.meetings.map((m) => [m.id, m.targetId]))
  const notesOf = new Map<string, { at: string; text: string }[]>()
  for (const n of data.notes) {
    const targetId = n.meetingId ? targetOfMeeting.get(n.meetingId) : n.targetId
    if (!targetId) continue
    const text = `${formatDateTime(n.capturedAt, tz)} · ${owner(n.authorId)} : ${n.body}`
    notesOf.set(targetId, [...(notesOf.get(targetId) ?? []), { at: n.capturedAt, text }])
  }

  const rows: Row[] = []
  for (const t of data.targets.slice().sort((a, b) => byText(a.name, b.name))) {
    const meetings = (meetingsOf.get(t.id) ?? [])
      .slice()
      .sort((a, b) => (a.plannedAt ?? '').localeCompare(b.plannedAt ?? ''))
    const last = meetings.at(-1)
    const interests = meetings.map((m) => m.interest).filter((i): i is number => i !== null)
    const notes = (notesOf.get(t.id) ?? [])
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((n) => n.text)
      .join('\n')
    const company: Record<string, CellValue> = {
      name: t.name,
      website: orNull(t.website),
      stand: orNull(t.stand),
      industry: orNull(t.industry),
      country: orNull(t.country),
      city: orNull(t.city),
      priority: t.priority,
      tags:
        t.tagIds
          .map((id) => tagLabel.get(id) ?? '')
          .filter(Boolean)
          .join(', ') || null,
      shows:
        t.tagIds
          .map((id) => showLabel.get(id) ?? '')
          .filter(Boolean)
          .join(', ') || null,
      history: orNull(t.history),
      assignees: t.assigneeIds.map(owner).join(', ') || null,
      status: last ? statusLabel(last.status) : 'Pas de rencontre',
      meetingAt: last ? wallClock(last.plannedAt, tz) : null,
      interest: interests.length ? Math.max(...interests) : null,
      notes: orNull(notes),
    }
    const contacts = contactsOf.get(t.companyId) ?? []
    for (const c of contacts.length > 0 ? contacts : [null]) {
      rows.push({
        priority: t.priority,
        cells: {
          ...company,
          contact: c ? orNull([c.firstName, c.lastName].filter(Boolean).join(' ')) : null,
          jobTitle: orNull(c?.jobTitle),
          email: orNull(c?.email),
          phone: orNull(c?.phone),
          linkedin: orNull(c?.linkedin),
          recontact: contactRecontact(c, meetings),
          news: contactNews(c, meetings),
        },
      })
    }
  }
  return {
    id: 'salon',
    title: 'Salon',
    columns: salonColumns(showsNews(data), usesShows(data), data.team.newsLabel),
    rows,
  }
}

/** Valeur d'une cellule en texte (CSV, aperçus). */
export function cellText(v: CellValue, kind: ColumnKind): string {
  if (v === null) return ''
  if (v instanceof Date) {
    // Les dates d'export sont déjà en heure murale (encodées en UTC).
    const iso = v.toISOString()
    return kind === 'date' ? formatDate(iso, 'UTC') : formatDateTime(iso, 'UTC')
  }
  return String(v)
}
