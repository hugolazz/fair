import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSION_KEYS,
  type PermissionKey,
} from '../../src/lib/permissions'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Droits des commerciaux : un jeu par équipe (teams.member_permissions), appliqué par la base (has_perm + RLS). Les
// admins ont toujours tout ; les valeurs par défaut reprennent le rôle commercial d'origine.
let db: PGlite
let admin: TestUser
let boss: TestUser // admin (pas propriétaire)
let amy: TestUser // commerciale
let bob: TestUser // commercial, collègue
let outsider: TestUser
let team: string
let event: string
let company: string
let ec: string // participation de Acme, assignée à bob (pas à amy)
let contact: string
let bobMeeting: string

const RLS = /row-level security/i
const ALL_OFF = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]))

async function setPerms(partial: Partial<Record<PermissionKey, boolean>>) {
  const all = { ...DEFAULT_MEMBER_PERMISSIONS, ...partial }
  await db.query('update teams set member_permissions = $2 where id = $1', [
    team,
    JSON.stringify(all),
  ])
}
const reset = () => setPerms({})

/** Une écriture : vraie si elle a touché au moins une ligne, fausse si la RLS l'a refusée (insertion ou 0 ligne). */
async function can(u: TestUser, sql: string, params: unknown[] = []): Promise<boolean> {
  try {
    const rows = await as(db, u).query(sql, params)
    return rows.length > 0
  } catch (e) {
    if (RLS.test(String(e))) return false
    throw e
  }
}

beforeAll(async () => {
  db = await createTestDb()
  admin = await createUser(db, 'owner@a.test')
  boss = await createUser(db, 'boss@a.test')
  amy = await createUser(db, 'amy@a.test')
  bob = await createUser(db, 'bob@a.test')
  outsider = await createUser(db, 'out@b.test')
  team = await createTeamAs(db, admin, 'A')
  await createTeamAs(db, outsider, 'B')
  await addMember(db, team, boss, 'admin')
  await addMember(db, team, amy)
  await addMember(db, team, bob)

  event = randomUUID()
  company = randomUUID()
  ec = randomUUID()
  contact = randomUUID()
  bobMeeting = randomUUID()
  await db.query(
    `insert into events (id, team_id, name, status) values ($1, $2, 'S', 'preparing')`,
    [event, team],
  )
  await db.query(
    `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Acme', 'acme')`,
    [company, team],
  )
  await db.query(
    `insert into contacts (id, team_id, company_id, first_name, last_name) values ($1, $2, $3, 'Ada', 'L')`,
    [contact, team, company],
  )
  await db.query(
    `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
    [ec, team, event, company],
  )
  await db.query(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
    [ec, bob.id, event, team],
  )
  await db.query(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status) values ($1, $2, $3, $4, $5, now(), 'done')`,
    [bobMeeting, team, event, ec, bob.id],
  )
})

describe('réglage des droits', () => {
  it('les valeurs par défaut de la base sont celles de l’application (le rôle commercial d’origine)', async () => {
    const [row] = (
      await db.query<{ p: Record<string, boolean> }>(
        'select member_permissions as p from teams where id = $1',
        [team],
      )
    ).rows
    expect(row!.p).toEqual(DEFAULT_MEMBER_PERMISSIONS)
    expect(Object.keys(row!.p).sort()).toEqual([...PERMISSION_KEYS].sort())
  })

  it('seuls le propriétaire et les admins le modifient ; il est lu par tous les membres', async () => {
    const upd = (u: TestUser) =>
      as(db, u).query('update teams set member_permissions = $2 where id = $1 returning id', [
        team,
        JSON.stringify({ ...DEFAULT_MEMBER_PERMISSIONS, create_events: true }),
      ])
    expect(await upd(amy)).toEqual([])
    expect(await upd(outsider)).toEqual([])
    expect(await upd(boss)).toHaveLength(1)
    const read = await as(db, bob).query<{ p: Record<string, boolean> }>(
      'select member_permissions as p from teams where id = $1',
      [team],
    )
    expect(read[0]!.p['create_events']).toBe(true)
    await reset()
    expect(await upd(admin)).toHaveLength(1)
    await reset()
  })

  it('refuse une clé inconnue, une valeur qui n’est pas un booléen, ou autre chose qu’un objet', async () => {
    for (const bad of [
      { ...DEFAULT_MEMBER_PERMISSIONS, fly: true },
      { ...DEFAULT_MEMBER_PERMISSIONS, edit_plan: 'oui' },
      [true],
      'x',
    ]) {
      await expect(
        as(db, admin).query('update teams set member_permissions = $2 where id = $1', [
          team,
          JSON.stringify(bad),
        ]),
      ).rejects.toThrow(/check|violates/i)
    }
  })
})

