import { formatDate, formatDateTime } from './format.ts'
import { GOAL_LABEL, priorityLabel, statusLabel } from './labels.ts'
import { memberNames } from './select.ts'
import type { ContactRec, ExportData, MeetingRec, TargetRec } from './types.ts'

// CSV prêt pour import dans un CRM : une ligne par contact, colonnes et valeurs définies par un modèle de mapping.

type Ctx = {
  data: ExportData
  target: TargetRec
  contact: ContactRec | null
  meeting: MeetingRec | undefined
  notes: { at: string; body: string }[]
  owner: (id: string | null | undefined) => string
}

const clean = (s: string | null | undefined) => (s ?? '').trim()
const NOTE_SEP = ' | '

/** Champs de fair utilisables comme source d'une colonne CSV. */
export const CSV_FIELDS: { key: string; label: string; get: (c: Ctx) => string }[] = [
  { key: 'contact.firstName', label: 'Contact : prénom', get: (c) => clean(c.contact?.firstName) },
  { key: 'contact.lastName', label: 'Contact : nom', get: (c) => clean(c.contact?.lastName) },
  {
    key: 'contact.fullName',
    label: 'Contact : nom complet',
    get: (c) => [c.contact?.firstName, c.contact?.lastName].map(clean).filter(Boolean).join(' '),
  },
  { key: 'contact.email', label: 'Contact : e-mail', get: (c) => clean(c.contact?.email) },
  { key: 'contact.phone', label: 'Contact : téléphone', get: (c) => clean(c.contact?.phone) },
  { key: 'contact.jobTitle', label: 'Contact : fonction', get: (c) => clean(c.contact?.jobTitle) },
  { key: 'contact.linkedin', label: 'Contact : LinkedIn', get: (c) => clean(c.contact?.linkedin) },
  { key: 'contact.language', label: 'Contact : langue', get: (c) => clean(c.contact?.language) },
  { key: 'company.name', label: 'Entreprise : nom', get: (c) => c.target.name },
  { key: 'company.domain', label: 'Entreprise : domaine', get: (c) => clean(c.target.domain) },
  { key: 'company.website', label: 'Entreprise : site web', get: (c) => clean(c.target.website) },
  { key: 'company.industry', label: 'Entreprise : secteur', get: (c) => clean(c.target.industry) },
  { key: 'company.city', label: 'Entreprise : ville', get: (c) => clean(c.target.city) },
  { key: 'company.country', label: 'Entreprise : pays', get: (c) => clean(c.target.country) },
  { key: 'event.name', label: 'Salon : nom', get: (c) => c.data.event.name },
  { key: 'event.city', label: 'Salon : ville', get: (c) => clean(c.data.event.city) },
  {
    key: 'event.date',
    label: 'Salon : date de début',
    get: (c) => formatDate(c.data.event.startsOn),
  },
  { key: 'target.stand', label: 'Stand', get: (c) => clean(c.target.stand) },
  { key: 'target.priority', label: 'Priorité (A, B, C)', get: (c) => c.target.priority ?? '' },
  {
    key: 'target.priorityLabel',
    label: 'Priorité (libellé)',
    get: (c) => priorityLabel(c.target.priority),
  },
  {
    key: 'target.goal',
    label: 'Objectif',
    get: (c) => (c.target.goal ? (GOAL_LABEL[c.target.goal] ?? c.target.goal) : ''),
  },
  {
    key: 'target.tags',
    label: 'Tags',
    get: (c) =>
      c.target.tagIds
        .map((id) => c.data.tags.find((t) => t.id === id)?.label ?? '')
        .filter(Boolean)
        .join('; '),
  },
  {
    key: 'target.assignees',
    label: 'Commerciaux assignés',
    get: (c) => c.target.assigneeIds.map(c.owner).join('; '),
  },
  {
    key: 'target.prepComment',
    label: 'Commentaire de préparation',
    get: (c) => clean(c.target.prepComment),
  },
  {
    key: 'company.history',
    label: 'Entreprise : historique',
    get: (c) => clean(c.target.history),
  },
  {
    key: 'meeting.status',
    label: 'Rencontre : statut (code)',
    get: (c) => c.meeting?.status ?? 'none',
  },
  {
    key: 'meeting.statusLabel',
    label: 'Rencontre : statut',
    get: (c) => (c.meeting ? statusLabel(c.meeting.status) : ''),
  },
  {
    key: 'meeting.interest',
    label: 'Rencontre : intérêt (1-5)',
    get: (c) => String(c.meeting?.interest ?? ''),
  },
  {
    key: 'meeting.owner',
    label: 'Rencontre : commercial',
    get: (c) => (c.meeting ? c.owner(c.meeting.ownerId) : ''),
  },
  {
    key: 'meeting.date',
    label: 'Rencontre : date',
    get: (c) => formatDateTime(c.meeting?.plannedAt ?? null, c.data.event.timezone),
  },
  {
    key: 'meeting.recontact',
    label: 'Rencontre : à recontacter (Oui / Non)',
    get: (c) => (c.meeting ? (c.meeting.recontact ? 'Oui' : 'Non') : ''),
  },
  {
    key: 'meeting.nextStep',
    label: 'Rencontre : prochaine étape',
    get: (c) => clean(c.meeting?.nextStep),
  },
  {
    key: 'notes.all',
    label: 'Notes (toutes)',
    get: (c) =>
      c.notes.map((n) => `${formatDate(n.at, c.data.event.timezone)} : ${n.body}`).join(NOTE_SEP),
  },
  { key: 'notes.last', label: 'Dernière note', get: (c) => c.notes.at(-1)?.body ?? '' },
]

