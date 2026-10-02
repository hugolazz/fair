import type { Row, SyncTableName } from '@/db/local/db'
import { TABLES } from '@/db/local/tables'
import { supabase } from '@/lib/supabase'
import { SyncError, type PushOp, type Remote } from './types'

const PAGE = 1000

/** Réseau coupé, serveur indisponible ou limitation de débit : réessayer plus tard a un sens. */
function retryable(status: number | undefined, message: string): boolean {
  if (status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500))
    return true
  return /fetch|network|timeout|offline|load failed/i.test(message)
}

type Failure = { message: string }

function fail(error: Failure, status?: number): never {
  throw new SyncError(error.message, retryable(status, error.message))
}

/** Implémentation Supabase (PostgREST + Storage) de l'interface `Remote`. */
export const supabaseRemote: Remote = {
  async pull({ table, eventId, sinceSeq, limit }) {
    let q = supabase
      .from(table)
      .select('*')
      .gt('server_seq', sinceSeq)
      .order('server_seq', { ascending: true })
      .limit(limit)
    if (eventId && TABLES[table].scope === 'event') q = q.eq('event_id', eventId)
    const { data, error, status } = await q
    if (error) fail(error, status)
    return (data ?? []) as Row[]
  },

  async pullAll(table: SyncTableName) {
    const columns = table === 'profiles' ? 'id, display_name' : '*'
    const order = TABLES[table].pk
    const out: Row[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select(columns)
      for (const c of order) q = q.order(c)
      const { data, error, status } = await q.range(from, from + PAGE - 1)
      if (error) fail(error, status)
      const rows = (data ?? []) as unknown as Row[]
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
  },

  async push(op: PushOp) {
    const t = supabase.from(op.table)
    const match = op.key
    if (op.kind === 'insert') {
      const { error, status } = await t.upsert(op.payload, {
        onConflict: TABLES[op.table].pk.join(','),
      })
      if (error) fail(error, status)
    } else if (op.kind === 'update') {
      const { error, status } = await t.update(op.payload).match(match)
      if (error) fail(error, status)
    } else {
      const { error, status } = await t.delete().match(match)
      if (error) fail(error, status)
    }
  },

  async upload(path, blob, mime) {
    const { error } = await supabase.storage
      .from('attachments')
      .upload(path, blob, { contentType: mime, upsert: true })
    if (error) fail(error)
  },
}
