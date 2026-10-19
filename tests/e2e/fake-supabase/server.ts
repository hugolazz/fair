// Faux Supabase pour les tests de bout en bout : les vraies migrations tournent dans PGlite (RLS comprise) derrière
// une façade HTTP qui parle assez de PostgREST et de GoTrue pour supabase-js. Aucun Docker, aucun réseau.
// Lancement : node tests/e2e/fake-supabase/server.ts  (PORT=54399 par défaut)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { PGlite } from '@electric-sql/pglite'
import { addMember, createTeamAs, createTestDb, createUser } from '../../rls/helpers.ts'
import { ApiError, build, buildRpc, type Built, type Meta } from './postgrest.ts'

export const PASSWORD = 'e2e-password-1'
export const USERS = {
  admin: 'admin@fair.test',
  marie: 'marie@fair.test',
  paul: 'paul@fair.test',
  newcomer: 'newcomer@fair.test',
} as const

type Account = { id: string; email: string }

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

function jwt(user: Account): string {
  const now = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
  })}.fake`
}

function claimsOf(req: IncomingMessage): Account | null {
  const token = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub?: string
      email?: string
      role?: string
    }
    return c.role === 'authenticated' && c.sub ? { id: c.sub, email: c.email ?? '' } : null
  } catch {
    return null
  }
}

async function readMeta(db: PGlite): Promise<Meta> {
  const fks = await db.query<{
    child: string
    child_col: string
    parent: string
    parent_col: string
  }>(`
    select c.conrelid::regclass::text as child, ca.attname as child_col,
           c.confrelid::regclass::text as parent, pa.attname as parent_col
    from pg_constraint c
    join pg_attribute ca on ca.attrelid = c.conrelid and ca.attnum = c.conkey[1]
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.connamespace = 'public'::regnamespace`)
  const pks = await db.query<{ tbl: string; cols: string[] }>(`
    select i.indrelid::regclass::text as tbl,
           array_agg(a.attname order by array_position(i.indkey, a.attnum)) as cols
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indisprimary and i.indrelid::regclass::text !~ '\\.'
    group by i.indrelid`)
  const procs = await db.query<{ proname: string; proretset: boolean; is_void: boolean }>(`
    select proname, proretset, prorettype = 'void'::regtype as is_void
    from pg_proc where pronamespace = 'public'::regnamespace`)
  return {
    fks: fks.rows.map((f) => ({
      child: f.child,
      childCol: f.child_col,
      parent: f.parent,
      parentCol: f.parent_col,
    })),
    pks: Object.fromEntries(pks.rows.map((p) => [p.tbl, p.cols])),
    procs: Object.fromEntries(
      procs.rows.map((p) => [p.proname, { set: p.proretset, void: p.is_void }]),
    ),
  }
}

type State = {
  db: PGlite
  meta: Meta
  accounts: Map<string, Account>
}

async function freshState(seed: 'team' | 'none'): Promise<State> {
  const db = await createTestDb()
  const accounts = new Map<string, Account>()
  for (const email of Object.values(USERS)) {
    const u = await createUser(db, email)
    accounts.set(email, u)
  }
  if (seed === 'team') {
    const admin = accounts.get(USERS.admin)!
    const teamId = await createTeamAs(db, admin, 'Équipe e2e')
    await addMember(db, teamId, accounts.get(USERS.marie)!, 'member')
    await addMember(db, teamId, accounts.get(USERS.paul)!, 'member')
  }
  return { db, meta: await readMeta(db), accounts }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
  'access-control-expose-headers': 'content-range,content-type',
}

function send(
  res: ServerResponse,
  status: number,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  res.writeHead(status, {
    ...CORS,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...extra,
  })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

function pgStatus(code: string | undefined): number {
  if (!code) return 400
  if (code === '23505') return 409
  if (code === '42501') return 403
  if (code === '42P01') return 404
  return 400
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString()
}

async function run(state: State, user: Account | null, built: Built): Promise<unknown> {
  const claims = user
    ? JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })
    : ''
  return state.db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`)
    const res = await tx.query<{ j: unknown }>(built.sql, built.params)
    return built.empty ? null : res.rows[0]?.j
  })
}