const FIELD = new Map(CSV_FIELDS.map((f) => [f.key, f]))

export type CsvSource = { field: string } | { value: string }
export type CsvColumn = {
  header: string
  source: CsvSource
  /** Table de correspondance de valeurs (ex. statut fair → statut CRM) ; valeur absente = laissée telle quelle. */
  map?: Record<string, string>
}
export type CsvTemplate = {
  id: string
  name: string
  delimiter: ',' | ';'
  /** BOM UTF-8 : utile pour qu'Excel ouvre les accents correctement. */
  bom: boolean
  /** Garder une ligne pour les entreprises sans contact (certains CRM l'exigent, d'autres l'interdisent). */
  includeCompaniesWithoutContact: boolean
  /** Ne pas exporter les contacts désinscrits. */
  excludeOptOut: boolean
  columns: CsvColumn[]
}

const f = (header: string, field: string, map?: Record<string, string>): CsvColumn => ({
  header,
  source: { field },
  ...(map ? { map } : {}),
})

const HUBSPOT_STATUS: Record<string, string> = {
  none: 'NEW',
  to_see: 'NEW',
  in_progress: 'IN_PROGRESS',
  done: 'CONNECTED',
  follow_up: 'IN_PROGRESS',
  not_interested: 'UNQUALIFIED',
  missed: 'ATTEMPTED_TO_CONTACT',
  skipped: 'ATTEMPTED_TO_CONTACT',
}

const SALESFORCE_STATUS: Record<string, string> = {
  none: 'Open - Not Contacted',
  to_see: 'Open - Not Contacted',
  in_progress: 'Working - Contacted',
  done: 'Working - Contacted',
  follow_up: 'Working - Contacted',
  not_interested: 'Closed - Not Converted',
  missed: 'Open - Not Contacted',
  skipped: 'Open - Not Contacted',
}

/** Priorité fair → « Rating » Salesforce. */
const SALESFORCE_RATING: Record<string, string> = { A: 'Hot', B: 'Warm', C: 'Cold' }

export const BUILTIN_TEMPLATES: CsvTemplate[] = [
  {
    id: 'hubspot',
    name: 'HubSpot (contacts)',
    delimiter: ',',
    bom: false,
    includeCompaniesWithoutContact: false,
    excludeOptOut: true,
    columns: [
      f('First Name', 'contact.firstName'),
      f('Last Name', 'contact.lastName'),
      f('Email', 'contact.email'),
      f('Phone Number', 'contact.phone'),
      f('Job Title', 'contact.jobTitle'),
      f('Company Name', 'company.name'),
      f('Company Domain Name', 'company.domain'),
      f('Website URL', 'company.website'),
      f('City', 'company.city'),
      f('Country/Region', 'company.country'),
      f('Lead Status', 'meeting.status', HUBSPOT_STATUS),
      { header: 'Lifecycle Stage', source: { value: 'lead' } },
    ],
  },
  {
    id: 'salesforce',
    name: 'Salesforce (leads)',
    delimiter: ',',
    bom: false,
    includeCompaniesWithoutContact: false,
    excludeOptOut: true,
    columns: [
      f('First Name', 'contact.firstName'),
      f('Last Name', 'contact.lastName'),
      f('Company', 'company.name'),
      f('Title', 'contact.jobTitle'),
      f('Email', 'contact.email'),
      f('Phone', 'contact.phone'),
      f('Website', 'company.website'),
      f('City', 'company.city'),
      f('Country', 'company.country'),
      f('Industry', 'company.industry'),
      f('Lead Source', 'event.name'),
      f('Status', 'meeting.status', SALESFORCE_STATUS),
      f('Rating', 'target.priority', SALESFORCE_RATING),
      f('Description', 'notes.all'),
    ],
  },
]

