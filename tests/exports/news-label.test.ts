import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildSalonCsv } from '@shared/exports/csv.ts'
import { DEFAULT_NEWS_LABEL, newsLabelOf, newsTitleOf } from '@shared/exports/labels.ts'
import { generateExport } from '@shared/exports/service.ts'
import { buildSalonTable } from '@shared/exports/tables.ts'
import { sampleData } from './fixtures'

// Intitulé personnalisable de la case optionnelle des notes (« Actualité ? » par défaut).
describe('intitulé de la case optionnelle', () => {
  it('vide ou blanc : l’intitulé d’origine ; sinon celui de l’équipe, sans espaces autour', () => {
    expect(newsLabelOf(null)).toBe(DEFAULT_NEWS_LABEL)
    expect(newsLabelOf('   ')).toBe('Actualité ?')
    expect(newsLabelOf('  Démo demandée ')).toBe('Démo demandée')
  })

  it('le titre de colonne enlève le « ? » final (et les espaces), jamais tout l’intitulé', () => {
    expect(newsTitleOf('Actualité ?')).toBe('Actualité')
    expect(newsTitleOf('Démo demandée ?')).toBe('Démo demandée')
    expect(newsTitleOf('Souhaite un devis')).toBe('Souhaite un devis')
    expect(newsTitleOf('Intéressé ? ?')).toBe('Intéressé')
    expect(newsTitleOf('?')).toBe('?')
  })

  it('la colonne des exports (tableau, CSV, Excel) porte l’intitulé de l’équipe, au même endroit', async () => {
    const d = sampleData()
    d.team.newsEnabled = true
    d.team.newsLabel = 'Démo demandée ?'
    d.meetings.find((m) => m.id === 'm1')!.news = true

    const table = buildSalonTable(d)
    const keys = table.columns.map((c) => c.key)
    expect(keys[keys.indexOf('recontact') + 1]).toBe('news')
    expect(table.columns.find((c) => c.key === 'news')!.label).toBe('Démo demandée')

    const header = buildSalonCsv(d).split('\n')[0]!
    expect(header).toContain('Démo demandée')
    expect(header).not.toContain('Actualité')

    const xlsx = await generateExport(d, 'xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(xlsx.bytes as unknown as ArrayBuffer)
    const headers = (wb.getWorksheet('Salon')!.getRow(1).values as unknown[]).slice(1)
    expect(headers).toContain('Démo demandée')
    expect(headers).not.toContain('Actualité')
  })

  it('même règle qu’avant : pas de colonne si l’option est décochée et que personne ne l’a cochée', () => {
    const d = sampleData()
    d.team.newsLabel = 'Démo demandée ?'
    expect(buildSalonTable(d).columns.map((c) => c.key)).not.toContain('news')
  })
})
