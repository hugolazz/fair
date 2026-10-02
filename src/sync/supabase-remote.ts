import type { Row, SyncTableName } from '@/db/local/db'
import { TABLES } from '@/db/local/tables'
import { supabase } from '@/lib/supabase'
import { SyncError, type PushOp, type PushResult, type Remote } from './types'

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

const hasSeq = (table: SyncTableName) => TABLES[table].scope !== 'full'
const seqOf = (rows: unknown): number | undefined => {
  const first = Array.isArray(rows) ? (rows[0] as { server_seq?: unknown } | undefined) : undefined
  return first?.server_seq === undefined ? undefined : Number(first.server_seq)
}

/** Implémentation Supabase (PostgREST + Storage + RPC de résolution de conflits) de l'interface `Remote`. */
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

  async push(op: PushOp): Promise<PushResult> {
    const { table, key, payload } = op
    if (op.kind === 'delete') {
      const { error, status } = await supabase.from(table).delete().match(key)
      if (error) fail(error, status)
      return {}
    }
    if (op.kind === 'insert') {
      const q = supabase.from(table).upsert(payload, { onConflict: TABLES[table].pk.join(',') })
      const { data, error, status } = await (hasSeq(table) ? q.select('server_seq') : q)
      if (error) fail(error, status)
      return { serverSeq: seqOf(data) }
    }

    // Meetings : dernier écrit gagne par champ, décidé par le serveur d'après l'heure de chaque champ.
    if (table === 'meetings') {
      const { data, error, status } = await supabase.rpc('patch_meeting', {
        p_id: key.id,
        p_patch: payload,
        p_edited: op.edited ?? {},
      })
      if (error) fail(error, status)
      return { serverSeq: data === null || data === undefined ? undefined : Number(data) }
    }

    // Notes : compare-and-swap sur le texte ; en cas de modification concurrente le serveur ne change rien.
    if (table === 'notes' && typeof payload.body === 'string' && op.baseSeq !== undefined) {
      const { data, error, status } = await supabase.rpc('patch_note', {
        p_id: key.id,
        p_body: payload.body,
        p_base_seq: op.baseSeq,
      })
      if (error) fail(error, status)
      const r = (
        data as { outcome: string; server_seq: number | null; body: string | null }[] | null
      )?.[0]
      if (r?.outcome === 'conflict')
        return { conflict: { serverBody: r.body ?? '', serverSeq: Number(r.server_seq) } }
      const rest = Object.fromEntries(Object.entries(payload).filter(([c]) => c !== 'body'))
      if (r?.outcome !== 'missing' && Object.keys(rest).length > 0) {
        const res = await supabase.from('notes').update(rest).match(key).select('server_seq')
        if (res.error) fail(res.error, res.status)
        return { serverSeq: seqOf(res.data) }
      }
      return {
        serverSeq:
          r?.server_seq === null || r?.server_seq === undefined ? undefined : Number(r.server_seq),
      }
    }

    const q = supabase.from(table).update(payload).match(key)
    const { data, error, status } = await (hasSeq(table) ? q.select('server_seq') : q)
    if (error) fail(error, status)
    return { serverSeq: seqOf(data) }
  },

  async upload(path, blob, mime) {
    const { error } = await supabase.storage
      .from('attachments')
      .upload(path, blob, { contentType: mime, upsert: true })
    if (error) fail(error)
  },

  async count(table, eventId) {
    let q = supabase.from(table).select('*', { count: 'exact', head: true })
    if (eventId && TABLES[table].scope === 'event') q = q.eq('event_id', eventId)
    const { count, error, status } = await q
    if (error) fail(error, status)
    return count ?? 0
  },
}
