import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Création de compte : nom d'usage, recherche d'équipe par nom, adhésion directe.

let db: PGlite
let owner: TestUser
let newcomer: TestUser
let teamA: string

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, 'owner@a.test')
  newcomer = await createUser(db, 'camille.martin@b.test')
  teamA = await createTeamAs(db, owner, 'Retail Squad')
  await createTeamAs(db, owner, 'Retail Media')
  await createTeamAs(db, owner, 'Autre 100%')
})

describe('nom d’usage', () => {
  it('le profil reprend le nom choisi à l’inscription, sinon la partie locale de l’e-mail', async () => {
    await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb)`, [
      'lea@c.test',
      JSON.stringify({ display_name: '  Léa Durand  ' }),
    ])
    await db.query(`insert into auth.users (email) values ($1)`, ['paul@c.test'])
    const rows = await db.query<{ display_name: string }>(
      `select display_name from profiles where id in (select id from auth.users where email in ('lea@c.test', 'paul@c.test')) order by display_name`,
    )
    expect(rows.rows.map((r) => r.display_name)).toEqual(['Léa Durand', 'paul'])
  })

  it('chacun modifie son propre nom, pas celui des autres', async () => {
    const me = as(db, newcomer)
    await me.query(`update profiles set display_name = 'Camille Martin' where id = $1`, [
      newcomer.id,
    ])
    expect(
      await me.query(`select display_name from profiles where id = $1`, [newcomer.id]),
    ).toEqual([{ display_name: 'Camille Martin' }])
    const other = await me.query(
      `update profiles set display_name = 'X' where id = $1 returning id`,
      [owner.id],
    )
    expect(other).toEqual([])
  })
})

describe('recherche d’équipe', () => {
  it('trouve par morceau de nom, sans casse, avec le nombre de membres', async () => {
    const found = await as(db, newcomer).query<{ name: string; member_count: number }>(
      `select name, member_count from search_teams('retail')`,
    )
    expect(found).toEqual([
      { name: 'Retail Media', member_count: 1 },
      { name: 'Retail Squad', member_count: 1 },
    ])
  })

  it('ignore les requêtes trop courtes et ne traite pas % comme un joker', async () => {
    const me = as(db, newcomer)
    expect(await me.query(`select * from search_teams('r')`)).toEqual([])
    expect(await me.query(`select * from search_teams('%%')`)).toEqual([])
    expect(await me.query(`select name from search_teams('100%')`)).toEqual([
      { name: 'Autre 100%' },
    ])
  })

  it('est refusée sans être connecté', async () => {
    await expect(as(db, null).query(`select * from search_teams('retail')`)).rejects.toThrow()
  })
})

describe('rejoindre une équipe', () => {
  it('donne l’accès aux données de l’équipe, comme commercial', async () => {
    const event = randomUUID()
    await as(db, owner).query(`insert into events (id, team_id, name) values ($1, $2, 'Salon')`, [
      event,
      teamA,
    ])
    const me = as(db, newcomer)
    expect(await me.query(`select id from events where id = $1`, [event])).toEqual([])

    await me.query(`select join_team($1)`, [teamA])
    expect(await me.query(`select id from events where id = $1`, [event])).toHaveLength(1)
    expect(
      await me.query(`select role from team_members where team_id = $1 and user_id = $2`, [
        teamA,
        newcomer.id,
      ]),
    ).toEqual([{ role: 'member' }])
    // Commercial : ne crée pas de salon.
    await expect(
      me.query(`insert into events (id, team_id, name) values ($1, $2, 'Non')`, [
        randomUUID(),
        teamA,
      ]),
    ).rejects.toThrow(/row-level security/i)
  })

  it('est sans effet si l’on est déjà membre, et ne rétrograde pas un propriétaire', async () => {
    await as(db, owner).query(`select join_team($1)`, [teamA])
    expect(
      await as(db, owner).query(
        `select role from team_members where team_id = $1 and user_id = $2`,
        [teamA, owner.id],
      ),
    ).toEqual([{ role: 'owner' }])
  })

  it('refuse une équipe inconnue ou supprimée, et l’accès anonyme', async () => {
    await expect(as(db, newcomer).query(`select join_team($1)`, [randomUUID()])).rejects.toThrow(
      /team not found/,
    )
    await expect(as(db, null).query(`select join_team($1)`, [teamA])).rejects.toThrow()
    const gone = await createTeamAs(db, owner, 'Supprimée')
    await db.query(`update teams set deleted_at = now() where id = $1`, [gone])
    await expect(as(db, newcomer).query(`select join_team($1)`, [gone])).rejects.toThrow(
      /team not found/,
    )
    expect(await as(db, newcomer).query(`select * from search_teams('Supprim')`)).toEqual([])
  })
})
