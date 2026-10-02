import Papa from 'papaparse'
import type { RowError } from '@/db/schemas/import'

/**
 * CSV des lignes en erreur : numéro de ligne, motif, puis les colonnes d'origine pour corriger et ré-importer.
 * Séparateur « ; » et BOM UTF-8 pour une ouverture directe dans Excel en français.
 * Les cellules commençant par = + - @ sont préfixées d'une apostrophe (injection de formules).
 */
export function buildErrorsCsv(
  errors: RowError[],
  headers: string[],
  labels: { row: string; reason: string },
  reasonOf: (e: RowError) => string,
): string {
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
  const data = [
    [labels.row, labels.reason, ...headers],
    ...errors.map((e) => [String(e.rowNumber), reasonOf(e), ...e.raw.map(safe)]),
  ]
  return '\uFEFF' + Papa.unparse(data, { delimiter: ';', newline: '\r\n' })
}
