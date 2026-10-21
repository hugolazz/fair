import { useEffect, useRef } from 'react'
import {
  ImportError,
  type ColumnMapping,
  type KnownCompany,
  type RawTable,
} from '@/db/schemas/import'
import {
  handleRequest,
  type Analysis,
  type ParseInput,
  type WorkerRequest,
  type WorkerResponse,
} from './lib/runner'

type Pending = { resolve: (r: WorkerResponse) => void }

/**
 * Exécute lecture de fichier, nettoyage et détection de doublons dans un Web Worker pour garder l'interface
 * fluide sur 5 000 lignes. Sans Worker (environnement restreint), repli sur le fil principal.
 */
export function useImportWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, Pending>())
  const seq = useRef(0)

  useEffect(() => {
    const map = pending.current
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      map.clear()
    }
  }, [])

  function getWorker(): Worker | null {
    if (workerRef.current) return workerRef.current
    if (typeof Worker === 'undefined') return null
    try {
      const w = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        pending.current.get(e.data.id)?.resolve(e.data)
        pending.current.delete(e.data.id)
      }
      w.onerror = () => {
        // Worker inutilisable : toutes les requêtes en attente échouent proprement.
        for (const [id, p] of pending.current) p.resolve({ id, ok: false, code: 'parse_failed' })
        pending.current.clear()
      }
      workerRef.current = w
      return w
    } catch {
      return null
    }
  }

  function call(
    build: (id: number) => WorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<WorkerResponse> {
    const id = ++seq.current
    const req = build(id)
    const worker = getWorker()
    if (!worker) return handleRequest(req)
    return new Promise((resolve) => {
      pending.current.set(id, { resolve })
      worker.postMessage(req, transfer)
    })
  }

  return {
    async parse(input: ParseInput): Promise<string[][]> {
      const res = await call(
        (id) => ({ id, type: 'parse', input }),
        input.kind === 'file' ? [input.buffer] : [],
      )
      if (!res.ok) throw new ImportError(res.code)
      if (res.type !== 'parsed') throw new ImportError('parse_failed')
      return res.grid
    },
    async analyze(
      table: RawTable,
      mapping: ColumnMapping,
      showCols: number[],
      known: KnownCompany[],
    ): Promise<Analysis> {
      const res = await call((id) => ({ id, type: 'analyze', table, mapping, showCols, known }))
      if (!res.ok) throw new ImportError(res.code)
      if (res.type !== 'analyzed') throw new ImportError('parse_failed')
      return res.analysis
    },
  }
}
