import { describe, expect, it } from 'vitest'
import {
  cleanCell,
  normalizeEmail,
  normalizeName,
  normalizeStand,
  normalizeUrl,
  splitFullName,
} from './text'

describe('cleanCell', () => {
  it('supprime espaces insécables, caractères invisibles et espaces multiples', () => {
    expect(cleanCell(`  Orange\u00A0 \u200BTelecom \t `)).toBe('Orange Telecom')
  })
  it('neutralise les valeurs vides déguisées', () => {
    for (const v of ['N/A', 'n/a', '-', '--', 'null', '#N/A', 'néant', '  ', null, undefined]) {
      expect(cleanCell(v)).toBe('')
    }
  })
  it('convertit les nombres', () => {
    expect(cleanCell(12)).toBe('12')
  })
})

describe('normalizeName', () => {
  it('ignore casse, accents, ponctuation, forme juridique et « groupe »', () => {
    const keys = ['Carrefour SA', 'CARREFOUR', 'Carrefour Group', ' carrefour  S.A. '].map(
      normalizeName,
    )
    expect(new Set(keys)).toEqual(new Set(['carrefour']))
  })
  it('rapproche les écritures avec apostrophe et parenthèses', () => {
    expect(normalizeName("L'Oréal (France)")).toBe(normalizeName('LOREAL'))
  })
  it('reconnaît les formes à points (N.V., S.A.S.)', () => {
    expect(normalizeName('Adyen N.V.')).toBe('adyen')
    expect(normalizeName('Dupont S.A.S.')).toBe('dupont')
  })
  it('ne réduit jamais un nom à rien', () => {
    expect(normalizeName('SA')).toBe('sa')
    expect(normalizeName('Group')).toBe('group')
  })
  it('distingue des sociétés différentes', () => {
    expect(normalizeName('Orange')).not.toBe(normalizeName('Orange Bank'))
  })
})

describe('normalizeUrl', () => {
  it.each([
    ['WWW.Acme.com', 'https://acme.com', 'acme.com'],
    ['acme.com/', 'https://acme.com', 'acme.com'],
    ['http://www.acme.com/fr/?utm_source=x#top', 'https://acme.com/fr', 'acme.com'],
    ['<https://acme.com>', 'https://acme.com', 'acme.com'],
    ['  https://Shop.Acme.FR/Catalogue/  ', 'https://shop.acme.fr/Catalogue', 'shop.acme.fr'],
    ['acme.com, autre.com', 'https://acme.com', 'acme.com'],
  ])('normalise %j', (raw, website, domain) => {
    expect(normalizeUrl(raw)).toEqual({ website, domain, invalid: false })
  })
  it('traite les réseaux sociaux comme sans domaine (pas de faux rapprochement)', () => {
    const r = normalizeUrl('https://www.linkedin.com/company/acme')
    expect(r.domain).toBe('')
    expect(r.website).toBe('https://linkedin.com/company/acme')
  })
  it.each(['pas de site', 'contact@acme.io', 'http://', 'localhost', 'acme.c'])(
    'signale %j comme invalide',
    (raw) => {
      expect(normalizeUrl(raw)).toEqual({ website: '', domain: '', invalid: true })
    },
  )
  it('laisse une cellule vide sans erreur', () => {
    expect(normalizeUrl('N/A')).toEqual({ website: '', domain: '', invalid: false })
  })
})

describe('normalizeEmail', () => {
  it.each([
    ['Jean.Martin@Carrefour.com', 'jean.martin@carrefour.com'],
    ['Jean-Pierre Dupont <JP.Dupont@fnacdarty.com>', 'jp.dupont@fnacdarty.com'],
    ['mailto:claire@dupont-fils.fr', 'claire@dupont-fils.fr'],
    ['a@b.com; c@d.com', 'a@b.com'],
    [' "bob@acme.io" ', 'bob@acme.io'],
  ])('extrait %j', (raw, email) => {
    expect(normalizeEmail(raw)).toEqual({ email, invalid: false })
  })
  it.each(['jean@orange', 'pas un mail', 'a@b', '@acme.com'])('rejette %j', (raw) => {
    expect(normalizeEmail(raw)).toEqual({ email: '', invalid: true })
  })
  it('accepte le vide', () => {
    expect(normalizeEmail('-')).toEqual({ email: '', invalid: false })
  })
})

describe('splitFullName', () => {
  it.each([
    ['Jean Martin', 'Jean', 'Martin'],
    ['MARTIN Jean', 'Jean', 'Martin'],
    ['jean-pierre DUPONT', 'Jean-Pierre', 'Dupont'],
    ['Martin, Jean', 'Jean', 'Martin'],
    ['Dr. Sophie Lefèvre', 'Sophie', 'Lefèvre'],
    ['Madame Claire de la Roche', 'Claire', 'de la Roche'],
    ['Hans MÜLLER', 'Hans', 'Müller'],
    ['Marie-Hélène Dubois Lacroix', 'Marie-Hélène Dubois', 'Lacroix'],
  ])('sépare %j', (full, firstName, lastName) => {
    expect(splitFullName(full)).toEqual({ firstName, lastName })
  })
  it('met un nom unique dans le nom de famille', () => {
    expect(splitFullName('Madonna')).toEqual({ firstName: '', lastName: 'Madonna' })
  })
  it('gère le vide', () => {
    expect(splitFullName(' - ')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('normalizeStand', () => {
  it.each([
    ['stand B12', 'B12'],
    ['N° 4a', '4A'],
    ['b12', 'B12'],
    ['Stand n° C3', 'C3'],
    ['Hall 5 - C21', 'Hall 5 - C21'],
    ['  ', ''],
  ])('normalise %j', (raw, expected) => {
    expect(normalizeStand(raw)).toBe(expected)
  })
})
