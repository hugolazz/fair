import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMBER_PERMISSIONS,
  effectivePermissions,
  PERMISSION_KEYS,
  type Permissions,
} from '../../src/lib/permissions'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Migration « source_perf » : origine d'une participation, `has_perm` en un seul accès (même résultat que la règle de
// l'interface) et `key_contacts` (contact clé de chaque entreprise d'un salon).
let db: PGlite
let owner: TestUser
let boss: TestUser
let amy: TestUser
let outsider: TestUser
let team: string
let otherTeam: string
let event: string
let otherEvent: string
const company = { a: randomUUID(), b: randomUUID(), c: randomUUID() }

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, 'owner@a.test')
  boss = await createUser(db, 'boss@a.test')
  amy = await createUser(db, 'amy@a.test')
  outsider = await createUser(db, 'out@b.test')
  team = await createTeamAs(db, owner, 'A')
  otherTeam = await createTeamAs(db, outsider, 'B')
  await addMember(db, team, boss, 'admin')
  await addMember(db, team, amy)

  event = randomUUID()
  otherEvent = randomUUID()
  for (const [id, t] of [
    [event, team],
    [otherEvent, team],
  ] as const)
    await db.query(
      `insert into events (id, team_id, name, status) values ($1, $2, 'S', 'preparing')`,
      [id, t],
    )
  for (const [k, id] of Object.entries(company))
    await db.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, $3, lower($3))`,
      [id, team, k],
    )
  // a et b sont dans le salon, c dans un autre salon.
  for (const [ev, co] of [
    [event, company.a],
    [event, company.b],
    [otherEvent, company.c],
  ] as const)
    await db.query(
      `insert into event_companies (id, team_id, event_id, company_id) values (gen_random_uuid(), $1, $2, $3)`,
      [team, ev, co],
    )
  // Contacts : l'identifiant donne l'ordre de saisie ; un contact supprimé n'est jamais le contact clé.
  const contact = (id: string, co: string, first: string, deleted = false) =>
    db.query(
      `insert into contacts (id, team_id, company_id, first_name, last_name, deleted_at)
       values ($1, $2, $3, $4, 'X', ${deleted ? 'now()' : 'null'})`,
      [id, team, co, first],
    )
  await contact('00000000-0000-7000-8000-000000000001', company.a, 'Supprimé', true)
  await contact('00000000-0000-7000-8000-000000000002', company.a, 'Premier')
  await contact('00000000-0000-7000-8000-000000000003', company.a, 'Second')
  await contact('00000000-0000-7000-8000-000000000004', company.c, 'AilleursSeulement')
})

describe('event_companies.source', () => {
  it('une insertion qui ne dit rien est « import » : un chemin inconnu n’est jamais compté comme saisie manuelle', async () => {
    const [row] = (
      await db.query<{ source: string }>(
        `select source from event_companies where event_id = $1 limit 1`,
        [event],
      )
    ).rows
    expect(row!.source).toBe('import')
  })

  it('refuse une valeur inconnue', async () => {
    await expect(
      db.query(
        `insert into event_companies (id, team_id, event_id, company_id, source) values (gen_random_uuid(), $1, $2, $3, 'autre')`,
        [team, event, randomUUID()],
      ),
    ).rejects.toThrow(/check|violates|foreign key/i)
  })

  it('une copie de salon marque ses participations « duplicate »', async () => {
    const rows = await as(db, owner).query<{ duplicate_event: string }>(
      `select duplicate_event($1, 'Copie', null, null, true, true)`,
      [event],
    )
    const copy = rows[0]!.duplicate_event
    const sources = await db.query<{ source: string }>(
      `select distinct source from event_companies where event_id = $1`,
      [copy],
    )
    expect(sources.rows.map((r) => r.source)).toEqual(['duplicate'])
  })
})

describe('has_perm : même règle que l’interface, en un seul accès', () => {
  const sets: Permissions[] = [
    DEFAULT_MEMBER_PERMISSIONS,
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as Permissions,
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Permissions,
    { ...DEFAULT_MEMBER_PERMISSIONS, import_participants: true, edit_companies: false },
  ]

  it('pour chaque rôle et chaque réglage de l’équipe, SQL et TypeScript s’accordent ; un étranger n’a rien', async () => {
    const roles: [TestUser, 'owner' | 'admin' | 'member'][] = [
      [owner, 'owner'],
      [boss, 'admin'],
      [amy, 'member'],
    ]
    for (const set of sets) {
      await db.query('update teams set member_permissions = $2 where id = $1', [
        team,
        JSON.stringify(set),
      ])
      for (const [user, role] of roles) {
        const expected = effectivePermissions(role, set)
        for (const key of PERMISSION_KEYS) {
          const [row] = await as(db, user).query<{ ok: boolean }>(`select has_perm($1, $2) as ok`, [
            team,
            key,
          ])
          expect(row!.ok, `${role} · ${key}`).toBe(expected[key])
        }
      }
      for (const key of PERMISSION_KEYS) {
        const [row] = await as(db, outsider).query<{ ok: boolean }>(
          `select has_perm($1, $2) as ok`,
          [team, key],
        )
        expect(row!.ok, `étranger · ${key}`).toBe(false)
      }
    }
  })

  it('une clé inconnue ou une équipe inexistante : refusé', async () => {
    const [a] = await as(db, amy).query<{ ok: boolean }>(`select has_perm($1, 'nope') as ok`, [
      team,
    ])
    const [b] = await as(db, owner).query<{ ok: boolean }>(
      `select has_perm($1, 'edit_plan') as ok`,
      [randomUUID()],
    )
    expect(a!.ok).toBe(false)
    expect(b!.ok).toBe(false)
  })
})

describe('key_contacts', () => {
  const keyOf = async (u: TestUser, ev: string) =>
    as(db, u).query<{ company_id: string; first_name: string }>(
      `select company_id, first_name from key_contacts($1) order by first_name`,
      [ev],
    )

  it('le premier contact saisi de chaque entreprise du salon, sans les supprimés ni les autres salons', async () => {
    const rows = await keyOf(amy, event)
    expect(rows).toEqual([{ company_id: company.a, first_name: 'Premier' }]) // b n'a aucun contact, c est ailleurs
    expect(await keyOf(amy, otherEvent)).toEqual([
      { company_id: company.c, first_name: 'AilleursSeulement' },
    ])
  })

  it('un membre d’une autre équipe ne voit rien (RLS)', async () => {
    expect(await keyOf(outsider, event)).toEqual([])
    expect(otherTeam).toBeTruthy()
  })
})
