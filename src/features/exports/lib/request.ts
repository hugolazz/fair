import type { CsvTemplate } from '@shared/exports/csv.ts'
import type { ExportRequest } from '@shared/exports/service.ts'
import { COLUMNS, type ColumnSelection, type TableId } from '@shared/exports/tables.ts'
import type { ExportFilters } from '@shared/exports/types.ts'

export type ExportKind = 'xlsx' | 'csv' | 'pdf'
export type PdfKind = 'pdf-global' | 'pdf-reps' | 'pdf-meetings'

export type FormState = {
  kind: ExportKind
  pdfKind: PdfKind
  filters: ExportFilters
  /** Colonnes cochées par onglet Excel. */
  columns: Record<TableId, string[]>
  template: CsvTemplate
}

export const allColumns = (): Record<TableId, string[]> => ({
  companies: COLUMNS.companies.map((c) => c.key),
  contacts: COLUMNS.contacts.map((c) => c.key),
  meetings: COLUMNS.meetings.map((c) => c.key),
  notes: COLUMNS.notes.map((c) => c.key),
})

/** Demande d'export correspondant au formulaire. */
export function buildRequest(s: FormState): ExportRequest {
  switch (s.kind) {
    case 'xlsx': {
      const everything = (Object.keys(COLUMNS) as TableId[]).every(
        (id) => s.columns[id].length === COLUMNS[id].length,
      )
      const columns: ColumnSelection = s.columns
      return { kind: 'xlsx', filters: s.filters, ...(everything ? {} : { columns }) }
    }
    case 'csv':
      return { kind: 'csv', filters: s.filters, template: s.template }
    case 'pdf':
      return { kind: s.pdfKind, filters: s.filters }
  }
}

/** Y a-t-il de quoi exporter ? (au moins une colonne par onglet n'est pas exigé : un onglet vide reste valide.) */
export function isValid(s: FormState): boolean {
  if (s.kind === 'csv') return s.template.columns.length > 0
  if (s.kind === 'xlsx')
    return (Object.keys(COLUMNS) as TableId[]).some((id) => s.columns[id].length > 0)
  return true
}
