import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

let db: PGlite
let alice: TestUser
let amy: TestUser
let bob: TestUser
let teamA: string
let teamB: string
let ecA: string
let eventA: string

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db, 'alice@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  teamA = await createTeamAs(db, alice, 'A')
  teamB = await createTeamAs(db, bob, 'B')
  await addMember(db, teamA, amy)
  eventA = randomUUID()
  ecA = randomUUID()
  const companyA = randomUUID()
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
})

const insertMeeting = (u: TestUser, cols: string, vals: unknown[]) =>
  as(db, u).query(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, ${cols}) values ($1, $2, $3, $4, $5, ${vals.map((_, i) => `$${i + 6}`).join(', ')})`,
    [randomUUID(), teamA, eventA, ecA, u.id, ...vals],
  )

describe('rencontres de terrain', () => {
  it('accepte les statuts « à relancer » et « pas intéressé »', async () => {
    await expect(insertMeeting(amy, 'status', ['follow_up'])).resolves.toBeTruthy()
    await expect(insertMeeting(amy, 'status', ['not_interested'])).resolves.toBeTruthy()
    await expect(insertMeeting(amy, 'status', ['done'])).resolves.toBeTruthy()
    await expect(insertMeeting(amy, 'status', ['maybe'])).rejects.toThrow()
  })

  it('enregistre intérêt (1 à 5) et champs structurés ; refuse un intérêt hors bornes', async () => {
    await expect(
      insertMeeting(amy, 'interest, need, budget, timing, decision_maker, is_unplanned', [
        4,
        'POC paiement',
        '50 k€',
        'T3',
        'DSI',
        true,
      ]),
    ).resolves.toBeTruthy()
    await expect(insertMeeting(amy, 'interest', [0])).rejects.toThrow()
    await expect(insertMeeting(amy, 'interest', [6])).rejects.toThrow()
  })

  it('isole les rencontres entre équipes', async () => {
    expect(await as(db, bob).query('select id from meetings')).toHaveLength(0)
  })
})

describe('stockage des photos (bucket attachments)', () => {
  const put = (u: TestUser, path: string, bucket = 'attachments') =>
    as(db, u).query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [
      bucket,
      path,
      u.id,
    ])

  it('le bucket est privé', async () => {
    const [b] = await db
      .query<{ public: boolean }>(`select public from storage.buckets where id = 'attachments'`)
      .then((r) => r.rows)
    expect(b?.public).toBe(false)
  })

  it('autorise un membre à écrire et lire dans le dossier de son équipe', async () => {
    await expect(put(amy, `${teamA}/photo-1.jpg`)).resolves.toBeTruthy()
    expect(await as(db, alice).query('select name from storage.objects')).toHaveLength(1)
  })

  it('refuse d’écrire dans le dossier d’une autre équipe ou hors dossier d’équipe', async () => {
    await expect(put(bob, `${teamA}/intrus.jpg`)).rejects.toThrow(/row-level security/i)
    await expect(put(amy, 'racine.jpg')).rejects.toThrow()
  })

  it('masque les fichiers d’une équipe aux autres', async () => {
    expect(await as(db, bob).query('select name from storage.objects')).toHaveLength(0)
    await put(bob, `${teamB}/b.jpg`)
    expect(await as(db, alice).query('select name from storage.objects')).toHaveLength(1)
  })
})
