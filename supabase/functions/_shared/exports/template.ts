import { IMPORT_COLUMNS, type Column, type Table } from './tables.ts'
import { buildWorkbook } from './xlsx.ts'

// Modèle de fichier d'import : un classeur sans ligne de données, seulement les intitulés de colonnes que fair reconnaît
// tout seul. Mêmes colonnes et même mise en forme que l'export, mais sans flèches de filtre sur les intitulés : ce sont
// des titres à garder tels quels, pas des listes à choisir.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Les intitulés disent ce qu'on y met : une lettre A, B ou C ; un type d'entreprise (n'importe quel libellé : un tag inconnu est créé à l'import). */
const TEMPLATE_LABELS: Record<string, string> = {
  priority: 'Priorité (A, B, C)',
  tags: 'Type (Client, Prospect…)',
}

const TEMPLATE_COLUMNS: Column[] = IMPORT_COLUMNS.map((c) => {
  const label = TEMPLATE_LABELS[c.key]
  return label ? { ...c, label } : c
})

export async function buildImportTemplate(
  generatedAt: string = new Date().toISOString(),
): Promise<{ filename: string; mime: string; bytes: Uint8Array }> {
  const table: Table = { id: 'salon', title: 'Participants', columns: TEMPLATE_COLUMNS, rows: [] }
  const bytes = await buildWorkbook([table], {
    title: "Modèle d'import fair",
    generatedAt,
    filters: false,
  })
  return { filename: 'fair-modele-import.xlsx', mime: XLSX_MIME, bytes }
}
