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
      status: 'draft',
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
        status: 'draft',
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
})
