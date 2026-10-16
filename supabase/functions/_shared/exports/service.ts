import { buildSalonCsv } from './csv.ts'
import { isoDay, slug } from './format.ts'
import { buildBilanPdf } from './pdf-bilan.ts'
import { buildEventReportPdf } from './pdf-reports.ts'
import { buildSalonTable } from './tables.ts'
import type { ExportData } from './types.ts'
import { buildWorkbook } from './xlsx.ts'

// Point d'entrée : une demande d'export → un fichier. Pas de filtre, pas d'option : on exporte tout le salon.

/**
 * - `xlsx` / `csv` : le fichier importé, enrichi de ce qui s'est passé pendant le salon (une ligne par contact) ;
 * - `pdf` : le compte-rendu du salon ;
 * - `pdf-bilan` : le bilan d'une page (page « Bilan »).
 */
export type ExportKind = 'xlsx' | 'csv' | 'pdf' | 'pdf-bilan'

export type ExportResult = { filename: string; mime: string; bytes: Uint8Array }

export const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  pdf: 'application/pdf',
} as const

/** Génère le fichier demandé pour l'intégralité du salon. */
export async function generateExport(data: ExportData, kind: ExportKind): Promise<ExportResult> {
  const base = `fair-${slug(data.event.name)}`
  const day = isoDay(data.generatedAt)

  switch (kind) {
    case 'xlsx': {
      const bytes = await buildWorkbook([buildSalonTable(data)], {
        title: `${data.event.name} — export`,
        generatedAt: data.generatedAt,
      })
      return { filename: `${base}-${day}.xlsx`, mime: MIME.xlsx, bytes }
    }
    case 'csv':
      return {
        filename: `${base}-${day}.csv`,
        mime: MIME.csv,
        bytes: new TextEncoder().encode(buildSalonCsv(data)),
      }
    case 'pdf':
      return {
        filename: `${base}-compte-rendu-${day}.pdf`,
        mime: MIME.pdf,
        bytes: await buildEventReportPdf(data),
      }
    case 'pdf-bilan':
      return {
        filename: `${base}-bilan-${day}.pdf`,
        mime: MIME.pdf,
        bytes: await buildBilanPdf(data),
      }
  }
}
