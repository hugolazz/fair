import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanRows } from './clean'
import { findDuplicates } from './dedupe'
import { detectMapping } from './mapping'
import { buildTable, parseDelimited } from './parse'
import { buildPlan } from './plan'
import { counter, known, row } from './test-helpers'
import { normalizeLinkedin, normalizePriority } from './text'

describe('normalizePriority', () => {
  it('reconnaît A/B/C, 1/2/3 et haute/moyenne/basse', () => {
    expect(
      ['a', 'B', ' c ', '1', '2', '3', 'Haute', 'moyenne', 'Basse', 'High'].map(normalizePriority),
    ).toEqual(['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C', 'A'])
  })
  it('renvoie null pour le reste', () => {
    expect(['', '—', 'urgent', 'D'].map(normalizePriority)).toEqual([null, null, null, null])
  })
})

describe('normalizeLinkedin', () => {
  it('complète le schéma et nettoie la fin', () => {
    expect(normalizeLinkedin('linkedin.com/in/claire-dubois/')).toEqual({
      url: 'https://linkedin.com/in/claire-dubois',
      invalid: false,
    })
    expect(normalizeLinkedin('https://fr.linkedin.com/in/marc').url).toBe(
      'https://fr.linkedin.com/in/marc',
    )
  })
  it('refuse ce qui n’est pas un profil LinkedIn', () => {
    expect(normalizeLinkedin('pas de profil').invalid).toBe(true)
    expect(normalizeLinkedin('https://exemple.com/in/marc').invalid).toBe(true)
    expect(normalizeLinkedin('')).toEqual({ url: '', invalid: false })
  })
})

describe('fichier d’exemple enrichi', () => {
  const text = readFileSync(
    join(import.meta.dirname, '../../../../exemples/participants-50.csv'),
    'utf8',
  )
  const table = buildTable(parseDelimited(text), true)
  const mapping = detectMapping(table)
  const { rows } = cleanRows(table, mapping)

  it('détecte les colonnes priorité, type et LinkedIn', () => {
    const header = (f: keyof typeof mapping) => table.headers[mapping[f]!]
    expect(header('priority')).toBe('Priorité')
    expect(header('tag')).toBe('Type')
    expect(header('contactLinkedin')).toBe('LinkedIn')
    expect(header('companyName')).toBe('Société')
  })
  it('chaque entreprise a une priorité et un type, les contacts un LinkedIn', () => {
    const carrefour = rows.find((r) => r.company.name === 'Carrefour')!
    expect(carrefour.company.priority).toBe('A')
    expect(carrefour.company.tag).toBe('Client')
    expect(carrefour.contacts[0]?.linkedin).toBe('https://www.linkedin.com/in/claire-dubois')
    expect(rows.every((r) => r.company.priority !== null && r.company.tag !== '')).toBe(true)
  })
  it('signale un lien LinkedIn invalide sans rejeter la ligne', () => {
    const zalando = rows.find((r) => r.company.name === 'Zalando')!
    expect(zalando.warnings).toContain('invalid_linkedin')
    expect(zalando.contacts[0]?.linkedin).toBe('')
  })
  it('Mirakl et Criteo ont deux contacts dans la même ligne, alignés position par position', () => {
    const mirakl = rows.find((r) => r.company.name === 'Mirakl')!
    expect(mirakl.contacts).toHaveLength(2)
    expect(mirakl.contacts[1]).toMatchObject({
      lastName: 'Vidal',
      jobTitle: 'Responsable Partenariats',
      email: 'sonia.vidal@demo.example',
      linkedin: 'https://www.linkedin.com/in/sonia-vidal',
    })
    expect(rows.find((r) => r.company.name === 'Criteo')!.contacts).toHaveLength(2)
    expect(mirakl.warnings).toEqual([])
  })
})

