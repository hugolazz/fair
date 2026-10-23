import { describe, expect, it } from 'vitest'
import { fetchExportData } from '@shared/exports/fetch.ts'
import { LOGO_PNG, fakeClient } from './fixtures'

type Row = Record<string, unknown>

/** Base de test au format des vraies tables Supabase. */
function db(extra: { targets?: number } = {}) {
  const tables: Record<string, Row[]> = {
    events: [
      {
        id: 'e1',
        team_id: 't1',
        name: 'Tech For Retail',
        starts_on: '2027-05-12',
        ends_on: '2027-05-13',
        venue: 'Paris Expo',
        city: 'Paris',
        timezone: 'Europe/Paris',
        deleted_at: null,
      },
      {
        id: 'e2',
        team_id: 't1',
        name: 'Autre salon',
        starts_on: null,
        ends_on: null,
        venue: null,
        city: null,
        timezone: 'Europe/Paris',
        deleted_at: null,
      },
    ],
    teams: [{ id: 't1', name: 'Équipe Démo', logo_path: 't1/logo.png' }],
    companies: [
      {
        id: 'c1',
        name: 'Carrefour',
        domain: 'carrefour.com',
        website: null,
        industry: 'Retail',
        city: 'Paris',
        country: 'France',
      },
      {
        id: 'c2',
        name: 'Décathlon',
        domain: null,
        website: null,
        industry: null,
        city: null,
        country: null,
      },
      {
        id: 'c3',
        name: 'Supprimée',
        domain: null,
        website: null,
        industry: null,
        city: null,
        country: null,
      },
    ],
    event_companies: [
      {
        id: 'ec1',
        event_id: 'e1',
        company_id: 'c1',
        stand_label: 'B12',
        priority: 'A',
        objective: 'demo',
        prep_comment: 'Parler du POC',
        created_at: '2027-01-10T09:00:00.000Z',
        import_batch_id: 'batch-1',
        deleted_at: null,
      },
      {
        id: 'ec2',
        event_id: 'e1',
        company_id: 'c2',
        stand_label: '',
        priority: null,
        objective: null,
        prep_comment: null,
        created_at: '2027-05-12T10:30:00.000Z',
        import_batch_id: null,
        deleted_at: null,
      },
      {
        id: 'ec3',
        event_id: 'e1',
        company_id: 'c3',
        stand_label: null,
        priority: 'B',
        objective: null,
        prep_comment: null,
        deleted_at: '2027-01-01',
      },
      {
        id: 'ec9',
        event_id: 'e2',
        company_id: 'c1',
        stand_label: 'Z1',
        priority: 'C',
        objective: null,
        prep_comment: null,
        deleted_at: null,
      },
    ],
    event_company_assignees: [
      { event_company_id: 'ec1', user_id: 'u1', event_id: 'e1', deleted_at: null },
      { event_company_id: 'ec1', user_id: 'u2', event_id: 'e1', deleted_at: '2027-02-01' }, // désassigné
    ],
    taggings: [
      { tag_id: 'tg1', taggable_table: 'companies', taggable_id: 'c1' },
      { tag_id: 'tg2', taggable_table: 'contacts', taggable_id: 'c1' }, // autre portée : ignoré
    ],
    tags: [
      { id: 'tg1', label: 'Client', color: '#0f766e', scope: 'company', deleted_at: null },
      { id: 'tg2', label: 'Contact', color: null, scope: 'contact', deleted_at: null },
    ],
    contacts: [
      {
        id: 'k1',
        company_id: 'c1',
        first_name: 'Jean',
        last_name: 'Martin',
        job_title: 'DSI',
        email: 'j@c.com',
        phone: '',
        linkedin_url: null,
        language: 'fr',
        opt_out_at: null,
        anonymized_at: null,
        deleted_at: null,
      },
      {
        id: 'k2',
        company_id: 'c1',
        first_name: 'Paula',
        last_name: 'X',
        job_title: null,
        email: null,
        phone: null,
        linkedin_url: null,
        language: null,
        opt_out_at: '2027-03-01',
        anonymized_at: null,
        deleted_at: null,
      },
      {
        id: 'k3',
        company_id: 'c1',
        first_name: null,
        last_name: 'Anonyme',
        job_title: null,
        email: null,
        phone: null,
        linkedin_url: null,
        language: null,
        opt_out_at: null,
        anonymized_at: '2027-04-01',
        deleted_at: null,
      },
      {
        id: 'k4',
        company_id: 'c2',
        first_name: 'Supprimé',
        last_name: 'Contact',
        job_title: null,
        email: null,
        phone: null,
        linkedin_url: null,
        language: null,
        opt_out_at: null,
        anonymized_at: null,
        deleted_at: '2027-04-01',
      },
    ],
    meetings: [
      {
        id: 'm1',
        event_id: 'e1',
        event_company_id: 'ec1',
        contact_id: 'k1',
        owner_id: 'u1',
        status: 'done',
        planned_at: '2027-05-12T08:30:00Z',
        planned_duration_min: 20,
        interest: 4,
        need: 'POC',
        budget: null,
        timing: null,
        decision_maker: null,
        next_step: 'Devis',
        outcome: null,
        deleted_at: null,
      },
      {
        id: 'm2',
        event_id: 'e1',
        event_company_id: 'ec2',
        contact_id: null,
        owner_id: 'u2',
        status: 'inconnu',
        planned_at: null,
        planned_duration_min: 15,
        interest: null,
        need: null,
        budget: null,
        timing: null,
        decision_maker: null,
        next_step: null,
        outcome: null,
        deleted_at: null,
      },
      {
        id: 'm3',
        event_id: 'e1',
        event_company_id: 'ec1',
        contact_id: null,
        owner_id: 'u1',
        status: 'done',
        planned_at: null,
        planned_duration_min: 15,
        interest: null,
        need: null,
        budget: null,
        timing: null,
        decision_maker: null,
        next_step: null,
        outcome: null,
        deleted_at: '2027-05-13',
      },
    ],
    notes: [
      {
        id: 'n1',
        meeting_id: 'm1',
        event_company_id: null,
        author_id: 'u1',
        body: 'Note de rencontre',
        source: 'typed',
        captured_at: '2027-05-12T09:00:00Z',
        deleted_at: null,
      },
      {
        id: 'n2',
        meeting_id: null,
        event_company_id: 'ec2',
        author_id: 'u2',
        body: 'Note sur l’entreprise',
        source: 'dictated',
        captured_at: '2027-05-12T10:00:00Z',
        deleted_at: null,
      },
      {
        id: 'n3',
        meeting_id: 'm1',
        event_company_id: null,
        author_id: 'u1',
        body: 'Note supprimée',
        source: 'typed',
        captured_at: '2027-05-12T09:30:00Z',
        deleted_at: '2027-05-13',
      },
    ],
    follow_ups: [
      {
        id: 'f1',
        meeting_id: 'm1',
        assignee_id: 'u1',
        due_on: '2027-05-20',
        channel: 'email',
        body: 'Envoyer le devis',
        status: 'todo',
        deleted_at: null,
      },
    ],
    team_members: [
      { team_id: 't1', user_id: 'u1' },
      { team_id: 't1', user_id: 'u2' },
    ],
    profiles: [
      { id: 'u1', display_name: 'Hugo' },
      { id: 'u2', display_name: null },
    ],
  }
  for (let i = 0; i < (extra.targets ?? 0); i++) {
    tables.companies!.push({
      id: `bc${i}`,
      name: `Société ${i}`,
      domain: null,
      website: null,
      industry: null,
      city: null,
      country: null,
    })
    tables.event_companies!.push({
      id: `bec${i}`,
      event_id: 'e1',
      company_id: `bc${i}`,
      stand_label: null,
      priority: null,
      objective: null,
      prep_comment: null,
      deleted_at: null,
    })
  }
  return tables
}

