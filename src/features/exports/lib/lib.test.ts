import { describe, expect, it } from 'vitest'
import { BUILTIN_TEMPLATES, CUSTOM_TEMPLATE } from '@shared/exports/csv.ts'
import { COLUMNS } from '@shared/exports/tables.ts'
import { NO_FILTERS } from '@shared/exports/types.ts'
import { bigData, sampleData } from '../../../../tests/exports/fixtures'
import { SERVER_THRESHOLD, chooseMode, volume } from './mode'
import { allColumns, buildRequest, isValid, type FormState } from './request'
import {
  deleteCustomTemplate,
  loadCustomTemplates,
  newCustomTemplate,
  saveCustomTemplate,
  type Storage,
} from './templates'

function memoryStorage(initial?: string): Storage & { raw: () => string | null } {
  let v: string | null = initial ?? null
  return { getItem: () => v, setItem: (_k, val) => void (v = val), raw: () => v }
}

describe('où générer l’export', () => {
  it('volume = entreprises + contacts + rencontres + notes', () => {
    expect(volume(sampleData())).toBe(6 + 4 + 8 + 3)
  })

  it('« automatique » : local pour un petit salon, serveur au-delà du seuil', () => {
    expect(chooseMode('auto', sampleData())).toBe('local')
    const big = bigData()
    big.targets = Array.from({ length: SERVER_THRESHOLD + 1 }, (_, i) => ({
      ...big.targets[0]!,
      id: `t${i}`,
    }))
    expect(chooseMode('auto', big)).toBe('server')
  })

  it('le choix explicite de l’utilisateur l’emporte', () => {
    expect(chooseMode('server', sampleData())).toBe('server')
    expect(chooseMode('local', { ...bigData(), contacts: [] })).toBe('local')
  })
})

describe('demande d’export construite depuis le formulaire', () => {
  const base = (over: Partial<FormState> = {}): FormState => ({
    kind: 'xlsx',
    pdfKind: 'pdf-global',
    filters: NO_FILTERS,
    columns: allColumns(),
    template: BUILTIN_TEMPLATES[0]!,
    ...over,
  })

  it('Excel : toutes les colonnes cochées = pas de restriction envoyée', () => {
    expect(buildRequest(base())).toEqual({ kind: 'xlsx', filters: NO_FILTERS })
  })

  it('Excel : une sélection partielle est transmise', () => {
    const columns = { ...allColumns(), companies: ['name', 'priority'] }
    expect(buildRequest(base({ columns }))).toEqual({ kind: 'xlsx', filters: NO_FILTERS, columns })
  })

  it('CSV : le modèle choisi est transmis tel quel', () => {
    const r = buildRequest(base({ kind: 'csv', template: CUSTOM_TEMPLATE }))
    expect(r).toEqual({ kind: 'csv', filters: NO_FILTERS, template: CUSTOM_TEMPLATE })
  })

  it('PDF : le type de PDF et les filtres', () => {
    const filters = { ...NO_FILTERS, priorities: ['A' as const] }
    expect(buildRequest(base({ kind: 'pdf', pdfKind: 'pdf-reps', filters }))).toEqual({
      kind: 'pdf-reps',
      filters,
    })
  })

  it('validité : au moins une colonne Excel, au moins une colonne CSV', () => {
    expect(isValid(base())).toBe(true)
    expect(
      isValid(base({ columns: { companies: [], contacts: [], meetings: [], notes: [] } })),
    ).toBe(false)
    expect(
      isValid(base({ columns: { ...allColumns(), companies: [], contacts: [], meetings: [] } })),
    ).toBe(true)
    expect(isValid(base({ kind: 'csv', template: { ...CUSTOM_TEMPLATE, columns: [] } }))).toBe(
      false,
    )
    expect(isValid(base({ kind: 'pdf' }))).toBe(true)
  })

  it('allColumns couvre chaque onglet', () => {
    const all = allColumns()
    expect(all.companies).toHaveLength(COLUMNS.companies.length)
    expect(all.notes).toHaveLength(COLUMNS.notes.length)
  })
})

describe('modèles CSV personnalisés', () => {
  it('s’enregistrent, se relisent, se remplacent par identifiant et se suppriment', () => {
    const storage = memoryStorage()
    const a = { ...newCustomTemplate([]), name: 'Mon CRM' }
    expect(saveCustomTemplate(a, storage)).toHaveLength(1)
    const b = newCustomTemplate([a])
    expect(b.id).not.toBe(a.id)
    expect(b.name).toBe('Modèle 2')
    saveCustomTemplate(b, storage)
    expect(loadCustomTemplates(storage).map((t) => t.name)).toEqual(['Mon CRM', 'Modèle 2'])
    saveCustomTemplate({ ...a, name: 'Renommé' }, storage) // même id : remplacé
    expect(
      loadCustomTemplates(storage)
        .map((t) => t.name)
        .sort(),
    ).toEqual(['Modèle 2', 'Renommé'])
    expect(deleteCustomTemplate(a.id, storage).map((t) => t.name)).toEqual(['Modèle 2'])
  })

  it('une copie ne partage pas ses colonnes avec le modèle d’origine', () => {
    const t = newCustomTemplate([], BUILTIN_TEMPLATES[0]!)
    t.columns[0]!.header = 'X'
    expect(BUILTIN_TEMPLATES[0]!.columns[0]!.header).toBe('First Name')
    expect(t.columns.length).toBe(BUILTIN_TEMPLATES[0]!.columns.length)
    expect(t.columns.some((c) => c.map)).toBe(true) // les correspondances de valeurs sont conservées
  })

  it('un stockage corrompu ou invalide ne plante pas et n’efface pas les bons modèles', () => {
    expect(loadCustomTemplates(memoryStorage('pas du json'))).toEqual([])
    expect(loadCustomTemplates(memoryStorage('{"a":1}'))).toEqual([])
    const good = { ...CUSTOM_TEMPLATE, id: 'ok', name: 'OK' }
    const mixed = JSON.stringify([
      { id: 1 },
      good,
      { ...good, id: 'x', delimiter: '\t' },
      { ...good, id: 'y', columns: [] },
    ])
    expect(loadCustomTemplates(memoryStorage(mixed)).map((t) => t.id)).toEqual(['ok'])
  })

  it('un stockage indisponible ne fait pas échouer l’enregistrement', () => {
    const broken: Storage = {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('plein')
      },
    }
    expect(loadCustomTemplates(broken)).toEqual([])
    expect(() => saveCustomTemplate(CUSTOM_TEMPLATE, broken)).not.toThrow()
  })
})
