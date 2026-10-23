import { describe, expect, it } from 'vitest'
import {
  clampScale,
  DEFAULT_PREFS,
  gridTemplate,
  isDefaultPrefs,
  normalizePrefs,
  setScale,
  tableMinWidth,
  toggleColumn,
  visibleColumns,
} from './columns'

describe('colonnes du tableau des participants', () => {
  it('par défaut : toutes les colonnes, avec les largeurs d’origine du tableau', () => {
    expect(visibleColumns(DEFAULT_PREFS)).toEqual([
      'priority',
      'company',
      'stand',
      'tags',
      'shows',
      'assignees',
      'meeting',
    ])
    expect(gridTemplate(DEFAULT_PREFS)).toBe(
      '2.75rem 3rem minmax(12rem,2.4fr) 4.5rem minmax(7rem,1.4fr) minmax(9rem,1.8fr) minmax(6rem,1fr) 8rem',
    )
    expect(tableMinWidth(DEFAULT_PREFS)).toBe('46rem') // comme avant
    expect(isDefaultPrefs(DEFAULT_PREFS)).toBe(true)
  })

  it('masquer une colonne la retire du tableau et de la grille', () => {
    const prefs = toggleColumn(toggleColumn(DEFAULT_PREFS, 'stand', false), 'meeting', false)
    expect(visibleColumns(prefs)).toEqual(['priority', 'company', 'tags', 'shows', 'assignees'])
    expect(gridTemplate(prefs).split(' ')).toHaveLength(6) // la case de sélection + 5 colonnes
    expect(isDefaultPrefs(prefs)).toBe(false)
    // La remettre rétablit l'ordre d'origine.
    expect(visibleColumns(toggleColumn(prefs, 'stand', true))).toEqual([
      'priority',
      'company',
      'stand',
      'tags',
      'shows',
      'assignees',
    ])
  })

  it('« Entreprise » reste toujours affichée', () => {
    expect(toggleColumn(DEFAULT_PREFS, 'company', false)).toBe(DEFAULT_PREFS)
    expect(normalizePrefs({ hidden: ['company', 'stand'] }).hidden).toEqual(['stand'])
  })

  it('la largeur se règle en % de la largeur d’origine, par pas de 10, entre 50 et 250', () => {
    expect(clampScale(10)).toBe(50)
    expect(clampScale(999)).toBe(250)
    expect(clampScale(137)).toBe(140)
    const wide = setScale(DEFAULT_PREFS, 'stand', 200)
    expect(gridTemplate(wide).split(' ')[3]).toBe('9rem') // 4,5 rem × 2
    const flex = setScale(DEFAULT_PREFS, 'company', 150)
    expect(gridTemplate(flex)).toContain('minmax(18rem,3.6fr)') // 12 rem et 2,4 fr × 1,5
    expect(tableMinWidth(wide)).toBe('56.75rem') // somme des minimums des colonnes visibles
    // Revenir à 100 % retire le réglage.
    expect(isDefaultPrefs(setScale(wide, 'stand', 100))).toBe(true)
  })

  it('un réglage mémorisé ancien, incomplet ou altéré est nettoyé', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs('x')).toEqual(DEFAULT_PREFS)
    expect(
      normalizePrefs({
        hidden: ['stand', 'stand', 'inconnue', 42],
        scale: { tags: 400, shows: 'large', fly: 120, meeting: 100, stand: 12 },
      }),
    ).toEqual({ hidden: ['stand'], scale: { tags: 250, stand: 50 } })
  })
})
