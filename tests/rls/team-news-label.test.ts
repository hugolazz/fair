import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Intitulé de la case optionnelle des notes : modifiable par les admins de l'équipe, lu par tous ses membres.
let db: PGlite
let admin: TestUser
let amy: TestUser
let outsider: TestUser
let team: string

const labelOf = async (u: TestUser) =>
  (
    await as(db, u).query<{ news_label: string | null }>(
      'select news_label from teams where id = $1',
      [team],
    )
  )[0]?.news_label

beforeAll(async () => {
  db = await createTestDb()
  admin = await createUser(db, 'admin@a.test')
  amy = await createUser(db, 'amy@a.test')
  outsider = await createUser(db, 'out@b.test')
  team = await createTeamAs(db, admin, 'A')
  await createTeamAs(db, outsider, 'B')
  await addMember(db, team, amy)
})

describe('teams.news_label', () => {
  it('vide par défaut (l’intitulé d’origine « Actualité ? »)', async () => {
    expect(await labelOf(admin)).toBeNull()
  })

  it('un admin le change, tous les membres le lisent', async () => {
    const r = await as(db, admin).query(
      'update teams set news_label = $2 where id = $1 returning id',
      [team, 'Démo demandée ?'],
    )
    expect(r).toHaveLength(1)
    expect(await labelOf(amy)).toBe('Démo demandée ?')
  })

  it('un commercial ou une autre équipe ne peuvent pas le changer', async () => {
    for (const u of [amy, outsider]) {
      const r = await as(db, u).query(
        'update teams set news_label = $2 where id = $1 returning id',
        [team, 'Autre'],
      )
      expect(r).toEqual([])
    }
    expect(await labelOf(admin)).toBe('Démo demandée ?')
  })

  it('refuse un intitulé blanc ou de plus de 40 caractères ; vide (null) revient à l’origine', async () => {
    for (const bad of ['', '   ', 'x'.repeat(41)])
      await expect(
        as(db, admin).query('update teams set news_label = $2 where id = $1', [team, bad]),
      ).rejects.toThrow(/check|violates/i)
    await as(db, admin).query('update teams set news_label = $2 where id = $1', [
      team,
      'x'.repeat(40),
    ])
    await as(db, admin).query('update teams set news_label = null where id = $1', [team])
    expect(await labelOf(admin)).toBeNull()
  })
})
