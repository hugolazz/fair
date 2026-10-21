import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Rencontre créée toute seule par le bloc-notes (`auto_created`) : la migration repère celles qui existaient déjà (15 min,
// sans rappel, à l'heure de leur création) et retire celles qui sont vides ; un rendez-vous planifié à la main reste.

let db: PGlite
let owner: TestUser
let team: string
let event: string
let ec: string
const ids = {
  emptyAuto: randomUUID(),
  autoWithInterest: randomUUID(),
  autoWithNote: randomUUID(),
  planned: randomUUID(),
}

const state = async (id: string) =>
  (
    await db.query<{ auto_created: boolean; deleted_at: string | null }>(
      'select auto_created, deleted_at from meetings where id = $1',
      [id],
    )
  ).rows[0]!

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, 'owner@a.test')
  team = await createTeamAs(db, owner, 'A')
  event = randomUUID()
  ec = randomUUID()
  const company = randomUUID()
  const a = as(db, owner)
  await a.query(`insert into events (id, team_id, name) values ($1, $2, 'Salon')`, [event, team])
  await a.query(
    `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Acme', 'acme')`,
    [company, team],
  )
  await a.query(
    `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4)`,
    [ec, team, event, company],
  )
  const insert = (
    id: string,
    duration: number,
    reminder: number | null,
    plannedAt: string,
    extra = '',
  ) =>
    db.query(
      `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, planned_duration_min, reminder_minutes, created_at ${extra ? ', ' + extra.split('=')[0] : ''})
       values ($1, $2, $3, $4, $5, ${plannedAt}, $6, $7, now() ${extra ? ', ' + extra.split('=')[1] : ''})`,
      [id, team, event, ec, owner.id, duration, reminder],
    )
  await insert(ids.emptyAuto, 15, null, 'now()')
  await insert(ids.autoWithInterest, 15, null, 'now()', 'interest=3')
  await insert(ids.autoWithNote, 15, null, 'now()')
  await insert(ids.planned, 30, 15, "now() + interval '2 days'")
  await db.query(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at) values ($1, $2, $3, $4, 'Une note', 'typed', now())`,
    [randomUUID(), team, ids.autoWithNote, owner.id],
  )
})

describe('migration « rencontre créée par le bloc-notes »', () => {
  it('la colonne est fausse par défaut', async () => {
    expect((await state(ids.planned)).auto_created).toBe(false)
  })

  it('repère les rencontres du bloc-notes et retire celles qui sont vides', async () => {
    // On rejoue les deux requêtes de nettoyage de la migration (la colonne existe déjà, créée par le rejeu complet).
    const sql = readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        'supabase',
        'migrations',
        '20261002000021_meeting_auto_created.sql',
      ),
      'utf8',
    )
    await db.exec(sql.slice(sql.indexOf('update meetings set auto_created')))

    expect(await state(ids.emptyAuto)).toMatchObject({ auto_created: true })
    expect((await state(ids.emptyAuto)).deleted_at).not.toBeNull() // vide : retirée
    expect(await state(ids.autoWithInterest)).toMatchObject({
      auto_created: true,
      deleted_at: null,
    })
    expect(await state(ids.autoWithNote)).toMatchObject({ auto_created: true, deleted_at: null })
    // Un rendez-vous planifié à la main (30 min, avec rappel, dans deux jours) n'est ni marqué ni retiré.
    expect(await state(ids.planned)).toMatchObject({ auto_created: false, deleted_at: null })
  })
})