/** Point de départ d'un modèle personnalisé. */
export const CUSTOM_TEMPLATE: CsvTemplate = {
  id: 'custom',
  name: 'Personnalisé',
  delimiter: ';',
  bom: true,
  includeCompaniesWithoutContact: true,
  excludeOptOut: true,
  columns: [
    f('Entreprise', 'company.name'),
    f('Stand', 'target.stand'),
    f('Priorité', 'target.priorityLabel'),
    f('Prénom', 'contact.firstName'),
    f('Nom', 'contact.lastName'),
    f('E-mail', 'contact.email'),
    f('Téléphone', 'contact.phone'),
    f('Statut', 'meeting.statusLabel'),
    f('Notes', 'notes.all'),
  ],
}

/**
 * Neutralise l'injection de formules (=, @, + ou - suivi d'autre chose qu'un numéro) à l'ouverture dans un tableur.
 * Les numéros de téléphone (« +33 6 12 34 56 78 ») et les nombres négatifs restent intacts.
 */
export function safeCell(v: string): string {
  if (/^[=@]/.test(v)) return `'${v}`
  if (/^[+-]/.test(v) && !/^[+-][0-9 ().\-/]+$/.test(v)) return `'${v}`
  return v
}

function quote(v: string, delimiter: string): string {
  return v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Écrit des lignes en CSV (RFC 4180, fins de ligne CRLF). */
export function toCsv(rows: string[][], delimiter: ',' | ';', bom: boolean): string {
  const body = rows.map((r) => r.map((v) => quote(v, delimiter)).join(delimiter)).join('\r\n')
  return `${bom ? '\uFEFF' : ''}${body}\r\n`
}

export type CsvResult = { csv: string; rows: number; skippedOptOut: number }

/** Génère le CSV d'un modèle depuis des données déjà filtrées. */
export function buildCsv(data: ExportData, template: CsvTemplate): CsvResult {
  const owner = memberNames(data)
  const contactsOf = new Map<string, ContactRec[]>()
  for (const c of data.contacts) {
    if (c.companyId) contactsOf.set(c.companyId, [...(contactsOf.get(c.companyId) ?? []), c])
  }
  const meetingsOf = new Map<string, MeetingRec[]>()
  for (const m of data.meetings)
    meetingsOf.set(m.targetId, [...(meetingsOf.get(m.targetId) ?? []), m])
  const meetingTarget = new Map(data.meetings.map((m) => [m.id, m.targetId]))
  const notesOf = new Map<string, { at: string; body: string }[]>()
  for (const n of data.notes) {
    const tid = n.meetingId ? meetingTarget.get(n.meetingId) : n.targetId
    if (tid) notesOf.set(tid, [...(notesOf.get(tid) ?? []), { at: n.capturedAt, body: n.body }])
  }

  const rows: string[][] = [template.columns.map((c) => c.header)]
  let skippedOptOut = 0
  const targets = data.targets
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  for (const target of targets) {
    const all = contactsOf.get(target.companyId) ?? []
    const contacts = all.filter((c) => !(template.excludeOptOut && c.optOut))
    skippedOptOut += all.length - contacts.length
    const list: (ContactRec | null)[] =
      contacts.length > 0
        ? contacts
        : template.includeCompaniesWithoutContact && all.length === 0
          ? [null]
          : []
    const ms = (meetingsOf.get(target.id) ?? [])
      .slice()
      .sort((a, b) => (a.plannedAt ?? '').localeCompare(b.plannedAt ?? ''))
    const notes = (notesOf.get(target.id) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at))
    for (const contact of list) {
      const ctx: Ctx = { data, target, contact, meeting: ms.at(-1), notes, owner }
      rows.push(
        template.columns.map((col) => {
          const raw =
            'field' in col.source ? (FIELD.get(col.source.field)?.get(ctx) ?? '') : col.source.value
          const mapped = col.map && raw in col.map ? col.map[raw]! : raw
          return safeCell(mapped)
        }),
      )
    }
  }
  return {
    csv: toCsv(rows, template.delimiter, template.bom),
    rows: rows.length - 1,
    skippedOptOut,
  }
}
