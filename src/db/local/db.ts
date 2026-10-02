import Dexie, { type Table } from 'dexie'

// Base locale (IndexedDB) : miroir des tables synchronisées, avec les noms et colonnes du serveur.
// L'interface lit et écrit TOUJOURS ici ; `src/sync/` fait le lien avec Supabase.

export type Row = { [column: string]: unknown }

export type SyncTableName =
  | 'events'
  | 'companies'
  | 'contacts'
  | 'event_companies'
  | 'meetings'
  | 'notes'
  | 'attachments'
  | 'tags'
  | 'taggings'
  | 'event_company_assignees'
  | 'profiles'

export type LocalEvent = Row & {
  id: string
  team_id: string
  name: string
  starts_on: string | null
  ends_on: string | null
  city: string | null
  deleted_at: string | null
}
export type LocalCompany = Row & {
  id: string
  team_id: string
  name: string
  name_normalized: string
  domain: string | null
  website: string | null
  industry: string | null
  city: string | null
  country: string | null
  deleted_at: string | null
}
export type LocalContact = Row & {
  id: string
  team_id: string
  company_id: string | null
  first_name: string | null
  last_name: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  deleted_at: string | null
}
export type LocalEventCompany = Row & {
  id: string
  team_id: string
  event_id: string
  company_id: string
  stand_label: string | null
  priority: 'A' | 'B' | 'C' | null
  objective: string | null
  prep_comment: string | null
  deleted_at: string | null
}
export type LocalMeeting = Row & {
  id: string
  team_id: string
  event_id: string
  event_company_id: string
  contact_id: string | null
  owner_id: string
  status: MeetingStatus
  is_unplanned: boolean
  planned_at: string | null
  planned_duration_min: number
  reminder_minutes: number | null
  interest: number | null
  need: string | null
  budget: string | null
  timing: string | null
  decision_maker: string | null
  next_step: string | null
  deleted_at: string | null
  created_at?: string
}
export type LocalNote = Row & {
  id: string
  team_id: string
  meeting_id: string | null
  event_company_id: string | null
  author_id: string
  body: string
  source: string
  captured_at: string
  deleted_at: string | null
}
export type LocalAttachment = Row & {
  id: string
  team_id: string
  owner_table: string
  owner_id: string
  kind: string
  storage_path: string | null
  mime: string | null
  size_bytes: number | null
  status: 'pending' | 'uploaded' | 'failed'
  deleted_at: string | null
}
export type LocalTag = Row & {
  id: string
  team_id: string
  label: string
  color: string | null
  scope: string
  deleted_at: string | null
}
export type LocalTagging = Row & {
  tag_id: string
  taggable_table: string
  taggable_id: string
  team_id: string
}
export type LocalAssignee = Row & {
  event_company_id: string
  user_id: string
  event_id: string
  team_id: string
  deleted_at: string | null
}
export type LocalProfile = Row & { id: string; display_name: string | null }

export type MeetingStatus =
  'to_see' | 'in_progress' | 'done' | 'missed' | 'skipped' | 'follow_up' | 'not_interested'

export type LocalBlob = { id: string; blob: Blob; mime: string }

/** Opération en attente d'envoi au serveur. */
export type OutboxOp = {
  seq?: number
  id: string
  table: SyncTableName
  /** Clé de la ligne (colonnes de la clé primaire). */
  key: Record<string, string>
  /** `table:valeurs` — sert à regrouper les opérations d'une même ligne. */
  rowKey: string
  kind: 'insert' | 'update' | 'delete'
  /** insert : ligne complète ; update : colonnes modifiées. */
  payload: Row
  createdAt: number
  attempts: number
  /** Heure de modification de chaque champ (appareil) : sert au « dernier écrit gagne » par champ. */
  edited?: Record<string, string>
  /** Opération en cours d'envoi : les nouvelles écritures ne la fusionnent plus. */
  locked?: boolean
  /** Refusée définitivement par le serveur (mise en quarantaine). */
  failed?: boolean
  lastError?: string
}

/** Conflit de note conservé pour résolution : les deux versions existent (la nôtre dans copyId). */
export type LocalConflict = {
  id: string
  table: 'notes'
  rowId: string
  copyId: string
  mine: string
  theirs: string
  createdAt: string
  status: 'open' | 'resolved'
}

export type SyncStateRow = { key: string; value: unknown }

export class FairDb extends Dexie {
  events!: Table<LocalEvent, string>
  companies!: Table<LocalCompany, string>
  contacts!: Table<LocalContact, string>
  event_companies!: Table<LocalEventCompany, string>
  meetings!: Table<LocalMeeting, string>
  notes!: Table<LocalNote, string>
  attachments!: Table<LocalAttachment, string>
  tags!: Table<LocalTag, string>
  taggings!: Table<LocalTagging, [string, string, string]>
  event_company_assignees!: Table<LocalAssignee, [string, string]>
  profiles!: Table<LocalProfile, string>
  blobs!: Table<LocalBlob, string>
  outbox!: Table<OutboxOp, number>
  sync_state!: Table<SyncStateRow, string>
  conflicts!: Table<LocalConflict, string>

  constructor(name = 'fair') {
    super(name)
    this.version(1).stores({
      events: 'id',
      companies: 'id, name_normalized',
      contacts: 'id, company_id',
      event_companies: 'id, event_id, company_id',
      meetings: 'id, event_id, event_company_id, owner_id',
      notes: 'id, meeting_id',
      attachments: 'id, owner_id',
      tags: 'id',
      taggings: '[tag_id+taggable_table+taggable_id], taggable_id',
      event_company_assignees: '[event_company_id+user_id], event_id, user_id',
      profiles: 'id',
      blobs: 'id',
      outbox: '++seq, rowKey, table',
      sync_state: 'key',
    })
    this.version(2).stores({ conflicts: 'id, status' })
  }
}

export let db = new FairDb()

/** Change la base courante (tests multi-appareils : une base par appareil). */
export function setCurrentDb(next: FairDb): FairDb {
  db = next
  return db
}

/** Pour les tests : remplace la base par une instance isolée. */
export function replaceDbForTests(name: string): FairDb {
  db = new FairDb(name)
  return db
}
