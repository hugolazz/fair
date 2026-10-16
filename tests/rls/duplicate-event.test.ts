import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

let db: PGlite
let admin: TestUser
let amy: TestUser
let bob: TestUser
let team: string
let event: string

const RLS = /row-level security/i
const mapping = { columns: { companyName: 'Société', stand: 'Stand' }, firstRowIsHeader: true }

beforeAll(async () => {
  db = await createTestDb()
  admin = await createUser(db, 'admin@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  team = await createTeamAs(db, admin, 'A')
  await createTeamAs(db, bob, 'B')
  await addMember(db, team, amy)

  event = randomUUID()
  const a = as(db, admin)
  await a.query(
    `insert into events (id, team_id, name, starts_on, ends_on, venue, city, country, status, goals)
     values ($1, $2, 'Tech For Retail 2027', '2027-05-12', '2027-05-13', 'Paris Expo', 'Paris', 'France', 'done', '{"text":"Signer 3 démos"}')`,
    [event, team],
  )
  const [c1, c2, c3] = [randomUUID(), randomUUID(), randomUUID()]
  for (const [id, n] of [
    [c1, 'Acme'],
    [c2, 'Globex'],
    [c3, 'Initech'],
  ] as const) {
    await a.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, $3, lower($3))`,
      [id, team, n],
    )
  }
  await a.query(
    `insert into event_companies (id, team_id, event_id, company_id, stand_label, priority, objective, prep_comment, deleted_at)
     values ($1, $4, $5, $6, 'B12', 'A', 'demo', 'Parler du POC', null),
            ($2, $4, $5, $7, 'C3', 'B', null, null, null),
            ($3, $4, $5, $8, 'D1', 'C', null, null, now())`,
    [randomUUID(), randomUUID(), randomUUID(), team, event, c1, c2, c3],
  )
  await a.query(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id)
    select id, $1, event_id, team_id from event_companies where event_id = $2 and deleted_at is null`,
    [amy.id, event],
  )
  await a.query(
    `insert into import_batches (id, team_id, event_id, filename, row_count, mapping, created_at)
    values ($1, $3, $4, 'ancien.csv', 10, '{"old":true}', now() - interval '2 days'),
           ($2, $3, $4, 'dernier.csv', 50, $5::jsonb, now())`,
    [randomUUID(), randomUUID(), team, event, JSON.stringify(mapping)],
  )
})

const duplicate = (u: TestUser, args: unknown[]) =>
  as(db, u).query<{ duplicate_event: string }>(
    'select duplicate_event($1, $2, $3, $4, $5, $6) as duplicate_event',
    args,
  )

describe('duplication d’un salon comme modèle', () => {
  it('copie la configuration, en brouillon, avec le nouveau nom et les nouvelles dates', async () => {
    const [{ duplicate_event: id }] = (await duplicate(admin, [
      event,
      '  Tech For Retail 2028 ',
      '2028-05-10',
      '2028-05-11',
      false,
      true,
    ])) as [{ duplicate_event: string }]
    const [e] = await as(db, admin).query<Record<string, unknown>>(
      'select * from events where id = $1',
      [id],
    )
    expect(e).toMatchObject({
      name: 'Tech For Retail 2028',
      starts_on: new Date('2028-05-10T00:00:00.000Z'),
      ends_on: new Date('2028-05-11T00:00:00.000Z'),
      venue: 'Paris Expo',
      city: 'Paris',
      country: 'France',
      status: 'draft', // jamais le statut de l'édition d'origine
      team_id: team,
      goals: { text: 'Signer 3 démos' },
    })
    expect(id).not.toBe(event)
  })

  it('copie le mapping d’import du DERNIER import, sans le fichier ni les lignes', async () => {
    const [{ duplicate_event: id }] = (await duplicate(admin, [
      event,
      'Édition 2',
      null,
      null,
      false,
      true,
    ])) as [{ duplicate_event: string }]
    const batches = await as(db, admin).query<Record<string, unknown>>(
      'select * from import_batches where event_id = $1',
      [id],
    )
    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({ filename: null, row_count: 0, mapping })
  })

  it('sans l’option : pas de mapping copié', async () => {
    const [{ duplicate_event: id }] = (await duplicate(admin, [
      event,
      'Édition 3',
      null,
      null,
      false,
      false,
    ])) as [{ duplicate_event: string }]
    expect(
      await as(db, admin).query('select 1 from import_batches where event_id = $1', [id]),
    ).toHaveLength(0)
  })

  it('ne copie PAS les participants par défaut', async () => {
    const [{ duplicate_event: id }] = (await duplicate(admin, [
      event,
      'Édition 4',
      null,
      null,
      false,
      true,
    ])) as [{ duplicate_event: string }]
    expect(
      await as(db, admin).query('select 1 from event_companies where event_id = $1', [id]),
    ).toHaveLength(0)
  })

  it('en option, copie les participants actifs avec priorité, objectif et commentaire — sans stand ni assignation', async () => {
    const [{ duplicate_event: id }] = (await duplicate(admin, [
      event,
      'Édition 5',
      null,
      null,
      true,
      true,
    ])) as [{ duplicate_event: string }]
    const rows = await as(db, admin).query<Record<string, unknown>>(
      `select c.name, ec.priority, ec.objective, ec.prep_comment, ec.stand_label
       from event_companies ec join companies c on c.id = ec.company_id where ec.event_id = $1 order by c.name`,
      [id],
    )
    expect(rows).toEqual([
      {
        name: 'Acme',
        priority: 'A',
        objective: 'demo',
        prep_comment: 'Parler du POC',
        stand_label: null,
      },
      { name: 'Globex', priority: 'B', objective: null, prep_comment: null, stand_label: null },
    ]) // Initech (supprimée) n'est pas copiée
    expect(
      await as(db, admin).query('select 1 from event_company_assignees where event_id = $1', [id]),
    ).toHaveLength(0)
    expect(
      await as(db, admin).query('select 1 from meetings where event_id = $1', [id]),
    ).toHaveLength(0)
  })

  it('laisse l’édition d’origine intacte', async () => {
    const [orig] = await as(db, admin).query<Record<string, unknown>>(
      'select name, status from events where id = $1',
      [event],
    )
    expect(orig).toEqual({ name: 'Tech For Retail 2027', status: 'done' })
    expect(
      await as(db, admin).query('select 1 from event_companies where event_id = $1', [event]),
    ).toHaveLength(3)
  })

  it('réservée aux admins : un commercial ne duplique pas', async () => {
    await expect(duplicate(amy, [event, 'Piraté', null, null, false, true])).rejects.toThrow(RLS)
  })

  it('un salon d’une autre équipe est introuvable', async () => {
    await expect(duplicate(bob, [event, 'Volé', null, null, true, true])).rejects.toThrow(
      /event not found/,
    )
  })

  it('refuse un nom vide et des dates inversées', async () => {
    await expect(duplicate(admin, [event, '   ', null, null, false, true])).rejects.toThrow(
      /name required/,
    )
    await expect(
      duplicate(admin, [event, 'X', '2028-05-12', '2028-05-10', false, true]),
    ).rejects.toThrow(/invalid dates/)
  })
})
