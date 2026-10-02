import ExcelJS from 'exceljs'
import { cellText, type Column, type Table } from './tables.ts'
import type { Priority } from './types.ts'

// Classeur Excel mis en forme : en-têtes figés, filtres actifs, largeurs adaptées au contenu, couleurs par priorité.

const BRAND = 'FF0F766E'
const FILL: Record<Priority, string> = { A: 'FFFECACA', B: 'FFFDE68A', C: 'FFBFDBFE' }
const INK: Record<Priority, string> = { A: 'FF7F1D1D', B: 'FF78350F', C: 'FF1E3A8A' }

// ExcelJS n'écrit pas la largeur quand elle vaut sa valeur par défaut (9) : on reste au-dessus (et on laisse de la
// place à la flèche du filtre dans l'en-tête).
const MIN_WIDTH = 10
const MAX_WIDTH = 70

/** Largeur d'une colonne : celle du contenu le plus long (bornée), jamais plus étroite que l'en-tête + son filtre. */
export function columnWidth(col: Column, values: string[]): number {
  const longest = values.reduce(
    (n, v) => Math.max(n, Math.max(...v.split('\n').map((l) => l.length), 0)),
    0,
  )
  const wanted = col.kind === 'longtext' ? Math.min(longest + 2, col.width) : longest + 2
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, col.label.length + 4, wanted))
}

export type WorkbookOptions = { title: string; creator?: string; generatedAt: string }

export async function buildWorkbook(tables: Table[], opts: WorkbookOptions): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = opts.creator ?? 'fair'
  wb.title = opts.title
  wb.created = new Date(opts.generatedAt)

  for (const table of tables) {
    const ws = wb.addWorksheet(table.title, { views: [{ state: 'frozen', ySplit: 1 }] })
    const texts = table.columns.map((c) =>
      table.rows.map((r) => cellText(r.cells[c.key] ?? null, c.kind)),
    )
    ws.columns = table.columns.map((c, i) => ({
      key: c.key,
      header: c.label,
      width: columnWidth(c, texts[i] ?? []),
    }))

    const header = ws.getRow(1)
    header.height = 22
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })

    const nameCol = table.columns.findIndex((c) => c.key === 'name' || c.key === 'company') + 1
    const prioCol = table.columns.findIndex((c) => c.kind === 'priority') + 1
    table.rows.forEach((r) => {
      const row = ws.addRow(table.columns.map((c) => r.cells[c.key] ?? null))
      table.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1)
        cell.alignment = { vertical: 'top', wrapText: c.kind === 'longtext' }
        if (c.kind === 'datetime') cell.numFmt = 'dd/mm/yyyy hh:mm'
        if (c.kind === 'date') cell.numFmt = 'dd/mm/yyyy'
        if (c.kind === 'number') cell.alignment = { vertical: 'top', horizontal: 'right' }
      })
      if (r.priority) {
        for (const idx of [prioCol, nameCol]) {
          if (idx < 1) continue
          const cell = row.getCell(idx)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.priority] } }
          if (idx === prioCol) cell.font = { bold: true, color: { argb: INK[r.priority] } }
        }
      }
    })

    if (table.columns.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: table.columns.length },
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
