import { IMPORT_COLUMNS, type Table } from './tables.ts'
import { buildWorkbook } from './xlsx.ts'

// Modèle de fichier d'import : un classeur sans ligne de données, seulement les intitulés de colonnes que fair reconnaît
// tout seul. Mêmes colonnes et même mise en forme que l'export (on peut aussi repartir d'un export).

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function buildImportTemplate(
  generatedAt: string = new Date().toISOString(),
): Promise<{ filename: string; mime: string; bytes: Uint8Array }> {
  const table: Table = { id: 'salon', title: 'Participants', columns: IMPORT_COLUMNS, rows: [] }
  const bytes = await buildWorkbook([table], { title: "Modèle d'import fair", generatedAt })
  return { filename: 'fair-modele-import.xlsx', mime: XLSX_MIME, bytes }
}
