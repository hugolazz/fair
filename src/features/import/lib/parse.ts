import Papa from 'papaparse'
import { IMPORT_LIMITS, ImportError, type RawTable } from '@/db/schemas/import'
import { cleanCell } from './text'

/** Décode un fichier texte : UTF-8, sinon Windows-1252 (cas fréquent des CSV exportés par Excel). */
export function decodeText(buffer: ArrayBuffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer)
  }
  return text.replace(/^\uFEFF/, '')
}

const DELIMITERS = [';', ',', '\t', '|'] as const

/**
 * Délimiteur le plus plausible : celui dont le nombre d'occurrences hors guillemets est le plus
 * régulier d'une ligne à l'autre (les 20 premières lignes), à égalité celui qui sépare le plus.
 * Plus fiable que la détection de Papa Parse sur de petits fichiers avec cellules multi-lignes.
 */
export function detectDelimiter(text: string): string {
  const lines: Record<string, number>[] = []
  let counts: Record<string, number> = Object.fromEntries(DELIMITERS.map((d) => [d, 0]))
  let quoted = false
  let seen = 0
  for (let i = 0; i < Math.min(text.length, 40_000) && lines.length < 20; i++) {
    const ch = text[i]!
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (seen > 0) lines.push(counts)
      counts = Object.fromEntries(DELIMITERS.map((d) => [d, 0]))
      seen = 0
      continue
    } else if (!quoted && (DELIMITERS as readonly string[]).includes(ch)) counts[ch]!++
    if (ch !== ' ') seen++
  }
  if (seen > 0 && lines.length < 20) lines.push(counts)
  let best = ','
  let bestScore = -1
  for (const d of DELIMITERS) {
    const ref = lines[0]?.[d] ?? 0
    if (ref === 0) continue
    const score = lines.filter((l) => l[d] === ref).length * 1000 + ref
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

/** Parse un CSV/TSV (délimiteur détecté : `,` `;` tabulation `|`) ou un copier-coller de tableur. */
export function parseDelimited(text: string): string[][] {
  if (!text.trim()) throw new ImportError('empty')
  const clean = text.replace(/^\uFEFF/, '')
  const result = Papa.parse<string[]>(clean, {
    delimiter: detectDelimiter(clean),
    skipEmptyLines: false,
  })
  if (result.data.length === 0) throw new ImportError('parse_failed')
  return result.data
}

type Cell = string | number | boolean | Date | null | undefined

function cellToString(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  return String(v)
}

/** Lit un .xlsx : première feuille non vide. Les anciens .xls ne sont pas pris en charge. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const { default: readXlsxFile } = await import('read-excel-file/universal')
  let sheets: { sheet: string; data: Cell[][] }[]
  try {
    sheets = (await readXlsxFile(buffer)) as unknown as { sheet: string; data: Cell[][] }[]
  } catch {
    throw new ImportError('parse_failed')
  }
  const first = sheets.find((s) =>
    s.data.some((row) => row.some((c) => cleanCell(cellToString(c)) !== '')),
  )
  if (!first) throw new ImportError('empty')
  return first.data.map((row) => row.map(cellToString))
}

export type FileKind = 'xlsx' | 'xls' | 'text'

/** Détection par signature (zip « PK » = xlsx, OLE = xls) puis par extension. */
export function detectFileKind(name: string, buffer: ArrayBuffer): FileKind {
  const head = new Uint8Array(buffer.slice(0, 4))
  if (head[0] === 0x50 && head[1] === 0x4b) return 'xlsx'
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'xls'
  return /\.xlsx$/i.test(name) ? 'xlsx' : /\.xls$/i.test(name) ? 'xls' : 'text'
}

export async function parseFile(name: string, buffer: ArrayBuffer): Promise<string[][]> {
  if (buffer.byteLength > IMPORT_LIMITS.maxBytes) throw new ImportError('file_too_large')
  const kind = detectFileKind(name, buffer)
  if (kind === 'xls') throw new ImportError('unsupported_format')
  const grid = kind === 'xlsx' ? await parseXlsx(buffer) : parseDelimited(decodeText(buffer))
  if (grid.length > IMPORT_LIMITS.maxRows + 1) throw new ImportError('too_many_rows')
  return grid
}

function columnLetter(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/**
 * Grille brute → tableau : lignes de tête vides ignorées, cellules nettoyées, lignes complétées à la largeur max.
 * `rowNumbers` conserve le numéro de ligne d'origine (1 = première ligne du fichier) pour le rapport d'erreurs.
 */
export function buildTable(grid: string[][], firstRowIsHeader: boolean): RawTable {
  const width = grid.reduce((w, r) => Math.max(w, r.length), 0)
  const clean = grid.map((r) => Array.from({ length: width }, (_, i) => cleanCell(r[i])))
  const firstData = clean.findIndex((r) => r.some((c) => c !== ''))
  if (firstData === -1 || width === 0) throw new ImportError('empty')

  let headers: string[]
  let start: number
  if (firstRowIsHeader) {
    headers = clean[firstData]!
    start = firstData + 1
  } else {
    headers = []
    start = firstData
  }
  const seen = new Map<string, number>()
  headers = Array.from({ length: width }, (_, i) => {
    const base = headers[i] || `(${columnLetter(i)})`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
  return {
    headers,
    rows: clean.slice(start),
    rowNumbers: clean.slice(start).map((_, i) => start + i + 1),
  }
}
