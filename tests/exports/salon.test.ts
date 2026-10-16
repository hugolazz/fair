import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildSalonCsv, safeCell } from '@shared/exports/csv.ts'
import { generateExport, MIME } from '@shared/exports/service.ts'
import { buildSalonTable, SALON_COLUMNS } from '@shared/exports/tables.ts'
import { bigData, sampleData } from './fixtures'
import { readPdf } from './pdf-text'

const col = (label: string) => SALON_COLUMNS.findIndex((c) => c.label === label)

/** Lignes du CSV (séparateur « ; », guillemets RFC 4180) sous forme de tableaux de cellules. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ';') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += ch
  }
  return rows
}

describe('table du salon', () => {
  const table = buildSalonTable(sampleData())
  const rows = table.rows.map((r) => r.cells)
  const of = (company: string) => rows.filter((r) => r.name === company)

  it('reprend d’abord les colonnes du fichier d’import, puis ce qui s’est passé pendant le salon', () => {
    expect(SALON_COLUMNS.slice(0, 14).map((c) => c.label)).toEqual([
      'Société',
      'Site web',
      'Stand',
      'Secteur',
      'Pays',
      'Ville',
      'Priorité',
      'Type',
      'Contact',
      'Fonction',
      'E-mail',
      'Téléphone',
      'LinkedIn',
      'Commentaire',
    ])
    expect(SALON_COLUMNS.slice(14).map((c) => c.label)).toEqual([
      'Commerciaux',
      'Statut de la rencontre',
      'Date de la rencontre',
      'Intérêt (1-5)',
      'À recontacter',
      'Prochaine étape',
      'Notes du salon',
      'Désinscrit',
    ])
  })

  it('une ligne par contact, une seule ligne pour une entreprise sans contact', () => {
    expect(of('Carrefour')).toHaveLength(2)
    expect(of('Décathlon')).toHaveLength(1)
    expect(of('Fnac Darty')).toHaveLength(1)
    expect(of('Fnac Darty')[0]).toMatchObject({ contact: null, email: null })
    expect(table.rows).toHaveLength(2 + 1 + 1 + 1 + 1 + 1)
  })

  it('trie les entreprises par nom et garde l’ordre des contacts', () => {
    const names = [...new Set(rows.map((r) => r.name))]
    expect(names).toEqual([...names].sort((a, b) => String(a).localeCompare(String(b), 'fr')))
    expect(of('Carrefour').map((r) => r.contact)).toEqual(['Jean Martin', 'Paula Désinscrite'])
  })

  it('porte les informations d’import de l’entreprise sur chaque ligne', () => {
    for (const r of of('Carrefour'))
      expect(r).toMatchObject({
        website: 'https://carrefour.com',
        stand: 'B12',
        priority: 'A',
        tags: 'Client',
        industry: 'Retail',
        city: 'Paris',
      })
  })

  it('la priorité est une simple lettre (A, B, C) : réimportable telle quelle', () => {
    expect(of('Zalando')[0]!.priority).toBe('C')
    expect(of('Fnac Darty')[0]!.priority).toBeNull()
  })

  it('reprend la dernière rencontre de l’entreprise : statut, date, intérêt maximal, prochaine étape', () => {
    // Carrefour : m1 (12/05, Vu, intérêt 5) puis m2 (13/05, À relancer, intérêt 4).
    expect(of('Carrefour')[0]).toMatchObject({
      status: 'À relancer',
      interest: 5,
      nextStep: 'Rappeler mardi',
      assignees: 'Hugo, Marie',
    })
    expect(of('Carrefour')[0]!.meetingAt).toBeInstanceOf(Date)
    expect(of('Fnac Darty')[0]!.status).toBe('À voir')
  })

  it('une entreprise sans rencontre le dit', () => {
    const d = sampleData()
    d.meetings = []
    const t = buildSalonTable(d)
    expect(t.rows[0]!.cells.status).toBe('Pas de rencontre')
    expect(t.rows[0]!.cells.recontact).toBeNull()
  })

  it('réunit toutes les notes de l’entreprise, datées et signées', () => {
    const notes = String(of('Carrefour')[0]!.notes)
    expect(notes).toContain('Hugo : Décideur présent')
    expect(notes).toMatch(/^12\/05\/2027 10:45 · Hugo :/)
    // Note rattachée à l'entreprise sans rencontre (Amazon France).
    expect(String(of('Amazon France')[0]!.notes)).toContain('Croisé au bar')
  })

  it('« À recontacter » est propre à chaque contact', () => {
    const d = sampleData()
    d.meetings.find((m) => m.id === 'm1')!.recontact = true // rencontre avec Jean Martin (c1)
    d.meetings.find((m) => m.id === 'm2')!.contactId = 'c1'
    const rows2 = buildSalonTable(d).rows.map((r) => r.cells)
    const carrefour = rows2.filter((r) => r.name === 'Carrefour')
    expect(carrefour.map((r) => [r.contact, r.recontact])).toEqual([
      ['Jean Martin', 'Oui'],
      ['Paula Désinscrite', 'Non'],
    ])
  })

  it('signale les contacts désinscrits', () => {
    expect(of('Carrefour').map((r) => r.optOut)).toEqual([null, 'Oui'])
  })

  it('l’historique de l’entreprise est dans la colonne « Commentaire »', () => {
    const d = sampleData()
    d.targets.find((t) => t.name === 'Carrefour')!.history =
      'Déjà contacté M. X le 19 janvier 2026.'
    const carrefour = buildSalonTable(d).rows.find((r) => r.cells.name === 'Carrefour')!
    expect(carrefour.cells.history).toBe('Déjà contacté M. X le 19 janvier 2026.')
  })
})

describe('CSV du salon', () => {
  const data = sampleData()
  // Deux notes pour Carrefour : elles sont réunies dans une même cellule, sur deux lignes.
  data.notes.push({
    id: 'n4',
    meetingId: 'm2',
    targetId: null,
    authorId: 'u2',
    body: 'À relancer mardi',
    source: 'typed',
    capturedAt: '2027-05-13T13:30:00.000Z',
  })
  const csv = buildSalonCsv(data)
  const lines = parseCsv(csv)

  it('commence par un BOM UTF-8, sépare par « ; » et termine les lignes en CRLF', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('\r\n')
    expect(lines[0]).toEqual(SALON_COLUMNS.map((c) => c.label))
  })

  it('la même chose que l’Excel : une ligne par contact', () => {
    expect(lines).toHaveLength(1 + buildSalonTable(sampleData()).rows.length)
    expect(lines.every((l) => l.length === SALON_COLUMNS.length)).toBe(true)
  })

  it('protège virgules, guillemets et retours à la ligne', () => {
    const decathlon = lines.find((l) => l[col('Société')] === 'Décathlon')!
    expect(decathlon[col('Contact')]).toBe('Alice Durand, Dupont')
    expect(decathlon[col('Fonction')]).toBe('Head of "Digital"')
    const carrefour = lines.find((l) => l[col('Société')] === 'Carrefour')!
    expect(carrefour[col('Notes du salon')]).toContain('\n')
  })

  it('neutralise l’injection de formule, sans abîmer les numéros de téléphone', () => {
    const zalando = lines.find((l) => l[col('Société')] === 'Zalando')!
    expect(zalando[col('Contact')]!.startsWith("'=")).toBe(true)
    expect(zalando[col('Fonction')]).toBe("'-2+3")
    const carrefour = lines.find((l) => l[col('Société')] === 'Carrefour')!
    expect(carrefour[col('Téléphone')]).toBe('+33 6 12 34 56 78')
    expect(safeCell('-12.5')).toBe('-12.5')
  })

  it('écrit les dates à la française (heure du salon)', () => {
    const carrefour = lines.find((l) => l[col('Société')] === 'Carrefour')!
    expect(carrefour[col('Date de la rencontre')]).toBe('13/05/2027 15:00')
  })
})

describe('Excel du salon', () => {
  async function build(data = sampleData()) {
    const r = await generateExport(data, 'xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(r.bytes as unknown as ArrayBuffer)
    return { r, wb }
  }

  it('un seul onglet « Salon », en-têtes figés et filtres sur toute la ligne d’en-têtes', async () => {
    const { wb } = await build()
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Salon'])
    const ws = wb.getWorksheet('Salon')!
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.autoFilter).toBe(`A1:${ws.getColumn(SALON_COLUMNS.length).letter}1`)
  })

  it('les en-têtes sont ceux de l’import, en gras blanc sur fond vert', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Salon')!
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(SALON_COLUMNS.map((c) => c.label))
    const a1 = ws.getCell('A1')
    expect(a1.font?.bold).toBe(true)
    expect((a1.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF0F766E')
  })

  it('contient une ligne par contact avec les bonnes valeurs', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Salon')!
    expect(ws.rowCount).toBe(1 + buildSalonTable(sampleData()).rows.length)
    const row = (name: string) => {
      let found: ExcelJS.Row | undefined
      ws.eachRow((r, i) => {
        if (i > 1 && r.getCell(1).value === name && !found) found = r
      })
      return found!
    }
    const carrefour = row('Carrefour')
    expect(carrefour.getCell(col('Priorité') + 1).value).toBe('A')
    expect(carrefour.getCell(col('Type') + 1).value).toBe('Client')
    expect(carrefour.getCell(col('Intérêt (1-5)') + 1).value).toBe(5)
    expect(carrefour.getCell(col('Date de la rencontre') + 1).value).toBeInstanceOf(Date)
  })

  it('colore le nom et la priorité selon la priorité', async () => {
    const { wb } = await build()
    const ws = wb.getWorksheet('Salon')!
    let fill: string | undefined
    ws.eachRow((r, i) => {
      if (i > 1 && r.getCell(1).value === 'Carrefour' && !fill)
        fill = (r.getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb
    })
    expect(fill).toBe('FFFECACA')
  })

  it('fonctionne avec un gros salon', async () => {
    const { wb } = await build(bigData())
    expect(wb.getWorksheet('Salon')!.rowCount).toBeGreaterThan(400)
  })
})

describe('generateExport', () => {
  it('nomme les fichiers avec le salon et la date', async () => {
    const data = sampleData()
    expect((await generateExport(data, 'xlsx')).filename).toBe(
      'fair-tech-for-retail-2027-2027-05-20.xlsx',
    )
    const csv = await generateExport(data, 'csv')
    expect(csv).toMatchObject({
      filename: 'fair-tech-for-retail-2027-2027-05-20.csv',
      mime: MIME.csv,
    })
    const pdf = await generateExport(data, 'pdf')
    expect(pdf.filename).toBe('fair-tech-for-retail-2027-compte-rendu-2027-05-20.pdf')
    expect(pdf.mime).toBe(MIME.pdf)
  })

  it('produit un PDF lisible et le bilan d’une page', async () => {
    const data = sampleData()
    const report = await readPdf((await generateExport(data, 'pdf')).bytes)
    expect(report.pages.join(' ')).toContain('Carrefour')
    const bilan = await readPdf((await generateExport(data, 'pdf-bilan')).bytes)
    expect(bilan.pages).toHaveLength(1)
  })

  it('un salon vide donne des fichiers valides', async () => {
    const empty = { ...sampleData(), targets: [], contacts: [], meetings: [], notes: [] }
    for (const kind of ['xlsx', 'csv', 'pdf', 'pdf-bilan'] as const) {
      expect((await generateExport(empty, kind)).bytes.length).toBeGreaterThan(0)
    }
  })
})
