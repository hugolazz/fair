// Mini traducteur PostgREST → SQL, juste ce qu'utilise fair (supabase-js). Sert uniquement aux tests de bout en bout :
// il tourne sur PGlite avec les vraies migrations, donc les politiques RLS s'appliquent comme en production.

export type Meta = {
  /** Clés étrangères entre tables de `public` : enfant.colonne → parent.colonne. */
  fks: { child: string; childCol: string; parent: string; parentCol: string }[]
  pks: Record<string, string[]>
  /** Fonctions de `public` : retourne un ensemble de lignes ? un void ? */
  procs: Record<string, { set: boolean; void: boolean }>
}

export type Built = { sql: string; params: unknown[]; single: boolean; empty: boolean }

type Item =
  | { kind: 'col'; name: string; alias: string | null }
  | {
      kind: 'embed'
      alias: string | null
      name: string
      hint: string | null
      inner: boolean
      sub: Item[]
    }

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`

/** Découpe `a,b(c,d),e` en éléments de premier niveau. */
function splitTop(s: string, sep = ','): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  let inQuote = false
  for (const ch of s) {
    if (ch === '"') inQuote = !inQuote
    if (!inQuote) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === sep && depth === 0) {
        out.push(cur)
        cur = ''
        continue
      }
    }
    cur += ch
  }
  if (cur.trim() !== '') out.push(cur)
  return out.map((x) => x.trim())
}

function parseSelect(s: string): Item[] {
  return splitTop(s).map((raw): Item => {
    const open = raw.indexOf('(')
    if (open === -1) {
      const [alias, name] = raw.includes(':') ? raw.split(':') : [null, raw]
      return { kind: 'col', name: name!.trim(), alias: alias?.trim() ?? null }
    }
    const head = raw.slice(0, open)
    const body = raw.slice(open + 1, raw.lastIndexOf(')'))
    const [aliasPart, rest] = head.includes(':') ? head.split(':') : [null, head]
    const [name, ...mods] = rest!.split('!')
    return {
      kind: 'embed',
      alias: aliasPart?.trim() ?? null,
      name: name!.trim(),
      inner: mods.includes('inner'),
      hint: mods.find((m) => m !== 'inner') ?? null,
      sub: parseSelect(body),
    }
  })
}

class Ctx {
  readonly params: unknown[] = []
  private n = 0
  readonly meta: Meta
  constructor(meta: Meta) {
    this.meta = meta
  }
  param(v: unknown): string {
    this.params.push(v)
    return `$${this.params.length}`
  }
  alias(): string {
    return `t${++this.n}`
  }
}

function relation(meta: Meta, parent: string, embed: { name: string; hint: string | null }) {
  const toOne = meta.fks.filter(
    (f) =>
      f.child === parent && f.parent === embed.name && (!embed.hint || f.childCol === embed.hint),
  )
  const toMany = meta.fks.filter(
    (f) =>
      f.child === embed.name && f.parent === parent && (!embed.hint || f.childCol === embed.hint),
  )
  if (toOne[0]) return { many: false, parentCol: toOne[0].childCol, childCol: toOne[0].parentCol }
  if (toMany[0]) return { many: true, parentCol: toMany[0].parentCol, childCol: toMany[0].childCol }
  throw new ApiError(400, 'PGRST200', `no relationship between ${parent} and ${embed.name}`)
}

/** Opérateur PostgREST → SQL (`col` déjà quoté). */
function cond(ctx: Ctx, col: string, expr: string): string {
  let neg = false
  let rest = expr
  if (rest.startsWith('not.')) {
    neg = true
    rest = rest.slice(4)
  }
  const dot = rest.indexOf('.')
  const op = dot === -1 ? rest : rest.slice(0, dot)
  const val = dot === -1 ? '' : rest.slice(dot + 1)
  let sql: string
  switch (op) {
    case 'eq':
      sql = `${col} = ${ctx.param(val)}`
      break
    case 'neq':
      sql = `${col} <> ${ctx.param(val)}`
      break
    case 'gt':
      sql = `${col} > ${ctx.param(val)}`
      break
    case 'gte':
      sql = `${col} >= ${ctx.param(val)}`
      break
    case 'lt':
      sql = `${col} < ${ctx.param(val)}`
      break
    case 'lte':
      sql = `${col} <= ${ctx.param(val)}`
      break
    case 'like':
    case 'ilike':
      sql = `${col} ${op} ${ctx.param(val.replace(/\*/g, '%'))}`
      break
    case 'is':
      sql = `${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : val === 'false' ? 'false' : 'unknown'}`
      break
    case 'in': {
      const items = splitTop(val.replace(/^\(|\)$/g, '')).map((v) => v.replace(/^"|"$/g, ''))
      const lit = `{${items.map((v) => `"${v.replace(/(["\\])/g, '\\$1')}"`).join(',')}}`
      sql = `${col} = any(${ctx.param(lit)})`
      break
    }
    default:
      throw new ApiError(400, 'PGRST100', `unsupported operator ${op}`)
  }
  return neg ? `not (${sql})` : sql
}

function orCond(ctx: Ctx, alias: string, expr: string): string {
  const inner = expr.replace(/^\(|\)$/g, '')
  return `(${splitTop(inner)
    .map((part) => {
      const [col, ...rest] = part.split('.')
      return cond(ctx, `${alias}.${q(col!)}`, rest.join('.'))
    })
    .join(' or ')})`
}

type Filters = { top: [string, string][]; embedded: Map<string, [string, string][]> }

function splitFilters(search: URLSearchParams): Filters {
  const top: [string, string][] = []
  const embedded = new Map<string, [string, string][]>()
  for (const [k, v] of search) {
    if (RESERVED.has(k)) continue
    const dot = k.indexOf('.')
    if (dot !== -1 && !k.endsWith('.order') && !k.endsWith('.limit')) {
      const emb = k.slice(0, dot)
      const list = embedded.get(emb) ?? []
      list.push([k.slice(dot + 1), v])
      embedded.set(emb, list)
    } else if (dot === -1) top.push([k, v])
  }
  return { top, embedded }
}

function where(ctx: Ctx, alias: string, filters: [string, string][]): string[] {
  return filters.map(([k, v]) =>
    k === 'or' ? orCond(ctx, alias, v) : cond(ctx, `${alias}.${q(k)}`, v),
  )
}

function columns(
  ctx: Ctx,
  table: string,
  alias: string,
  items: Item[],
  embeddedFilters: Map<string, [string, string][]>,
  inner: string[],
): string {
  const out: string[] = []
  for (const it of items) {
    if (it.kind === 'col') {
      out.push(
        it.name === '*'
          ? `${alias}.*`
          : `${alias}.${q(it.name)}${it.alias ? ` as ${q(it.alias)}` : ''}`,
      )
      continue
    }
    const rel = relation(ctx.meta, table, it)
    const b = ctx.alias()
    const filters = embeddedFilters.get(it.alias ?? it.name) ?? embeddedFilters.get(it.name) ?? []
    const link = `${b}.${q(rel.childCol)} = ${alias}.${q(rel.parentCol)}`
    const conds = [link, ...where(ctx, b, filters)]
    const label = q(it.alias ?? it.name)
    if (it.sub.length === 1 && it.sub[0]!.kind === 'col' && it.sub[0]!.name === 'count') {
      out.push(
        `json_build_array(json_build_object('count', (select count(*) from ${q(it.name)} ${b} where ${conds.join(' and ')}))) as ${label}`,
      )
      continue
    }
    const list = columns(ctx, it.name, b, it.sub, new Map(), [])
    const subQuery = `select ${list} from ${q(it.name)} ${b} where ${conds.join(' and ')}`
    out.push(
      rel.many
        ? `coalesce((select json_agg(row_to_json(x)) from (${subQuery}) x), '[]'::json) as ${label}`
        : `(select row_to_json(x) from (${subQuery}) x) as ${label}`,
    )
    if (it.inner) inner.push(`exists (${subQuery})`)
  }
  return out.join(', ')
}

function orderBy(alias: string, order: string | null): string {
  if (!order) return ''
  const parts = splitTop(order).map((p) => {
    const [col, ...mods] = p.split('.')
    const dir = mods.includes('desc') ? 'desc' : 'asc'
    const nulls = mods.includes('nullsfirst')
      ? ' nulls first'
      : mods.includes('nullslast')
        ? ' nulls last'
        : ''
    return `${alias}.${q(col!)} ${dir}${nulls}`
  })
  return ` order by ${parts.join(', ')}`
}

function readSql(
  ctx: Ctx,
  source: string,
  table: string,
  search: URLSearchParams,
  defaultSelect: string,
): string {
  const items = parseSelect(search.get('select') ?? defaultSelect)
  const { top, embedded } = splitFilters(search)
  const a = ctx.alias()
  const inner: string[] = []
  const list = columns(ctx, table, a, items, embedded, inner)
  const conds = [...where(ctx, a, top), ...inner]
  const limit = search.get('limit')
  const offset = search.get('offset')
  return (
    `select coalesce(json_agg(row_to_json(x)), '[]'::json) as j from (select ${list} from ${source} ${a}` +
    `${conds.length ? ` where ${conds.join(' and ')}` : ''}${orderBy(a, search.get('order'))}` +
    `${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}) x`
  )
}

export function build(
  meta: Meta,
  method: string,
  table: string,
  search: URLSearchParams,
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
): Built {
  const ctx = new Ctx(meta)
  const prefer = String(headers['prefer'] ?? '')
  const wantsRows = prefer.includes('return=representation')
  const single = String(headers['accept'] ?? '').includes('vnd.pgrst.object+json')

  if (method === 'GET' || method === 'HEAD') {
    return {
      sql: readSql(ctx, q(table), table, search, '*'),
      params: ctx.params,
      single,
      empty: false,
    }
  }

  const rows = Array.isArray(body) ? body : body == null ? [] : [body]
  const finish = (write: string, returning: string): Built => {
    if (!wantsRows) return { sql: write, params: ctx.params, single, empty: true }
    // Les filtres du select final n'ont plus de sens : on ne garde que les colonnes demandées.
    const sel = new URLSearchParams({ select: search.get('select') ?? '*' })
    const read = readSql(ctx, 'w', table, sel, '*')
    return {
      sql: `with w as (${write} returning ${returning}) ${read}`,
      params: ctx.params,
      single,
      empty: false,
    }
  }

  if (method === 'POST') {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r as object)))]
    const cols = keys.map(q).join(', ')
    const p = ctx.param(JSON.stringify(rows))
    let write = `insert into ${q(table)} (${cols}) select ${cols} from json_populate_recordset(null::${q(table)}, ${p}::json)`
    if (prefer.includes('resolution=')) {
      const target = (search.get('on_conflict') ?? (meta.pks[table] ?? []).join(',')).split(',')
      const conflict = target.map((c) => q(c.trim())).join(', ')
      write += prefer.includes('ignore-duplicates')
        ? ` on conflict (${conflict}) do nothing`
        : ` on conflict (${conflict}) do update set ${keys.map((k) => `${q(k)} = excluded.${q(k)}`).join(', ')}`
    }
    return finish(write, '*')
  }

  const a = ctx.alias()
  const { top } = splitFilters(search)
  if (method === 'PATCH') {
    const keys = Object.keys((rows[0] ?? {}) as object)
    const p = ctx.param(JSON.stringify(rows[0] ?? {}))
    const conds = where(ctx, a, top)
    const write =
      `update ${q(table)} ${a} set ${keys.map((k) => `${q(k)} = r.${q(k)}`).join(', ')} ` +
      `from json_populate_record(null::${q(table)}, ${p}::json) r${conds.length ? ` where ${conds.join(' and ')}` : ''}`
    return finish(write, `${a}.*`)
  }
  if (method === 'DELETE') {
    const conds = where(ctx, a, top)
    return finish(
      `delete from ${q(table)} ${a}${conds.length ? ` where ${conds.join(' and ')}` : ''}`,
      `${a}.*`,
    )
  }
  throw new ApiError(405, 'PGRST000', `method ${method} not allowed`)
}

export function buildRpc(meta: Meta, fn: string, args: Record<string, unknown>): Built {
  const proc = meta.procs[fn]
  if (!proc) throw new ApiError(404, 'PGRST202', `function ${fn} not found`)
  const ctx = new Ctx(meta)
  const named = Object.entries(args).map(([k, v]) => {
    const value = v === null || typeof v === 'string' ? v : JSON.stringify(v)
    return `${q(k)} => ${ctx.param(value)}`
  })
  const call = `${q(fn)}(${named.join(', ')})`
  const sql = proc.void
    ? `select null::json as j from (select ${call}) v`
    : proc.set
      ? `select coalesce(json_agg(to_json(x)), '[]'::json) as j from ${call} x`
      : `select to_json(x) as j from ${call} x`
  return { sql, params: ctx.params, single: false, empty: false }
}
