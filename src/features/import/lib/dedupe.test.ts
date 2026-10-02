import { describe, expect, it } from 'vitest'
import { defaultDecisions, findDuplicates } from './dedupe'
import { known, row } from './test-helpers'

describe('findDuplicates — dans le fichier', () => {
  it('regroupe par domaine, même si les noms diffèrent', () => {
    const g = findDuplicates(
      [
        row(2, "L'Oréal (France)", { domain: 'loreal.com' }),
        row(3, 'LOREAL', { domain: 'loreal.com' }),
      ],
      [],
    )
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({
      id: 'file:2',
      rowNumbers: [3],
      reason: 'domain',
      target: { kind: 'file', rowNumber: 2 },
    })
  })

  it('regroupe par nom normalisé quand un des domaines manque', () => {
    const g = findDuplicates(
      [row(2, 'Acme Inc.'), row(3, 'ACME', { domain: 'acme.io' }), row(4, 'acme sas')],
      [],
    )
    expect(g).toHaveLength(1)
    expect(g[0]!.rowNumbers).toEqual([3, 4])
    expect(g[0]!.reason).toBe('name')
  })

  it('ne confond pas deux sociétés de même nom mais de domaines différents', () => {
    const g = findDuplicates(
      [row(2, 'Orange', { domain: 'orange.fr' }), row(3, 'Orange', { domain: 'orange.com' })],
      [],
    )
    expect(g).toEqual([])
  })

  it('regroupe plusieurs lignes d’une même société (un contact par ligne)', () => {
    const g = findDuplicates(
      [
        row(2, 'Carrefour SA', { domain: 'carrefour.com' }),
        row(3, 'Carrefour', { domain: 'carrefour.com' }),
        row(4, 'CARREFOUR Group'),
      ],
      [],
    )
    expect(g).toHaveLength(1)
    expect(g[0]!.rowNumbers).toEqual([3, 4])
  })

  it('ne signale rien quand tout est distinct', () => {
    expect(findDuplicates([row(2, 'A'), row(3, 'B'), row(4, 'C')], [])).toEqual([])
  })
})

describe('findDuplicates — rapprochement avec les sociétés connues', () => {
  const orange = known('k1', 'Orange SA', { domain: 'orange.fr' })

  it('rapproche par domaine', () => {
    const g = findDuplicates([row(2, 'Orange Business', { domain: 'orange.fr' })], [orange])
    expect(g[0]).toMatchObject({
      id: 'known:k1',
      reason: 'domain',
      target: { kind: 'known', companyId: 'k1', name: 'Orange SA' },
    })
  })

  it('rapproche par nom normalisé quand le fichier n’a pas de domaine', () => {
    const g = findDuplicates([row(2, 'ORANGE')], [orange])
    expect(g[0]).toMatchObject({ id: 'known:k1', reason: 'name' })
  })

  it('ne rapproche pas des domaines contradictoires malgré un nom identique', () => {
    expect(findDuplicates([row(2, 'Orange', { domain: 'orange.com' })], [orange])).toEqual([])
  })

  it('regroupe toutes les lignes d’une société connue dans un seul groupe', () => {
    const g = findDuplicates(
      [row(2, 'Orange'), row(3, 'Orange SA', { domain: 'orange.fr' })],
      [orange],
    )
    expect(g).toHaveLength(1)
    expect(g[0]!.rowNumbers).toEqual([2, 3])
  })

  it('privilégie le domaine au nom', () => {
    const other = known('k2', 'Orange', { domain: 'orange.com' })
    const g = findDuplicates([row(2, 'Orange', { domain: 'orange.fr' })], [other, orange])
    expect(g[0]!.id).toBe('known:k1')
  })
})

describe('defaultDecisions', () => {
  it('fusionne par défaut', () => {
    const g = findDuplicates([row(2, 'A'), row(3, 'A')], [])
    expect(defaultDecisions(g)).toEqual({ 'file:2': 'merge' })
  })
})
