import { describe, expect, it } from 'vitest'
import { fixture } from '../../../../tests/fixtures/load'
import type { RawTable } from '@/db/schemas/import'
import { detectMapping, normHeader, resolveMapping, toStoredMapping } from './mapping'
import { buildTable, parseFile } from './parse'

const table = (headers: string[], rows: string[][] = []): RawTable => ({
  headers,
  rows,
  rowNumbers: rows.map((_, i) => i + 2),
})

describe('normHeader', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(normHeader('  N° Stand / Numéro-de-STAND ')).toBe('n stand numero de stand')
  })
})

describe('detectMapping', () => {
  it('reconnaît des intitulés français', () => {
    const m = detectMapping(
      table([
        'Société',
        'Site Web',
        'N° Stand',
        "Secteur d'activité",
        'Contact',
        'Fonction',
        'E-mail',
      ]),
    )
    expect(m).toEqual({
      companyName: 0,
      website: 1,
      stand: 2,
      industry: 3,
      contactName: 4,
      jobTitle: 5,
      email: 6,
    })
  })
  it('reconnaît des intitulés anglais', () => {
    const m = detectMapping(
      table(['Exhibitor Name', 'Website', 'Booth', 'Category', 'Full Name', 'Title', 'Email']),
    )
    expect(m).toMatchObject({
      companyName: 0,
      website: 1,
      stand: 2,
      industry: 3,
      contactName: 4,
      jobTitle: 5,
      email: 6,
    })
  })
  it('sépare prénom et nom ; « Nom » seul devient le nom de famille', () => {
    const m = detectMapping(table(['Raison sociale', 'Prénom', 'Nom', 'Mail', 'Téléphone']))
    expect(m).toEqual({
      companyName: 0,
      contactFirstName: 1,
      contactLastName: 2,
      email: 3,
      phone: 4,
    })
  })
  it('traite « Nom » seul comme la société quand il n’y a pas de prénom', () => {
    expect(detectMapping(table(['Nom', 'Site'])).companyName).toBe(0)
  })
  it('n’utilise pas contactName quand prénom et nom existent', () => {
    const m = detectMapping(table(['Société', 'Contact', 'Prénom', 'Nom']))
    expect(m.contactName).toBeUndefined()
  })
  it('devine une colonne d’e-mails par son contenu même avec un intitulé trompeur', () => {
    const m = detectMapping(
      table(
        ['Société', 'Contact'],
        [
          ['A', 'a@a.com'],
          ['B', 'b@b.com'],
          ['C', 'c@c.com'],
        ],
      ),
    )
    expect(m.email).toBe(1)
    expect(m.contactName).toBeUndefined()
  })
  it('ne mappe jamais deux champs sur la même colonne', () => {
    const m = detectMapping(table(['Société', 'Site', 'Stand', 'Mail', 'Poste']))
    const cols = Object.values(m)
    expect(new Set(cols).size).toBe(cols.length)
  })
  it('laisse non mappées les colonnes inconnues', () => {
    expect(detectMapping(table(['Foo', 'Bar']))).toEqual({})
  })
})

describe('mémorisation du mapping', () => {
  it('réapplique un mapping mémorisé par intitulé, même si l’ordre des colonnes change', () => {
    const first = table(['Société', 'Stand', 'Blabla'])
    const stored = toStoredMapping(first, { companyName: 0, stand: 1 }, true)
    const next = table(['Blabla', 'Société', 'Stand'])
    const { mapping, restored } = resolveMapping(next, stored)
    expect(restored).toBe(2)
    expect(mapping).toMatchObject({ companyName: 1, stand: 2 })
  })
  it('complète par la détection pour les champs non mémorisés', () => {
    const stored = toStoredMapping(table(['Entreprise']), { companyName: 0 }, true)
    const { mapping, restored } = resolveMapping(table(['Entreprise', 'Email']), stored)
    expect(restored).toBe(1)
    expect(mapping).toEqual({ companyName: 0, email: 1 })
  })
  it('ignore proprement un intitulé mémorisé absent du nouveau fichier', () => {
    const stored = toStoredMapping(table(['Exposant']), { companyName: 0 }, true)
    const { mapping, restored } = resolveMapping(table(['Autre', 'Site']), stored)
    expect(restored).toBe(0)
    expect(mapping.website).toBe(1)
  })
})

describe('sur les fichiers d’exemple', () => {
  it.each([
    [
      'participants-sale.csv',
      { companyName: 0, website: 1, stand: 2, industry: 3, contactName: 4, jobTitle: 5, email: 6 },
    ],
    [
      'participants-excel-fr-windows1252.csv',
      {
        companyName: 0,
        website: 1,
        stand: 2,
        industry: 3,
        contactFirstName: 4,
        contactLastName: 5,
        jobTitle: 6,
        email: 7,
        phone: 8,
      },
    ],
    [
      'participants-paste-english.tsv',
      { companyName: 0, website: 1, stand: 2, industry: 3, contactName: 4, jobTitle: 5, email: 6 },
    ],
    [
      'participants.xlsx',
      { companyName: 0, website: 1, stand: 2, industry: 3, contactName: 4, jobTitle: 5, email: 6 },
    ],
  ])('détecte les colonnes de %s', async (file, expected) => {
    const t = buildTable(await parseFile(file, fixture(file)), true)
    expect(detectMapping(t)).toEqual(expected)
  })
})
