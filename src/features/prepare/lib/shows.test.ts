import { describe, expect, it } from 'vitest'
import { SHOW_COLORS, showColorFor, type Tag } from '@/db/schemas/prepare'
import { showAbbrev, showPillText, showShortName, showsOf, showTiming } from './shows'

const today = new Date(2026, 9, 21) // 21 octobre 2026

describe('showTiming', () => {
  it('lit le mois et l’année du libellé : passé, ou à venir', () => {
    expect(showTiming('NRF 09/26', today)).toBe('past')
    expect(showTiming('Tech For Retail 03/26', today)).toBe('past')
    expect(showTiming('One to One Monaco (03/27)', today)).toBe('upcoming')
    expect(showTiming('Retail 01/2027', today)).toBe('upcoming')
  })

  it('le mois en cours compte comme à venir (le salon n’est pas fini)', () => {
    expect(showTiming('Salon 10/26', today)).toBe('upcoming')
    expect(showTiming('Salon 09/26', today)).toBe('past')
  })

  it('lit aussi une date complète', () => {
    expect(showTiming('Forum 12/05/2027', today)).toBe('upcoming')
    expect(showTiming('Forum 20/10/2026', today)).toBe('past')
    expect(showTiming('Forum 21/10/2026', today)).toBe('upcoming')
  })

  it('rend null sans date lisible dans le nom', () => {
    expect(showTiming('NRF', today)).toBeNull()
    expect(showTiming('Salon 99/26', today)).toBeNull() // mois invalide
    expect(showTiming('Salon 2026', today)).toBeNull()
  })
})

describe('showShortName', () => {
  it('retire la date du nom', () => {
    expect(showShortName('NRF 09/26')).toBe('NRF')
    expect(showShortName(' One to One Monaco (03/27)')).toBe('One to One Monaco')
    expect(showShortName('Forum 12/05/2027')).toBe('Forum')
  })

  it('garde le libellé s’il ne reste rien', () => {
    expect(showShortName('09/26')).toBe('09/26')
    expect(showShortName('NRF')).toBe('NRF')
  })
})

describe('showColorFor', () => {
  it('est stable (mêmes couleurs partout), insensible à la casse et aux accents', () => {
    expect(showColorFor('NRF 09/26')).toBe(showColorFor('nrf 09/26'))
    expect(showColorFor('Salon Été 26')).toBe(showColorFor('salon ete 26'))
    expect(SHOW_COLORS).toContain(showColorFor('Autre salon'))
  })
})

describe('showsOf', () => {
  const tag = (id: string, label: string): Tag => ({
    id,
    label,
    color: '#000000',
    kind: 'show',
    abbrev: null,
  })
  const shows = [tag('a', 'One to One Monaco (03/27)'), tag('b', 'NRF 09/26'), tag('c', 'Alpha')]

  it('ne garde que les salons de l’entreprise, du plus ancien au plus récent, sans date en dernier', () => {
    expect(showsOf(['a', 'b', 'c', 'x'], shows).map((s) => s.id)).toEqual(['b', 'a', 'c'])
    expect(showsOf(['x'], shows)).toEqual([])
  })
})

describe('showAbbrev', () => {
  it('abrège les noms à plusieurs mots en initiales', () => {
    expect(showAbbrev('Tech For Retail 03/26')).toBe('TFR')
    expect(showAbbrev('One to One Monaco (03/27)')).toBe('OOM')
    expect(showAbbrev("Retail's Big Show 01/27")).toBe('RBS')
    expect(showAbbrev('All4Customer Cannes')).toBe('AC')
  })

  it('garde les noms d’un seul mot tels quels', () => {
    expect(showAbbrev('NRF 09/26')).toBe('NRF')
    expect(showAbbrev('Paris')).toBe('Paris')
  })

  it('garde le nom (sans date) quand il ne resterait pas deux lettres', () => {
    expect(showAbbrev('Salon passé 09/20')).toBe('Salon passé')
    expect(showAbbrev('salon de paris')).toBe('salon de paris')
  })

  it('plafonne à quatre lettres', () => {
    expect(showAbbrev('Alpha Beta Gamma Delta Epsilon')).toBe('ABGD')
  })
})

describe('showPillText', () => {
  it('l’abréviation choisie l’emporte, sinon l’abréviation automatique', () => {
    const base = { label: 'Tech For Retail 03/26' }
    expect(showPillText({ ...base, abbrev: null })).toBe('TFR')
    expect(showPillText({ ...base, abbrev: 'TFR26' })).toBe('TFR26')
    expect(showPillText({ ...base, abbrev: '  ' })).toBe('TFR') // vide : retour à l’automatique
  })
})
