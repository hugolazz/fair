// Types partagés des exports (navigateur, Edge Function, tests). Aucune dépendance : fonctions pures ailleurs.

export type Priority = 'A' | 'B' | 'C'

export const MEETING_STATUSES = [
  'to_see',
  'in_progress',
  'done',
  'follow_up',
  'not_interested',
  'missed',
  'skipped',
] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

/** Statuts d'une rencontre qui a bien eu lieu. */
export const HELD_STATUSES: readonly MeetingStatus[] = ['done', 'follow_up', 'not_interested']
/** Statuts d'une rencontre qui n'a pas eu lieu. */
export const MISSED_STATUSES: readonly MeetingStatus[] = ['missed', 'skipped']

export type TeamInfo = {
  id: string
  name: string
  /** Logo de l'équipe (PNG ou JPEG) pour les PDF. */
  logo: { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } | null
}

export type EventInfo = {
  id: string
  name: string
  startsOn: string | null
  endsOn: string | null
  venue: string | null
  city: string | null
  timezone: string
}

export type Member = { userId: string; name: string }
export type Tag = { id: string; label: string; color: string | null }

/** Une entreprise ciblée sur le salon (`event_companies` + entreprise). */
export type TargetRec = {
  id: string
  companyId: string
  name: string
  domain: string | null
  website: string | null
  industry: string | null
  city: string | null
  country: string | null
  stand: string | null
  priority: Priority | null
  goal: string | null
  prepComment: string | null
  /** Historique avec l'entreprise (colonne « Commentaire » de l'import). */
  history: string | null
  assigneeIds: string[]
  tagIds: string[]
}

export type ContactRec = {
  id: string
  companyId: string | null
  firstName: string | null
  lastName: string | null
  jobTitle: string | null
  email: string | null
  phone: string | null
  linkedin: string | null
  language: string | null
  /** Désinscrit : à ne pas relancer. */
  optOut: boolean
}

export type MeetingRec = {
  id: string
  targetId: string
  contactId: string | null
  ownerId: string
  status: MeetingStatus
  plannedAt: string | null
  durationMin: number | null
  unplanned: boolean
  interest: number | null
  need: string | null
  budget: string | null
  timing: string | null
  decisionMaker: string | null
  nextStep: string | null
  outcome: string | null
  /** À recontacter après le salon. */
  recontact: boolean
}

export type NoteRec = {
  id: string
  meetingId: string | null
  targetId: string | null
  authorId: string
  body: string
  source: string
  capturedAt: string
}

export type FollowUpRec = {
  id: string
  meetingId: string | null
  assigneeId: string | null
  dueOn: string | null
  channel: string
  body: string | null
  status: 'todo' | 'done' | 'cancelled'
}

/** Tout ce qu'il faut pour générer un export ou un bilan. */
export type ExportData = {
  /** Instant de génération (ISO) : injecté pour des fichiers reproductibles. */
  generatedAt: string
  team: TeamInfo
  event: EventInfo
  members: Member[]
  tags: Tag[]
  targets: TargetRec[]
  contacts: ContactRec[]
  meetings: MeetingRec[]
  notes: NoteRec[]
  followUps: FollowUpRec[]
}

/** Filtres d'export. Une liste vide = pas de filtre sur ce critère. */
export type ExportFilters = {
  statuses: (MeetingStatus | 'none')[]
  priorities: (Priority | 'none')[]
  assigneeIds: string[]
  tagIds: string[]
}

export const NO_FILTERS: ExportFilters = {
  statuses: [],
  priorities: [],
  assigneeIds: [],
  tagIds: [],
}
