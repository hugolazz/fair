import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

const RLS = /row-level security|permission denied/i

let db: PGlite
let alice: TestUser // owner équipe A
let adam: TestUser // admin équipe A
let amy: TestUser // membre équipe A
let bob: TestUser // owner équipe B
let teamA: string
let teamB: string
let eventA: string
let eventB: string

async function insertEvent(user: TestUser, teamId: string, name = 'salon') {
  const id = randomUUID()
  await as(db, user).query('insert into events (id, team_id, name) values ($1, $2, $3)', [
    id,
    teamId,
    name,
  ])
  return id
}

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db, 'alice@a.test')
  adam = await createUser(db, 'adam@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  teamA = await createTeamAs(db, alice, 'Équipe A')
  teamB = await createTeamAs(db, bob, 'Équipe B')
  await addMember(db, teamA, adam, 'admin')
  await addMember(db, teamA, amy, 'member')
  eventA = await insertEvent(alice, teamA, 'Salon A')
  eventB = await insertEvent(bob, teamB, 'Salon B')
})

describe('isolation entre équipes', () => {
  it('ne montre à chacun que les salons de son équipe', async () => {
    expect(
      (await as(db, alice).query('select id from events')).map((r) => (r as { id: string }).id),
    ).toEqual([eventA])
    expect(
      (await as(db, bob).query('select id from events')).map((r) => (r as { id: string }).id),
    ).toEqual([eventB])
  })

  it('refuse d’insérer dans une autre équipe', async () => {
    await expect(insertEvent(bob, teamA)).rejects.toThrow(RLS)
  })

  it('ignore les update et delete visant une autre équipe', async () => {
    const upd = await as(db, bob).query(
      `update events set name = 'piraté' where id = $1 returning id`,
      [eventA],
    )
    expect(upd).toHaveLength(0)
    const del = await as(db, bob).query('delete from events where id = $1 returning id', [eventA])
    expect(del).toHaveLength(0)
    const [row] = await as(db, alice).query<{ name: string }>(
      'select name from events where id = $1',
      [eventA],
    )
    expect(row?.name).toBe('Salon A')
  })

  it('refuse de déplacer un salon vers une équipe dont on n’est pas membre', async () => {
    await expect(
      as(db, alice).query('update events set team_id = $1 where id = $2', [teamB, eventA]),
    ).rejects.toThrow(RLS)
  })

  it('isole entreprises et contacts', async () => {
    const companyId = randomUUID()
    await as(db, alice).query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Acme', 'acme')`,
      [companyId, teamA],
    )
    expect(await as(db, bob).query('select id from companies')).toHaveLength(0)
    expect(await as(db, amy).query('select id from companies')).toHaveLength(1)
  })

  it('isole teams et team_members', async () => {
    const teams = await as(db, bob).query<{ id: string }>('select id from teams')
    expect(teams.map((t) => t.id)).toEqual([teamB])
    const members = await as(db, bob).query('select user_id from team_members')
    expect(members).toHaveLength(1)
  })

  it('refuse tout accès anonyme', async () => {
    await expect(as(db, null).query('select id from events')).rejects.toThrow(RLS)
    await expect(as(db, null).query(`select create_team('x')`)).rejects.toThrow(RLS)
  })
})

describe('rôles dans une équipe', () => {
  it('un commercial lit les salons de son équipe mais n’en crée pas : c’est réservé aux admins', async () => {
    await expect(insertEvent(amy, teamA, 'Salon de amy')).rejects.toThrow(RLS)
    await expect(insertEvent(adam, teamA, 'Salon de l’admin')).resolves.toBeTruthy()
    expect((await as(db, amy).query('select id from events')).length).toBeGreaterThanOrEqual(2)
  })

  it('réserve la suppression physique aux admins', async () => {
    const id = await insertEvent(adam, teamA, 'à supprimer')
    expect(
      await as(db, amy).query('delete from events where id = $1 returning id', [id]),
    ).toHaveLength(0)
    expect(
      await as(db, adam).query('delete from events where id = $1 returning id', [id]),
    ).toHaveLength(1)
  })

  it('interdit à un client de créer une équipe ou un membership directement', async () => {
    await expect(as(db, bob).query(`insert into teams (name) values ('pirate')`)).rejects.toThrow(
      RLS,
    )
    await expect(
      as(db, bob).query(
        `insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')`,
        [teamA, bob.id],
      ),
    ).rejects.toThrow(RLS)
  })

  it('empêche un membre de se promouvoir', async () => {
    const rows = await as(db, amy).query(
      `update team_members set role = 'admin' where user_id = $1 returning user_id`,
      [amy.id],
    )
    expect(rows).toHaveLength(0)
  })

  it('empêche un admin de créer ou rétrograder un owner', async () => {
    await expect(
      as(db, adam).query(`update team_members set role = 'owner' where user_id = $1`, [amy.id]),
    ).rejects.toThrow(RLS)
    const demote = await as(db, adam).query(
      `update team_members set role = 'member' where user_id = $1 returning user_id`,
      [alice.id],
    )
    expect(demote).toHaveLength(0)
  })

  it('autorise un admin à renommer l’équipe, pas un membre', async () => {
    expect(
      await as(db, adam).query(`update teams set name = 'Équipe A+' where id = $1 returning id`, [
        teamA,
      ]),
    ).toHaveLength(1)
    expect(
      await as(db, amy).query(`update teams set name = 'x' where id = $1 returning id`, [teamA]),
    ).toHaveLength(0)
  })

  it('crée le créateur d’équipe en owner', async () => {
    const [m] = await as(db, bob).query<{ role: string }>(
      'select role from team_members where team_id = $1',
      [teamB],
    )
    expect(m?.role).toBe('owner')
  })
})

