import { memberNames } from './select.ts'
import { GOAL_LABEL, SOURCE_LABEL, priorityLabel, statusLabel } from './labels.ts'
import { formatDate, formatDateTime, wallClock } from './format.ts'
import {
  HELD_STATUSES,
  type ContactRec,
  type ExportData,
  type MeetingRec,
  type Priority,
  type TargetRec,
} from './types.ts'

// Tables d'export : le même modèle alimente l'Excel, l'aperçu et le choix des colonnes.

export type CellValue = string | number | Date | null
export type ColumnKind =
  'text' | 'longtext' | 'number' | 'date' | 'datetime' | 'priority' | 'status'
export type Column = { key: string; label: string; kind: ColumnKind; width: number }
export type Row = { cells: Record<string, CellValue>; priority: Priority | null }
export type TableId = 'companies' | 'contacts' | 'meetings' | 'notes'
export type Table = { id: TableId; title: string; columns: Column[]; rows: Row[] }
/** Colonnes retenues par onglet (clés) ; un onglet absent garde toutes ses colonnes. */
export type ColumnSelection = Partial<Record<TableId, string[]>>

export const TABLE_TITLES: Record<TableId, string> = {
  companies: 'Entreprises',
  contacts: 'Contacts',
  meetings: 'Rencontres',
  notes: 'Notes',
}

const col = (key: string, label: string, kind: ColumnKind, width: number): Column => ({
  key,
  label,
  kind,
  width,
})

export const COLUMNS: Record<TableId, Column[]> = {
  companies: [
    col('name', 'Entreprise', 'text', 28),
    col('stand', 'Stand', 'text', 10),
    col('priority', 'Priorité', 'priority', 12),
    col('goal', 'Objectif', 'text', 18),
    col('assignees', 'Commerciaux', 'text', 24),
    col('tags', 'Tags', 'text', 22),
    col('status', 'Statut', 'status', 16),
    col('interest', 'Intérêt (1-5)', 'number', 12),
    col('meetingsPlanned', 'Rencontres prévues', 'number', 12),
    col('meetingsHeld', 'Rencontres réalisées', 'number', 12),
    col('recontact', 'À recontacter', 'text', 14),
    col('contacts', 'Contacts', 'number', 10),
    col('industry', 'Secteur', 'text', 18),
    col('city', 'Ville', 'text', 16),
    col('country', 'Pays', 'text', 14),
    col('domain', 'Domaine', 'text', 22),
    col('website', 'Site web', 'text', 28),
    col('prepComment', 'Commentaire de préparation', 'longtext', 40),
    col('history', 'Historique', 'longtext', 50),
  ],
  contacts: [
    col('company', 'Entreprise', 'text', 28),
    col('stand', 'Stand', 'text', 10),
    col('priority', 'Priorité', 'priority', 12),
    col('firstName', 'Prénom', 'text', 16),
    col('lastName', 'Nom', 'text', 18),
    col('jobTitle', 'Fonction', 'text', 24),
    col('email', 'E-mail', 'text', 30),
    col('phone', 'Téléphone', 'text', 18),
    col('linkedin', 'LinkedIn', 'text', 28),
    col('recontact', 'À recontacter', 'text', 14),
    col('language', 'Langue', 'text', 10),
    col('optOut', 'Désinscrit', 'text', 12),
  ],
  meetings: [
    col('company', 'Entreprise', 'text', 28),
    col('stand', 'Stand', 'text', 10),
    col('priority', 'Priorité', 'priority', 12),
    col('plannedAt', 'Date et heure', 'datetime', 18),
    col('duration', 'Durée (min)', 'number', 11),
    col('owner', 'Commercial', 'text', 20),
    col('status', 'Statut', 'status', 16),
    col('interest', 'Intérêt (1-5)', 'number', 12),
    col('contact', 'Contact', 'text', 22),
    col('recontact', 'À recontacter', 'text', 14),
    col('need', 'Besoin', 'longtext', 30),
    col('budget', 'Budget', 'text', 16),
    col('timing', 'Timing', 'text', 16),
    col('decisionMaker', 'Décideur', 'text', 20),
    col('nextStep', 'Prochaine étape', 'longtext', 32),
    col('outcome', 'Issue', 'longtext', 28),
    col('notes', 'Nombre de notes', 'number', 10),
  ],
  notes: [
    col('company', 'Entreprise', 'text', 28),
    col('stand', 'Stand', 'text', 10),
    col('priority', 'Priorité', 'priority', 12),
    col('meetingAt', 'Rencontre du', 'datetime', 18),
    col('author', 'Auteur', 'text', 20),
    col('capturedAt', 'Saisie le', 'datetime', 18),
    col('source', 'Source', 'text', 14),
    col('body', 'Note', 'longtext', 70),
  ],
}

