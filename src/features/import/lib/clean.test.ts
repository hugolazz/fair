import { describe, expect, it } from 'vitest'
import type { RawTable } from '@/db/schemas/import'
import { cleanRows } from './clean'

const table = (
  rows: string[][],
  headers = ['Société', 'Site', 'Stand', 'Contact', 'Email'],
): RawTable => ({
  headers,
  rows,
  rowNumbers: rows.map((_, i) => i + 2),
})
const mapping = { companyName: 0, website: 1, stand: 2, contactName: 3, email: 4 }

describe('cleanRows', () => {
  it('nettoie et normalise chaque champ', () => {
    const { rows } = cleanRows(
      table([
        [
          'Carrefour SA',
          'WWW.Carrefour.com/',
          'stand b12',
          'MARTIN Jean',
          'Jean.Martin@Carrefour.com',
        ],
      ]),
      mapping,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      company: {
        name: 'Carrefour SA',
        nameKey: 'carrefour',
        website: 'https://carrefour.com',
        domain: 'carrefour.com',
        stand: 'B12',
      },
      contacts: [{ firstName: 'Jean', lastName: 'Martin', email: 'jean.martin@carrefour.com' }],
      warnings: [],
    })
  })

  it('supprime les lignes vides et compte les retraits', () => {
    const r = cleanRows(
      table([
        ['', '', '', '', ''],
        ['Acme', '', '', '', ''],
        ['', '', '', '', ''],
      ]),
      mapping,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.removed.empty).toBe(2)
  })

  it('retire les répétitions de la ligne de titres et les lignes « Total »', () => {
    const r = cleanRows(
      table([
        ['Acme', '', '', '', ''],
        ['société', 'site', '', '', ''],
        ['Total', '', '', '', ''],
        ['Beta', '', '', '', ''],
      ]),
      mapping,
    )
    expect(r.rows.map((x) => x.company.name)).toEqual(['Acme', 'Beta'])
    expect(r.removed).toEqual({ empty: 1, repeatedHeader: 1 })
  })

  it('signale en erreur une ligne sans société, avec son numéro et ses cellules d’origine', () => {
    const r = cleanRows(table([['', 'acme.com', '', 'Alice Roy', 'alice@acme.io']]), mapping)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toEqual([
      {
        rowNumber: 2,
        code: 'missing_company',
        raw: ['', 'acme.com', '', 'Alice Roy', 'alice@acme.io'],
      },
    ])
  })

  it('importe la société malgré un e-mail ou un site invalide, avec un avertissement', () => {
    const r = cleanRows(
      table([['Orange', 'pas de site', '', 'Jean Martin', 'jean@orange']]),
      mapping,
    )
    expect(r.rows[0]!.warnings.sort()).toEqual(['invalid_email', 'invalid_url'])
    expect(r.rows[0]!.company.website).toBe('')
    expect(r.rows[0]!.contacts[0]?.email).toBe('')
    expect(r.rows[0]!.contacts[0]?.lastName).toBe('Martin')
  })

  it('n’ajoute pas de contact sans nom ni e-mail', () => {
    const r = cleanRows(
      table([['Acme', '', '', '', '']], ['Société', 'Site', 'Stand', 'Poste', 'Email']),
      { companyName: 0, jobTitle: 3 },
    )
    expect(r.rows[0]!.contacts).toEqual([])
  })

  it('préfère prénom/nom séparés au nom complet', () => {
    const r = cleanRows(
      table([['Acme', 'Anne', 'LAMY', 'ignoré Nom']], ['Société', 'Prénom', 'Nom', 'Contact']),
      { companyName: 0, contactFirstName: 1, contactLastName: 2, contactName: 3 },
    )
    expect(r.rows[0]!.contacts[0]).toMatchObject({ firstName: 'Anne', lastName: 'Lamy' })
  })

  it('traite les valeurs « N/A » comme vides', () => {
    const r = cleanRows(table([['Acme', 'N/A', '-', 'n/a', '#N/A']]), mapping)
    expect(r.rows[0]!.company.website).toBe('')
    expect(r.rows[0]!.contacts).toEqual([])
    expect(r.rows[0]!.warnings).toEqual([])
  })
})

describe('salons (colonnes de croix)', () => {
  const headers = ['Société', 'NRF 09/26', '  One to One Monaco (03/27) ']

  it('une croix dans une colonne de salon ajoute son intitulé à l’entreprise', () => {
    const r = cleanRows(
      table(
        [
          ['Carrefour', 'x', '', ''],
          ['Auchan', 'X', 'x', ''],
          ['Fnac', '', '', ''],
        ],
        headers,
      ),
      { companyName: 0 },
      [1, 2],
    )
    expect(r.rows.map((x) => x.company.shows)).toEqual([
      ['NRF 09/26'],
      ['NRF 09/26', 'One to One Monaco (03/27)'],
      [],
    ])
  })

  it('sans colonne de salon, aucune pastille', () => {
    const r = cleanRows(table([['Carrefour', 'x', '', '']], headers), { companyName: 0 })
    expect(r.rows[0]!.company.shows).toEqual([])
  })
})
