import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { IMPORT_COLUMNS } from '@shared/exports/tables.ts'
import { buildImportTemplate, XLSX_MIME } from '@shared/exports/template.ts'
import { IMPORT_FIELDS } from '@/db/schemas/import'
import { detectMapping } from '@/features/import/lib/mapping'

// Le modèle d'import : un classeur sans données, avec seulement les intitulés de colonnes que fair reconnaît.

const TEMPLATE_LABELS = IMPORT_COLUMNS.map((c) =>
  c.key === 'priority' ? 'Priorité (A, B, C)' : c.label,
)

async function readTemplate() {
  const { filename, mime, bytes } = await buildImportTemplate('2027-01-01T00:00:00.000Z')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.slice().buffer)
  return { filename, mime, wb }
}

describe('modèle d’import (.xlsx)', () => {
  it('est un classeur Excel nommé « fair-modele-import.xlsx »', async () => {
    const { filename, mime } = await readTemplate()
    expect(filename).toBe('fair-modele-import.xlsx')
    expect(mime).toBe(XLSX_MIME)
  })

  it('ne contient que la ligne d’intitulés : un onglet, aucune donnée', async () => {
    const { wb } = await readTemplate()
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Participants'])
    const ws = wb.worksheets[0]!
    expect(ws.actualRowCount).toBe(1)
    expect(ws.getRow(1).values).toEqual([undefined, ...TEMPLATE_LABELS])
  })

  it('appelle la colonne de priorité « Priorité (A, B, C) »', async () => {
    const { wb } = await readTemplate()
    const labels = (wb.worksheets[0]!.getRow(1).values as (string | undefined)[]).slice(1)
    expect(labels).toContain('Priorité (A, B, C)')
    expect(labels).not.toContain('Priorité')
  })

  it('a les 14 colonnes du fichier d’import et une ligne d’intitulés figée, sans flèches de filtre', async () => {
    const { wb } = await readTemplate()
    const ws = wb.worksheets[0]!
    expect(IMPORT_COLUMNS).toHaveLength(14)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    // Les intitulés sont des titres : pas de liste déroulante de filtre dessus.
    expect(ws.autoFilter).toBeFalsy()
  })

  it('est reconnu tel quel par l’import : chaque colonne se rattache à un champ de fair', async () => {
    const { wb } = await readTemplate()
    const headers = (wb.worksheets[0]!.getRow(1).values as (string | undefined)[])
      .slice(1)
      .map((h) => String(h))
    const mapping = detectMapping({ headers, rows: [], rowNumbers: [] })
    // Sociétés, site, stand, secteur, pays, ville, priorité, type, contact, fonction, e-mail, téléphone, LinkedIn, commentaire.
    for (const field of [
      'companyName',
      'website',
      'stand',
      'industry',
      'country',
      'city',
      'priority',
      'tag',
      'jobTitle',
      'email',
      'phone',
      'contactLinkedin',
      'comment',
    ] as const) {
      expect(mapping[field], `champ « ${field} » non reconnu`).toBeDefined()
    }
    expect(mapping.contactName ?? mapping.contactLastName).toBeDefined()
    // Une colonne ↔ un champ : aucune colonne n'est prise deux fois.
    const used = IMPORT_FIELDS.flatMap((f) => (mapping[f] === undefined ? [] : [mapping[f]]))
    expect(new Set(used).size).toBe(used.length)
  })
})
