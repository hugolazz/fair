import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { standKey } from '@/features/plan/lib/stand-key'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

let db: PGlite
let alice: TestUser
let amy: TestUser
let bob: TestUser
let teamA: string
let teamB: string
let eventA: string
let eventB: string
let planA: string
let planB: string
let ecA: string
let ecB: string

beforeAll(async () => {
  db = await createTestDb()
  alice = await createUser(db, 'alice@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@b.test')
  teamA = await createTeamAs(db, alice, 'A')
  teamB = await createTeamAs(db, bob, 'B')
  await addMember(db, teamA, amy)

  const seed = async (u: TestUser, team: string, name: string) => {
    const event = randomUUID()
    const company = randomUUID()
    const ec = randomUUID()
    const plan = randomUUID()
    const q = as(db, u)
    await q.query('insert into events (id, team_id, name) values ($1, $2, $3)', [event, team, name])
    await q.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, $3, $4)`,
      [company, team, name, name.toLowerCase()],
    )
    await q.query(
      `insert into event_companies (id, team_id, event_id, company_id, stand_label) values ($1, $2, $3, $4, 'A-05')`,
      [ec, team, event, company],
    )
    await q.query(
      `insert into floorplans (id, team_id, event_id, name, width_px, height_px) values ($1, $2, $3, 'Hall 1', 4000, 3000)`,
      [plan, team, event],
    )
    return { event, ec, plan }
  }
  const a = await seed(alice, teamA, 'Salon A')
  const b = await seed(bob, teamB, 'Salon B')
  ;({ event: eventA, ec: ecA, plan: planA } = a)
  ;({ event: eventB, ec: ecB, plan: planB } = b)
})

const insertPin = (
  u: TestUser,
  team: string,
  event: string,
  plan: string,
  cols: Record<string, unknown>,
) => {
  const names = Object.keys(cols)
  return as(db, u)
    .query<{ id: string }>(
      `insert into plan_pins (id, team_id, event_id, floorplan_id, ${names.join(', ')})
     values ($1, $2, $3, $4, ${names.map((_, i) => `$${i + 5}`).join(', ')}) returning id`,
      [randomUUID(), team, event, plan, ...names.map((n) => cols[n])],
    )
    .then((rows) => rows[0]!.id)
}

describe('clé de stand', () => {
  const samples = [
    'B12',
    'b-12',
    'A 05',
    'a-05',
    'A005',
    'A0',
    'A00',
    'A-05-B06',
    '0012',
    '5005',
    'Hall 3 / D07',
    '  ',
    '',
    '---',
    'É12',
    'B.12',
    '007',
    '0',
  ]

  it('la fonction SQL stand_key() donne le même résultat que standKey() côté client', async () => {
    for (const label of samples) {
      const { rows } = await db.query<{ k: string | null }>('select stand_key($1) as k', [label])
      expect({ label, key: rows[0]!.k }).toEqual({ label, key: standKey(label) })
    }
  })

  it('« A-05 » et « A5 » se rejoignent', () => {
    expect(standKey('A-05')).toBe('A5')
    expect(standKey('a 5')).toBe('A5')
  })

  it('est calculée par la base sur les participations et sur les pins', async () => {
    const [ec] = await as(db, alice).query<{ stand_key: string }>(
      'select stand_key from event_companies where id = $1',
      [ecA],
    )
    expect(ec?.stand_key).toBe('A5')
    const id = await insertPin(alice, teamA, eventA, planA, {
      stand_label: 'a 05',
      x: 0.2,
      y: 0.3,
    })
    const [pin] = await as(db, alice).query<{ stand_key: string }>(
      'select stand_key from plan_pins where id = $1',
      [id],
    )
    expect(pin?.stand_key).toBe('A5') // même clé que la participation : c'est le futur lien OCR
  })

  it('on ne peut pas écrire la clé à la main (colonne calculée)', async () => {
    await expect(
      insertPin(alice, teamA, eventA, planA, { stand_label: 'B1', stand_key: 'ZZ', x: 0, y: 0 }),
    ).rejects.toThrow()
  })
})

describe('plans (floorplans)', () => {
  it('isole les plans entre équipes', async () => {
    expect(await as(db, bob).query('select id from floorplans')).toHaveLength(1)
    expect(await as(db, alice).query('select id from floorplans')).toHaveLength(1)
    expect(
      await as(db, bob).query('select id from floorplans where id = $1', [planA]),
    ).toHaveLength(0)
  })

  it('refuse de créer un plan dans l’équipe d’un autre', async () => {
    await expect(
      as(db, bob).query(
        `insert into floorplans (id, team_id, event_id, name) values ($1, $2, $3, 'x')`,
        [randomUUID(), teamA, eventA],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('accepte une pièce jointe pas encore arrivée (envoi des fichiers différé)', async () => {
    await expect(
      as(db, alice).query(
        `insert into floorplans (id, team_id, event_id, name, attachment_id) values ($1, $2, $3, 'P', $4)`,
        [randomUUID(), teamA, eventA, randomUUID()],
      ),
    ).resolves.toBeTruthy()
  })

  it('les anciennes colonnes de pin sur la participation ont disparu', async () => {
    await expect(as(db, alice).query('select pin_x from event_companies')).rejects.toThrow()
    await expect(as(db, alice).query('select floorplan_id from event_companies')).rejects.toThrow()
  })
})

describe('pins (plan_pins)', () => {
  it('un membre pose un pin relié à une entreprise, ou un simple numéro de stand', async () => {
    await expect(
      insertPin(alice, teamA, eventA, planA, { event_company_id: ecA, x: 0.5, y: 0.5 }),
    ).resolves.toBeTruthy()
    await expect(
      insertPin(alice, teamA, eventA, planA, { stand_label: 'C7', x: 0, y: 1 }),
    ).resolves.toBeTruthy()
  })

  it('refuse un pin sans entreprise ni numéro de stand', async () => {
    await expect(insertPin(alice, teamA, eventA, planA, { x: 0.1, y: 0.1 })).rejects.toThrow(
      /check/i,
    )
  })

  it('refuse des coordonnées hors du plan', async () => {
    await expect(
      insertPin(alice, teamA, eventA, planA, { stand_label: 'D1', x: 1.2, y: 0.5 }),
    ).rejects.toThrow()
    await expect(
      insertPin(alice, teamA, eventA, planA, { stand_label: 'D1', x: 0.5, y: -0.1 }),
    ).rejects.toThrow()
  })

  it('prévoit l’OCR : source, confiance, rectangle et texte lu, à confirmer', async () => {
    await expect(
      insertPin(alice, teamA, eventA, planA, {
        stand_label: 'E9',
        x: 0.4,
        y: 0.6,
        source: 'ocr',
        review_status: 'suggested',
        confidence: 0.82,
        bbox: JSON.stringify({ x: 0.39, y: 0.59, w: 0.02, h: 0.01 }),
        raw_text: 'E 9',
      }),
    ).resolves.toBeTruthy()
    await expect(
      insertPin(alice, teamA, eventA, planA, { stand_label: 'E9', x: 0.4, y: 0.6, source: 'gps' }),
    ).rejects.toThrow()
    await expect(
      insertPin(alice, teamA, eventA, planA, {
        stand_label: 'E9',
        x: 0.4,
        y: 0.6,
        confidence: 1.5,
      }),
    ).rejects.toThrow()
  })

  it('isole les pins entre équipes', async () => {
    const mine = await as(db, alice).query('select id from plan_pins')
    expect(mine.length).toBeGreaterThan(0)
    expect(await as(db, bob).query('select id from plan_pins')).toHaveLength(0)
  })

  it('refuse de poser un pin dans l’équipe d’un autre', async () => {
    await expect(
      insertPin(bob, teamA, eventA, planA, { stand_label: 'X1', x: 0.1, y: 0.1 }),
    ).rejects.toThrow(/row-level security/i)
  })

  it('refuse un pin qui vise le plan ou l’entreprise d’une autre équipe', async () => {
    // Bob écrit dans SON équipe, mais vise le plan / la participation de l’équipe A.
    await expect(
      insertPin(bob, teamB, eventB, planA, { stand_label: 'X2', x: 0.1, y: 0.1 }),
    ).rejects.toThrow(/row-level security/i)
    await expect(
      insertPin(bob, teamB, eventB, planB, { event_company_id: ecA, x: 0.1, y: 0.1 }),
    ).rejects.toThrow(/row-level security/i)
    await expect(
      insertPin(bob, teamB, eventB, planB, { event_company_id: ecB, x: 0.1, y: 0.1 }),
    ).resolves.toBeTruthy()
  })

  it('suppression logique par un membre ; suppression physique réservée aux admins', async () => {
    const id = await insertPin(alice, teamA, eventA, planA, { stand_label: 'F2', x: 0.3, y: 0.3 })
    const before = await as(db, alice).query<{ server_seq: string }>(
      'select server_seq from plan_pins where id = $1',
      [id],
    )
    await as(db, alice).query('update plan_pins set deleted_at = now() where id = $1', [id])
    const after = await as(db, alice).query<{ server_seq: string; deleted_at: string | null }>(
      'select server_seq, deleted_at from plan_pins where id = $1',
      [id],
    )
    expect(after[0]?.deleted_at).not.toBeNull()
    expect(Number(after[0]?.server_seq)).toBeGreaterThan(Number(before[0]?.server_seq)) // se propage aux autres appareils
    await as(db, amy).query('delete from plan_pins where id = $1', [id])
    expect(await as(db, alice).query('select id from plan_pins where id = $1', [id])).toHaveLength(
      1,
    )
    await as(db, alice).query('delete from plan_pins where id = $1', [id])
    expect(await as(db, alice).query('select id from plan_pins where id = $1', [id])).toHaveLength(
      0,
    )
  })
})