describe('plan d’import enrichi', () => {
  const plan = (
    rows: ReturnType<typeof row>[],
    knownCompanies = [known('k1', 'Acme', { domain: 'acme.com' })],
  ) =>
    buildPlan({
      rows,
      groups: findDuplicates(rows, knownCompanies),
      decisions: {},
      known: knownCompanies,
      knownContacts: [],
      eventCompanyIds: new Set(),
      teamId: 't',
      eventId: 'e',
      batchId: 'b',
      newId: counter(),
    })

  it('porte la priorité sur le salon, la typologie sur l’entreprise et le LinkedIn sur le contact', () => {
    const p = plan([
      row(2, 'Nouvelle Co', {
        priority: 'A',
        tag: 'Client',
        first: 'Ada',
        last: 'Lovelace',
        linkedin: 'https://www.linkedin.com/in/ada',
      }),
    ])
    expect(p.eventCompanies[0]!.priority).toBe('A')
    expect(p.companyTags).toEqual([
      { company_id: p.companies[0]!.id, label: 'Client', kind: 'type', rowNumbers: [2] },
    ])
    expect(p.contacts[0]!.linkedin_url).toBe('https://www.linkedin.com/in/ada')
  })
  it('sur une société déjà connue, rattache la typologie à la société existante', () => {
    const p = plan([row(2, 'Acme', { domain: 'acme.com', priority: 'B', tag: 'Prospect' })])
    expect(p.companyTags).toEqual([
      { company_id: 'k1', label: 'Prospect', kind: 'type', rowNumbers: [2] },
    ])
    expect(p.eventCompanies[0]!.priority).toBe('B')
  })
  it('pose les salons de la ligne sur l’entreprise, une seule fois chacun', () => {
    const p = plan([
      row(2, 'Nouvelle Co', { shows: ['NRF 09/26', 'One to One Monaco (03/27)'], tag: 'Client' }),
      row(3, 'Nouvelle Co', { shows: ['nrf 09/26'] }), // même société (fusion dans le fichier), même salon
    ])
    const id = p.companies[0]!.id
    expect(p.companyTags.map((t) => [t.company_id, t.label, t.kind])).toEqual([
      [id, 'Client', 'type'],
      [id, 'NRF 09/26', 'show'],
      [id, 'One to One Monaco (03/27)', 'show'],
    ])
  })
  it('sans colonnes ajoutées, rien de plus n’est écrit', () => {
    const p = plan([row(2, 'Simple SA')])
    expect(p.companyTags).toEqual([])
    expect(p.eventCompanies[0]!.priority).toBeNull()
  })
})

describe('plusieurs contacts dans une même ligne', () => {
  const clean = (cells: string[], mapping: Record<string, number>) =>
    cleanRows(
      { headers: cells.map((_, i) => `c${i}`), rows: [cells], rowNumbers: [2] },
      { companyName: 0, ...mapping },
    ).rows[0]!

  it('sépare les contacts « ; » et aligne e-mail, poste et téléphone par position', () => {
    const r = clean(
      [
        'Acme',
        'Claire Dubois; Marc Lefèvre',
        'claire@acme.io; marc@acme.io',
        'Directrice; CTO',
        '0611111111; 0622222222',
      ],
      { contactName: 1, email: 2, jobTitle: 3, phone: 4 },
    )
    expect(r.contacts).toHaveLength(2)
    expect(r.contacts[0]).toMatchObject({
      firstName: 'Claire',
      email: 'claire@acme.io',
      jobTitle: 'Directrice',
    })
    expect(r.contacts[1]).toMatchObject({
      lastName: 'Lefèvre',
      email: 'marc@acme.io',
      phone: '0622222222',
    })
    expect(r.warnings).toEqual([])
  })

  it('sépare aussi sur un retour à la ligne dans la cellule', () => {
    const r = clean(['Acme', 'Claire Dubois\nMarc Lefèvre', 'claire@acme.io\nmarc@acme.io'], {
      contactName: 1,
      email: 2,
    })
    expect(r.contacts.map((c) => c.email)).toEqual(['claire@acme.io', 'marc@acme.io'])
  })

  it('signale un décalage entre le nombre de noms et d’e-mails', () => {
    const r = clean(
      ['Acme', 'Claire Dubois; Marc Lefèvre; Zoé Roy', 'claire@acme.io; marc@acme.io'],
      {
        contactName: 1,
        email: 2,
      },
    )
    expect(r.contacts).toHaveLength(3)
    expect(r.contacts[2]!.email).toBe('')
    expect(r.warnings).toContain('contacts_mismatch')
  })

  it('un seul contact : un poste avec « / » ou plusieurs e-mails ne crée pas de doublon', () => {
    const r = clean(
      [
        'Acme',
        'Claire Dubois',
        'claire@acme.io, c.dubois@acme.io',
        'Directrice Digital / Innovation',
      ],
      {
        contactName: 1,
        email: 2,
        jobTitle: 3,
      },
    )
    expect(r.contacts).toHaveLength(1)
    expect(r.contacts[0]).toMatchObject({
      email: 'claire@acme.io',
      jobTitle: 'Directrice Digital / Innovation',
    })
  })

  it('sans noms, chaque e-mail devient un contact', () => {
    const r = clean(['Acme', 'a@acme.io; b@acme.io'], { email: 1 })
    expect(r.contacts).toHaveLength(2)
  })

  it('le plan crée un contact par personne, rattaché à la même entreprise', () => {
    const rows = [
      {
        ...row(2, 'Acme'),
        contacts: [
          {
            firstName: 'A',
            lastName: 'B',
            jobTitle: '',
            email: 'a@acme.io',
            phone: '',
            linkedin: '',
          },
          {
            firstName: 'C',
            lastName: 'D',
            jobTitle: '',
            email: 'c@acme.io',
            phone: '',
            linkedin: '',
          },
        ],
      },
    ]
    const p = buildPlan({
      rows,
      groups: [],
      decisions: {},
      known: [],
      knownContacts: [],
      eventCompanyIds: new Set(),
      teamId: 't',
      eventId: 'e',
      batchId: 'b',
      newId: counter(),
    })
    expect(p.contacts).toHaveLength(2)
    expect(new Set(p.contacts.map((c) => c.company_id)).size).toBe(1)
    expect(p.eventContacts).toHaveLength(2)
  })
})

