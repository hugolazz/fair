import { z } from 'zod'
import type { Priority, TagKind } from './prepare'

// Types et schémas partagés par l'import de participants (UI, worker et dépôt).

export const IMPORT_FIELDS = [
  'companyName',
  'website',
  'stand',
  'industry',
  'country',
  'city',
  'contactName',
  'contactFirstName',
  'contactLastName',
  'jobTitle',
  'email',
  'phone',
  'contactLinkedin',
  'priority',
  'tag',
  'shows',
  'comment',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

/** Tableau brut : en-têtes + lignes (cellules nettoyées) + numéro de ligne d'origine de chaque ligne. */
export type RawTable = { headers: string[]; rows: string[][]; rowNumbers: number[] }

/** Champ → index de colonne. */
export type ColumnMapping = Partial<Record<ImportField, number>>

/** Mapping mémorisé : champ → intitulé de colonne, pour être réappliqué à un autre fichier. */
export const storedMappingSchema = z.object({
  firstRowIsHeader: z.boolean(),
  columns: z.partialRecord(z.enum(IMPORT_FIELDS), z.string()),
})
export type StoredMapping = z.infer<typeof storedMappingSchema>

export type CompanyDraft = {
  name: string
  /** Clé de comparaison (nom normalisé). */
  nameKey: string
  website: string
  domain: string
  stand: string
  industry: string
  country: string
  city: string
  /** Priorité déjà décidée dans le fichier (A, B ou C). */
  priority: Priority | null
  /** Typologie (client, prospect, concurrent…) : le libellé d'un tag de l'équipe. */
  tag: string
  /** Salons où l'entreprise était ou sera : libellés des colonnes cochées et de la colonne « Salons » (pastilles). */
  shows: string[]
  /** Historique avec l'entreprise (colonne « Commentaire » du fichier), texte libre. */
  comment: string
}

export type ContactDraft = {
  firstName: string
  lastName: string
  jobTitle: string
  email: string
  phone: string
  linkedin: string
}

export type RowWarning =
  | 'invalid_email'
  | 'invalid_url'
  | 'invalid_linkedin'
  | 'contact_incomplete'
  /** Plusieurs contacts dans la ligne, mais pas autant d'e-mails que de noms : l'alignement est à vérifier. */
  | 'contacts_mismatch'

export type CleanRow = {
  rowNumber: number
  company: CompanyDraft
  /** Un ou plusieurs contacts (le premier est le contact clé). */
  contacts: ContactDraft[]
  warnings: RowWarning[]
}

export type RowErrorCode = 'missing_company' | 'save_failed'
export type RowError = { rowNumber: number; code: RowErrorCode; message?: string; raw: string[] }

export type RemovedCounts = { empty: number; repeatedHeader: number }

export type KnownCompany = {
  id: string
  name: string
  nameKey: string
  domain: string | null
  website: string | null
  industry: string | null
  country: string | null
  city: string | null
  history: string | null
}

export type KnownContact = {
  id: string
  companyId: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
}

export type DuplicateTarget =
  | { kind: 'file'; rowNumber: number; name: string }
  | { kind: 'known'; companyId: string; name: string }

export type DuplicateGroup = {
  id: string
  target: DuplicateTarget
  /** Lignes du fichier considérées comme doublons de la cible. */
  rowNumbers: number[]
  reason: 'domain' | 'name'
}

export type Decision = 'merge' | 'skip' | 'create'

export type CompanyWrite = {
  id: string
  team_id: string
  name: string
  name_normalized: string
  domain: string | null
  website: string | null
  industry: string | null
  country: string | null
  city: string | null
  history: string | null
  isNew: boolean
  rowNumbers: number[]
}

export type EventCompanyWrite = {
  id: string
  team_id: string
  event_id: string
  company_id: string
  stand_label: string | null
  priority: Priority | null
  import_batch_id: string | null
  rowNumbers: number[]
}

/**
 * Tag à poser sur une société (au niveau de l'entreprise : il suit d'un salon à l'autre) : une typologie (client,
 * prospect…) ou un salon (pastille).
 */
export type CompanyTagWrite = {
  company_id: string
  label: string
  kind: TagKind
  rowNumbers: number[]
}

export type ContactWrite = {
  id: string
  team_id: string
  company_id: string
  first_name: string | null
  last_name: string | null
  job_title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  rowNumbers: number[]
}

export type EventContactWrite = {
  event_id: string
  contact_id: string
  company_id: string
  team_id: string
  expected: boolean
  rowNumbers: number[]
}

export type SkipReason = 'duplicate_skipped'

export type PlanWarning = { rowNumber: number; code: 'domain_conflict' | RowWarning }

export type ImportPlan = {
  batchId: string | null
  companies: CompanyWrite[]
  eventCompanies: EventCompanyWrite[]
  companyTags: CompanyTagWrite[]
  contacts: ContactWrite[]
  eventContacts: EventContactWrite[]
  skipped: { rowNumber: number; reason: SkipReason }[]
  warnings: PlanWarning[]
  stats: {
    rowsTotal: number
    rowsImported: number
    companiesCreated: number
    companiesMerged: number
    alreadyInEvent: number
    contactsCreated: number
    contactsLinked: number
  }
}

export type ImportReport = {
  rowsTotal: number
  rowsImported: number
  companiesCreated: number
  companiesMerged: number
  eventCompaniesAdded: number
  alreadyInEvent: number
  contactsCreated: number
  contactsLinked: number
  warnings: number
  skipped: { rowNumber: number; reason: SkipReason }[]
  errors: RowError[]
}

export type ImportErrorCode =
  'empty' | 'file_too_large' | 'too_many_rows' | 'unsupported_format' | 'parse_failed'

export class ImportError extends Error {
  readonly code: ImportErrorCode
  constructor(code: ImportErrorCode) {
    super(code)
    this.name = 'ImportError'
    this.code = code
  }
}

export const IMPORT_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxRows: 20_000,
} as const
