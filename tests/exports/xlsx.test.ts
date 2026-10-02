import ExcelJS from 'exceljs'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { applyFilters } from '@shared/exports/select.ts'
import { buildTables, COLUMNS } from '@shared/exports/tables.ts'
import { NO_FILTERS } from '@shared/exports/types.ts'
import { buildWorkbook, columnWidth } from '@shared/exports/xlsx.ts'
import { sampleData } from './fixtures'

async function load(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as ArrayBuffer)
  return wb
}

/** Largeur de chaque colonne, lue dans le XML de la feuille (indépendamment du lecteur ExcelJS). */
function sheetColumnWidths(bytes: Uint8Array, sheet: number): Map<number, number> {
  const xml = new TextDecoder().decode(unzipSync(bytes)[`xl/worksheets/sheet${sheet}.xml`]!)
  const out = new Map<number, number>()
  for (const m of xml.matchAll(/<col [^>]*>/g)) {
    const attr = (n: string) => Number(new RegExp(`${n}="([\\d.]+)"`).exec(m[0])?.[1])
    for (let i = attr('min'); i <= attr('max'); i++) out.set(i, attr('width'))
  }
  return out
}

const headers = (ws: ExcelJS.Worksheet) =>
  (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v))

async function build(data = sampleData(), columns?: Parameters<typeof buildTables>[1]) {
  const bytes = await buildWorkbook(buildTables(data, columns), {
    title: 'Export',
    generatedAt: data.generatedAt,
  })
  return { bytes, wb: await load(bytes) }
}