describe('notes (append-only, auteur seul)', () => {
  it('limite la modification d’une note à son auteur', async () => {
    const eventCompany = randomUUID()
    const companyId = randomUUID()
    await db.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'N', 'n')`,
      [companyId, teamA],
    )
    await db.query(
      'insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)',
      [eventCompany, teamA, eventA, companyId],
    )
    const noteId = randomUUID()
    await as(db, alice).query(
      `insert into notes (id, team_id, event_company_id, author_id, body, captured_at) values ($1, $2, $3, $4, 'bonne rencontre', now())`,
      [noteId, teamA, eventCompany, alice.id],
    )
    // Un coéquipier lit la note mais ne peut ni la modifier ni la supprimer.
    expect(await as(db, amy).query('select id from notes where id = $1', [noteId])).toHaveLength(1)
    expect(
      await as(db, amy).query(`update notes set body = 'x' where id = $1 returning id`, [noteId]),
    ).toHaveLength(0)
    expect(
      await as(db, amy).query('delete from notes where id = $1 returning id', [noteId]),
    ).toHaveLength(0)
    expect(
      await as(db, alice).query(`update notes set body = 'ok' where id = $1 returning id`, [
        noteId,
      ]),
    ).toHaveLength(1)
    // On ne peut pas écrire une note au nom d'un autre.
    await expect(
      as(db, amy).query(
        `insert into notes (id, team_id, event_company_id, author_id, body, captured_at) values ($1, $2, $3, $4, 'faux', now())`,
        [randomUUID(), teamA, eventCompany, alice.id],
      ),
    ).rejects.toThrow(RLS)
    // Isolation inter-équipes.
    expect(await as(db, bob).query('select id from notes')).toHaveLength(0)
  })
})

describe('invitations', () => {
  it('réserve la création d’invitations aux admins', async () => {
    const insert = (u: TestUser, email: string) =>
      as(db, u).query(
        `insert into team_invitations (team_id, email, invited_by) values ($1, $2, $3)`,
        [teamA, email, u.id],
      )
    await expect(insert(amy, 'x@x.test')).rejects.toThrow(RLS)
    await expect(insert(bob, 'x@x.test')).rejects.toThrow(RLS)
    await expect(insert(adam, 'carol@c.test')).resolves.toBeTruthy()
    expect(await as(db, amy).query('select id from team_invitations')).toHaveLength(0)
    expect(await as(db, bob).query('select id from team_invitations')).toHaveLength(0)
  })

  it('rejoint l’équipe invitée via accept_pending_invitations, avec la bonne adresse seulement', async () => {
    const carol = await createUser(db, 'carol@c.test')
    const dave = await createUser(db, 'dave@d.test')

    expect(await as(db, carol).query('select id from events')).toHaveLength(0)
    expect(await as(db, dave).query('select accept_pending_invitations()')).toHaveLength(0)

    const joined = await as(db, carol).query<{ accept_pending_invitations: string }>(
      'select accept_pending_invitations()',
    )
    expect(joined.map((r) => r.accept_pending_invitations)).toEqual([teamA])
    expect((await as(db, carol).query('select id from events')).length).toBeGreaterThan(0)
    const [m] = await as(db, carol).query<{ role: string }>(
      'select role from team_members where user_id = $1',
      [carol.id],
    )
    expect(m?.role).toBe('member')

    // Une invitation ne s'accepte qu'une fois.
    expect(await as(db, carol).query('select accept_pending_invitations()')).toHaveLength(0)
    expect(await as(db, dave).query('select id from events')).toHaveLength(0)
  })

  it('interdit d’inviter avec le rôle owner', async () => {
    await expect(
      as(db, alice).query(
        `insert into team_invitations (team_id, email, role, invited_by) values ($1, 'o@o.test', 'owner', $2)`,
        [teamA, alice.id],
      ),
    ).rejects.toThrow()
  })
})

describe('profils', () => {
  it('montre son profil et ceux des coéquipiers, pas ceux des autres équipes', async () => {
    const ids = (await as(db, amy).query<{ id: string }>('select id from profiles')).map(
      (p) => p.id,
    )
    expect(ids).toContain(alice.id)
    expect(ids).toContain(amy.id)
    expect(ids).not.toContain(bob.id)
  })

  it('interdit de modifier le profil d’un autre', async () => {
    const rows = await as(db, amy).query(
      `update profiles set display_name = 'x' where id = $1 returning id`,
      [alice.id],
    )
    expect(rows).toHaveLength(0)
  })
})

describe('triggers de sync', () => {
  it('incrémente server_seq et updated_at à chaque écriture, soft delete compris', async () => {
    const id = await insertEvent(alice, teamA, 'sync')
    const get = async () =>
      (
        await as(db, alice).query<{ server_seq: string; updated_by: string }>(
          'select server_seq, updated_by from events where id = $1',
          [id],
        )
      )[0]!
    const before = await get()
    expect(before.updated_by).toBe(alice.id)
    await as(db, alice).query('update events set deleted_at = now() where id = $1', [id])
    const after = await get()
    expect(Number(after.server_seq)).toBeGreaterThan(Number(before.server_seq))
  })

  it('refuse une fin de salon antérieure au début', async () => {
    await expect(
      as(db, alice).query(
        `insert into events (id, team_id, name, starts_on, ends_on) values ($1, $2, 'x', '2026-06-10', '2026-06-01')`,
        [randomUUID(), teamA],
      ),
    ).rejects.toThrow()
  })
})
