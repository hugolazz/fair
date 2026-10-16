import { buildSalonTable, cellText } from './tables.ts'
import type { ExportData } from './types.ts'

// CSV du salon : le même contenu que l'Excel (une ligne par contact), en UTF-8 avec BOM et séparateur « ; » pour qu'Excel
// en français l'ouvre directement avec les accents.

/**
 * Neutralise l'injection de formules (=, @, + ou - suivi d'autre chose qu'un numéro) à l'ouverture dans un tableur.
 * Les numéros de téléphone (« +33 6 12 34 56 78 ») et les nombres négatifs restent intacts.
 */
export function safeCell(v: string): string {
  if (/^[=@]/.test(v)) return `'${v}`
  if (/^[+-]/.test(v) && !/^[+-][0-9 ().\-/]+$/.test(v)) return `'${v}`
  return v
}

function quote(v: string, delimiter: string): string {
  return v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Écrit des lignes en CSV (RFC 4180, fins de ligne CRLF). */
export function toCsv(rows: string[][], delimiter: ',' | ';', bom: boolean): string {
  const body = rows.map((r) => r.map((v) => quote(v, delimiter)).join(delimiter)).join('\r\n')
  return `${bom ? '﻿' : ''}${body}\r\n`
}

export function buildSalonCsv(data: ExportData): string {
  const table = buildSalonTable(data)
  const rows = [
    table.columns.map((c) => c.label),
    ...table.rows.map((r) =>
      table.columns.map((c) => safeCell(cellText(r.cells[c.key] ?? null, c.kind))),
    ),
  ]
  return toCsv(rows, ';', true)
}
