import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser } from './helpers'

it('un simple membre se désassigne : la ligne passe en soft delete et sort de ses cibles', async () => {
  const db = await createTestDb()
  const alice = await createUser(db, 'alice@a.test')
  const amy = await createUser(db, 'amy@a.test')
  const team = await createTeamAs(db, alice, 'A')
  await addMember(db, team, amy)
  const event = randomUUID()
  const company = randomUUID()
  const ec = randomUUID()
  const a = as(db, alice)
  await a.query('insert into events (id, team_id, name) values ($1,$2,$3)', [event, team, 'S'])
  await a.query(
    `insert into companies (id, team_id, name, name_normalized) values ($1,$2,'X','x')`,
    [company, team],
  )
  await a.query(
    'insert into event_companies (id, team_id, event_id, company_id) values ($1,$2,$3,$4)',
    [ec, team, event, company],
  )
  const m = as(db, amy)
  await m.query(
    'insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1,$2,$3,$4)',
    [ec, amy.id, event, team],
  )
  const rows = await m.query<{ event_company_id: string }>(
    `update event_company_assignees set deleted_at = now() where user_id = $1 and event_company_id = any($2::uuid[]) returning event_company_id`,
    [amy.id, [ec]],
  )
  expect(rows).toHaveLength(1)
  const embedded = await m.query<{ n: string }>(
    `select count(*) as n from event_company_assignees where event_company_id = $1 and deleted_at is null`,
    [ec],
  )
  expect(Number(embedded[0]!.n)).toBe(0)
})