export async function startFakeSupabase(port: number) {
  let state = await freshState('team')

  const server = createServer((req, res) => {
    void handle(req, res).catch((e: unknown) => {
      const err = e as { code?: string; message?: string; status?: number }
      send(res, err instanceof ApiError ? err.status : pgStatus(err.code), {
        code: err.code ?? 'PGRST000',
        message: err.message ?? 'error',
        details: null,
        hint: null,
      })
    })
  })

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...CORS,
        'access-control-allow-headers': String(
          req.headers['access-control-request-headers'] ?? '*',
        ),
      })
      res.end()
      return
    }
    const path = url.pathname

    // --- Pilotage des tests -------------------------------------------------------------------------------------
    if (path === '/__e2e/reset') {
      state = await freshState(url.searchParams.get('seed') === 'none' ? 'none' : 'team')
      return send(res, 200, { ok: true })
    }
    if (path === '/__e2e/exec') {
      // Préparation de données en superutilisateur (hors RLS) : { sql, params? } → lignes.
      const { sql, params } = JSON.parse(await readBody(req)) as { sql: string; params?: unknown[] }
      const r = await state.db.query(sql, params ?? [])
      return send(res, 200, r.rows)
    }
    if (path === '/__e2e/users') {
      return send(res, 200, Object.fromEntries([...state.accounts].map(([e, a]) => [e, a.id])))
    }

    // --- GoTrue ---------------------------------------------------------------------------------------------------
    if (path === '/auth/v1/token') {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        email?: string
        password?: string
        refresh_token?: string
      }
      let account: Account | undefined
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        account = [...state.accounts.values()].find((a) => `rt-${a.id}` === body.refresh_token)
      } else if (body.password === PASSWORD) {
        account = state.accounts.get(String(body.email).toLowerCase())
      }
      if (!account) {
        return send(res, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          code: 400,
          msg: 'Invalid login credentials',
        })
      }
      return send(res, 200, session(account))
    }
    if (path === '/auth/v1/signup') {
      // Inscription sans confirmation par e-mail : le profil naît du trigger, nourri par options.data.
      const body = JSON.parse((await readBody(req)) || '{}') as {
        email?: string
        data?: Record<string, unknown>
      }
      const email = String(body.email ?? '').toLowerCase()
      if (state.accounts.has(email)) {
        return send(res, 422, {
          code: 422,
          error_code: 'user_already_exists',
          msg: 'User already registered',
        })
      }
      const created = await state.db.query<{ id: string }>(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id',
        [email, JSON.stringify(body.data ?? {})],
      )
      const account = { id: created.rows[0]!.id, email }
      state.accounts.set(email, account)
      return send(res, 200, session(account))
    }
    if (path === '/auth/v1/user') {
      const u = claimsOf(req)
      return u ? send(res, 200, authUser(u)) : send(res, 401, { msg: 'not authenticated' })
    }
    if (path === '/auth/v1/logout') return send(res, 204)

    // --- Edge Functions et Storage : non fournis (l'appli retombe sur la génération locale) --------------------------
    if (path.startsWith('/functions/v1/') || path.startsWith('/storage/v1/')) {
      return send(res, 404, { error: 'not available in e2e' })
    }

    // --- PostgREST ------------------------------------------------------------------------------------------------
    if (path.startsWith('/rest/v1/')) {
      const name = decodeURIComponent(path.slice('/rest/v1/'.length))
      const user = claimsOf(req)
      const raw = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req)
      const body: unknown = raw ? JSON.parse(raw) : undefined
      const built = name.startsWith('rpc/')
        ? buildRpc(state.meta, name.slice(4), (body ?? {}) as Record<string, unknown>)
        : build(state.meta, req.method ?? 'GET', name, url.searchParams, req.headers, body)
      const out = await run(state, user, built)
      if (name.startsWith('rpc/'))
        return send(res, out === null ? 204 : 200, out === null ? undefined : out)
      if (built.empty) return send(res, req.method === 'POST' ? 201 : 204)
      const rows = (out ?? []) as unknown[]
      if (built.single) {
        if (rows.length !== 1) {
          return send(res, 406, {
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
            details: `The result contains ${rows.length} rows`,
            hint: null,
          })
        }
        return send(res, req.method === 'POST' ? 201 : 200, rows[0])
      }
      return send(res, req.method === 'POST' ? 201 : 200, rows, {
        'content-range': `0-${Math.max(rows.length - 1, 0)}/*`,
      })
    }

    return send(res, 404, { message: 'not found' })
  }

  function authUser(a: Account) {
    return {
      id: a.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: a.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    }
  }
  function session(a: Account) {
    return {
      access_token: jwt(a),
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `rt-${a.id}`,
      user: authUser(a),
    }
  }

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

// Exécution directe : node tests/e2e/fake-supabase/server.ts
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const port = Number(process.env['PORT'] ?? 54399)
  await startFakeSupabase(port)
  console.log(`fake supabase on http://127.0.0.1:${port}`)
}
