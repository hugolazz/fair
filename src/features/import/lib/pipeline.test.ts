import { describe, expect, it } from 'vitest'
import { fixture } from '../../../../tests/fixtures/load'
import { buildPlan } from './plan'
import { defaultDecisions } from './dedupe'
import { resolveMapping } from './mapping'
import { buildTable } from './parse'
import { handleRequest, type Analysis } from './runner'
import { counter, known } from './test-helpers'

/** Lecture → mapping → nettoyage/doublons : le chemin exact du Web Worker, sans le Worker. */
async function run(file: string, knownCompanies = [known('k0', 'Zzz')]) {
  const parsed = await handleRequest({
    id: 1,
    type: 'parse',
    input: { kind: 'file', name: file, buffer: fixture(file) },
  })
  if (!parsed.ok || parsed.type !== 'parsed') throw new Error('parse failed')
  const table = buildTable(parsed.grid, true)
  const { mapping } = resolveMapping(table)
  const res = await handleRequest({ id: 2, type: 'analyze', table, mapping, known: knownCompanies })
  if (!res.ok || res.type !== 'analyzed') throw new Error('analyze failed')
  return { table, analysis: res.analysis }
}

const plan = (a: Analysis, knownCompanies = [known('k0', 'Zzz')]) =>
  buildPlan({
    rows: a.rows,
    groups: a.groups,
    decisions: defaultDecisions(a.groups),
    known: knownCompanies,
    knownContacts: [],
    eventCompanyIds: new Set(),
    teamId: 't',
    eventId: 'e',
    batchId: 'b',
    newId: counter(),
  })

describe('import du CSV très sale', () => {
  it('produit des lignes propres, des erreurs numérotées et des doublons attendus', async () => {
    const { analysis } = await run('participants-sale.csv')
    expect(analysis.errors.map((e) => e.rowNumber)).toEqual([11, 19]) // sans société
    expect(analysis.removed).toEqual({ empty: 4, repeatedHeader: 1 }) // 3 vides + « Total », 1 titre répété

    const byRow = new Map(analysis.rows.map((r) => [r.rowNumber, r]))
    expect(byRow.get(2)!.company).toMatchObject({
      domain: 'carrefour.com',
      stand: 'B12',
      nameKey: 'carrefour',
    })
    expect(byRow.get(2)!.contacts[0]).toMatchObject({
      firstName: 'Jean',
      lastName: 'Martin',
      email: 'jean.martin@carrefour.com',
    })
    expect(byRow.get(8)!.company.stand).toBe('hall 5 - C21')
    expect(byRow.get(8)!.contacts[0]).toMatchObject({
      firstName: 'Claire',
      lastName: 'de la Roche',
      email: 'claire@dupont-fils.fr',
    })
    expect(byRow.get(9)!.warnings).toContain('invalid_email')

    const groups = analysis.groups.map((g) => [g.target.name, g.rowNumbers])
    expect(groups).toEqual([
      ['Carrefour SA', [4, 5]],
      ['Acme Inc.', [13]],
      ['Zalando', [15]],
      ["L'Oréal (France)", [18]],
    ])
  })

  it('fusionne en un plan cohérent : 9 sociétés, aucun doublon de domaine', async () => {
    const { analysis } = await run('participants-sale.csv')
    const p = plan(analysis)
    const domains = p.companies.map((c) => c.domain).filter(Boolean)
    expect(new Set(domains).size).toBe(domains.length)
    expect(p.stats.companiesCreated).toBe(9)
    expect(p.stats.rowsImported).toBe(analysis.rows.length)
    // Carrefour : 3 lignes, 2 contacts distincts ; Zalando : le même contact écrit deux fois → 1 seul.
    expect(p.contacts.filter((c) => c.email?.endsWith('@carrefour.com'))).toHaveLength(2)
    expect(p.contacts.filter((c) => c.email?.endsWith('@zalando.fr'))).toHaveLength(1)
  })

  it('rapproche avec les salons précédents : société connue réutilisée, pas recréée', async () => {
    const orange = known('known-orange', 'Orange SA', { domain: 'orange.fr' })
    const { analysis } = await run('participants-sale.csv', [orange])
    expect(analysis.groups.find((g) => g.id === 'known:known-orange')?.rowNumbers).toEqual([9])
    const p = plan(analysis, [orange])
    expect(p.companies.filter((c) => c.isNew && c.name_normalized === 'orange')).toHaveLength(0)
    expect(p.eventCompanies.some((e) => e.company_id === 'known-orange')).toBe(true)
  })
})

describe('autres formats', () => {
  it('xlsx : retire les lignes vides, rapporte l’erreur et fusionne Veepee', async () => {
    const { analysis } = await run('participants.xlsx')
    expect(analysis.errors.map((e) => e.rowNumber)).toEqual([9])
    expect(analysis.groups.map((g) => [g.target.name, g.rowNumbers])).toEqual([['Veepee', [8]]])
    expect(plan(analysis).stats.companiesCreated).toBe(3)
  })
  it('CSV Windows-1252 avec prénom/nom/téléphone', async () => {
    const { analysis } = await run('participants-excel-fr-windows1252.csv')
    expect(analysis.errors).toEqual([])
    expect(analysis.rows[0]!.contacts[0]).toMatchObject({
      firstName: 'Éloïse',
      lastName: 'Garcia',
      phone: '+33 6 12 34 56 78',
    })
  })
})

describe('gros fichier (5 000 lignes)', () => {
  it('se traite entièrement, vite, sans doublon de domaine dans le plan', async () => {
    const t0 = performance.now()
    const { analysis, table } = await run('participants-5000.csv')
    const p = plan(analysis)
    const ms = performance.now() - t0

    expect(table.rows.length).toBeGreaterThanOrEqual(5000)
    expect(analysis.rows.length + analysis.errors.length + analysis.removed.empty).toBe(
      table.rows.length,
    )
    expect(analysis.groups.length).toBeGreaterThan(100) // ~800 lignes répètent une société déjà vue
    const domains = p.companies.map((c) => c.domain).filter(Boolean)
    expect(new Set(domains).size).toBe(domains.length)
    expect(p.stats.rowsImported + p.skipped.length).toBe(analysis.rows.length)
    // Garde-fou large : ce traitement est linéaire (quelques centaines de ms ici).
    expect(ms).toBeLessThan(5000)
  })
})