describe('aller-retour export → import', () => {
  it('le fichier exporté se réimporte tel quel : colonnes reconnues et valeurs identiques', async () => {
    const { buildSalonTable, cellText } = await import('@shared/exports/tables.ts')
    const { sampleData } = await import('../../../../tests/exports/fixtures')
    const data = sampleData()
    data.targets[0]!.history = 'Déjà contacté M. X le 19 janvier 2026.'
    const exported = buildSalonTable(data)
    const table = {
      headers: exported.columns.map((c) => c.label),
      rows: exported.rows.map((r) =>
        exported.columns.map((c) => cellText(r.cells[c.key] ?? null, c.kind)),
      ),
      rowNumbers: exported.rows.map((_, i) => i + 2),
    }

    const m = detectMapping(table)
    const at = (f: keyof typeof m) => table.headers[m[f]!]
    expect(at('companyName')).toBe('Société')
    expect(at('website')).toBe('Site web')
    expect(at('stand')).toBe('Stand')
    expect(at('industry')).toBe('Secteur')
    expect(at('country')).toBe('Pays')
    expect(at('city')).toBe('Ville')
    expect(at('priority')).toBe('Priorité')
    expect(at('tag')).toBe('Type')
    expect(at('contactName')).toBe('Contact')
    expect(at('jobTitle')).toBe('Fonction')
    expect(at('email')).toBe('E-mail')
    expect(at('phone')).toBe('Téléphone')
    expect(at('contactLinkedin')).toBe('LinkedIn')
    expect(at('comment')).toBe('Commentaire')

    // Les valeurs reviennent à l'identique une fois nettoyées (Carrefour, premier contact).
    const { rows } = cleanRows(table, m)
    const carrefour = rows.find((r) => r.company.name === 'Carrefour')!
    expect(carrefour.company).toMatchObject({
      domain: 'carrefour.com',
      stand: 'B12',
      priority: 'A',
      tag: 'Client',
      comment: 'Déjà contacté M. X le 19 janvier 2026.',
    })
    expect(carrefour.contacts[0]).toMatchObject({
      firstName: 'Jean',
      lastName: 'Martin',
      email: 'jean.martin@carrefour.com',
      jobTitle: 'Directeur innovation',
    })
  })
})

describe('historique de l’entreprise (colonne Commentaire)', () => {
  const text = readFileSync(
    join(import.meta.dirname, '../../../../exemples/participants-50.csv'),
    'utf8',
  )
  const table = buildTable(parseDelimited(text), true)
  const mapping = detectMapping(table)
  const { rows } = cleanRows(table, mapping)

  it('détecte la colonne Commentaire et lit le commentaire de chaque entreprise', () => {
    expect(table.headers[mapping.comment!]).toBe('Commentaire')
    const carrefour = rows.find((r) => r.company.name === 'Carrefour')!
    expect(carrefour.company.comment).toContain('19 janvier 2026')
    expect(rows.filter((r) => r.company.comment !== '').length).toBeGreaterThanOrEqual(10)
  })

  it('mergeHistory ajoute sans répéter ni écraser', async () => {
    const { mergeHistory } = await import('./plan')
    expect(mergeHistory(null, ' Premier contact ')).toBe('Premier contact')
    expect(mergeHistory('Premier contact', 'Relancé le 3 mars')).toBe(
      'Premier contact\nRelancé le 3 mars',
    )
    expect(mergeHistory('Premier contact\nRelancé le 3 mars', 'Relancé le 3 mars')).toBe(
      'Premier contact\nRelancé le 3 mars',
    )
    expect(mergeHistory('Déjà là', '')).toBe('Déjà là')
  })

  it('le plan stocke l’historique d’une nouvelle société et l’enrichit sur une société connue', () => {
    const create = buildPlan({
      rows: [row(2, 'Nouvelle Co', { comment: 'Contactée en janvier' })],
      groups: [],
      decisions: {},
      known: [],
      knownContacts: [],
      eventCompanyIds: new Set(),
      teamId: 't',
      eventId: 'e',
      batchId: 'b',
      newId: counter(),
    })
    expect(create.companies[0]!.history).toBe('Contactée en janvier')

    const k = known('k1', 'Acme', { domain: 'acme.com', history: 'Ancien historique' })
    const rowsAcme = [row(2, 'Acme', { domain: 'acme.com', comment: 'Nouvelle info' })]
    const merged = buildPlan({
      rows: rowsAcme,
      groups: findDuplicates(rowsAcme, [k]),
      decisions: {},
      known: [k],
      knownContacts: [],
      eventCompanyIds: new Set(),
      teamId: 't',
      eventId: 'e',
      batchId: 'b',
      newId: counter(),
    })
    expect(merged.companies[0]).toMatchObject({
      id: 'k1',
      isNew: false,
      history: 'Ancien historique\nNouvelle info',
    })
  })
})