describe('export Excel', () => {
  it('contient les quatre onglets Entreprises, Contacts, Rencontres, Notes, dans cet ordre', async () => {
    const { bytes, wb } = await build()
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Entreprises',
      'Contacts',
      'Rencontres',
      'Notes',
    ])
    // C'est bien un fichier .xlsx (archive zip).
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b])
  })

  it('fige la ligne d’en-têtes et active les filtres sur chaque onglet', async () => {
    const { wb } = await build()
    for (const ws of wb.worksheets) {
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
      // Le filtre couvre toute la ligne d'en-têtes : A1 jusqu'à la dernière colonne.
      expect(ws.autoFilter).toBe(`A1:${ws.getColumn(ws.columnCount).letter}1`)
    }
    expect(wb.getWorksheet('Entreprises')!.autoFilter).toBe('A1:Q1')
  })

  it('met en forme les en-têtes (gras, blanc sur fond vert)', async () => {
    const { wb } = await build()
    const cell = wb.getWorksheet('Entreprises')!.getCell('A1')
    expect(cell.font?.bold).toBe(true)
    expect(cell.font?.color?.argb).toBe('FFFFFFFF')
    expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF0F766E')
  })

  it('écrit les données : une ligne par entreprise, triées par nom, avec leurs valeurs', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Entreprises')!
    expect(headers(ws).slice(0, 8)).toEqual([
      'Entreprise',
      'Stand',
      'Priorité',
      'Objectif',
      'Commerciaux',
      'Tags',
      'Statut',
      'Intérêt (1-5)',
    ])
    expect(ws.rowCount).toBe(7) // en-tête + 6 entreprises
    const names = [2, 3, 4, 5, 6, 7].map((r) => ws.getCell(`A${r}`).value)
    expect(names).toEqual([
      'Amazon France',
      'Carrefour',
      'Décathlon',
      'Fnac Darty',
      'Leroy Merlin',
      'Zalando',
    ])
    const carrefour = ws.getRow(3)
    expect(carrefour.getCell('B').value).toBe('B12')
    expect(carrefour.getCell('C').value).toBe('Priorité A')
    expect(carrefour.getCell('D').value).toBe('Démo')
    expect(carrefour.getCell('E').value).toBe('Hugo, Marie')
    expect(carrefour.getCell('F').value).toBe('Client')
    expect(carrefour.getCell('H').value).toBe(5) // intérêt max, nombre et non texte
    expect(typeof carrefour.getCell('I').value).toBe('number')
  })

  it('colore les cellules selon la priorité (A rouge, B ambre, C bleu, aucune sans couleur)', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Entreprises')!
    const fill = (addr: string) =>
      (ws.getCell(addr).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb
    expect(fill('C3')).toBe('FFFECACA') // Carrefour A
    expect(fill('A3')).toBe('FFFECACA') // le nom aussi
    expect(fill('C4')).toBe('FFFDE68A') // Décathlon B
    expect(fill('C7')).toBe('FFBFDBFE') // Zalando C
    expect(fill('C5')).toBeUndefined() // Fnac : sans priorité
    expect(ws.getCell('C3').font?.bold).toBe(true)
  })

  it('adapte la largeur des colonnes au contenu', async () => {
    const { bytes, wb } = await build()
    const h = headers(wb.getWorksheet('Entreprises')!)
    const w = sheetColumnWidths(bytes, 1)
    const width = (label: string) => w.get(h.indexOf(label) + 1)!
    expect(width('Entreprise')).toBeGreaterThanOrEqual('Amazon France'.length + 2)
    expect(width('Stand')).toBeLessThan(width('Entreprise'))
    expect(width('Site web')).toBeGreaterThanOrEqual('https://carrefour.com'.length)
    expect(width('Commentaire de préparation')).toBeGreaterThan(20)
    for (const sheet of [1, 2, 3, 4]) {
      const widths = sheetColumnWidths(bytes, sheet)
      expect(widths.size).toBeGreaterThan(5)
      for (const v of widths.values()) expect(v).toBeGreaterThanOrEqual(8)
    }
  })

  it('columnWidth : bornée, jamais plus étroite que l’en-tête, texte long plafonné', () => {
    const c = { key: 'x', label: 'Colonne très longue', kind: 'text' as const, width: 20 }
    expect(columnWidth(c, ['a'])).toBe(c.label.length + 4)
    expect(columnWidth(c, ['x'.repeat(500)])).toBe(70)
    expect(columnWidth({ ...c, kind: 'longtext', width: 40 }, ['x'.repeat(500)])).toBe(40)
  })

  it('écrit les dates en vraies dates Excel, à l’heure du salon (Paris)', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Rencontres')!
    const iPlanned = headers(ws).indexOf('Date et heure') + 1
    const first = ws.getRow(2).getCell(iPlanned) // trié par date : m1 le 12/05 à 10 h 30 (08:30 UTC)
    expect(first.value).toBeInstanceOf(Date)
    expect((first.value as Date).toISOString()).toBe('2027-05-12T10:30:00.000Z') // heure murale, encodée en UTC
    expect(first.numFmt).toBe('dd/mm/yyyy hh:mm')
  })

  it('onglet Rencontres : statut, intérêt, champs de qualification', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Rencontres')!
    const h = headers(ws)
    expect(ws.rowCount).toBe(9)
    const row = ws.getRow(2)
    const get = (name: string) => row.getCell(h.indexOf(name) + 1).value
    expect(get('Entreprise')).toBe('Carrefour')
    expect(get('Commercial')).toBe('Hugo')
    expect(get('Statut')).toBe('Vu')
    expect(get('Intérêt (1-5)')).toBe(5)
    expect(get('Besoin')).toBe('Caisse mobile')
    expect(get('Budget')).toBe('50 k€')
    expect(get('Contact')).toBe('Jean Martin')
    expect(get('Nombre de notes')).toBe(1)
  })

  it('onglet Contacts : coordonnées, désinscription signalée', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Contacts')!
    const h = headers(ws)
    const rows = [2, 3, 4, 5].map((r) => ({
      nom: ws.getRow(r).getCell(h.indexOf('Nom') + 1).value,
      email: ws.getRow(r).getCell(h.indexOf('E-mail') + 1).value,
      optOut: ws.getRow(r).getCell(h.indexOf('Désinscrit') + 1).value,
    }))
    expect(rows.find((r) => r.nom === 'Martin')).toMatchObject({
      email: 'jean.martin@carrefour.com',
      optOut: null,
    })
    expect(rows.find((r) => r.nom === 'Désinscrite')!.optOut).toBe('Oui')
  })

  it('onglet Notes : texte complet conservé (accents, guillemets), retour à la ligne activé', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Notes')!
    const h = headers(ws)
    const bodies = [2, 3, 4].map((r) => ws.getRow(r).getCell(h.indexOf('Note') + 1).value)
    expect(bodies).toContain(
      'Décideur présent, budget validé T3 – très intéressé par l’offre « caisse mobile ».',
    )
    expect(ws.getRow(2).getCell(h.indexOf('Note') + 1).alignment?.wrapText).toBe(true)
    expect(ws.getRow(2).getCell(h.indexOf('Auteur') + 1).value).toBe('Hugo')
  })

  it('choix des colonnes : seules les colonnes retenues sont exportées, dans l’ordre du modèle', async () => {
    const { wb } = await build(sampleData(), {
      companies: ['name', 'priority', 'status'],
      contacts: ['email', 'lastName'],
    })
    expect(headers(wb.getWorksheet('Entreprises')!)).toEqual(['Entreprise', 'Priorité', 'Statut'])
    expect(headers(wb.getWorksheet('Contacts')!)).toEqual(['Nom', 'E-mail']) // ordre du modèle, pas de la sélection
    expect(headers(wb.getWorksheet('Rencontres')!)).toHaveLength(COLUMNS.meetings.length) // non précisé = tout
  })

  it('respecte les filtres : un seul commercial', async () => {
    const { wb } = await build(applyFilters(sampleData(), { ...NO_FILTERS, assigneeIds: ['u3'] }))
    const names = wb.getWorksheet('Entreprises')!.getColumn(1).values.slice(2)
    expect(names).toEqual(['Amazon France', 'Fnac Darty'])
    expect(wb.getWorksheet('Rencontres')!.rowCount).toBe(3)
  })

  it('un salon sans donnée donne un classeur valide (en-têtes seulement)', async () => {
    const empty = {
      ...sampleData(),
      targets: [],
      contacts: [],
      meetings: [],
      notes: [],
      followUps: [],
    }
    const { wb } = await build(empty)
    for (const ws of wb.worksheets) expect(ws.rowCount).toBe(1)
  })

  it('métadonnées : créé avec fair, date de génération', async () => {
    const { wb } = await build()
    expect(wb.creator).toBe('fair')
    expect(wb.created.toISOString()).toBe('2027-05-20T09:00:00.000Z')
  })
})
