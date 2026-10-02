import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

let db: PGlite
let alice: TestUser
let amy: TestUser
let bob: TestUser
let teamA: string
let eventA: string
let ec: string

const iso = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

async function newMeeting(): Promise<string> {
  const id = randomUUID()
  await as(db, alice).query(
    'insert into meetings (id, team_id, event_id, event_company_id, owner_id) values ($1, $2, $3, $4, $5)',
    [id, teamA, eventA, ec, alice.id],
  )
  return id
}
const patch = (u: TestUser, id: string, p: object, edited: object) =>
  as(db, u).query<{ patch_meeting: string | null }>(
    'select patch_meeting($1, $2::jsonb, $3::jsonb)',
    [id, JSON.stringify(p), JSON.stringify(edited)],
  )
const meeting = async (id: string) =>
  (
    await as(db, alice).query<{
      status: string
      interest: number | null
      need: string | null
      field_updated_at: Record<string, string>
    }>('select status, interest, need, field_updated_at from meetings where id = $1', [id])
  )[0]!

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db, 'alice@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  teamA = await createTeamAs(db, alice, 'A')
  await createTeamAs(db, bob, 'B')
  await addMember(db, teamA, amy)
  eventA = randomUUID()
  ec = randomUUID()
  const company = randomUUID()
  const a = as(db, alice)
  await a.query('insert into events (id, team_id, name) values ($1, $2, $3)', [
    eventA,
    teamA,
    'Salon',
  ])
  await a.query(
    `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Acme', 'acme')`,
    [company, teamA],
  )
  await a.query(
    'insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)',
    [ec, teamA, eventA, company],
  )
})

