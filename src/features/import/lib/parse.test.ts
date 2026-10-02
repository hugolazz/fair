import { describe, expect, it } from 'vitest'
import { fixture } from '../../../../tests/fixtures/load'
import { ImportError } from '@/db/schemas/import'
import { buildTable, decodeText, detectFileKind, parseDelimited, parseFile } from './parse'

const bytes = (...n: number[]) => new Uint8Array(n).buffer

describe('decodeText', () => {
  it('lit l’UTF-8 et retire le BOM', () => {
    const buf = new TextEncoder().encode('\uFEFFSociété;Stand').buffer as ArrayBuffer
    expect(decodeText(buf)).toBe('Société;Stand')
  })
  it('bascule sur Windows-1252 quand l’UTF-8 est invalide', () => {
    expect(decodeText(bytes(0x53, 0x6f, 0x63, 0x69, 0xe9, 0x74, 0xe9))).toBe('Société')
  })
})

describe('parseDelimited', () => {
  it('détecte le point-virgule, la virgule, la tabulation et la barre verticale', () => {
    const expected = [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]
    expect(parseDelimited('a;b;c\n1;2;3')).toEqual(expected)
    expect(parseDelimited('a,b,c\n1,2,3')).toEqual(expected)
    expect(parseDelimited('a\tb\tc\n1\t2\t3')).toEqual(expected)
    expect(parseDelimited('a|b|c\n1|2|3')).toEqual(expected)
  })
  it('gère guillemets, délimiteur et retour à la ligne dans une cellule', () => {
    const grid = parseDelimited(
      'Société;Secteur\r\n"Dupont & Fils; SARL";"Industrie\r\net ""logistique"""\r\n',
    )
    expect(grid[1]).toEqual(['Dupont & Fils; SARL', 'Industrie\r\net "logistique"'])
  })
  it('refuse un contenu vide', () => {
    expect(() => parseDelimited('  \n ')).toThrow(ImportError)
  })
})

describe('buildTable', () => {
  it('ignore les lignes vides de tête, complète les lignes courtes et conserve les numéros de ligne', () => {
    const t = buildTable(
      [[], ['', ''], ['Société', 'Stand'], ['Acme'], ['', ''], ['Beta', 'B2', 'extra']],
      true,
    )
    expect(t.headers).toEqual(['Société', 'Stand', '(C)'])
    expect(t.rows).toEqual([
      ['Acme', '', ''],
      ['', '', ''],
      ['Beta', 'B2', 'extra'],
    ])
    expect(t.rowNumbers).toEqual([4, 5, 6])
  })
  it('rend uniques les en-têtes en double ou vides', () => {
    const t = buildTable(
      [
        ['Nom', 'Nom', '', 'Nom'],
        ['a', 'b', 'c', 'd'],
      ],
      true,
    )
    expect(t.headers).toEqual(['Nom', 'Nom (2)', '(C)', 'Nom (3)'])
  })
  it('sans ligne de titres, la première ligne reste une donnée', () => {
    const t = buildTable(
      [
        ['Acme', 'B1'],
        ['Beta', 'B2'],
      ],
      false,
    )
    expect(t.headers).toEqual(['(A)', '(B)'])
    expect(t.rows).toHaveLength(2)
    expect(t.rowNumbers).toEqual([1, 2])
  })
  it('refuse un tableau sans aucune donnée', () => {
    expect(() => buildTable([[''], ['']], true)).toThrow(ImportError)
  })
})

describe('detectFileKind', () => {
  it('reconnaît xlsx et xls par signature', () => {
    expect(detectFileKind('x.csv', bytes(0x50, 0x4b, 3, 4))).toBe('xlsx')
    expect(detectFileKind('x.csv', bytes(0xd0, 0xcf, 0x11, 0xe0))).toBe('xls')
    expect(detectFileKind('x.csv', bytes(0x61, 0x3b, 0x62, 0x0a))).toBe('text')
  })
})

describe('parseFile sur les fichiers d’exemple', () => {
  it('lit le CSV très sale (BOM, CRLF, guillemets, lignes vides)', async () => {
    const grid = await parseFile('participants-sale.csv', fixture('participants-sale.csv'))
    expect(grid[0]).toContain('Société')
    expect(grid[0]![0]).not.toMatch(/^\uFEFF/)
    // La cellule entre guillemets sur deux lignes reste une seule ligne logique.
    expect(grid.some((r) => r[0] === 'Dupont & Fils, SARL' && r[3]?.includes('logistique'))).toBe(
      true,
    )
  })
  it('décode le CSV Windows-1252', async () => {
    const grid = await parseFile('x.csv', fixture('participants-excel-fr-windows1252.csv'))
    expect(grid[0]).toContain('Prénom')
    expect(grid[1]![0]).toBe('Société Générale')
  })
  it('lit un copier-coller tabulé', async () => {
    const grid = await parseFile('paste.tsv', fixture('participants-paste-english.tsv'))
    expect(grid[0]).toEqual([
      'Exhibitor Name',
      'Website',
      'Booth',
      'Category',
      'Full Name',
      'Title',
      'Email',
    ])
  })
  it('lit un .xlsx (lignes vides, nombres)', async () => {
    const grid = await parseFile('participants.xlsx', fixture('participants.xlsx'))
    const t = buildTable(grid, true)
    expect(t.headers[0]).toBe('Entreprise')
    expect(t.rows[0]![2]).toBe('12')
  })
  it('refuse un ancien .xls et un fichier trop gros', async () => {
    await expect(parseFile('old.xls', bytes(0xd0, 0xcf, 0x11, 0xe0, 0, 0))).rejects.toMatchObject({
      code: 'unsupported_format',
    })
    await expect(parseFile('big.csv', new ArrayBuffer(26 * 1024 * 1024))).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })
  it('refuse un xlsx corrompu', async () => {
    await expect(parseFile('bad.xlsx', bytes(0x50, 0x4b, 1, 2, 3, 4))).rejects.toMatchObject({
      code: 'parse_failed',
    })
  })
})
