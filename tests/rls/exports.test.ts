import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

let db: PGlite
let alice: TestUser
let amy: TestUser
let bob: TestUser
let teamA: string
let teamB: string

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db, 'alice@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  teamA = await createTeamAs(db, alice, 'A')
  teamB = await createTeamAs(db, bob, 'B')
  await addMember(db, teamA, amy)
})

describe('logo d’équipe', () => {
  it('un admin renseigne le logo de son équipe', async () => {
    await as(db, alice).query('update teams set logo_path = $1 where id = $2', [
      `${teamA}/logo.png`,
      teamA,
    ])
    const [t] = await as(db, amy).query<{ logo_path: string }>(
      'select logo_path from teams where id = $1',
      [teamA],
    )
    expect(t?.logo_path).toBe(`${teamA}/logo.png`) // tous les membres le lisent (pour leurs PDF)
  })

  it('un simple membre ne peut pas le modifier, ni un autre l’équipe d’autrui', async () => {
    await as(db, amy).query(`update teams set logo_path = 'x' where id = $1`, [teamA])
    await as(db, bob).query(`update teams set logo_path = 'x' where id = $1`, [teamA])
    const [t] = await as(db, alice).query<{ logo_path: string }>(
      'select logo_path from teams where id = $1',
      [teamA],
    )
    expect(t?.logo_path).toBe(`${teamA}/logo.png`)
  })
})

describe('bucket exports', () => {
  const put = (u: TestUser, path: string, bucket = 'exports') =>
    as(db, u).query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [
      bucket,
      path,
      u.id,
    ])

  it('est privé', async () => {
    const [b] = await db
      .query<{ public: boolean }>(`select public from storage.buckets where id = 'exports'`)
      .then((r) => r.rows)
    expect(b?.public).toBe(false)
  })

  it('un membre écrit et lit dans le dossier de son équipe, et peut purger', async () => {
    await expect(put(amy, `${teamA}/20271001-ab12-bilan.pdf`)).resolves.toBeTruthy()
    expect(await as(db, alice).query('select name from storage.objects')).toHaveLength(1)
    await as(db, amy).query(`delete from storage.objects where name = $1`, [
      `${teamA}/20271001-ab12-bilan.pdf`,
    ])
    expect(await as(db, alice).query('select name from storage.objects')).toHaveLength(0)
  })

  it('refuse le dossier d’une autre équipe et la racine', async () => {
    await expect(put(bob, `${teamA}/intrus.xlsx`)).rejects.toThrow(/row-level security/i)
    await expect(put(amy, 'racine.xlsx')).rejects.toThrow()
  })

  it('masque les exports d’une équipe aux autres', async () => {
    await put(bob, `${teamB}/b.xlsx`)
    expect(await as(db, alice).query('select name from storage.objects')).toHaveLength(0)
    expect(await as(db, bob).query('select name from storage.objects')).toHaveLength(1)
  })
})