describe('chaque droit ouvre ou ferme l’action correspondante (commercial) ; un admin a toujours tout', () => {
  const cases: {
    key: PermissionKey
    /** Une écriture qu'un commercial réussit seulement avec ce droit. */
    run: (u: TestUser) => Promise<boolean>
  }[] = [
    {
      key: 'create_events',
      run: (u) =>
        can(
          u,
          `insert into events (id, team_id, name, status) values ($1, $2, 'Nouveau', 'preparing') returning id`,
          [randomUUID(), team],
        ),
    },
    {
      key: 'edit_events',
      run: (u) => can(u, `update events set name = 'Renommé' where id = $1 returning id`, [event]),
    },
    {
      key: 'import_participants',
      run: (u) =>
        can(
          u,
          `insert into import_batches (id, team_id, event_id) values ($1, $2, $3) returning id`,
          [randomUUID(), team, event],
        ),
    },
    {
      key: 'add_companies',
      run: (u) =>
        can(
          u,
          `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Neuve', 'neuve') returning id`,
          [randomUUID(), team],
        ),
    },
    {
      key: 'edit_companies',
      run: (u) =>
        can(u, `update companies set city = 'Lyon' where id = $1 returning id`, [company]),
    },
    {
      key: 'manage_tags',
      run: (u) =>
        can(
          u,
          `insert into tags (id, team_id, label, scope) values ($1, $2, $3, 'company') returning id`,
          [randomUUID(), team, randomUUID()],
        ),
    },
    {
      key: 'edit_plan',
      run: (u) =>
        can(
          u,
          `insert into floorplans (id, team_id, event_id, name) values ($1, $2, $3, 'P') returning id`,
          [randomUUID(), team, event],
        ),
    },
    {
      key: 'prepare_all_targets',
      run: (u) =>
        can(u, `update event_companies set stand_label = 'B1' where id = $1 returning id`, [ec]),
    },
    {
      key: 'assign_others',
      // Assigner un collègue (pas soi-même) à la participation.
      run: (u) =>
        can(
          u,
          `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4) on conflict (event_company_id, user_id) do update set deleted_at = null returning user_id`,
          [ec, u.id === boss.id ? amy.id : boss.id, event, team],
        ),
    },
    {
      key: 'edit_colleagues_meetings',
      run: (u) =>
        can(u, `update meetings set interest = 3 where id = $1 returning id`, [bobMeeting]),
    },
  ]

  for (const { key, run } of cases) {
    it(`${key} : ${DEFAULT_MEMBER_PERMISSIONS[key] ? 'accordé' : 'refusé'} par défaut, réglable`, async () => {
      await reset()
      expect(await run(amy), `${key} par défaut`).toBe(DEFAULT_MEMBER_PERMISSIONS[key])
      await setPerms({ [key]: !DEFAULT_MEMBER_PERMISSIONS[key] })
      expect(await run(amy), `${key} inversé`).toBe(!DEFAULT_MEMBER_PERMISSIONS[key])
      // Un admin garde tous les droits même quand le tableau les refuse aux commerciaux.
      await setPerms(ALL_OFF)
      expect(await run(boss), `${key} admin`).toBe(true)
      expect(await run(admin), `${key} propriétaire`).toBe(true)
      expect(await run(outsider), `${key} étranger à l'équipe`).toBe(false)
      await reset()
    })
  }

  it('remove_participants : retirer des participants (fonction SQL)', async () => {
    const co2 = randomUUID()
    const mine = randomUUID()
    await db.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Bis', 'bis')`,
      [co2, team],
    )
    await db.query(
      `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
      [mine, team, event, co2],
    )
    const remove = async (u: TestUser, ids: string[]) =>
      (
        await as(db, u).query<{ n: number }>('select remove_event_companies($1::uuid[]) as n', [
          ids,
        ])
      )[0]!.n
    await reset()
    expect(await remove(amy, [mine])).toBe(0)
    await setPerms({ remove_participants: true })
    expect(await remove(outsider, [mine])).toBe(0)
    expect(await remove(amy, [mine])).toBe(1)
    await reset()
    // Un admin peut toujours retirer, même quand le droit est refusé aux commerciaux.
    const again = randomUUID()
    await db.query(
      `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
      [again, team, event, co2],
    )
    await setPerms(ALL_OFF)
    expect(await remove(boss, [again])).toBe(1)
    await reset()
  })
})

