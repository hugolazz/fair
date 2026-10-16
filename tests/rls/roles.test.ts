import type { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, as, createTeamAs, createTestDb, createUser, type TestUser } from './helpers'

// Rôles : admin d'équipe (owner / admin) et commercial (member). Les droits sont portés par la RLS.

const RLS = /row-level security/i

let db: PGlite
let owner: TestUser // propriétaire
let admin: TestUser
let amy: TestUser // commerciale, assignée à ec1
let amos: TestUser // autre commercial
let outsider: TestUser
let team: string
let event: string
let company1: string
let company2: string
let ec1: string
let ec2: string
let contact: string

beforeAll(async () => {
  db = await createTestDb()
  owner = await createUser(db, 'owner@a.test')
  admin = await createUser(db, 'admin@a.test')
  amy = await createUser(db, 'amy@a.test')
  amos = await createUser(db, 'amos@a.test')
  outsider = await createUser(db, 'out@b.test')
  team = await createTeamAs(db, owner, 'A')
  await createTeamAs(db, outsider, 'B')
  await addMember(db, team, admin, 'admin')
  await addMember(db, team, amy)
  await addMember(db, team, amos)

  event = randomUUID()
  company1 = randomUUID()
  company2 = randomUUID()
  ec1 = randomUUID()
  ec2 = randomUUID()
  contact = randomUUID()
  const a = as(db, admin)
  await a.query(`insert into events (id, team_id, name) values ($1, $2, 'Salon')`, [event, team])
  for (const [c, n] of [
    [company1, 'Acme'],
    [company2, 'Globex'],
  ] as const) {
    await a.query(
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, $3, lower($3))`,
      [c, team, n],
    )
  }
  await a.query(
    `insert into event_companies (id, team_id, event_id, company_id) values ($1, $2, $3, $4), ($5, $2, $3, $6)`,
    [ec1, team, event, company1, ec2, company2],
  )
  await a.query(
    `insert into contacts (id, team_id, company_id, last_name) values ($1, $2, $3, 'Martin')`,
    [contact, team, company1],
  )
  await a.query(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
    [ec1, amy.id, event, team],
  )
})

const rows = (u: TestUser, sql: string, params: unknown[] = []) => as(db, u).query(sql, params)

describe('le commercial lit tout, mais ne structure rien', () => {
  it('lit les salons, entreprises, contacts et assignations de l’équipe', async () => {
    expect(await rows(amy, 'select id from events')).toHaveLength(1)
    expect(await rows(amy, 'select id from event_companies')).toHaveLength(2)
    expect(await rows(amy, 'select id from companies')).toHaveLength(2)
    expect(await rows(amy, 'select id from contacts')).toHaveLength(1)
  })

  it('ne peut ni créer, ni modifier un salon', async () => {
    await expect(
      rows(amy, `insert into events (id, team_id, name) values ($1, $2, 'X')`, [
        randomUUID(),
        team,
      ]),
    ).rejects.toThrow(RLS)
    expect(
      await rows(amy, `update events set name = 'Piraté' where id = $1 returning id`, [event]),
    ).toHaveLength(0)
    expect(await rows(admin, 'select name from events where id = $1', [event])).toEqual([
      { name: 'Salon' },
    ])
  })

  it('peut ajouter à la main une entreprise, sa participation au salon et ses contacts', async () => {
    const c = randomUUID()
    const ec = randomUUID()
    await rows(
      amy,
      `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'Nouvelle', 'nouvelle')`,
      [c, team],
    )
    await rows(
      amy,
      `insert into event_companies (id, team_id, event_id, company_id, priority) values ($1, $2, $3, $4, 'B')`,
      [ec, team, event, c],
    )
    const ct = randomUUID()
    await rows(
      amy,
      `insert into contacts (id, team_id, company_id, first_name, linkedin_url) values ($1, $2, $3, 'Ada', 'https://www.linkedin.com/in/ada')`,
      [ct, team, c],
    )
    await rows(
      amy,
      `insert into event_contacts (event_id, contact_id, company_id, team_id) values ($1, $2, $3, $4)`,
      [event, ct, c, team],
    )
    expect(await rows(admin, 'select 1 from event_companies where id = $1', [ec])).toHaveLength(1)
  })

  it('ne peut pas ajouter dans une autre équipe', async () => {
    const otherTeam = (
      await db.query<{ team_id: string }>('select team_id from team_members where user_id = $1', [
        outsider.id,
      ])
    ).rows[0]!.team_id
    await expect(
      rows(
        amy,
        `insert into companies (id, team_id, name, name_normalized) values ($1, $2, 'N', 'n')`,
        [randomUUID(), otherTeam],
      ),
    ).rejects.toThrow(RLS)
  })

  it('ne peut pas importer un fichier (lots d’import)', async () => {
    await expect(
      rows(amy, `insert into import_batches (id, team_id, event_id) values ($1, $2, $3)`, [
        randomUUID(),
        team,
        event,
      ]),
    ).rejects.toThrow(RLS)
  })

  it('peut modifier la fiche d’une entreprise (historique compris), mais pas celle d’une autre équipe ni la supprimer', async () => {
    expect(
      await rows(
        amy,
        `update companies set history = 'Déjà contacté le 19 janvier 2026', city = 'Lyon' where id = $1 returning id`,
        [company1],
      ),
    ).toHaveLength(1)
    expect(
      await rows(admin, 'select history, city from companies where id = $1', [company1]),
    ).toEqual([{ history: 'Déjà contacté le 19 janvier 2026', city: 'Lyon' }])
    // Hors de son équipe : aucune ligne visible, donc rien de modifié.
    expect(
      await rows(outsider, `update companies set history = 'x' where id = $1 returning id`, [
        company1,
      ]),
    ).toHaveLength(0)
    // La suppression définitive reste réservée aux admins.
    expect(
      await rows(amy, 'delete from companies where id = $1 returning id', [company2]),
    ).toHaveLength(0)
  })

  it('ne peut pas gérer les tags, ni le plan du salon', async () => {
    await expect(
      rows(
        amy,
        `insert into tags (id, team_id, label, scope) values ($1, $2, 'Perso', 'company')`,
        [randomUUID(), team],
      ),
    ).rejects.toThrow(RLS)
    await expect(
      rows(
        amy,
        `insert into floorplans (id, team_id, event_id, name) values ($1, $2, $3, 'Plan')`,
        [randomUUID(), team, event],
      ),
    ).rejects.toThrow(RLS)
  })

  it('ne peut pas gérer l’équipe : ni se promouvoir, ni retirer un collègue, ni changer son nom', async () => {
    expect(
      await rows(
        amy,
        `update team_members set role = 'admin' where user_id = $1 returning user_id`,
        [amy.id],
      ),
    ).toHaveLength(0)
    expect(
      await rows(amy, `delete from team_members where user_id = $1 returning user_id`, [amos.id]),
    ).toHaveLength(0)
    expect(
      await rows(amy, `update teams set name = 'Piraté' where id = $1 returning id`, [team]),
    ).toHaveLength(0)
  })
})

describe('le commercial travaille sur ses entreprises', () => {
  it('prépare une entreprise qui lui est assignée (priorité, objectif, commentaire, stand)', async () => {
    const r = await rows(
      amy,
      `update event_companies set priority = 'A', objective = 'demo', prep_comment = 'POC', stand_label = 'B12' where id = $1 returning id`,
      [ec1],
    )
    expect(r).toHaveLength(1)
  })

  it('ne modifie pas une entreprise qui ne lui est pas assignée', async () => {
    expect(
      await rows(amy, `update event_companies set priority = 'C' where id = $1 returning id`, [
        ec2,
      ]),
    ).toHaveLength(0)
    expect(
      await rows(amos, `update event_companies set priority = 'C' where id = $1 returning id`, [
        ec1,
      ]),
    ).toHaveLength(0) // ni un autre commercial
  })

  it('s’assigne lui-même, puis peut préparer l’entreprise ; se désassigne', async () => {
    await expect(
      rows(
        amos,
        `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
        [ec2, amos.id, event, team],
      ),
    ).resolves.toBeTruthy()
    expect(
      await rows(amos, `update event_companies set priority = 'B' where id = $1 returning id`, [
        ec2,
      ]),
    ).toHaveLength(1)
    const off = await rows(
      amos,
      `update event_company_assignees set deleted_at = now() where event_company_id = $1 and user_id = $2 returning user_id`,
      [ec2, amos.id],
    )
    expect(off).toHaveLength(1)
    expect(
      await rows(amos, `update event_companies set priority = 'C' where id = $1 returning id`, [
        ec2,
      ]),
    ).toHaveLength(0) // plus assigné : plus de droit
  })

  it('n’assigne personne d’autre, et ne désassigne pas les autres', async () => {
    await expect(
      rows(
        amy,
        `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
        [ec2, amos.id, event, team],
      ),
    ).rejects.toThrow(RLS)
    const off = await rows(
      amos,
      `update event_company_assignees set deleted_at = now() where event_company_id = $1 and user_id = $2 returning user_id`,
      [ec1, amy.id],
    )
    expect(off).toHaveLength(0)
  })

  it('tient SES rencontres, pas celles des autres', async () => {
    const mine = randomUUID()
    await expect(
      rows(
        amy,
        `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at) values ($1, $2, $3, $4, $5, now())`,
        [mine, team, event, ec1, amy.id],
      ),
    ).resolves.toBeTruthy()
    expect(
      await rows(
        amy,
        `update meetings set status = 'done', interest = 4, next_step = 'Devis' where id = $1 returning id`,
        [mine],
      ),
    ).toHaveLength(1)
    // ni créer pour un collègue, ni modifier la sienne
    await expect(
      rows(
        amy,
        `insert into meetings (id, team_id, event_id, event_company_id, owner_id) values ($1, $2, $3, $4, $5)`,
        [randomUUID(), team, event, ec1, amos.id],
      ),
    ).rejects.toThrow(RLS)
    expect(
      await rows(amos, `update meetings set status = 'missed' where id = $1 returning id`, [mine]),
    ).toHaveLength(0)
    // un commercial rencontre aussi des entreprises qui ne lui sont pas assignées (rencontre sur le stand)
    await expect(
      rows(
        amos,
        `insert into meetings (id, team_id, event_id, event_company_id, owner_id) values ($1, $2, $3, $4, $5)`,
        [randomUUID(), team, event, ec1, amos.id],
      ),
    ).resolves.toBeTruthy()
  })

  it('écrit ses notes (signées de son nom), pas celles des autres', async () => {
    const [m] = await rows(amy, `select id from meetings where owner_id = $1 limit 1`, [amy.id])
    const note = randomUUID()
    await expect(
      rows(
        amy,
        `insert into notes (id, team_id, meeting_id, author_id, body, captured_at) values ($1, $2, $3, $4, 'Décideur présent', now())`,
        [note, team, (m as { id: string }).id, amy.id],
      ),
    ).resolves.toBeTruthy()
    await expect(
      rows(
        amos,
        `insert into notes (id, team_id, meeting_id, author_id, body, captured_at) values ($1, $2, $3, $4, 'Usurpée', now())`,
        [randomUUID(), team, (m as { id: string }).id, amy.id],
      ),
    ).rejects.toThrow(RLS)
    expect(
      await rows(amos, `update notes set body = 'Piratée' where id = $1 returning id`, [note]),
    ).toHaveLength(0)
    expect(await rows(amos, 'select body from notes where id = $1', [note])).toHaveLength(1) // lisible par l'équipe
  })

  it('tague une entreprise (tag choisi par un admin) et complète un contact', async () => {
    const tag = randomUUID()
    await rows(
      admin,
      `insert into tags (id, team_id, label, scope) values ($1, $2, 'Client', 'company')`,
      [tag, team],
    )
    await expect(
      rows(
        amy,
        `insert into taggings (tag_id, taggable_table, taggable_id, team_id) values ($1, 'companies', $2, $3)`,
        [tag, company1, team],
      ),
    ).resolves.toBeTruthy()
    expect(
      await rows(amy, `update contacts set job_title = 'DSI' where id = $1 returning id`, [
        contact,
      ]),
    ).toHaveLength(1)
  })
})

describe('l’admin gère l’équipe et le salon', () => {
  it('crée salon, entreprises, plan, tags ; assigne n’importe qui ; planifie pour n’importe qui', async () => {
    await expect(
      rows(admin, `insert into events (id, team_id, name) values ($1, $2, 'Autre')`, [
        randomUUID(),
        team,
      ]),
    ).resolves.toBeTruthy()
    await expect(
      rows(
        admin,
        `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
        [ec1, amos.id, event, team],
      ),
    ).resolves.toBeTruthy()
    await expect(
      rows(
        admin,
        `insert into meetings (id, team_id, event_id, event_company_id, owner_id) values ($1, $2, $3, $4, $5)`,
        [randomUUID(), team, event, ec2, amy.id],
      ),
    ).resolves.toBeTruthy()
    expect(
      await rows(admin, `update event_companies set priority = 'A' where id = $1 returning id`, [
        ec2,
      ]),
    ).toHaveLength(1)
    const plan = randomUUID()
    await expect(
      rows(
        admin,
        `insert into floorplans (id, team_id, event_id, name) values ($1, $2, $3, 'Plan')`,
        [plan, team, event],
      ),
    ).resolves.toBeTruthy()
  })

  it('change le rôle d’un commercial et le retire de l’équipe', async () => {
    expect(
      await rows(
        admin,
        `update team_members set role = 'admin' where user_id = $1 returning user_id`,
        [amos.id],
      ),
    ).toHaveLength(1)
    expect(
      await rows(
        admin,
        `update team_members set role = 'member' where user_id = $1 returning user_id`,
        [amos.id],
      ),
    ).toHaveLength(1)
    const extra = await createUser(db, 'extra@a.test')
    await addMember(db, team, extra)
    expect(
      await rows(admin, `delete from team_members where user_id = $1 returning user_id`, [
        extra.id,
      ]),
    ).toHaveLength(1)
  })

  it('personne d’une autre équipe ne voit ni n’écrit rien', async () => {
    expect(await rows(outsider, 'select id from event_companies')).toHaveLength(0)
    await expect(
      rows(outsider, `insert into events (id, team_id, name) values ($1, $2, 'X')`, [
        randomUUID(),
        team,
      ]),
    ).rejects.toThrow(RLS)
  })
})

