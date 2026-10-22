import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Suppression de son compte : le compte, le profil, l'appartenance et les assignations disparaissent ; les notes et
// rencontres saisies restent, sans auteur ; la propriété d'une équipe suit la règle de « Quitter l'équipe ».
let db: PGlite
let owner: TestUser
let heir: TestUser
let amy: TestUser
let solo: TestUser
let team: string
let soloTeam: string
let event: string
let meeting: string

const count = async (sql: string, params: unknown[] = []) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0]!.n

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, 'owner@a.test')
  heir = await createUser(db, 'heir@a.test')
  amy = await createUser(db, 'amy@a.test')
  solo = await createUser(db, 'solo@s.test')
  team = await createTeamAs(db, owner, 'A')
  soloTeam = await createTeamAs(db, solo, 'Solo')
  await addMember(db, team, heir, 'admin')
  await addMember(db, team, amy)

  event = randomUUID()
  const company = randomUUID()
  const ec = randomUUID()
  meeting = randomUUID()
  const a = as(db, owner)
  await a.query(
    `insert into events (id, team_id, name, status) values ($1, $2, 'S', 'preparing')`,
    [event, team],
  )
  await a.query(
    `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Acme', 'acme')`,
    [company, team],
  )
  await a.query(
    `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
    [ec, team, event, company],
  )
  await as(db, amy).query(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
    [ec, amy.id, event, team],
  )
  await as(db, amy).query(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status) values ($1, $2, $3, $4, $5, now(), 'done')`,
    [meeting, team, event, ec, amy.id],
  )
  await as(db, amy).query(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at) values ($1, $2, $3, $4, 'Compte-rendu', 'typed', now())`,
    [randomUUID(), team, meeting, amy.id],
  )
})

describe('delete_my_account', () => {
  it('exige d’être connecté', async () => {
    await expect(as(db, null).query(`select delete_my_account()`)).rejects.toThrow()
  })

  it('un commercial : compte, profil, appartenance et assignations disparaissent ; notes et rencontres restent, sans auteur', async () => {
    await as(db, amy).query(`select delete_my_account()`)
    expect(await count('auth.users where id = $1', [amy.id])).toBe(0)
    expect(await count('profiles where id = $1', [amy.id])).toBe(0)
    expect(await count('team_members where user_id = $1', [amy.id])).toBe(0)
    expect(await count('event_company_assignees where user_id = $1', [amy.id])).toBe(0)
    expect(
      await count('meetings where id = $1 and owner_id is null and deleted_at is null', [meeting]),
    ).toBe(1)
    expect(
      await count(`notes where body = 'Compte-rendu' and author_id is null and deleted_at is null`),
    ).toBe(1)
    // Les collègues et l'équipe ne sont pas touchés.
    expect(await count('team_members where team_id = $1', [team])).toBe(2)
    expect(await count('teams where id = $1 and deleted_at is null', [team])).toBe(1)
  })

  it('un propriétaire avec des collègues transmet la propriété au plus ancien admin', async () => {
    await as(db, owner).query(`select delete_my_account()`)
    expect(await count('auth.users where id = $1', [owner.id])).toBe(0)
    expect(
      await count(`team_members where team_id = $1 and user_id = $2 and role = 'owner'`, [
        team,
        heir.id,
      ]),
    ).toBe(1)
    expect(await count('teams where id = $1 and deleted_at is null', [team])).toBe(1)
    expect(await count('companies where team_id = $1 and deleted_at is null', [team])).toBe(1)
  })

  it('un propriétaire seul ferme son équipe (données conservées)', async () => {
    await as(db, solo).query(`select delete_my_account()`)
    expect(await count('auth.users where id = $1', [solo.id])).toBe(0)
    expect(await count('teams where id = $1 and deleted_at is not null', [soloTeam])).toBe(1)
  })
})
