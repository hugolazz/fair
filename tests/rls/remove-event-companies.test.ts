import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Retirer des participants d'un salon : réservé aux admins, retire la participation (pas l'entreprise) avec ses rencontres,
// notes et assignations ; l'entreprise peut ensuite être ajoutée de nouveau.
let db: PGlite
let admin: TestUser
let amy: TestUser
let bob: TestUser
let team: string
let event: string
let otherEvent: string
const company = { acme: randomUUID(), globex: randomUUID() }
const ec = { acme: randomUUID(), globex: randomUUID(), acmeOther: randomUUID() }
let meeting: string

const live = async (table: string, where = 'true') =>
  (
    await db.query<{ n: number }>(
      `select count(*)::int as n from ${table} where deleted_at is null and ${where}`,
    )
  ).rows[0]!.n

beforeAll(async () => {
  db = await createTestDb()
  admin = await createUser(db, 'admin@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  team = await createTeamAs(db, admin, 'A')
  await createTeamAs(db, bob, 'B')
  await addMember(db, team, amy)
  const a = as(db, admin)
  event = randomUUID()
  otherEvent = randomUUID()
  for (const e of [event, otherEvent])
    await a.query(
      `insert into events (id, team_id, name, status) values ($1, $2, 'S', 'preparing')`,
      [e, team],
    )
  for (const [k, id] of Object.entries(company))
    await a.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, $3, lower($3))`,
      [id, team, k],
    )
  await a.query(
    `insert into event_companies (id, team_id, event_id, company_id) values
       ($1, $4, $5, $6), ($2, $4, $5, $7), ($3, $4, $8, $6)`,
    [ec.acme, ec.globex, ec.acmeOther, team, event, company.acme, company.globex, otherEvent],
  )
  await a.query(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
    [ec.acme, amy.id, event, team],
  )
  meeting = randomUUID()
  await as(db, amy).query(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status)
     values ($1, $2, $3, $4, $5, now(), 'done')`,
    [meeting, team, event, ec.acme, amy.id],
  )
  await as(db, amy).query(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at)
     values ($1, $2, $3, $4, 'Note', 'typed', now())`,
    [randomUUID(), team, meeting, amy.id],
  )
})

describe('remove_event_companies', () => {
  it('un commercial ne peut rien retirer', async () => {
    const r = await as(db, amy).query<{ n: number }>(
      `select remove_event_companies($1::uuid[]) as n`,
      [[ec.acme, ec.globex]],
    )
    expect(r[0]!.n).toBe(0)
    expect(await live('event_companies', `event_id = '${event}'`)).toBe(2)
  })

  it('un admin d’une autre équipe non plus', async () => {
    const r = await as(db, bob).query<{ n: number }>(
      `select remove_event_companies($1::uuid[]) as n`,
      [[ec.acme]],
    )
    expect(r[0]!.n).toBe(0)
    expect(await live('event_companies', `event_id = '${event}'`)).toBe(2)
  })

  it('l’admin retire la participation avec ses rencontres, notes et assignations, pas l’entreprise ni les autres salons', async () => {
    const r = await as(db, admin).query<{ n: number }>(
      `select remove_event_companies($1::uuid[]) as n`,
      [[ec.acme, ec.globex]],
    )
    expect(r[0]!.n).toBe(2)
    expect(await live('event_companies', `event_id = '${event}'`)).toBe(0)
    expect(await live('meetings')).toBe(0)
    expect(await live('notes')).toBe(0)
    expect(await live('event_company_assignees')).toBe(0)
    expect(await live('companies')).toBe(2)
    expect(await live('event_companies', `event_id = '${otherEvent}'`)).toBe(1)
  })

  it('retirer deux fois ne compte rien de plus', async () => {
    const r = await as(db, admin).query<{ n: number }>(
      `select remove_event_companies($1::uuid[]) as n`,
      [[ec.acme]],
    )
    expect(r[0]!.n).toBe(0)
  })

  it('l’entreprise retirée peut être ajoutée de nouveau, mais pas deux fois', async () => {
    const add = () =>
      as(db, admin).query(
        `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
        [randomUUID(), team, event, company.acme],
      )
    await add()
    await expect(add()).rejects.toThrow(/duplicate key|unique/i)
  })
})