describe('droits liés', () => {
  it('un import (sans « ajouter une entreprise ») crée entreprises, participations et pastilles de salon, sans gérer les tags', async () => {
    await setPerms({ import_participants: true, add_companies: false, manage_tags: false })
    const q = as(db, amy)
    const c = randomUUID()
    await q.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Importée', 'importee')`,
      [c, team],
    )
    await q.query(
      `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
      [randomUUID(), team, event, c],
    )
    const tag = randomUUID()
    await q.query(
      `insert into tags (id, team_id, label, scope, kind) values ($1, $2, 'NRF 09/26', 'company', 'show')`,
      [tag, team],
    )
    // … mais pas renommer un tag existant (c'est « gérer les tags »).
    expect(
      await can(amy, `update tags set label = 'Autre' where id = $1 returning id`, [tag]),
    ).toBe(false)
    await reset()
  })

  it('« ajouter une entreprise » sans « modifier les fiches » : on crée, mais on ne modifie ni entreprise ni contact existants', async () => {
    await setPerms({ add_companies: true, edit_companies: false })
    const q = as(db, amy)
    const c = randomUUID()
    await q.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Saisie', 'saisie')`,
      [c, team],
    )
    // « Créer ou remplacer » d'un nouvel identifiant : le chemin d'insertion suffit, le chemin de mise à jour n'est pas pris.
    await q.query(
      `insert into contacts (id, team_id, company_id, first_name, last_name) values ($1, $2, $3, 'Max', 'P') on conflict (id) do update set last_name = excluded.last_name`,
      [randomUUID(), team, c],
    )
    expect(
      await can(amy, `update contacts set last_name = 'Z' where id = $1 returning id`, [contact]),
    ).toBe(false)
    expect(
      await can(amy, `update companies set city = 'Nice' where id = $1 returning id`, [company]),
    ).toBe(false)
    await reset()
    expect(
      await can(amy, `update contacts set last_name = 'Z' where id = $1 returning id`, [contact]),
    ).toBe(true)
  })

  it('les droits de lecture restent acquis, même avec tout refusé ; chacun s’assigne et tient ses rendez-vous', async () => {
    await setPerms(ALL_OFF)
    for (const table of ['events', 'companies', 'contacts', 'event_companies', 'meetings'])
      expect(
        (await as(db, amy).query(`select id from ${table} where team_id = $1`, [team])).length,
        table,
      ).toBeGreaterThan(0)
    expect(
      await can(
        amy,
        `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4) on conflict (event_company_id, user_id) do update set deleted_at = null returning user_id`,
        [ec, amy.id, event, team],
      ),
    ).toBe(true)
    expect(
      await can(
        amy,
        `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status) values ($1, $2, $3, $4, $5, now(), 'done') returning id`,
        [randomUUID(), team, event, ec, amy.id],
      ),
    ).toBe(true)
    await reset()
  })
})
