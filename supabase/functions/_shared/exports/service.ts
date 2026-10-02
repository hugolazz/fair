import { zipSync } from 'fflate'
import { buildCsv, type CsvColumn, type CsvTemplate } from './csv.ts'
import { isoDay, slug } from './format.ts'
import { buildBilanPdf } from './pdf-bilan.ts'
import { buildEventReportPdf, buildMeetingSheetsPdf, buildRepReportPdfs } from './pdf-reports.ts'
import { applyFilters } from './select.ts'
import { COLUMNS, buildTables, type ColumnSelection, type TableId } from './tables.ts'
import {
  MEETING_STATUSES,
  NO_FILTERS,
  type ExportData,
  type ExportFilters,
  type Priority,
} from './types.ts'
import { buildWorkbook } from './xlsx.ts'

// Point d'entrée commun (navigateur et Edge Function) : une demande d'export → un fichier.

export type ExportRequest =
  | { kind: 'xlsx'; filters: ExportFilters; columns?: ColumnSelection }
  | { kind: 'csv'; filters: ExportFilters; template: CsvTemplate }
  | { kind: 'pdf-global'; filters: ExportFilters }
  | { kind: 'pdf-reps'; filters: ExportFilters }
  | { kind: 'pdf-meetings'; filters: ExportFilters }
  | { kind: 'pdf-bilan'; filters: ExportFilters }

export type ExportKind = ExportRequest['kind']

export type ExportResult = { filename: string; mime: string; bytes: Uint8Array }

export const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  pdf: 'application/pdf',
  zip: 'application/zip',
} as const

const KINDS: ExportKind[] = ['xlsx', 'csv', 'pdf-global', 'pdf-reps', 'pdf-meetings', 'pdf-bilan']

// --- validation (entrée de l'Edge Function : on ne fait pas confiance au JSON reçu) -------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown, max = 500): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length <= 200).slice(0, max)
    : []

export function parseFilters(raw: unknown): ExportFilters {
  if (!isObj(raw)) return NO_FILTERS
  const allowedStatus = new Set<string>([...MEETING_STATUSES, 'none'])
  const allowedPriority = new Set<string>(['A', 'B', 'C', 'none'])
  return {
    statuses: strings(raw.statuses).filter((s) =>
      allowedStatus.has(s),
    ) as ExportFilters['statuses'],
    priorities: strings(raw.priorities).filter((p) => allowedPriority.has(p)) as (
      Priority | 'none'
    )[],
    assigneeIds: strings(raw.assigneeIds),
    tagIds: strings(raw.tagIds),
  }
}

function parseColumns(raw: unknown): ColumnSelection | undefined {
  if (!isObj(raw)) return undefined
  const out: ColumnSelection = {}
  for (const id of Object.keys(COLUMNS) as TableId[]) {
    const wanted = strings(raw[id], 100)
    if (Array.isArray(raw[id]))
      out[id] = COLUMNS[id].map((c) => c.key).filter((k) => wanted.includes(k))
  }
  return out
}

function parseTemplate(raw: unknown): CsvTemplate {
  if (
    !isObj(raw) ||
    !Array.isArray(raw.columns) ||
    raw.columns.length === 0 ||
    raw.columns.length > 100
  ) {
    throw new Error('invalid template')
  }
  const columns: CsvColumn[] = raw.columns.map((c: unknown) => {
    if (!isObj(c) || typeof c.header !== 'string' || !isObj(c.source))
      throw new Error('invalid template column')
    const source = c.source
    const map = isObj(c.map)
      ? Object.fromEntries(
          Object.entries(c.map).filter((e): e is [string, string] => typeof e[1] === 'string'),
        )
      : undefined
    return {
      header: c.header.slice(0, 120),
      source:
        typeof source.field === 'string'
          ? { field: source.field }
          : { value: String(source.value ?? '').slice(0, 500) },
      ...(map ? { map } : {}),
    }
  })
  return {
    id: String(raw.id ?? 'custom').slice(0, 40),
    name: String(raw.name ?? 'Personnalisé').slice(0, 80),
    delimiter: raw.delimiter === ';' ? ';' : ',',
    bom: raw.bom === true,
    includeCompaniesWithoutContact: raw.includeCompaniesWithoutContact === true,
    excludeOptOut: raw.excludeOptOut !== false,
    columns,
  }
}

/** Valide une demande reçue (JSON inconnu). Lève une erreur si elle est invalide. */
export function parseRequest(raw: unknown): ExportRequest {
  if (!isObj(raw) || !KINDS.includes(raw.kind as ExportKind)) throw new Error('invalid kind')
  const filters = parseFilters(raw.filters)
  switch (raw.kind as ExportKind) {
    case 'xlsx': {
      const columns = parseColumns(raw.columns)
      return { kind: 'xlsx', filters, ...(columns ? { columns } : {}) }
    }
    case 'csv':
      return { kind: 'csv', filters, template: parseTemplate(raw.template) }
    case 'pdf-global':
    case 'pdf-reps':
    case 'pdf-meetings':
    case 'pdf-bilan':
      return { kind: raw.kind as 'pdf-global', filters }
  }
}

// --- génération -------------------------------------------------------------------------------------------

/** Génère le fichier demandé. `data` est l'intégralité du salon : les filtres sont appliqués ici. */
export async function generateExport(data: ExportData, req: ExportRequest): Promise<ExportResult> {
  const filtered = applyFilters(data, req.filters)
  const base = `fair-${slug(data.event.name)}`
  const day = isoDay(data.generatedAt)

  switch (req.kind) {
    case 'xlsx': {
      const bytes = await buildWorkbook(buildTables(filtered, req.columns), {
        title: `${data.event.name} — export`,
        generatedAt: data.generatedAt,
      })
      return { filename: `${base}-export-${day}.xlsx`, mime: MIME.xlsx, bytes }
    }
    case 'csv': {
      const { csv } = buildCsv(filtered, req.template)
      return {
        filename: `${base}-${slug(req.template.name)}-${day}.csv`,
        mime: MIME.csv,
        bytes: new TextEncoder().encode(csv),
      }
    }
    case 'pdf-global':
      return {
        filename: `${base}-compte-rendu-${day}.pdf`,
        mime: MIME.pdf,
        bytes: await buildEventReportPdf(filtered),
      }
    case 'pdf-meetings':
      return {
        filename: `${base}-fiches-rencontres-${day}.pdf`,
        mime: MIME.pdf,
        bytes: await buildMeetingSheetsPdf(filtered),
      }
    case 'pdf-bilan':
      return {
        filename: `${base}-bilan-${day}.pdf`,
        mime: MIME.pdf,
        bytes: await buildBilanPdf(filtered),
      }
    case 'pdf-reps': {
      const pdfs = await buildRepReportPdfs(filtered)
      if (pdfs.length === 0) throw new Error('no salesperson')
      const files = Object.fromEntries(pdfs.map((p) => [p.filename, p.bytes]))
      return {
        filename: `${base}-par-commercial-${day}.zip`,
        mime: MIME.zip,
        bytes: zipSync(files),
      }
    }
  }
}