describe('une équipe garde toujours un propriétaire', () => {
  it('refuse de retirer ou rétrograder le dernier propriétaire', async () => {
    await expect(
      db.query(`update team_members set role = 'admin' where team_id = $1 and user_id = $2`, [
        team,
        owner.id,
      ]),
    ).rejects.toThrow(/at least one owner/)
    await expect(
      db.query(`delete from team_members where team_id = $1 and user_id = $2`, [team, owner.id]),
    ).rejects.toThrow(/at least one owner/)
  })

  it('autorise le départ d’un propriétaire quand il y en a un autre', async () => {
    await db.query(
      `insert into team_members (team_id, user_id, role) values ($1, $2, 'owner') on conflict (team_id, user_id) do update set role = 'owner'`,
      [team, admin.id],
    )
    await expect(
      db.query(`update team_members set role = 'member' where team_id = $1 and user_id = $2`, [
        team,
        owner.id,
      ]),
    ).resolves.toBeTruthy()
    // il n'en reste qu'un : on ne peut plus le rétrograder
    await expect(
      db.query(`update team_members set role = 'member' where team_id = $1 and user_id = $2`, [
        team,
        admin.id,
      ]),
    ).rejects.toThrow(/at least one owner/)
  })

  it('la suppression de l’équipe entière reste possible', async () => {
    const t = await createTeamAs(db, outsider, 'Temporaire')
    await expect(db.query('delete from teams where id = $1', [t])).resolves.toBeTruthy()
  })
})
