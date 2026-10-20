import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Quitter une équipe : commercial, admin, propriétaire avec des collègues (transmission), propriétaire seul (fermeture).

let db: PGlite
let n = 0
const user = (name: string) => createUser(db, `${name}-${++n}@leave.test`)

const roleOf = async (team: string, u: TestUser) =>
  (
    await db.query<{ role: string }>(
      `select role from team_members where team_id = $1 and user_id = $2`,
      [team, u.id],
    )
  ).rows[0]?.role
const leave = (u: TestUser, team: string) => as(db, u).query(`select leave_team($1)`, [team])

beforeEach(async () => {
  db = await createTestDb()
})

describe('quitter une équipe', () => {
  it('un commercial et un admin partent sans toucher aux autres', async () => {
    const owner = await user('owner')
    const admin = await user('admin')
    const amy = await user('amy')
    const team = await createTeamAs(db, owner, 'A')
    await addMember(db, team, admin, 'admin')
    await addMember(db, team, amy)

    await leave(amy, team)
    await leave(admin, team)
    expect(await roleOf(team, amy)).toBeUndefined()
    expect(await roleOf(team, admin)).toBeUndefined()
    expect(await roleOf(team, owner)).toBe('owner')
    // Plus aucun accès aux données de l'équipe.
    const event = randomUUID()
    await as(db, owner).query(`insert into events (id, team_id, name) values ($1, $2, 'Salon')`, [
      event,
      team,
    ])
    expect(await as(db, amy).query(`select id from events where id = $1`, [event])).toEqual([])
  })

  it('un propriétaire avec des collègues transmet la propriété au plus ancien admin avant de partir', async () => {
    const owner = await user('owner')
    const amy = await user('amy') // membre, arrivée avant l'admin
    const admin = await user('admin')
    const team = await createTeamAs(db, owner, 'A')
    await addMember(db, team, amy)
    await addMember(db, team, admin, 'admin')

    await leave(owner, team)
    expect(await roleOf(team, owner)).toBeUndefined()
    expect(await roleOf(team, admin)).toBe('owner') // l'admin passe devant la membre, même plus récent
    expect(await roleOf(team, amy)).toBe('member')
  })

  it('sans admin, la propriété va au plus ancien membre', async () => {
    const owner = await user('owner')
    const first = await user('first')
    const second = await user('second')
    const team = await createTeamAs(db, owner, 'A')
    await addMember(db, team, first)
    await addMember(db, team, second)
    await leave(owner, team)
    expect(await roleOf(team, first)).toBe('owner')
    expect(await roleOf(team, second)).toBe('member')
  })

  it('un propriétaire parmi plusieurs propriétaires part simplement', async () => {
    const owner = await user('owner')
    const other = await user('other')
    const team = await createTeamAs(db, owner, 'A')
    await db.query(`insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')`, [
      team,
      other.id,
    ])
    await leave(owner, team)
    expect(await roleOf(team, other)).toBe('owner')
    expect(await roleOf(team, owner)).toBeUndefined()
  })

  it('un propriétaire seul ferme l’équipe : introuvable à la recherche, données conservées', async () => {
    const owner = await user('owner')
    const stranger = await user('stranger')
    const team = await createTeamAs(db, owner, 'Solo fermée')
    const event = randomUUID()
    await as(db, owner).query(`insert into events (id, team_id, name) values ($1, $2, 'Salon')`, [
      event,
      team,
    ])

    await leave(owner, team)
    expect(await roleOf(team, owner)).toBeUndefined()
    expect(await as(db, stranger).query(`select * from search_teams('Solo fermée')`)).toEqual([])
    await expect(as(db, stranger).query(`select join_team($1)`, [team])).rejects.toThrow(
      /team not found/,
    )
    // Rien n'est effacé : la ligne de l'équipe et ses salons sont toujours en base.
    expect((await db.query(`select 1 from events where id = $1`, [event])).rows).toHaveLength(1)
    expect(
      (await db.query(`select deleted_at from teams where id = $1`, [team])).rows[0],
    ).toMatchObject({ deleted_at: expect.anything() })
  })

  it('refuse à quelqu’un qui n’est pas membre, et à un visiteur non connecté', async () => {
    const owner = await user('owner')
    const stranger = await user('stranger')
    const team = await createTeamAs(db, owner, 'A')
    await expect(leave(stranger, team)).rejects.toThrow(/not a member/)
    await expect(as(db, null).query(`select leave_team($1)`, [team])).rejects.toThrow()
    expect(await roleOf(team, owner)).toBe('owner')
  })

  it('un administrateur de la base ne peut toujours pas retirer le dernier propriétaire d’une équipe ouverte', async () => {
    const owner = await user('owner')
    const team = await createTeamAs(db, owner, 'A')
    await expect(
      as(db, owner).query(`delete from team_members where team_id = $1 and user_id = $2`, [
        team,
        owner.id,
      ]),
    ).rejects.toThrow()
  })
})
