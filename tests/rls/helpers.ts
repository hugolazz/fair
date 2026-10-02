import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const root = join(import.meta.dirname, '..', '..')

export type TestUser = { id: string; email: string }

/** Base Postgres en mémoire avec les vraies migrations de supabase/migrations. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } })
  await db.exec(readFileSync(join(import.meta.dirname, 'auth-stub.sql'), 'utf8'))
  const dir = join(root, 'supabase', 'migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  return db
}

export async function createUser(db: PGlite, email: string): Promise<TestUser> {
  const res = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  return { id: res.rows[0]!.id, email }
}

export type Session = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>
}

/**
 * Exécute des requêtes comme le ferait PostgREST : rôle `authenticated` (ou `anon` si user = null)
 * avec les claims JWT correspondants. Les politiques RLS s'appliquent.
 */
export function as(db: PGlite, user: TestUser | null): Session {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const claims = user
        ? JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })
        : ''
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
      await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
      try {
        return (await db.query<T>(sql, params)).rows
      } finally {
        await db.exec('reset role')
      }
    },
  }
}

/** Équipe + propriétaire, créés via la RPC create_team comme dans l'application. */
export async function createTeamAs(db: PGlite, user: TestUser, name: string): Promise<string> {
  const rows = await as(db, user).query<{ create_team: string }>('select create_team($1)', [name])
  return rows[0]!.create_team
}

export async function addMember(
  db: PGlite,
  teamId: string,
  user: TestUser,
  role: 'admin' | 'member' = 'member',
) {
  await db.query('insert into team_members (team_id, user_id, role) values ($1, $2, $3)', [
    teamId,
    user.id,
    role,
  ])
}
