import ExcelJS from 'exceljs'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { BUILTIN_TEMPLATES } from '@shared/exports/csv.ts'
import { MIME, generateExport, parseRequest } from '@shared/exports/service.ts'
import { NO_FILTERS } from '@shared/exports/types.ts'
import { sampleData } from './fixtures'
import { readPdf } from './pdf-text'

const hubspot = BUILTIN_TEMPLATES[0]!

describe('validation des demandes (entrée de l’Edge Function)', () => {
  it('accepte chaque type d’export', () => {
    for (const kind of ['pdf-global', 'pdf-reps', 'pdf-meetings', 'pdf-bilan']) {
      expect(parseRequest({ kind, filters: {} })).toEqual({ kind, filters: NO_FILTERS })
    }
    expect(parseRequest({ kind: 'xlsx', filters: {} })).toEqual({
      kind: 'xlsx',
      filters: NO_FILTERS,
    })
    expect(parseRequest({ kind: 'csv', filters: {}, template: hubspot }).kind).toBe('csv')
  })

  it('refuse un type inconnu ou une entrée qui n’est pas un objet', () => {
    expect(() => parseRequest({ kind: 'exe' })).toThrow('invalid kind')
    expect(() => parseRequest(null)).toThrow()
    expect(() => parseRequest('xlsx')).toThrow()
    expect(() => parseRequest([])).toThrow()
  })

  it('assainit les filtres : valeurs inconnues retirées, types vérifiés', () => {
    const r = parseRequest({
      kind: 'pdf-global',
      filters: {
        statuses: ['done', 'hack', 7, 'none'],
        priorities: ['A', 'Z'],
        assigneeIds: ['u1', {}],
        tagIds: 'oops',
      },
    })
    expect(r.filters).toEqual({
      statuses: ['done', 'none'],
      priorities: ['A'],
      assigneeIds: ['u1'],
      tagIds: [],
    })
  })

  it('colonnes : seules celles du modèle sont acceptées', () => {
    const r = parseRequest({
      kind: 'xlsx',
      filters: {},
      columns: { companies: ['name', 'pirate'], contacts: [] },
    })
    expect(r).toMatchObject({ columns: { companies: ['name'], contacts: [] } })
    expect((r as { columns: object }).columns).not.toHaveProperty('meetings')
  })

  it('valide le modèle CSV : colonnes obligatoires, bornes, valeurs par défaut sûres', () => {
    expect(() => parseRequest({ kind: 'csv', filters: {} })).toThrow('invalid template')
    expect(() => parseRequest({ kind: 'csv', filters: {}, template: { columns: [] } })).toThrow(
      'invalid template',
    )
    expect(() =>
      parseRequest({
        kind: 'csv',
        filters: {},
        template: { columns: [{ header: 1, source: {} }] },
      }),
    ).toThrow()
    const r = parseRequest({
      kind: 'csv',
      filters: {},
      template: {
        name: 'Mon CRM',
        delimiter: '\t',
        columns: [{ header: 'A', source: { field: 'company.name' }, map: { x: 'y', z: 3 } }],
      },
    })
    if (r.kind !== 'csv') throw new Error('type')
    expect(r.template).toMatchObject({
      delimiter: ',',
      bom: false,
      excludeOptOut: true,
      includeCompaniesWithoutContact: false,
    })
    expect(r.template.columns[0]).toEqual({
      header: 'A',
      source: { field: 'company.name' },
      map: { x: 'y' },
    })
  })
})

