import { describe, expect, it } from 'vitest'
import type { Decision, KnownContact } from '@/db/schemas/import'
import { findDuplicates } from './dedupe'
import { buildPlan } from './plan'
import { counter, known, row } from './test-helpers'
import type { CleanRow, KnownCompany } from '@/db/schemas/import'

function plan(
  rows: CleanRow[],
  opts: {
    knownCompanies?: KnownCompany[]
    knownContacts?: KnownContact[]
    inEvent?: string[]
    decision?: Decision
    decisions?: Record<string, Decision>
  } = {},
) {
  const knownCompanies = opts.knownCompanies ?? []
  const groups = findDuplicates(rows, knownCompanies)
  const decisions =
    opts.decisions ?? Object.fromEntries(groups.map((g) => [g.id, opts.decision ?? 'merge']))
  return buildPlan({
    rows,
    groups,
    decisions,
    known: knownCompanies,
    knownContacts: opts.knownContacts ?? [],
    eventCompanyIds: new Set(opts.inEvent ?? []),
    teamId: 'team',
    eventId: 'event',
    batchId: 'batch',
    newId: counter(),
  })
}

describe('buildPlan — sociétés nouvelles', () => {
  it('crée société, participation au salon et contact', () => {
    const p = plan([
      row(2, 'Acme', {
        domain: 'acme.io',
        stand: 'A1',
        first: 'Alice',
        last: 'Roy',
        email: 'alice@acme.io',
      }),
    ])
    expect(p.companies).toHaveLength(1)
    expect(p.companies[0]).toMatchObject({
      isNew: true,
      name: 'Acme',
      name_normalized: 'acme',
      domain: 'acme.io',
      team_id: 'team',
    })
    expect(p.eventCompanies).toMatchObject([
      {
        company_id: p.companies[0]!.id,
        stand_label: 'A1',
        event_id: 'event',
        import_batch_id: 'batch',
      },
    ])
    expect(p.contacts).toMatchObject([
      { company_id: p.companies[0]!.id, email: 'alice@acme.io', first_name: 'Alice' },
    ])
    expect(p.eventContacts).toMatchObject([{ contact_id: p.contacts[0]!.id, expected: true }])
    expect(p.stats).toMatchObject({ companiesCreated: 1, contactsCreated: 1, rowsImported: 1 })
  })
})

describe('buildPlan — doublons dans le fichier', () => {
  const rows = [
    row(2, 'Carrefour SA', {
      domain: 'carrefour.com',
      stand: 'B12',
      email: 'a@carrefour.com',
      first: 'A',
      last: 'A',
    }),
    row(3, 'Carrefour', {
      domain: 'carrefour.com',
      email: 'b@carrefour.com',
      first: 'B',
      last: 'B',
      industry: 'Retail',
    }),
    row(4, 'CARREFOUR Group', { email: 'a@carrefour.com', first: 'A', last: 'A' }),
  ]

  it('fusionner : une seule société, contacts distincts conservés, champs vides complétés', () => {
    const p = plan(rows, { decision: 'merge' })
    expect(p.companies).toHaveLength(1)
    expect(p.companies[0]!.industry).toBe('Retail')
    expect(p.eventCompanies).toHaveLength(1)
    expect(p.contacts.map((c) => c.email)).toEqual(['a@carrefour.com', 'b@carrefour.com'])
    expect(p.stats.rowsImported).toBe(3)
  })

  it('ignorer : seule la première ligne est importée, les doublons sont comptés', () => {
    const p = plan(rows, { decision: 'skip' })
    expect(p.companies).toHaveLength(1)
    expect(p.contacts.map((c) => c.email)).toEqual(['a@carrefour.com'])
    expect(p.skipped).toEqual([
      { rowNumber: 3, reason: 'duplicate_skipped' },
      { rowNumber: 4, reason: 'duplicate_skipped' },
    ])
    expect(p.stats.rowsImported).toBe(1)
  })

  it('créer : chaque ligne devient une société distincte, sans violer l’unicité du domaine', () => {
    const p = plan(rows, { decision: 'create' })
    expect(p.companies).toHaveLength(3)
    expect(p.companies.filter((c) => c.domain === 'carrefour.com')).toHaveLength(1)
    expect(p.warnings.filter((w) => w.code === 'domain_conflict')).toHaveLength(1)
    expect(p.eventCompanies).toHaveLength(3)
  })
})

