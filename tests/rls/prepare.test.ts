import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

const RLS = /row-level security|permission denied/i

let db: PGlite
let alice: TestUser // owner A
let amy: TestUser // membre A
let bob: TestUser // owner B
let teamA: string
let teamB: string
let ecA: string // event_company de l'équipe A
let eventA: string
let companyA: string
let tagA: string

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db, 'alice@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  teamA = await createTeamAs(db, alice, 'A')
  teamB = await createTeamAs(db, bob, 'B')
  await addMember(db, teamA, amy)
  eventA = randomUUID()
  companyA = randomUUID()
  ecA = randomUUID()
  tagA = randomUUID()
  const a = as(db, alice)
  await a.query('insert into events (id, team_id, name) values ($1, $2, $3)', [
    eventA,
    teamA,
    'Salon',
  ])
  await a.query(
    `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Acme', 'acme')`,
    [companyA, teamA],
  )
  await a.query(
    'insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)',
    [ecA, teamA, eventA, companyA],
  )
  await a.query(
    `insert into tags (id, team_id, label, scope) values ($1, $2, 'Client', 'company')`,
    [tagA, teamA],
  )
})

describe('priorité et objectif typés', () => {
  it('accepte A/B/C et les objectifs prévus, rejette le reste', async () => {
    const a = as(db, alice)
    await a.query(
      `update event_companies set priority = 'A', objective = 'intro_decision_maker', prep_comment = 'Parler du POC' where id = $1`,
      [ecA],
    )
    const [row] = await a.query<{ priority: string; objective: string; prep_comment: string }>(
      'select priority, objective, prep_comment from event_companies where id = $1',
      [ecA],
    )
    expect(row).toEqual({
      priority: 'A',
      objective: 'intro_decision_maker',
      prep_comment: 'Parler du POC',
    })
    await expect(
      a.query(`update event_companies set priority = 'D' where id = $1`, [ecA]),
    ).rejects.toThrow()
    await expect(
      a.query(`update event_companies set objective = 'golf' where id = $1`, [ecA]),
    ).rejects.toThrow()
  })
})

describe('assignations', () => {
  const assign = (u: TestUser, teamId: string, userId: string) =>
    as(db, u).query(
      'insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)',
      [ecA, userId, eventA, teamId],
    )

  it('permet d’assigner plusieurs commerciaux de l’équipe à la même cible', async () => {
    await assign(alice, teamA, alice.id)
    await assign(amy, teamA, amy.id)
    const rows = await as(db, alice).query(
      'select user_id from event_company_assignees where deleted_at is null',
    )
    expect(rows).toHaveLength(2)
  })

  it('refuse d’assigner quelqu’un qui n’est pas membre de l’équipe', async () => {
    await expect(assign(alice, teamA, bob.id)).rejects.toThrow(RLS)
  })

  it('refuse d’écrire dans une autre équipe et la masque aux autres équipes', async () => {
    await expect(assign(bob, teamA, bob.id)).rejects.toThrow(RLS)
    expect(await as(db, bob).query('select * from event_company_assignees')).toHaveLength(0)
  })

  it('désassigne par soft delete (réactivable) et propage via server_seq', async () => {
    const q = (sql: string) =>
      as(db, amy).query<{ server_seq: string; deleted_at: string | null }>(sql, [ecA, amy.id])
    const before = (
      await q(
        'select server_seq, deleted_at from event_company_assignees where event_company_id = $1 and user_id = $2',
      )
    )[0]!
    await q(
      'update event_company_assignees set deleted_at = now() where event_company_id = $1 and user_id = $2',
    )
    const gone = (
      await q(
        'select server_seq, deleted_at from event_company_assignees where event_company_id = $1 and user_id = $2',
      )
    )[0]!
    expect(gone.deleted_at).not.toBeNull()
    expect(Number(gone.server_seq)).toBeGreaterThan(Number(before.server_seq))
    await q(
      'update event_company_assignees set deleted_at = null where event_company_id = $1 and user_id = $2',
    )
    expect(
      (
        await q(
          'select server_seq, deleted_at from event_company_assignees where event_company_id = $1 and user_id = $2',
        )
      )[0]!.deleted_at,
    ).toBeNull()
  })

  it('un membre ne peut pas réassigner vers un non-membre via update', async () => {
    await expect(
      as(db, amy).query(
        'update event_company_assignees set user_id = $1 where event_company_id = $2 and user_id = $3',
        [bob.id, ecA, amy.id],
      ),
    ).rejects.toThrow(RLS)
  })
})

describe('tags', () => {
  it('interdit deux tags de même libellé (casse ignorée) dans une équipe, mais pas entre équipes', async () => {
    await expect(
      as(db, alice).query(
        `insert into tags (id, team_id, label, scope) values ($1, $2, 'CLIENT', 'company')`,
        [randomUUID(), teamA],
      ),
    ).rejects.toThrow(/unique|duplicate/i)
    await expect(
      as(db, bob).query(
        `insert into tags (id, team_id, label, scope) values ($1, $2, 'Client', 'company')`,
        [randomUUID(), teamB],
      ),
    ).resolves.toBeTruthy()
  })

  it('tout membre peut poser et retirer un tag sur une entreprise ; les autres équipes ne le voient pas', async () => {
    await as(db, amy).query(
      `insert into taggings (tag_id, taggable_table, taggable_id, team_id) values ($1, 'companies', $2, $3)`,
      [tagA, companyA, teamA],
    )
    expect(await as(db, bob).query('select * from taggings')).toHaveLength(0)
    const removed = await as(db, amy).query(
      `delete from taggings where tag_id = $1 and taggable_id = $2 returning tag_id`,
      [tagA, companyA],
    )
    expect(removed).toHaveLength(1)
  })

  it('un membre d’une autre équipe ne peut pas retirer un tag', async () => {
    await as(db, alice).query(
      `insert into taggings (tag_id, taggable_table, taggable_id, team_id) values ($1, 'companies', $2, $3)`,
      [tagA, companyA, teamA],
    )
    expect(
      await as(db, bob).query(`delete from taggings where tag_id = $1 returning tag_id`, [tagA]),
    ).toHaveLength(0)
  })
})

describe('créneaux de rendez-vous', () => {
  const insertMeeting = (extra: string, params: unknown[]) =>
    as(db, amy).query(
      `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, ${extra}) values ($1, $2, $3, $4, $5, now(), ${params.map((_, i) => `$${i + 6}`).join(', ')})`,
      [randomUUID(), teamA, eventA, ecA, amy.id, ...params],
    )

  it('enregistre durée et rappel', async () => {
    await expect(
      insertMeeting('planned_duration_min, reminder_minutes', [30, 15]),
    ).resolves.toBeTruthy()
  })
  it('borne la durée et le rappel', async () => {
    await expect(insertMeeting('planned_duration_min', [1])).rejects.toThrow()
    await expect(insertMeeting('reminder_minutes', [-5])).rejects.toThrow()
  })
  it('l’historique d’une entreprise reste invisible aux autres équipes', async () => {
    expect(await as(db, bob).query('select id from meetings')).toHaveLength(0)
  })
})
