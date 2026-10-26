import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PASSWORD, startFakeSupabase, USERS } from './server.ts'

// Le faux serveur doit se comporter comme Supabase pour les vrais dépôts de l'appli (mêmes requêtes que le navigateur).
const PORT = 54398
const base = `http://127.0.0.1:${PORT}`
let stop: () => Promise<void>

async function exec(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${base}/__e2e/exec`, {
    method: 'POST',
    body: JSON.stringify({ sql, params }),
  })
  return (await r.json()) as Record<string, unknown>[]
}

beforeAll(async () => {
  const s = await startFakeSupabase(PORT)
  stop = s.close
  vi.stubEnv('VITE_SUPABASE_URL', base)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-e2e')
})
afterAll(async () => {
  await stop()
})

describe('faux Supabase', () => {
  it('connecte un utilisateur, lit son équipe et ses salons, et applique la RLS', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const targets = await import('@/db/repositories/targets')

    await expect(auth.signInWithPassword(USERS.admin, 'mauvais')).rejects.toThrow()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id

    const membership = await teams.fetchMembership(me)
    expect(membership).toMatchObject({ teamName: 'Équipe e2e', role: 'owner' })
    const members = await teams.listMembers(membership!.teamId)
    expect(members.map((m) => m.displayName).sort()).toEqual(['admin', 'marie', 'paul'])

    const event = await events.createEvent(membership!.teamId, {
      name: 'Tech For Retail',
      startsOn: '2026-11-10',
      endsOn: '2026-11-11',
      venue: '',
      city: 'Paris',
      goals: '',
    })
    expect((await events.listEvents()).map((e) => e.name)).toEqual(['Tech For Retail'])
    expect((await events.getEvent(event.id))?.city).toBe('Paris')

    // Une entreprise avec un contact et un rendez-vous, préparés en superutilisateur.
    const ids = await exec(`
      with c as (insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), '${membership!.teamId}', 'Acme', 'acme') returning id),
           ec as (insert into event_companies (id, team_id, event_id, company_id, stand_label)
                  select gen_random_uuid(), '${membership!.teamId}', '${event.id}', id, 'A12' from c returning id, company_id),
           ct as (insert into contacts (id, team_id, company_id, first_name, last_name)
                  select gen_random_uuid(), '${membership!.teamId}', id, 'Jeanne', 'Martin' from c returning id)
      select id from ec`)
    expect(ids, JSON.stringify(ids)).toHaveLength(1)
    const ecId = ids[0]!['id'] as string

    const list = await targets.listTargets(event.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Acme', stand: 'A12', contactCount: 1 })

    await targets.updateTargets([ecId], { priority: 'A' })
    expect((await targets.listTargets(event.id))[0]!.priority).toBe('A')

    // Un commercial ne peut pas créer de salon (RLS) ni modifier une entreprise qui ne lui est pas assignée.
    await auth.signOut()
    await auth.signInWithPassword(USERS.marie, PASSWORD)
    const marie = (await auth.getSession())!.user.id
    expect(await events.listEvents()).toHaveLength(1)
    await expect(
      events.createEvent(membership!.teamId, {
        name: 'Interdit',
        startsOn: '',
        endsOn: '',
        venue: '',
        city: '',
        goals: '',
      }),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(targets.updateTargets([ecId], { priority: 'C' })).rejects.toThrow(/not allowed/)
    // Sans tags dans l'équipe, un commercial ne doit pas faire échouer le chargement des participants.
    await expect(targets.ensureDefaultTags(membership!.teamId)).resolves.toEqual([])

    await targets.assignTargets(membership!.teamId, event.id, [ecId], marie)
    await targets.updateTargets([ecId], { priority: 'B' })
    expect((await targets.listTargets(event.id))[0]).toMatchObject({
      priority: 'B',
      assigneeIds: [marie],
    })
  })

  it('un commercial ajoute une entreprise et des contacts à la main, et note « à recontacter »', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const targets = await import('@/db/repositories/targets')
    const { addCompanyManually } = await import('@/features/manual-entry/add-company')
    const { emptyCompanyForm, emptyContactForm } =
      await import('@/features/manual-entry/lib/manual')

    await auth.signOut()
    await auth.signInWithPassword(USERS.marie, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    const [event] = await events.listEvents()

    const created = await addCompanyManually({
      teamId,
      eventId: event!.id,
      meId: me,
      assignToMe: true,
      form: {
        ...emptyCompanyForm,
        name: 'Zeta Corp',
        website: 'zeta.example',
        stand: 'Z9',
        priority: 'B',
        tag: 'Client',
        history: 'Déjà contacté M. X le 19 janvier 2026.',
        contact: {
          ...emptyContactForm,
          firstName: 'Ada',
          lastName: 'Lovelace',
          linkedin: 'linkedin.com/in/ada',
        },
      },
    })
    expect(created.status).toBe('created')

    const zeta = (await targets.listTargets(event!.id)).find((t) => t.name === 'Zeta Corp')!
    expect(zeta).toMatchObject({
      priority: 'B',
      stand: 'Z9',
      assigneeIds: [me],
      contactCount: 1,
      history: 'Déjà contacté M. X le 19 janvier 2026.',
    })

    // Une entreprise déjà dans le salon n'est ni dupliquée ni modifiée.
    const again = await addCompanyManually({
      teamId,
      eventId: event!.id,
      meId: me,
      assignToMe: false,
      form: { ...emptyCompanyForm, name: 'Zeta Corp' },
    })
    expect(again).toEqual({ status: 'already', targetId: null })

    // Contact rencontré sur le salon, rattaché à la rencontre, avec « à recontacter ».
    const added = await targets.addContact(teamId, zeta.companyId, {
      firstName: 'Grace',
      lastName: 'Hopper',
      jobTitle: 'CTO',
      email: 'grace@zeta.example',
      phone: '0611223344',
      linkedin: 'https://www.linkedin.com/in/grace',
    })
    const contacts = await targets.fetchContacts(zeta.companyId)
    expect(contacts.map((c) => c.name)).toEqual(['Ada Lovelace', 'Grace Hopper'])
    expect(contacts[1]).toMatchObject({ linkedin: 'https://www.linkedin.com/in/grace' })

    const meetingId = await targets.saveMeeting({
      teamId,
      eventId: event!.id,
      targetId: zeta.id,
      ownerId: me,
      plannedAt: new Date().toISOString(),
      durationMin: 15,
      reminderMin: null,
    })
    await targets.updateMeetingReport(meetingId, { recontact: true, contactId: added.id })
    const after = (await targets.listTargets(event!.id)).find((t) => t.id === zeta.id)!
    expect(after.meetings[0]).toMatchObject({ id: meetingId, recontact: true })

    // La note de la rencontre reste modifiable par son auteur (un seul texte, pas une note par envoi).
    const note = await targets.addMeetingNote(teamId, meetingId, me, 'Première version')
    await targets.updateMeetingNote(note.id, 'Version corrigée')
    const notes = await targets.fetchMeetingNotes(meetingId)
    expect(notes.map((n) => n.body)).toEqual(['Version corrigée'])

    // Champ vidé : la note est supprimée (suppression logique), elle n'apparaît plus.
    await targets.deleteMeetingNote(note.id)
    expect(await targets.fetchMeetingNotes(meetingId)).toEqual([])
  })

  it('l’historique saisi suit l’entreprise ; un salon supprimé disparaît de l’historique', async () => {
    const targets = await import('@/db/repositories/targets')
    const events = await import('@/db/repositories/events')
    const [event] = await events.listEvents()
    const zeta = (await targets.listTargets(event!.id)).find((t) => t.name === 'Zeta Corp')!

    // « Modifier la fiche » : un commercial corrige l'entreprise (historique compris) et ses contacts.
    await targets.updateCompany(zeta.companyId, {
      name: 'Zeta Corporation',
      name_normalized: 'zeta corporation',
      website: 'https://zeta.example',
      domain: 'zeta.example',
      industry: 'Retail',
      city: 'Lyon',
      country: null,
      history: 'Historique corrigé',
    })
    const edited = (await targets.listTargets(event!.id)).find((t) => t.id === zeta.id)!
    expect(edited).toMatchObject({
      name: 'Zeta Corporation',
      city: 'Lyon',
      history: 'Historique corrigé',
    })
    const [first, second] = await targets.fetchContacts(zeta.companyId)
    await targets.updateContact(second!.id, {
      firstName: 'Grace',
      lastName: 'Hopper',
      jobTitle: 'Directrice technique',
      email: 'grace@zeta.example',
      phone: '',
      linkedin: '',
    })
    expect((await targets.fetchContacts(zeta.companyId))[1]).toMatchObject({
      jobTitle: 'Directrice technique',
      phone: '',
    })
    await targets.deleteContact(first!.id)
    expect((await targets.fetchContacts(zeta.companyId)).map((c) => c.name)).toEqual([
      'Grace Hopper',
    ])

    // Un salon passé où l'entreprise a été rencontrée (préparé en superutilisateur).
    const [past] = await exec(`
      with ev as (insert into events (id, team_id, name, status, starts_on)
                  select gen_random_uuid(), team_id, 'Salon passé', 'done', '2025-10-14' from events limit 1 returning id, team_id),
           ec as (insert into event_companies (id, team_id, event_id, company_id)
                  select gen_random_uuid(), ev.team_id, ev.id, '${zeta.companyId}' from ev returning id, event_id, team_id),
           m as (insert into meetings (id, team_id, event_id, event_company_id, owner_id, status, planned_at, outcome)
                 select gen_random_uuid(), ec.team_id, ec.event_id, ec.id, (select id from auth.users limit 1), 'done', now(), 'Bon échange'
                 from ec returning id)
      select event_id as id from ec`)
    const before = await targets.fetchHistory(zeta.companyId, event!.id)
    expect(before.map((h) => h.eventName)).toEqual(['Salon passé'])

    await exec(`update events set deleted_at = now() where id = '${String(past!['id'])}'`)
    expect(await targets.fetchHistory(zeta.companyId, event!.id)).toEqual([])
  })

  it('changer de mot de passe exige l’actuel : un mauvais mot de passe est refusé, le bon laisse passer', async () => {
    const auth = await import('@/db/repositories/auth')
    await auth.signInWithPassword(USERS.marie, PASSWORD)
    await expect(
      auth.changePassword(USERS.marie, 'pas-le-bon', 'nouveau-mot-de-passe-1'),
    ).rejects.toThrow(auth.WRONG_CURRENT_PASSWORD)
    await expect(
      auth.changePassword(USERS.marie, PASSWORD, 'nouveau-mot-de-passe-1'),
    ).resolves.toBeUndefined()
    await auth.signOut()
  })

  it('l’équipe rejointe en dernier est celle qui s’affiche (quitter la rend à la précédente)', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    expect((await teams.fetchMembership(me))?.teamName).toBe('Équipe e2e')

    await exec(`
      with t as (insert into teams (name) values ('Équipe récente') returning id)
      insert into team_members (team_id, user_id, role) select id, '${me}', 'member' from t`)
    const recent = await teams.fetchMembership(me)
    expect(recent?.teamName).toBe('Équipe récente')

    await teams.leaveTeam(recent!.teamId)
    expect((await teams.fetchMembership(me))?.teamName).toBe('Équipe e2e')
    await auth.signOut()
  })

  it('mot de passe oublié : le lien se demande pour n’importe quelle adresse, le nouveau mot de passe se pose sur la session', async () => {
    const auth = await import('@/db/repositories/auth')
    await auth.signOut()
    // Même réponse pour une adresse connue et pour une adresse inconnue (aucune fuite d'information).
    await expect(auth.requestPasswordReset(USERS.admin)).resolves.toBeUndefined()
    await expect(auth.requestPasswordReset('inconnu@fair.test')).resolves.toBeUndefined()

    // Le lien de l'e-mail ouvre une session : on y change le mot de passe.
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    await expect(auth.updatePassword('nouveau-mot-de-passe-1')).resolves.toBeUndefined()
    await auth.signOut()
  })

  it('un salon supprimé ne pèse plus sur les imports : ses entreprises ne sont plus proposées à la fusion', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const importRepo = await import('@/db/repositories/import')
    const { addCompanyManually } = await import('@/features/manual-entry/add-company')
    const { emptyCompanyForm } = await import('@/features/manual-entry/lib/manual')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    const values = { startsOn: '2027-01-10', endsOn: '2027-01-11', venue: '', city: '', goals: '' }
    const old = await events.createEvent(teamId, { ...values, name: 'Salon supprimé' })
    const current = await events.createEvent(teamId, { ...values, name: 'Salon actuel' })
    const form = { ...emptyCompanyForm, name: 'Fantôme SAS', website: 'fantome.example' }

    // L'entreprise est connue tant que son salon existe…
    await addCompanyManually({ teamId, eventId: old.id, meId: me, assignToMe: false, form })
    expect((await importRepo.fetchKnownCompanies()).map((c) => c.name)).toContain('Fantôme SAS')

    // … puis elle disparaît des entreprises connues quand le salon est supprimé.
    await events.deleteEvent(old.id)
    expect((await importRepo.fetchKnownCompanies()).map((c) => c.name)).not.toContain('Fantôme SAS')

    // Importer la même entreprise dans un autre salon la crée à neuf (pas de fusion, pas de conflit de site web).
    const again = await addCompanyManually({
      teamId,
      eventId: current.id,
      meId: me,
      assignToMe: false,
      form,
    })
    expect(again.status).toBe('created')
    expect((await importRepo.fetchKnownCompanies()).map((c) => c.name)).toContain('Fantôme SAS')
  })

  it('l’abréviation d’un salon se choisit (admin) et se retire ; un commercial ne peut pas', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const targets = await import('@/db/repositories/targets')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    const show = await targets.createTag(teamId, 'Tech For Retail 03/26', '#0f766e', 'show')
    expect(show).toMatchObject({ kind: 'show', abbrev: null })
    const abbrev = async () => (await targets.fetchTags()).find((t) => t.id === show.id)!.abbrev

    await targets.updateShowAbbrev(show.id, 'TFR26')
    expect(await abbrev()).toBe('TFR26')
    await targets.updateShowAbbrev(show.id, null)
    expect(await abbrev()).toBeNull()

    await auth.signOut()
    await auth.signInWithPassword(USERS.marie, PASSWORD)
    await expect(targets.updateShowAbbrev(show.id, 'XX')).rejects.toThrow()
  })

  it('file d’attente hors ligne : les envois sont rejouables sans doublon et reprennent une note existante', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const { executeOp } = await import('@/db/repositories/sync')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    const event = await events.createEvent(teamId, {
      name: 'Salon file',
      startsOn: '2027-01-10',
      endsOn: '2027-01-11',
      venue: '',
      city: '',
      goals: '',
    })
    const rows = await exec(`
      with c as (insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), '${teamId}', 'Fileco', 'fileco') returning id)
      insert into event_companies (id, team_id, event_id, company_id)
        select gen_random_uuid(), '${teamId}', '${event.id}', id from c returning id`)
    const targetId = String(rows[0]!.id)
    const meetingId = crypto.randomUUID()
    const input = {
      id: meetingId,
      teamId,
      eventId: event.id,
      targetId,
      ownerId: me,
      plannedAt: new Date().toISOString(),
      durationMin: 15,
      reminderMin: null,
      auto: true,
    }
    const liveMeetings = async () =>
      await exec(
        `select id, interest, auto_created from meetings where id = '${meetingId}' and deleted_at is null`,
      )
    const liveNotes = async () =>
      (
        await exec(
          `select id, body from notes where meeting_id = '${meetingId}' and deleted_at is null`,
        )
      ).map((n) => n.body)

    // Rejouer le même envoi (reprise après coupure) ne crée pas de doublon.
    await executeOp({ type: 'meeting.upsert', input })
    await executeOp({ type: 'meeting.upsert', input })
    await executeOp({
      type: 'meeting.patch',
      id: meetingId,
      patch: { interest: 4, status: 'done' },
    })
    expect(await liveMeetings()).toEqual([{ id: meetingId, interest: 4, auto_created: true }])

    const note = {
      id: crypto.randomUUID(),
      teamId,
      meetingId,
      authorId: me,
      body: 'Premier texte',
      capturedAt: '2027-01-10T10:00:00.000Z',
      adopt: false,
    }
    await executeOp({ type: 'note.upsert', note })
    await executeOp({ type: 'note.upsert', note: { ...note, body: 'Texte corrigé' } })
    expect(await liveNotes()).toEqual(['Texte corrigé']) // une seule note, le dernier texte

    // Écrite sans avoir pu lire l'existante (autre identifiant) : l'envoi reprend la note qui existe.
    await executeOp({
      type: 'note.upsert',
      note: { ...note, id: crypto.randomUUID(), body: 'Texte hors ligne', adopt: true },
    })
    expect(await liveNotes()).toEqual(['Texte hors ligne'])

    // Supprimer ce qui n'existe plus n'est pas une erreur.
    await executeOp({ type: 'note.delete', id: note.id, meetingId })
    await executeOp({ type: 'note.delete', id: note.id, meetingId })
    await executeOp({ type: 'meeting.delete', id: meetingId })
    await executeOp({ type: 'meeting.delete', id: meetingId })
    await executeOp({ type: 'meeting.patch', id: meetingId, patch: { news: true } })
    expect(await liveMeetings()).toEqual([])
  })

  it('copie locale : les lectures se rabattent sur la copie si le réseau manque, et le téléchargement remplit les fiches', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const targets = await import('@/db/repositories/targets')
    const { prefetchEventData, prefetchStatus } = await import('@/db/repositories/prefetch')
    const { cacheKeys } = await import('@/db/cache-keys')
    const { configureCache, readCached, staleStatus, markFresh } = await import('@/lib/cache/cache')
    const { MemoryCacheStore } = await import('@/lib/cache/store')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    configureCache(me, new MemoryCacheStore())
    const event = await events.createEvent(teamId, {
      name: 'Salon copie',
      startsOn: '2027-02-10',
      endsOn: '2027-02-11',
      venue: '',
      city: '',
      goals: '',
    })
    const rows = await exec(`
      with c as (insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), '${teamId}', 'Copieco', 'copieco') returning id),
           ct as (insert into contacts (id, team_id, company_id, first_name, last_name)
                  select gen_random_uuid(), '${teamId}', id, 'Ada', 'Lovelace' from c returning id),
           ec as (insert into event_companies (id, team_id, event_id, company_id)
                  select gen_random_uuid(), '${teamId}', '${event.id}', id from c returning id, company_id),
           m as (insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at)
                 select gen_random_uuid(), '${teamId}', '${event.id}', id, '${me}', now() from ec returning id)
      select (select company_id from ec) as company_id, (select id from m) as meeting_id`)
    const companyId = String(rows[0]!.company_id)
    const meetingId = String(rows[0]!.meeting_id)
    await exec(
      `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at) values (gen_random_uuid(), '${teamId}', '${meetingId}', '${me}', 'Note copiée', 'typed', now())`,
    )

    // Lecture en ligne : la copie se remplit.
    const live = await targets.fetchContacts(companyId)
    expect(live.map((c) => c.name)).toEqual(['Ada Lovelace'])
    expect((await readCached(cacheKeys.contacts(companyId)))?.value).toEqual(live)

    // Téléchargement du salon : contacts, notes et historique des entreprises assignées.
    const list = await targets.listTargets(event.id)
    await prefetchEventData(event.id, list, me, { force: true })
    expect(prefetchStatus.getSnapshot()).toMatchObject({ status: 'done', percent: 100 })
    expect((await readCached(cacheKeys.notes(meetingId)))?.value).toEqual([
      expect.objectContaining({ body: 'Note copiée', authorId: me }),
    ])

    // Réseau coupé : la lecture rend la copie et le signale.
    const offline = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'))
    try {
      expect((await targets.fetchContacts(companyId)).map((c) => c.name)).toEqual(['Ada Lovelace'])
      expect((await targets.fetchMeetingNotes(meetingId)).map((n) => n.body)).toEqual([
        'Note copiée',
      ])
      expect(staleStatus.getSnapshot()).not.toBeNull()
      // Sans copie, l'erreur remonte (rien à afficher).
      await expect(
        targets.fetchContacts('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeDefined()
    } finally {
      offline.mockRestore()
      markFresh()
    }
    configureCache(null)
  })

  it('ouverture sans réseau : l’équipe et le nom d’usage viennent de la copie locale', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const profile = await import('@/db/repositories/profile')
    const { configureCache, markFresh } = await import('@/lib/cache/cache')
    const { MemoryCacheStore } = await import('@/lib/cache/store')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    configureCache(me, new MemoryCacheStore())
    const live = await teams.fetchMembership(me)
    const name = await profile.fetchMyDisplayName(me)
    expect(live).not.toBeNull()

    const offline = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'))
    try {
      expect(await teams.fetchMembership(me)).toEqual(live)
      expect(await profile.fetchMyDisplayName(me)).toEqual(name)
    } finally {
      offline.mockRestore()
      markFresh()
    }
    configureCache(null)
  })

  it('retirer des participants : seul un admin, avec rencontres et notes ; l’entreprise reste', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const targets = await import('@/db/repositories/targets')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    const event = await events.createEvent(teamId, {
      name: 'Salon retrait',
      startsOn: '2027-03-10',
      endsOn: '2027-03-11',
      venue: '',
      city: '',
      goals: '',
    })
    await exec(`
      with c as (insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), '${teamId}', 'Retirée', 'retiree') returning id),
           ec as (insert into event_companies (id, team_id, event_id, company_id)
                  select gen_random_uuid(), '${teamId}', '${event.id}', id from c returning id)
      insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at)
      select gen_random_uuid(), '${teamId}', '${event.id}', id, '${me}', now() from ec`)
    const [target] = await targets.listTargets(event.id)
    expect(target?.meetings).toHaveLength(1)

    // Un commercial n’en retire aucune.
    await auth.signOut()
    await auth.signInWithPassword(USERS.marie, PASSWORD)
    expect(await targets.removeTargets([target!.id])).toBe(0)

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    expect(await targets.removeTargets([target!.id])).toBe(1)
    expect(await targets.listTargets(event.id)).toEqual([])
    expect(
      await exec(`select id from meetings where deleted_at is null and event_id = '${event.id}'`),
    ).toEqual([])
    expect(
      await exec(`select id from companies where name = 'Retirée' and deleted_at is null`),
    ).toHaveLength(1)
  })

  it('droits des commerciaux : un admin les régle pour l’équipe, un commercial ne le peut pas', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const { DEFAULT_MEMBER_PERMISSIONS, effectivePermissions } = await import('@/lib/permissions')

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const adminId = (await auth.getSession())!.user.id
    const before = await teams.fetchMembership(adminId)
    expect(before!.memberPermissions).toEqual(DEFAULT_MEMBER_PERMISSIONS)
    expect(
      Object.values(effectivePermissions(before!.role, before!.memberPermissions)).every(Boolean),
    ).toBe(true) // un admin a tout
    const teamId = before!.teamId

    await teams.setMemberPermissions(teamId, {
      ...DEFAULT_MEMBER_PERMISSIONS,
      import_participants: true,
    })
    await auth.signOut()
    await auth.signInWithPassword(USERS.marie, PASSWORD)
    const marie = await teams.fetchMembership((await auth.getSession())!.user.id)
    const mine = effectivePermissions(marie!.role, marie!.memberPermissions)
    expect(mine.import_participants).toBe(true)
    expect(mine.create_events).toBe(false)
    // Un commercial ne modifie pas le tableau.
    await expect(
      teams.setMemberPermissions(teamId, { ...DEFAULT_MEMBER_PERMISSIONS, create_events: true }),
    ).rejects.toBeDefined()

    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    await teams.setMemberPermissions(teamId, DEFAULT_MEMBER_PERMISSIONS)
  })

  it('contact clé de chaque entreprise d’un salon : le premier contact saisi, en une requête', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const events = await import('@/db/repositories/events')
    const targets = await import('@/db/repositories/targets')
    await auth.signOut()
    await auth.signInWithPassword(USERS.admin, PASSWORD)
    const me = (await auth.getSession())!.user.id
    const teamId = (await teams.fetchMembership(me))!.teamId
    const event = await events.createEvent(teamId, {
      name: 'Salon contacts clés',
      startsOn: '2027-04-10',
      endsOn: '2027-04-11',
      venue: '',
      city: '',
      goals: '',
    })
    const rows = await exec(`
      with c as (insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), '${teamId}', 'Cléco', 'cleco') returning id),
           other as (insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), '${teamId}', 'Hors salon', 'hors salon') returning id),
           ec as (insert into event_companies (id, team_id, event_id, company_id)
                  select gen_random_uuid(), '${teamId}', '${event.id}', id from c returning id),
           oc as (insert into contacts (id, team_id, company_id, first_name, last_name)
                  select gen_random_uuid(), '${teamId}', id, 'Absent', 'Du salon' from other returning id)
      insert into contacts (id, team_id, company_id, first_name, last_name, job_title)
      select v.id::uuid, '${teamId}', c.id, v.f, v.l, v.j from c,
        (values ('00000000-0000-7000-8000-0000000000a1', 'Ada', 'Lovelace', 'CTO'),
                ('00000000-0000-7000-8000-0000000000a2', 'Zoé', 'Autre', 'RH')) as v(id, f, l, j)
      returning company_id`)
    const companyId = String(rows[0]!.company_id)
    const key = await targets.fetchKeyContactsNetwork(event.id)
    // Une seule entrée : l'entreprise du salon, avec son premier contact ; l'entreprise d'un autre salon n'y est pas.
    expect(Object.keys(key)).toEqual([companyId])
    expect(key[companyId]).toMatchObject({ name: 'Ada Lovelace', jobTitle: 'CTO' })
  })

  it('inscription : nom d’usage, recherche d’une équipe par son nom, adhésion, profil modifiable', async () => {
    const auth = await import('@/db/repositories/auth')
    const teams = await import('@/db/repositories/teams')
    const profile = await import('@/db/repositories/profile')

    await auth.signOut()
    const { confirmationNeeded } = await auth.signUp(
      'camille.martin@fair.test',
      PASSWORD,
      'Camille Martin',
    )
    expect(confirmationNeeded).toBe(false)
    const me = (await auth.getSession())!.user.id
    expect(await profile.fetchMyDisplayName(me)).toBe('Camille Martin')
    expect(await teams.fetchMembership(me)).toBeNull() // pas encore d'équipe

    expect(await teams.searchTeams('é')).toEqual([]) // trop court
    const hits = await teams.searchTeams('équipe e2')
    expect(hits).toEqual([expect.objectContaining({ name: 'Équipe e2e', memberCount: 3 })])
    await teams.joinTeam(hits[0]!.id)
    expect(await teams.fetchMembership(me)).toMatchObject({
      teamName: 'Équipe e2e',
      role: 'member',
    })

    // Les collègues la voient sous son nom d'usage, pas sous son e-mail.
    expect((await teams.listMembers(hits[0]!.id)).map((m) => m.displayName)).toContain(
      'Camille Martin',
    )
    await profile.updateMyDisplayName(me, '  Camille Martin-Dupont ')
    expect(await profile.fetchMyDisplayName(me)).toBe('Camille Martin-Dupont')

    await auth.signOut()
    await expect(auth.signUp('camille.martin@fair.test', PASSWORD, 'Autre')).rejects.toThrow(
      /already registered/i,
    )
  })
})
