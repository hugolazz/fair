import type { OutboxOp, Row, SyncTableName } from '@/db/local/db'

/** Erreur de réseau ou de serveur indisponible : on réessaiera plus tard. Sinon le refus est définitif. */
export class SyncError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'SyncError'
    this.retryable = retryable
  }
}

export type PushOp = Pick<OutboxOp, 'table' | 'kind' | 'key' | 'payload' | 'edited'> & {
  /** Version (server_seq) de la ligne connue de l'appareil : sert à détecter une modification concurrente. */
  baseSeq?: number
}

/** Réponse du serveur à l'envoi d'une opération. */
export type PushResult = {
  /** Nouvelle version de la ligne côté serveur. */
  serverSeq?: number
  /** Note modifiée ailleurs entre-temps : rien n'a été écrasé, voici la version du serveur. */
  conflict?: { serverBody: string; serverSeq: number }
}

/** Ce dont le moteur de sync a besoin côté serveur (Supabase en production, un faux dans les tests). */
export interface Remote {
  /** Lignes modifiées après `sinceSeq`, triées par `server_seq` croissant. */
  pull(p: {
    table: SyncTableName
    eventId?: string
    sinceSeq: number
    limit: number
  }): Promise<Row[]>
  /** Table entière (pour celles sans `server_seq`). */
  pullAll(table: SyncTableName): Promise<Row[]>
  push(op: PushOp): Promise<PushResult>
  /** Nombre de lignes (estimation de la taille d'un téléchargement). */
  count(table: SyncTableName, eventId?: string): Promise<number>
  upload(path: string, blob: Blob, mime: string): Promise<void>
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error'
export type SyncStatus = { phase: SyncPhase; lastSyncAt: number | null; lastError: string | null }
