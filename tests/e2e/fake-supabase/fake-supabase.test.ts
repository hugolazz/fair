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
