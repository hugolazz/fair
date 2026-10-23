import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Couleur d'accentuation de l'équipe : modifiable par les admins, lue par tous les membres, jamais par une autre équipe.
let db: PGlite
let admin: TestUser
let amy: TestUser
let outsider: TestUser
let team: string
let other: string

const accentOf = async (u: TestUser, id: string) =>
  (
    await as(db, u).query<{ accent_color: string | null }>(
      'select accent_color from teams where id = $1',
      [id],
    )
  )[0]?.accent_color

beforeAll(async () => {
  db = await createTestDb()
  admin = await createUser(db, 'admin@a.test')
  amy = await createUser(db, 'amy@a.test')
  outsider = await createUser(db, 'out@b.test')
  team = await createTeamAs(db, admin, 'A')
  other = await createTeamAs(db, outsider, 'B')
  await addMember(db, team, amy)
})

describe('teams.accent_color', () => {
  it('vide par défaut (le vert d’origine)', async () => {
    expect(await accentOf(admin, team)).toBeNull()
  })

  it('un admin la change, tous les membres la lisent', async () => {
    const r = await as(db, admin).query(
      'update teams set accent_color = $2 where id = $1 returning id',
      [team, '#6d28d9'],
    )
    expect(r).toHaveLength(1)
    expect(await accentOf(amy, team)).toBe('#6d28d9')
  })

  it('un commercial ou une autre équipe ne peuvent pas la changer', async () => {
    for (const u of [amy, outsider]) {
      const r = await as(db, u).query(
        'update teams set accent_color = $2 where id = $1 returning id',
        [team, '#ff0000'],
      )
      expect(r).toEqual([])
    }
    expect(await accentOf(admin, team)).toBe('#6d28d9')
    expect(await accentOf(admin, other)).toBeUndefined() // l'autre équipe n'est pas visible
  })

  it('refuse une valeur qui n’est pas #rrggbb, accepte le retour au vert (vide)', async () => {
    for (const bad of ['red', '#fff', 'url(x)', '#12345g'])
      await expect(
        as(db, admin).query('update teams set accent_color = $2 where id = $1', [team, bad]),
      ).rejects.toThrow(/check|violates/i)
    await as(db, admin).query('update teams set accent_color = null where id = $1', [team])
    expect(await accentOf(admin, team)).toBeNull()
  })
})