const orNull = (s: string | null | undefined) => (s && s.trim() !== '' ? s : null)
const byName = (a: TargetRec, b: TargetRec) =>
  a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })

/** Rencontre la plus récente d'une entreprise (la dernière planifiée). */
function latest(meetings: MeetingRec[]): MeetingRec | undefined {
  return meetings
    .slice()
    .sort((a, b) => (a.plannedAt ?? '').localeCompare(b.plannedAt ?? ''))
    .at(-1)
}

/**
 * « À recontacter » d'un contact : Oui si une rencontre de son entreprise est marquée à recontacter et qu'elle concerne
 * ce contact (ou ne précise pas de contact) ; vide si l'entreprise n'a eu aucune rencontre.
 */
function contactRecontact(c: ContactRec, meetings: MeetingRec[]): string | null {
  if (meetings.length === 0) return null
  return meetings.some((m) => m.recontact && (m.contactId === null || m.contactId === c.id))
    ? 'Oui'
    : 'Non'
}

/** Construit les quatre tables (Entreprises, Contacts, Rencontres, Notes) depuis des données déjà filtrées. */
export function buildTables(data: ExportData, selection: ColumnSelection = {}): Table[] {
  const tz = data.event.timezone
  const owner = memberNames(data)
  const tagLabel = new Map(data.tags.map((t) => [t.id, t.label]))
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const meetingsOf = new Map<string, MeetingRec[]>()
  for (const m of data.meetings)
    meetingsOf.set(m.targetId, [...(meetingsOf.get(m.targetId) ?? []), m])
  const contactsOf = new Map<string, number>()
  for (const c of data.contacts)
    if (c.companyId) contactsOf.set(c.companyId, (contactsOf.get(c.companyId) ?? 0) + 1)
  const notesOf = new Map<string, number>()
  for (const n of data.notes)
    if (n.meetingId) notesOf.set(n.meetingId, (notesOf.get(n.meetingId) ?? 0) + 1)
  const meetingById = new Map(data.meetings.map((m) => [m.id, m]))
  const targets = data.targets.slice().sort(byName)

  const companies: Row[] = targets.map((t) => {
    const ms = meetingsOf.get(t.id) ?? []
    const last = latest(ms)
    const interests = ms.map((m) => m.interest).filter((i): i is number => i !== null)
    return {
      priority: t.priority,
      cells: {
        name: t.name,
        stand: orNull(t.stand),
        priority: priorityLabel(t.priority),
        goal: t.goal ? (GOAL_LABEL[t.goal] ?? t.goal) : null,
        assignees: t.assigneeIds.map(owner).join(', ') || null,
        tags:
          t.tagIds
            .map((id) => tagLabel.get(id) ?? '')
            .filter(Boolean)
            .join(', ') || null,
        status: last ? statusLabel(last.status) : null,
        interest: interests.length ? Math.max(...interests) : null,
        meetingsPlanned: ms.filter((m) => !m.unplanned).length,
        meetingsHeld: ms.filter((m) => HELD_STATUSES.includes(m.status)).length,
        recontact: ms.length ? (ms.some((m) => m.recontact) ? 'Oui' : 'Non') : null,
        contacts: contactsOf.get(t.companyId) ?? 0,
        industry: orNull(t.industry),
        city: orNull(t.city),
        country: orNull(t.country),
        domain: orNull(t.domain),
        website: orNull(t.website),
        prepComment: orNull(t.prepComment),
        history: orNull(t.history),
      },
    }
  })

  const targetOfCompany = new Map(data.targets.map((t) => [t.companyId, t]))
  const contacts: Row[] = data.contacts
    .map((c) => ({ c, t: c.companyId ? targetOfCompany.get(c.companyId) : undefined }))
    .sort(
      (a, b) =>
        (a.t?.name ?? '').localeCompare(b.t?.name ?? '', 'fr', { sensitivity: 'base' }) ||
        (a.c.lastName ?? '').localeCompare(b.c.lastName ?? '', 'fr', { sensitivity: 'base' }),
    )
    .map(({ c, t }) => ({
      priority: t?.priority ?? null,
      cells: {
        company: t?.name ?? null,
        stand: orNull(t?.stand),
        priority: priorityLabel(t?.priority ?? null),
        firstName: orNull(c.firstName),
        lastName: orNull(c.lastName),
        jobTitle: orNull(c.jobTitle),
        email: orNull(c.email),
        phone: orNull(c.phone),
        linkedin: orNull(c.linkedin),
        recontact: contactRecontact(c, t ? (meetingsOf.get(t.id) ?? []) : []),
        language: orNull(c.language),
        optOut: c.optOut ? 'Oui' : null,
      },
    }))

  const contactName = new Map(
    data.contacts.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(' ')]),
  )
  const meetings: Row[] = data.meetings
    .slice()
    .sort((a, b) => (a.plannedAt ?? '9999').localeCompare(b.plannedAt ?? '9999'))
    .map((m) => {
      const t = targetById.get(m.targetId)
      return {
        priority: t?.priority ?? null,
        cells: {
          company: t?.name ?? null,
          stand: orNull(t?.stand),
          priority: priorityLabel(t?.priority ?? null),
          plannedAt: wallClock(m.plannedAt, tz),
          duration: m.durationMin,
          owner: owner(m.ownerId),
          status: statusLabel(m.status),
          interest: m.interest,
          contact: orNull(m.contactId ? contactName.get(m.contactId) : null),
          recontact: m.recontact ? 'Oui' : 'Non',
          need: orNull(m.need),
          budget: orNull(m.budget),
          timing: orNull(m.timing),
          decisionMaker: orNull(m.decisionMaker),
          nextStep: orNull(m.nextStep),
          outcome: orNull(m.outcome),
          notes: notesOf.get(m.id) ?? 0,
        },
      }
    })

  const notes: Row[] = data.notes
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .map((n) => {
      const m = n.meetingId ? meetingById.get(n.meetingId) : undefined
      const t = targetById.get(m?.targetId ?? n.targetId ?? '')
      return {
        priority: t?.priority ?? null,
        cells: {
          company: t?.name ?? null,
          stand: orNull(t?.stand),
          priority: priorityLabel(t?.priority ?? null),
          meetingAt: wallClock(m?.plannedAt ?? null, tz),
          author: owner(n.authorId),
          capturedAt: wallClock(n.capturedAt, tz),
          source: SOURCE_LABEL[n.source] ?? n.source,
          body: n.body,
        },
      }
    })

  const rows: Record<TableId, Row[]> = { companies, contacts, meetings, notes }
  return (Object.keys(TABLE_TITLES) as TableId[]).map((id) => {
    const wanted = selection[id]
    const columns = wanted ? COLUMNS[id].filter((c) => wanted.includes(c.key)) : COLUMNS[id]
    return { id, title: TABLE_TITLES[id], columns, rows: rows[id] }
  })
}

/** Valeur d'une cellule en texte (aperçus, PDF, CSV). */
export function cellText(v: CellValue, kind: ColumnKind): string {
  if (v === null) return ''
  if (v instanceof Date) {
    // Les dates d'export sont déjà en heure murale (encodées en UTC).
    const iso = v.toISOString()
    return kind === 'date' ? formatDate(iso, 'UTC') : formatDateTime(iso, 'UTC')
  }
  return String(v)
}
