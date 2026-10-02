import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { buildErrorsCsv } from './errors-csv'

describe('buildErrorsCsv', () => {
  const errors = [
    {
      rowNumber: 11,
      code: 'missing_company' as const,
      raw: ['', 'acme.com', '=HYPERLINK("http://x")'],
    },
    { rowNumber: 19, code: 'save_failed' as const, message: 'boom', raw: ['Beta; "SA"', '', ''] },
  ]
  const csv = buildErrorsCsv(
    errors,
    ['Société', 'Site', 'Contact'],
    { row: 'Ligne', reason: 'Motif' },
    (e) => (e.code === 'missing_company' ? 'Nom de société manquant' : `Échec : ${e.message}`),
  )

  it('commence par un BOM UTF-8 et utilise « ; » avec CRLF (Excel FR)', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('\r\n')
    expect(csv.split('\r\n')[0]).toBe('\uFEFFLigne;Motif;Société;Site;Contact')
  })

  it('conserve les colonnes d’origine pour corriger et ré-importer', () => {
    const parsed = Papa.parse<string[]>(csv.slice(1), { delimiter: ';' }).data
    expect(parsed[1]).toEqual([
      '11',
      'Nom de société manquant',
      '',
      'acme.com',
      '\'=HYPERLINK("http://x")',
    ])
    expect(parsed[2]).toEqual(['19', 'Échec : boom', 'Beta; "SA"', '', ''])
  })

  it('neutralise les formules (injection CSV)', () => {
    expect(csv).not.toMatch(/;=HYPERLINK/)
  })
})