describe('buildPlan — rapprochement avec une société connue', () => {
  const orange = known('k1', 'Orange SA', { domain: 'orange.fr', city: 'Paris' })

  it('fusionner : réutilise la société, complète seulement les champs vides, ne crée pas de doublon', () => {
    const p = plan(
      [
        row(2, 'Orange', {
          domain: 'orange.fr',
          website: 'https://orange.fr/pro',
          industry: 'Télécom',
          stand: 'D07',
        }),
      ],
      { knownCompanies: [orange] },
    )
    expect(p.companies).toHaveLength(1)
    expect(p.companies[0]).toMatchObject({
      id: 'k1',
      isNew: false,
      name: 'Orange SA',
      industry: 'Télécom',
      website: 'https://orange.fr/pro',
      city: 'Paris',
    })
    expect(p.eventCompanies).toMatchObject([{ company_id: 'k1', stand_label: 'D07' }])
    expect(p.stats).toMatchObject({ companiesCreated: 0, companiesMerged: 1 })
  })

  it('n’écrase jamais une valeur existante', () => {
    const p = plan([row(2, 'Orange', { domain: 'orange.fr', industry: 'X' })], {
      knownCompanies: [known('k1', 'Orange', { domain: 'orange.fr', industry: 'Télécom' })],
    })
    // Seul le champ vide (site) est complété ; le secteur existant est conservé.
    expect(p.companies).toMatchObject([
      { id: 'k1', industry: 'Télécom', website: 'https://orange.fr' },
    ])
    expect(p.eventCompanies).toHaveLength(1)
  })

  it('ignorer : rien n’est écrit', () => {
    const p = plan([row(2, 'Orange', { domain: 'orange.fr' })], {
      knownCompanies: [orange],
      decision: 'skip',
    })
    expect(p.companies).toHaveLength(0)
    expect(p.eventCompanies).toHaveLength(0)
    expect(p.skipped).toHaveLength(1)
  })

  it('créer : ajoute une nouvelle société à côté de la connue (domaine non dupliqué)', () => {
    const p = plan([row(2, 'Orange', { domain: 'orange.fr' })], {
      knownCompanies: [orange],
      decision: 'create',
    })
    expect(p.companies).toMatchObject([{ isNew: true, domain: null }])
    expect(p.warnings).toEqual([{ rowNumber: 2, code: 'domain_conflict' }])
  })

  it('ne rattache pas deux fois au salon une société déjà présente', () => {
    const p = plan([row(2, 'Orange', { domain: 'orange.fr' })], {
      knownCompanies: [orange],
      inEvent: ['k1'],
    })
    expect(p.eventCompanies).toHaveLength(0)
    expect(p.stats.alreadyInEvent).toBe(1)
  })
})

describe('buildPlan — contacts', () => {
  it('rattache un contact déjà connu (même e-mail) au salon sans le dupliquer', () => {
    const existing: KnownContact = {
      id: 'c1',
      companyId: 'k1',
      email: 'jean@orange.fr',
      firstName: 'Jean',
      lastName: 'Martin',
    }
    const p = plan(
      [
        row(2, 'Orange', {
          domain: 'orange.fr',
          email: 'jean@orange.fr',
          first: 'Jean',
          last: 'Martin',
        }),
      ],
      {
        knownCompanies: [known('k1', 'Orange', { domain: 'orange.fr' })],
        knownContacts: [existing],
      },
    )
    expect(p.contacts).toHaveLength(0)
    expect(p.eventContacts).toMatchObject([{ contact_id: 'c1', company_id: 'k1' }])
    expect(p.stats.contactsLinked).toBe(1)
  })

  it('reconnaît un contact connu par son nom (casse et accents ignorés) quand il n’a pas d’e-mail', () => {
    const existing: KnownContact = {
      id: 'c1',
      companyId: 'k1',
      email: null,
      firstName: 'Léa',
      lastName: 'Bernard',
    }
    const p = plan([row(2, 'Orange', { domain: 'orange.fr', first: 'LEA', last: 'bernard' })], {
      knownCompanies: [known('k1', 'Orange', { domain: 'orange.fr' })],
      knownContacts: [existing],
    })
    expect(p.contacts).toHaveLength(0)
    expect(p.stats.contactsLinked).toBe(1)
  })

  it('dédoublonne un même contact répété dans une société', () => {
    const p = plan(
      [
        row(2, 'Acme', { first: 'A', last: 'B', email: 'a@acme.io' }),
        row(3, 'Acme', { first: 'A', last: 'B', email: 'A@ACME.io' }),
      ].map((r, i) =>
        i === 1 ? { ...r, contacts: [{ ...r.contacts[0]!, email: 'a@acme.io' }] } : r,
      ),
    )
    expect(p.contacts).toHaveLength(1)
  })
})
