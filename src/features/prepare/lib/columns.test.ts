import { describe, expect, it } from 'vitest'
import {
  clampWidth,
  DEFAULT_PREFS,
  dropTarget,
  gridTemplate,
  isDefaultPrefs,
  minWidthOf,
  moveColumn,
  normalizePrefs,
  setWidth,
  shiftColumn,
  tableMinWidth,
  toggleColumn,
  visibleColumns,
  WIDTH_MAX,
  WIDTH_MIN,
} from './columns'

describe('colonnes du tableau des participants', () => {
  it('par défaut : toutes les colonnes, dans l’ordre et aux largeurs d’origine du tableau', () => {
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
      '44px 3rem minmax(12rem,2.4fr) 4.5rem minmax(7rem,1.4fr) minmax(9rem,1.8fr) minmax(6rem,1fr) 8rem',
    )
    expect(tableMinWidth(DEFAULT_PREFS)).toBe('46rem') // comme avant
    expect(isDefaultPrefs(DEFAULT_PREFS)).toBe(true)
  })

  it('masquer une colonne la retire du tableau et de la grille, la remettre rétablit sa place', () => {
    const prefs = toggleColumn(toggleColumn(DEFAULT_PREFS, 'stand', false), 'meeting', false)
    expect(visibleColumns(prefs)).toEqual(['priority', 'company', 'tags', 'shows', 'assignees'])
    expect(gridTemplate(prefs).split(' ')).toHaveLength(6) // la case de sélection + 5 colonnes
    expect(isDefaultPrefs(prefs)).toBe(false)
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

  it('la largeur se règle en pixels, seule la colonne tirée change ; les autres gardent leur largeur d’origine', () => {
    const wide = setWidth(DEFAULT_PREFS, 'stand', 200)
    expect(gridTemplate(wide).split(' ')[3]).toBe('200px')
    expect(gridTemplate(wide)).toContain('minmax(12rem,2.4fr)') // « Entreprise » inchangée
    expect(isDefaultPrefs(wide)).toBe(false)
    // Une largeur hors bornes est ramenée dans les bornes.
    expect(clampWidth(3)).toBe(WIDTH_MIN)
    expect(clampWidth(99999)).toBe(WIDTH_MAX)
    expect(setWidth(DEFAULT_PREFS, 'tags', 1).widths.tags).toBe(WIDTH_MIN)
    // `null` rend la largeur d'origine (double-clic sur le bord).
    expect(isDefaultPrefs(setWidth(wide, 'stand', null))).toBe(true)
  })

  it('largeur minimale du tableau : la somme des largeurs réglées ou des minimums des colonnes visibles', () => {
    const prefs = setWidth(toggleColumn(DEFAULT_PREFS, 'meeting', false), 'company', 400)
    const expected =
      44 +
      minWidthOf('priority') +
      400 +
      minWidthOf('stand') +
      minWidthOf('tags') +
      minWidthOf('shows') +
      minWidthOf('assignees')
    expect(tableMinWidth(prefs)).toBe(`${expected / 16}rem`)
  })

  it('changer une colonne de place : avant une autre, ou en dernier', () => {
    const toFront = moveColumn(DEFAULT_PREFS, 'assignees', 'company')
    expect(visibleColumns(toFront)).toEqual([
      'priority',
      'assignees',
      'company',
      'stand',
      'tags',
      'shows',
      'meeting',
    ])
    expect(gridTemplate(toFront).split(' ')[2]).toBe('minmax(6rem,1fr)') // la grille suit l'ordre
    expect(visibleColumns(moveColumn(DEFAULT_PREFS, 'priority', null)).at(-1)).toBe('priority')
    // Déposer une colonne à sa place ne change rien.
    expect(moveColumn(DEFAULT_PREFS, 'stand', 'stand')).toBe(DEFAULT_PREFS)
    expect(moveColumn(DEFAULT_PREFS, 'stand', 'tags')).toBe(DEFAULT_PREFS) // déjà juste avant « Tags »
    expect(isDefaultPrefs(toFront)).toBe(false)
  })

  it('décaler d’un cran (boutons du menu, clavier) ; sans effet aux extrémités', () => {
    expect(visibleColumns(shiftColumn(DEFAULT_PREFS, 'stand', -1)).slice(0, 3)).toEqual([
      'priority',
      'stand',
      'company',
    ])
    expect(shiftColumn(DEFAULT_PREFS, 'priority', -1)).toBe(DEFAULT_PREFS)
    expect(shiftColumn(DEFAULT_PREFS, 'meeting', 1)).toBe(DEFAULT_PREFS)
  })

  it('une colonne masquée garde sa place dans l’ordre', () => {
    const hidden = toggleColumn(shiftColumn(DEFAULT_PREFS, 'stand', -1), 'stand', false)
    expect(visibleColumns(hidden)).toEqual([
      'priority',
      'company',
      'tags',
      'shows',
      'assignees',
      'meeting',
    ])
    expect(visibleColumns(toggleColumn(hidden, 'stand', true)).slice(0, 3)).toEqual([
      'priority',
      'stand',
      'company',
    ])
  })

  it('où déposer une colonne glissée : avant celle dont le milieu n’est pas encore dépassé', () => {
    const rects = [
      { key: 'priority' as const, left: 0, width: 100 },
      { key: 'company' as const, left: 100, width: 200 },
      { key: 'stand' as const, left: 300, width: 100 },
    ]
    expect(dropTarget(rects, 20)).toBe('priority')
    expect(dropTarget(rects, 120)).toBe('company')
    expect(dropTarget(rects, 250)).toBe('stand') // au-delà du milieu de « Entreprise » (200), avant « Stand »
    expect(dropTarget(rects, 390)).toBeNull() // au-delà du milieu de la dernière : à la fin
  })

  it('un réglage mémorisé ancien, incomplet ou altéré est nettoyé', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs('x')).toEqual(DEFAULT_PREFS)
    // Ancien format (curseurs en %) : ignoré ; ordre partiel complété ; doublons et clés inconnues retirés.
    expect(
      normalizePrefs({
        hidden: ['stand', 'stand', 'inconnue', 42],
        order: ['tags', 'tags', 'fly', 'company'],
        scale: { tags: 150 },
        widths: { shows: 5000, tags: 'large', meeting: 120, fly: 10 },
      }),
    ).toEqual({
      hidden: ['stand'],
      order: ['tags', 'company', 'priority', 'stand', 'shows', 'assignees', 'meeting'],
      widths: { shows: WIDTH_MAX, meeting: 120 },
    })
  })
})
