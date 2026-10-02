import type {
  CleanRow,
  CompanyWrite,
  ContactDraft,
  ContactWrite,
  Decision,
  DuplicateGroup,
  EventCompanyWrite,
  EventContactWrite,
  ImportPlan,
  KnownCompany,
  KnownContact,
  PlanWarning,
} from '@/db/schemas/import'
import { normalizeName } from './text'

type Fields = { website: string; domain: string; industry: string; country: string; city: string }

type Slot = {
  companyId: string | null // null = société à créer
  name: string
  nameKey: string
  fields: Fields
  stand: string
  rows: CleanRow[]
}

const FILL_FIELDS = ['domain', 'website', 'industry', 'country', 'city'] as const

const nul = (s: string | null | undefined) => (s ? s : null)

const personKey = (c: ContactDraft) =>
  c.email || `${normalizeName(c.firstName)}|${normalizeName(c.lastName)}`

export type PlanInput = {
  rows: CleanRow[]
  groups: DuplicateGroup[]
  decisions: Record<string, Decision>
  known: KnownCompany[]
  knownContacts: KnownContact[]
  /** Sociétés déjà rattachées à ce salon. */
  eventCompanyIds: Set<string>
  teamId: string
  eventId: string
  batchId: string
  newId: () => string
}

/**
 * Transforme les lignes nettoyées + décisions de l'utilisateur en écritures à effectuer.
 * Fusion : les champs vides d'une société connue sont complétés, jamais écrasés.
 */
