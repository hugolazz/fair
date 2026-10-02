import { supabase } from '@/lib/supabase'
import { normalizeName } from '@/lib/normalize-name'
import {
  storedMappingSchema,
  type ImportPlan,
  type ImportReport,
  type KnownCompany,
  type KnownContact,
  type RowError,
  type StoredMapping,
} from '../schemas/import'

const PAGE = 1000
const CHUNK = 500

type Row = Record<string, unknown>

async function fetchAll(table: string, columns: string): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as Row[]
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

/** Toutes les sociétés de l'équipe : sert au rapprochement avec les salons précédents. */
export async function fetchKnownCompanies(): Promise<KnownCompany[]> {
  const rows = await fetchAll('companies', 'id, name, domain, website, industry, country, city')
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    nameKey: normalizeName(r.name as string),
    domain: str(r.domain),
    website: str(r.website),
    industry: str(r.industry),
    country: str(r.country),
    city: str(r.city),
  }))
}

export async function fetchKnownContacts(): Promise<KnownContact[]> {
  const rows = await fetchAll('contacts', 'id, company_id, email, first_name, last_name')
  return rows.map((r) => ({
    id: r.id as string,
    companyId: str(r.company_id),
    email: str(r.email)?.toLowerCase() ?? null,
    firstName: str(r.first_name),
    lastName: str(r.last_name),
  }))
}

export async function fetchEventCompanyIds(eventId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('event_companies')
      .select('company_id')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) ids.add(r.company_id as string)
    if ((data ?? []).length < PAGE) return ids
  }
}

/** Mapping de colonnes du dernier import de ce salon, s'il existe. */
export async function loadLastMapping(eventId: string): Promise<StoredMapping | null> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('mapping')
    .eq('event_id', eventId)
    .not('mapping', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const parsed = storedMappingSchema.safeParse(data?.[0]?.mapping)
  return parsed.success ? parsed.data : null
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export type ExecuteInput = {
  plan: ImportPlan
  teamId: string
  eventId: string
  filename: string
  mapping: StoredMapping
  /** Erreurs de nettoyage déjà détectées (lignes inexploitables). */
  cleaningErrors: RowError[]
  /** Cellules d'origine de chaque ligne, pour le rapport d'erreurs. */
  rawByRow: Map<number, string[]>
  onProgress?: (done: number, total: number) => void
}

/**
 * Écrit le plan par lots. Les identifiants sont fixés par le plan : relancer le même plan après une
 * coupure réseau est sans danger (upsert). Un lot en échec ne bloque pas les autres : ses lignes
 * sont reportées en erreur, ainsi que celles qui en dépendent.
 */
export async function executeImport(input: ExecuteInput): Promise<ImportReport> {
  const { plan, teamId, eventId } = input
  const failedRows = new Map<number, string>()
  const failedCompanies = new Set<string>()
  const failedContacts = new Set<string>()

  const total =
    chunks(plan.companies).length +
    chunks(plan.eventCompanies).length +
    chunks(plan.contacts).length +
    chunks(plan.eventContacts).length
  let done = 0
  const tick = () => input.onProgress?.(++done, total)

  const { error: batchErr } = await supabase.from('import_batches').upsert(
    {
      id: plan.batchId,
      team_id: teamId,
      event_id: eventId,
      filename: input.filename,
      row_count: plan.stats.rowsTotal + input.cleaningErrors.length,
      mapping: input.mapping,
    },
    { onConflict: 'id' },
  )
  if (batchErr) throw batchErr

  async function write<T extends { rowNumbers: number[] }>(
    items: T[],
    table: string,
    toRow: (item: T) => Row,
    onConflict: string,
    onFail: (items: T[]) => void,
  ) {
    for (const part of chunks(items)) {
      const { error } = await supabase.from(table).upsert(part.map(toRow), { onConflict })
      if (error) {
        onFail(part)
        for (const item of part) for (const n of item.rowNumbers) failedRows.set(n, error.message)
      }
      tick()
    }
  }

  const newCompanies = plan.companies.filter((c) => c.isNew)
  const updatedCompanies = plan.companies.filter((c) => !c.isNew)
  const companyRow = (c: ImportPlan['companies'][number]): Row => ({
    id: c.id,
    team_id: c.team_id,
    name: c.name,
    name_normalized: c.name_normalized,
    domain: c.domain,
    website: c.website,
    industry: c.industry,
    country: c.country,
    city: c.city,
  })
  const markCompanies = (items: { id: string }[]) => items.forEach((c) => failedCompanies.add(c.id))

  await write(
    newCompanies,
    'companies',
    (c) => ({ ...companyRow(c), source: 'import' }),
    'id',
    markCompanies,
  )
  await write(updatedCompanies, 'companies', companyRow, 'id', markCompanies)

  await write(
    plan.eventCompanies.filter((e) => !failedCompanies.has(e.company_id)),
    'event_companies',
    (e) => ({
      id: e.id,
      team_id: e.team_id,
      event_id: e.event_id,
      company_id: e.company_id,
      stand_label: e.stand_label,
      import_batch_id: e.import_batch_id,
    }),
    'id',
    (items) => items.forEach((e) => failedCompanies.add(e.company_id)),
  )

  await write(
    plan.contacts.filter((c) => !failedCompanies.has(c.company_id)),
    'contacts',
    (c) => ({
      id: c.id,
      team_id: c.team_id,
      company_id: c.company_id,
      first_name: c.first_name,
      last_name: c.last_name,
      job_title: c.job_title,
      email: c.email,
      phone: c.phone,
    }),
    'id',
    (items) => items.forEach((c) => failedContacts.add(c.id)),
  )

  await write(
    plan.eventContacts.filter(
      (e) => !failedCompanies.has(e.company_id) && !failedContacts.has(e.contact_id),
    ),
    'event_contacts',
    (e) => ({
      event_id: e.event_id,
      contact_id: e.contact_id,
      company_id: e.company_id,
      team_id: e.team_id,
      expected: e.expected,
    }),
    'event_id,contact_id',
    () => {},
  )

  const saveErrors: RowError[] = [...failedRows].map(([rowNumber, message]) => ({
    rowNumber,
    code: 'save_failed',
    message,
    raw: input.rawByRow.get(rowNumber) ?? [],
  }))
  const failedEventCompanies = plan.eventCompanies.filter((e) =>
    failedCompanies.has(e.company_id),
  ).length
  const report: ImportReport = {
    rowsTotal: plan.stats.rowsTotal + input.cleaningErrors.length,
    rowsImported: Math.max(0, plan.stats.rowsImported - failedRows.size),
    companiesCreated:
      plan.stats.companiesCreated - newCompanies.filter((c) => failedCompanies.has(c.id)).length,
    companiesMerged: plan.stats.companiesMerged,
    eventCompaniesAdded: plan.eventCompanies.length - failedEventCompanies,
    alreadyInEvent: plan.stats.alreadyInEvent,
    contactsCreated:
      plan.stats.contactsCreated -
      plan.contacts.filter((c) => failedContacts.has(c.id) || failedCompanies.has(c.company_id))
        .length,
    contactsLinked: plan.stats.contactsLinked,
    warnings: plan.warnings.length,
    skipped: plan.skipped,
    errors: [...input.cleaningErrors, ...saveErrors],
  }

  // Compteurs seulement (pas de données personnelles dans le rapport stocké).
  await supabase
    .from('import_batches')
    .update({ report: { ...report, skipped: report.skipped.length, errors: report.errors.length } })
    .eq('id', plan.batchId)
  return report
}