describe('génération', () => {
  const data = sampleData()
  const filters = NO_FILTERS

  it('Excel : nom de fichier, type MIME et contenu', async () => {
    const r = await generateExport(data, { kind: 'xlsx', filters })
    expect(r.filename).toBe('fair-tech-for-retail-2027-export-2027-05-20.xlsx')
    expect(r.mime).toBe(MIME.xlsx)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(r.bytes as unknown as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Entreprises',
      'Contacts',
      'Rencontres',
      'Notes',
    ])
  })

  it('Excel : applique filtres et colonnes demandés', async () => {
    const r = await generateExport(data, {
      kind: 'xlsx',
      filters: { ...NO_FILTERS, priorities: ['A'] },
      columns: { companies: ['name', 'priority'] },
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(r.bytes as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Entreprises')!
    expect(ws.columnCount).toBe(2)
    expect(ws.rowCount).toBe(3) // en-tête + Carrefour + Amazon France
  })

  it('CSV : nom de fichier, UTF-8, contenu du modèle', async () => {
    const r = await generateExport(data, { kind: 'csv', filters, template: hubspot })
    expect(r.filename).toBe('fair-tech-for-retail-2027-hubspot-contacts-2027-05-20.csv')
    expect(r.mime).toBe(MIME.csv)
    const text = new TextDecoder().decode(r.bytes)
    expect(text.split('\r\n')[0]).toBe(
      'First Name,Last Name,Email,Phone Number,Job Title,Company Name,Company Domain Name,Website URL,City,Country/Region,Lead Status,Lifecycle Stage',
    )
    expect(text).toContain('Jean,Martin,jean.martin@carrefour.com')
  })

  it('PDF global, fiches et bilan : PDF valides', async () => {
    const global = await generateExport(data, { kind: 'pdf-global', filters })
    expect(global.filename).toBe('fair-tech-for-retail-2027-compte-rendu-2027-05-20.pdf')
    expect(global.mime).toBe(MIME.pdf)
    expect((await readPdf(global.bytes)).pages.length).toBeGreaterThan(4)

    const sheets = await generateExport(data, { kind: 'pdf-meetings', filters })
    expect(sheets.filename).toBe('fair-tech-for-retail-2027-fiches-rencontres-2027-05-20.pdf')
    expect((await readPdf(sheets.bytes)).pages).toHaveLength(8)

    const bilan = await generateExport(data, { kind: 'pdf-bilan', filters })
    expect(bilan.filename).toBe('fair-tech-for-retail-2027-bilan-2027-05-20.pdf')
    expect((await readPdf(bilan.bytes)).pages).toHaveLength(1)
  })

  it('PDF par commercial : une archive ZIP contenant un PDF par commercial', async () => {
    const r = await generateExport(data, { kind: 'pdf-reps', filters })
    expect(r.filename).toBe('fair-tech-for-retail-2027-par-commercial-2027-05-20.zip')
    expect(r.mime).toBe(MIME.zip)
    const files = unzipSync(r.bytes)
    expect(Object.keys(files).sort()).toEqual([
      'fair-tech-for-retail-2027-hugo.pdf',
      'fair-tech-for-retail-2027-marie.pdf',
      'fair-tech-for-retail-2027-paul.pdf',
    ])
    for (const bytes of Object.values(files))
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('PDF par commercial : un filtre sur un commercial ne produit que le sien', async () => {
    const r = await generateExport(data, {
      kind: 'pdf-reps',
      filters: { ...NO_FILTERS, assigneeIds: ['u3'] },
    })
    expect(Object.keys(unzipSync(r.bytes))).toEqual(['fair-tech-for-retail-2027-paul.pdf'])
  })

  it('PDF par commercial : erreur claire quand personne ne correspond', async () => {
    await expect(
      generateExport(data, { kind: 'pdf-reps', filters: { ...NO_FILTERS, tagIds: ['inconnu'] } }),
    ).rejects.toThrow('no salesperson')
  })

  it('le bilan reflète les filtres choisis', async () => {
    const r = await generateExport(data, {
      kind: 'pdf-bilan',
      filters: { ...NO_FILTERS, assigneeIds: ['u3'] },
    })
    const t = (await readPdf(r.bytes)).pages[0]!
    expect(t).toContain('1 / 2') // rencontres réalisées / prévues de Paul
  })
})