export function buildPlan(input: PlanInput): ImportPlan {
  const { rows, groups, decisions, known, knownContacts, eventCompanyIds, newId } = input
  const knownById = new Map(known.map((k) => [k.id, k]))
  const groupOfRow = new Map<number, DuplicateGroup>()
  for (const g of groups) for (const n of g.rowNumbers) groupOfRow.set(n, g)

  const slots = new Map<string, Slot>()
  const skipped: ImportPlan['skipped'] = []

  const newSlot = (key: string, row: CleanRow): Slot => {
    const s: Slot = {
      companyId: null,
      name: row.company.name,
      nameKey: row.company.nameKey,
      fields: { website: '', domain: '', industry: '', country: '', city: '' },
      stand: '',
      rows: [],
    }
    slots.set(key, s)
    return s
  }
  const knownSlot = (id: string): Slot => {
    const key = `known:${id}`
    const existing = slots.get(key)
    if (existing) return existing
    const k = knownById.get(id)!
    const s: Slot = {
      companyId: id,
      name: k.name,
      nameKey: k.nameKey,
      fields: { website: '', domain: '', industry: '', country: '', city: '' },
      stand: '',
      rows: [],
    }
    slots.set(key, s)
    return s
  }

  for (const row of rows) {
    const g = groupOfRow.get(row.rowNumber)
    const decision = g ? (decisions[g.id] ?? 'merge') : 'create'
    let slot: Slot
    if (!g || decision === 'create') {
      slot = newSlot(`row:${row.rowNumber}`, row)
    } else if (decision === 'skip') {
      skipped.push({ rowNumber: row.rowNumber, reason: 'duplicate_skipped' })
      continue
    } else if (g.target.kind === 'known') {
      slot = knownSlot(g.target.companyId)
    } else {
      slot = slots.get(`row:${g.target.rowNumber}`) ?? newSlot(`row:${row.rowNumber}`, row)
    }
    // Les champs de la première ligne qui les renseigne l'emportent.
    for (const f of FILL_FIELDS)
      if (!slot.fields[f] && row.company[f]) slot.fields[f] = row.company[f]
    if (!slot.stand && row.company.stand) slot.stand = row.company.stand
    slot.rows.push(row)
  }

  const companies: CompanyWrite[] = []
  const eventCompanies: EventCompanyWrite[] = []
  const contacts: ContactWrite[] = []
  const eventContacts: EventContactWrite[] = []
  const warnings: PlanWarning[] = []
  const usedDomains = new Set(known.map((k) => k.domain).filter((d): d is string => !!d))
  const contactsByEmail = new Map<string, KnownContact>()
  const contactsByName = new Map<string, KnownContact>()
  for (const c of knownContacts) {
    if (c.email) contactsByEmail.set(c.email.toLowerCase(), c)
    if (c.companyId && (c.firstName || c.lastName)) {
      contactsByName.set(
        `${c.companyId}|${normalizeName(c.firstName ?? '')}|${normalizeName(c.lastName ?? '')}`,
        c,
      )
    }
  }
  let companiesMerged = 0
  let alreadyInEvent = 0
  let contactsLinked = 0

  for (const slot of slots.values()) {
    const rowNumbers = slot.rows.map((r) => r.rowNumber)
    let companyId = slot.companyId
    if (companyId === null) {
      companyId = newId()
      let domain = slot.fields.domain
      if (domain && usedDomains.has(domain)) {
        // L'index unique (équipe, domaine) interdit un second exemplaire : on garde le site, sans le domaine.
        warnings.push({ rowNumber: rowNumbers[0]!, code: 'domain_conflict' })
        domain = ''
      }
      if (domain) usedDomains.add(domain)
      companies.push({
        id: companyId,
        team_id: input.teamId,
        name: slot.name,
        name_normalized: slot.nameKey,
        domain: nul(domain),
        website: nul(slot.fields.website),
        industry: nul(slot.fields.industry),
        country: nul(slot.fields.country),
        city: nul(slot.fields.city),
        isNew: true,
        rowNumbers,
      })
    } else {
      companiesMerged++
      const k = knownById.get(companyId)!
      const patch: Partial<Record<(typeof FILL_FIELDS)[number], string>> = {}
      for (const f of FILL_FIELDS) {
        if (!k[f] && slot.fields[f]) {
          if (f === 'domain' && usedDomains.has(slot.fields.domain)) continue
          patch[f] = slot.fields[f]
        }
      }
      if (Object.keys(patch).length > 0) {
        if (patch.domain) usedDomains.add(patch.domain)
        companies.push({
          id: k.id,
          team_id: input.teamId,
          name: k.name,
          name_normalized: k.nameKey,
          domain: nul(patch.domain ?? k.domain),
          website: nul(patch.website ?? k.website),
          industry: nul(patch.industry ?? k.industry),
          country: nul(patch.country ?? k.country),
          city: nul(patch.city ?? k.city),
          isNew: false,
          rowNumbers,
        })
      }
    }

    if (eventCompanyIds.has(companyId)) alreadyInEvent++
    else {
      eventCompanies.push({
        id: newId(),
        team_id: input.teamId,
        event_id: input.eventId,
        company_id: companyId,
        stand_label: nul(slot.stand),
        import_batch_id: input.batchId,
        rowNumbers,
      })
    }

    const seen = new Set<string>()
    for (const row of slot.rows) {
      for (const w of row.warnings) warnings.push({ rowNumber: row.rowNumber, code: w })
      const c = row.contact
      if (!c) continue
      const key = personKey(c)
      if (seen.has(key)) continue
      seen.add(key)

      const existing =
        (c.email ? contactsByEmail.get(c.email) : undefined) ??
        contactsByName.get(
          `${companyId}|${normalizeName(c.firstName)}|${normalizeName(c.lastName)}`,
        )
      let contactId: string
      let contactCompany = companyId
      if (existing) {
        contactId = existing.id
        contactCompany = existing.companyId ?? companyId
        contactsLinked++
      } else {
        contactId = newId()
        contacts.push({
          id: contactId,
          team_id: input.teamId,
          company_id: companyId,
          first_name: nul(c.firstName),
          last_name: nul(c.lastName),
          job_title: nul(c.jobTitle),
          email: nul(c.email),
          phone: nul(c.phone),
          rowNumbers: [row.rowNumber],
        })
      }
      eventContacts.push({
        event_id: input.eventId,
        contact_id: contactId,
        company_id: contactCompany,
        team_id: input.teamId,
        expected: true,
        rowNumbers: [row.rowNumber],
      })
    }
  }

  const rowsImported = [...slots.values()].reduce((n, s) => n + s.rows.length, 0)
  return {
    batchId: input.batchId,
    companies,
    eventCompanies,
    contacts,
    eventContacts,
    skipped,
    warnings,
    stats: {
      rowsTotal: rows.length,
      rowsImported,
      companiesCreated: companies.filter((c) => c.isNew).length,
      companiesMerged,
      alreadyInEvent,
      contactsCreated: contacts.length,
      contactsLinked,
    },
  }
}