const NOW = new Date('2027-05-20T09:00:00Z')

describe('lecture des données d’un salon', () => {
  it('assemble équipe, salon, entreprises, contacts, rencontres, notes, relances et membres', async () => {
    const { client } = fakeClient(db(), { 't1/logo.png': LOGO_PNG })
    const d = await fetchExportData(client, 'e1', NOW)
    expect(d.generatedAt).toBe('2027-05-20T09:00:00.000Z')
    expect(d.team).toMatchObject({ id: 't1', name: 'Équipe Démo' })
    expect(d.team.logo).toMatchObject({ mime: 'image/png' })
    expect(d.event).toEqual({
      id: 'e1',
      name: 'Tech For Retail',
      startsOn: '2027-05-12',
      endsOn: '2027-05-13',
      venue: 'Paris Expo',
      city: 'Paris',
      timezone: 'Europe/Paris',
    })
    expect(d.targets.map((t) => [t.name, t.stand, t.priority, t.goal])).toEqual([
      ['Carrefour', 'B12', 'A', 'demo'],
      ['Décathlon', null, null, null], // chaîne vide → null
    ])
    expect(d.members).toEqual([
      { userId: 'u1', name: 'Hugo' },
      { userId: 'u2', name: '—' }, // profil sans nom
    ])
    expect(d.notes.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
    expect(d.followUps).toHaveLength(1)
  })

  it('retient quand et comment chaque entreprise a été ajoutée (rencontres imprévues du bilan)', async () => {
    const { client } = fakeClient(db(), { 't1/logo.png': LOGO_PNG })
    const data = await fetchExportData(client, 'e1', NOW)
    const byId = Object.fromEntries(data.targets.map((t) => [t.id, t]))
    expect(byId['ec1']).toMatchObject({ addedAt: '2027-01-10T09:00:00.000Z', imported: true })
    expect(byId['ec2']).toMatchObject({ addedAt: '2027-05-12T10:30:00.000Z', imported: false })
  })

  it('ne lit que ce qui est actif : ni supprimé, ni d’un autre salon, ni désassigné', async () => {
    const { client } = fakeClient(db())
    const d = await fetchExportData(client, 'e1', NOW)
    expect(d.targets.map((t) => t.id)).toEqual(['ec1', 'ec2']) // ni ec3 (supprimée) ni ec9 (autre salon)
    expect(d.targets[0]!.assigneeIds).toEqual(['u1'])
    expect(d.targets[0]!.tagIds).toEqual(['tg1']) // le tag de portée « contact » est ignoré
    expect(d.tags.map((t) => t.label)).toEqual(['Client'])
    expect(d.meetings.map((m) => m.id).sort()).toEqual(['m1', 'm2'])
    expect(d.contacts.map((c) => c.id).sort()).toEqual(['k1', 'k2'])
  })

  it('n’exporte jamais un contact anonymisé (RGPD) et signale la désinscription', async () => {
    const { client } = fakeClient(db())
    const d = await fetchExportData(client, 'e1', NOW)
    expect(d.contacts.find((c) => c.id === 'k3')).toBeUndefined()
    expect(d.contacts.find((c) => c.id === 'k2')!.optOut).toBe(true)
    expect(d.contacts.find((c) => c.id === 'k1')).toMatchObject({
      optOut: false,
      phone: null,
      email: 'j@c.com',
    })
  })

  it('nettoie les rencontres (statut inconnu → à voir, durée, intérêt)', async () => {
    const { client } = fakeClient(db())
    const d = await fetchExportData(client, 'e1', NOW)
    expect(d.meetings.find((m) => m.id === 'm2')).toMatchObject({
      status: 'to_see',
      plannedAt: null,
    })
    expect(d.meetings.find((m) => m.id === 'm1')).toMatchObject({
      status: 'done',
      durationMin: 20,
      interest: 4,
      contactId: 'k1',
      nextStep: 'Devis',
    })
  })

  it('le logo est facultatif : absent, illisible ou introuvable, l’export continue', async () => {
    const noLogo = await fetchExportData(fakeClient(db()).client, 'e1', NOW) // fichier absent du stockage
    expect(noLogo.team.logo).toBeNull()
    const junk = await fetchExportData(
      fakeClient(db(), { 't1/logo.png': new Uint8Array([1, 2, 3]) }).client,
      'e1',
      NOW,
    )
    expect(junk.team.logo).toBeNull()
    const none = db()
    none.teams![0]!.logo_path = null
    expect((await fetchExportData(fakeClient(none).client, 'e1', NOW)).team.logo).toBeNull()
    const jpeg = await fetchExportData(
      fakeClient(db(), { 't1/logo.png': new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) }).client,
      'e1',
      NOW,
    )
    expect(jpeg.team.logo?.mime).toBe('image/jpeg')
  })

  it('un salon introuvable (ou supprimé) lève une erreur claire', async () => {
    await expect(fetchExportData(fakeClient(db()).client, 'inconnu', NOW)).rejects.toThrow(
      'event not found',
    )
  })

  it('gros volume : pagine par 1 000 et découpe les listes d’identifiants par 150', async () => {
    const { client, calls } = fakeClient(db({ targets: 2500 }))
    const d = await fetchExportData(client, 'e1', NOW)
    expect(d.targets).toHaveLength(2502) // 2 d'origine + 2 500
    const sizes = calls.filter((c) => c.table === 'companies').map((c) => c.inSize!)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(150)
    expect(sizes.length).toBeGreaterThanOrEqual(Math.ceil(2502 / 150))
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(2502)
  })
})
