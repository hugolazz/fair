import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Supprimer un salon retire aussi les entreprises qui n'étaient que dans ce salon : elles ne sont plus proposées à la
// fusion lors d'un import, et leur site web redevient disponible (index unique « actifs seulement »).

let db: PGlite
let owner: TestUser
let team: string
let e1: string
let e2: string
const id = {
  onlyE1: randomUUID(), // seulement dans le salon qu'on supprime
  both: randomUUID(), // dans les deux salons
  onlyE2: randomUUID(),
  never: randomUUID(), // dans aucun salon (jamais rattachée)
}
const contactOf = { onlyE1: randomUUID(), both: randomUUID() }

const deletedAt = async (table: 'companies' | 'contacts', rowId: string) =>
  (
    await db.query<{ deleted_at: string | null }>(`select deleted_at from ${table} where id = $1`, [
      rowId,
    ])
  ).rows[0]!.deleted_at

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, 'owner@a.test')
  team = await createTeamAs(db, owner, 'A')
  e1 = randomUUID()
  e2 = randomUUID()
  const a = as(db, owner)
  for (const [event, name] of [
    [e1, 'Salon 1'],
    [e2, 'Salon 2'],
  ] as const)
    await a.query(`insert into events (id, team_id, name) values ($1, $2, $3)`, [event, team, name])
  for (const [key, domain] of [
    ['onlyE1', 'only-e1.example'],
    ['both', 'both.example'],
    ['onlyE2', 'only-e2.example'],
    ['never', 'never.example'],
  ] as const)
    await a.query(
      `insert into companies (id, team_id, name, name_normalized, domain) values ($1, $2, $3, lower($3), $4)`,
      [id[key], team, key, domain],
    )
  for (const [event, company] of [
    [e1, id.onlyE1],
    [e1, id.both],
    [e2, id.both],
    [e2, id.onlyE2],
  ] as const)
    await a.query(
      `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
      [randomUUID(), team, event, company],
    )
  for (const key of ['onlyE1', 'both'] as const)
    await a.query(
      `insert into contacts (id, team_id, company_id, last_name) values ($1, $2, $3, 'Martin')`,
      [contactOf[key], team, id[key]],
    )
})

describe('suppression d’un salon', () => {
  it('retire les entreprises (et leurs contacts) qui n’étaient que dans ce salon', async () => {
    const res = await as(db, owner).query(
      `update events set deleted_at = now() where id = $1 returning id`,
      [e1],
    )
    expect(res).toHaveLength(1)

    expect(await deletedAt('companies', id.onlyE1)).not.toBeNull()
    expect(await deletedAt('contacts', contactOf.onlyE1)).not.toBeNull()
  })

  it('garde les entreprises encore présentes dans un autre salon, et celles sans salon', async () => {
    expect(await deletedAt('companies', id.both)).toBeNull()
    expect(await deletedAt('contacts', contactOf.both)).toBeNull()
    expect(await deletedAt('companies', id.onlyE2)).toBeNull()
    expect(await deletedAt('companies', id.never)).toBeNull()
  })

  it('libère le site web : on peut recréer l’entreprise supprimée', async () => {
    await expect(
      as(db, owner).query(
        `insert into companies (id, team_id, name, name_normalized, domain) values ($1, $2, 'Neuve', 'neuve', 'only-e1.example')`,
        [randomUUID(), team],
      ),
    ).resolves.toBeTruthy()
  })

  it('supprimer le dernier salon retire les entreprises restantes de ce salon', async () => {
    await as(db, owner).query(`update events set deleted_at = now() where id = $1`, [e2])
    expect(await deletedAt('companies', id.both)).not.toBeNull()
    expect(await deletedAt('contacts', contactOf.both)).not.toBeNull()
    expect(await deletedAt('companies', id.onlyE2)).not.toBeNull()
    // Une entreprise qui n'a jamais été dans un salon n'est pas concernée.
    expect(await deletedAt('companies', id.never)).toBeNull()
  })
})