describe('patch_meeting : dernier écrit gagne, champ par champ', () => {
  it('applique les champs modifiés et mémorise l’heure de chaque champ', async () => {
    const id = await newMeeting()
    await patch(
      alice,
      id,
      { status: 'follow_up', interest: 4 },
      { status: iso(10), interest: iso(10) },
    )
    expect(await meeting(id)).toMatchObject({ status: 'follow_up', interest: 4 })
    expect(Object.keys((await meeting(id)).field_updated_at).sort()).toEqual(['interest', 'status'])
  })

  it('une modification plus ANCIENNE (faite hors-ligne) n’écrase pas une plus récente, même arrivée après', async () => {
    const id = await newMeeting()
    await patch(alice, id, { status: 'done' }, { status: iso(1) }) // appareil A, en ligne, il y a 1 min
    await patch(alice, id, { status: 'not_interested' }, { status: iso(60) }) // appareil B, édité il y a 1 h, arrive maintenant
    expect((await meeting(id)).status).toBe('done')
  })

  it('une modification plus récente l’emporte, quel que soit l’ordre d’arrivée', async () => {
    const id = await newMeeting()
    await patch(alice, id, { status: 'done' }, { status: iso(60) })
    await patch(alice, id, { status: 'follow_up' }, { status: iso(5) })
    expect((await meeting(id)).status).toBe('follow_up')
  })

  it('des champs différents modifiés sur deux appareils sont tous conservés', async () => {
    const id = await newMeeting()
    await patch(alice, id, { status: 'done' }, { status: iso(30) }) // appareil A
    await patch(
      alice,
      id,
      { need: 'POC paiement', interest: 5 },
      { need: iso(20), interest: iso(20) },
    ) // appareil B
    expect(await meeting(id)).toMatchObject({ status: 'done', need: 'POC paiement', interest: 5 })
  })

  it('permet d’effacer un champ (valeur nulle) et rejoue sans effet (idempotent)', async () => {
    const id = await newMeeting()
    await patch(alice, id, { interest: 3 }, { interest: iso(10) })
    await patch(alice, id, { interest: null }, { interest: iso(5) })
    await patch(alice, id, { interest: null }, { interest: iso(5) })
    expect((await meeting(id)).interest).toBeNull()
  })

  it('ramène à « maintenant » une heure d’édition dans le futur (horloge déréglée)', async () => {
    const id = await newMeeting()
    await patch(
      alice,
      id,
      { status: 'done' },
      { status: new Date(Date.now() + 86_400_000).toISOString() },
    )
    const t = new Date((await meeting(id)).field_updated_at.status!).getTime()
    expect(t).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('ignore les colonnes non autorisées et protège les rencontres des autres équipes', async () => {
    const id = await newMeeting()
    await patch(
      alice,
      id,
      { owner_id: bob.id, team_id: randomUUID() },
      { owner_id: iso(1), team_id: iso(1) },
    )
    const [row] = await as(db, alice).query<{ owner_id: string }>(
      'select owner_id from meetings where id = $1',
      [id],
    )
    expect(row!.owner_id).toBe(alice.id)
    const res = await patch(bob, id, { status: 'done' }, { status: iso(1) })
    expect(res[0]!.patch_meeting).toBeNull() // invisible pour une autre équipe (RLS)
  })

  it('est exécutée avec les droits de l’appelant : refusée hors authentification', async () => {
    const id = await newMeeting()
    await expect(
      as(db, null).query('select patch_meeting($1, $2::jsonb, $3::jsonb)', [id, '{}', '{}']),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('patch_note : conflit détecté sans rien écraser', () => {
  async function newNote(body = 'v1') {
    const id = randomUUID()
    const meetingId = await newMeeting()
    await as(db, alice).query(
      `insert into notes (id, team_id, meeting_id, author_id, body, captured_at) values ($1, $2, $3, $4, $5, now())`,
      [id, teamA, meetingId, alice.id, body],
    )
    const [r] = await as(db, alice).query<{ server_seq: string }>(
      'select server_seq from notes where id = $1',
      [id],
    )
    return { id, seq: Number(r!.server_seq) }
  }
  const call = async (u: TestUser, id: string, body: string, base: number) =>
    (
      await as(db, u).query<{ outcome: string; server_seq: string; body: string }>(
        'select * from patch_note($1, $2, $3)',
        [id, body, base],
      )
    )[0]!

  it('applique la modification quand l’appareil part de la dernière version connue', async () => {
    const { id, seq } = await newNote()
    const r = await call(alice, id, 'v2', seq)
    expect(r).toMatchObject({ outcome: 'ok', body: 'v2' })
    expect(Number(r.server_seq)).toBeGreaterThan(seq)
  })

  it('refuse d’écraser une note modifiée entre-temps et renvoie la version du serveur', async () => {
    const { id, seq } = await newNote('départ')
    await call(alice, id, 'version du téléphone', seq) // appareil A
    const r = await call(alice, id, 'version de l’ordinateur', seq) // appareil B, parti de la même base
    expect(r).toMatchObject({ outcome: 'conflict', body: 'version du téléphone' })
    const [row] = await as(db, alice).query<{ body: string }>(
      'select body from notes where id = $1',
      [id],
    )
    expect(row!.body).toBe('version du téléphone') // rien n'a été écrasé
  })

  it('une modification identique faite des deux côtés n’est pas un conflit', async () => {
    const { id, seq } = await newNote()
    await call(alice, id, 'même texte', seq)
    expect((await call(alice, id, 'même texte', seq)).outcome).toBe('ok')
  })

  it('signale une note inconnue ; les autres équipes ne peuvent ni la voir ni la modifier', async () => {
    expect((await call(alice, randomUUID(), 'x', 1)).outcome).toBe('missing')
    const { id, seq } = await newNote()
    expect((await call(bob, id, 'piraté', seq)).outcome).toBe('missing')
  })

  it('un collègue ne peut pas modifier la note d’un autre (auteur seul)', async () => {
    const { id, seq } = await newNote()
    const r = await call(amy, id, 'modifié par amy', seq)
    const [row] = await as(db, alice).query<{ body: string }>(
      'select body from notes where id = $1',
      [id],
    )
    expect(row!.body).toBe('v1')
    expect(['ok', 'conflict', 'missing']).toContain(r.outcome)
  })
})
