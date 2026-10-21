import {
  ImportError,
  type CleanRow,
  type ColumnMapping,
  type DuplicateGroup,
  type ImportErrorCode,
  type KnownCompany,
  type RawTable,
  type RemovedCounts,
  type RowError,
} from '@/db/schemas/import'
import { cleanRows } from './clean'
import { findDuplicates } from './dedupe'
import { parseDelimited, parseFile } from './parse'

export type ParseInput =
  { kind: 'file'; name: string; buffer: ArrayBuffer } | { kind: 'paste'; text: string }

export type WorkerRequest =
  | { id: number; type: 'parse'; input: ParseInput }
  | {
      id: number
      type: 'analyze'
      table: RawTable
      mapping: ColumnMapping
      showCols: number[]
      known: KnownCompany[]
    }

export type Analysis = {
  rows: CleanRow[]
  errors: RowError[]
  removed: RemovedCounts
  groups: DuplicateGroup[]
}

export type WorkerResponse =
  | { id: number; ok: true; type: 'parsed'; grid: string[][] }
  | { id: number; ok: true; type: 'analyzed'; analysis: Analysis }
  | { id: number; ok: false; code: ImportErrorCode }

/** Traitement lourd (lecture de fichier, nettoyage, doublons) : exécuté dans un Web Worker, ou en direct en repli. */
export async function handleRequest(req: WorkerRequest): Promise<WorkerResponse> {
  try {
    if (req.type === 'parse') {
      const grid =
        req.input.kind === 'file'
          ? await parseFile(req.input.name, req.input.buffer)
          : parseDelimited(req.input.text)
      return { id: req.id, ok: true, type: 'parsed', grid }
    }
    const { rows, errors, removed } = cleanRows(req.table, req.mapping, req.showCols)
    return {
      id: req.id,
      ok: true,
      type: 'analyzed',
      analysis: { rows, errors, removed, groups: findDuplicates(rows, req.known) },
    }
  } catch (e) {
    return { id: req.id, ok: false, code: e instanceof ImportError ? e.code : 'parse_failed' }
  }
}
