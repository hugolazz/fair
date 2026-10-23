import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExportData, MeetingRec, MeetingStatus, TargetRec } from '@shared/exports/types.ts'

/** PNG 1×1 valide (logo d'équipe de test). */
export const LOGO_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const target = (id: string, name: string, over: Partial<TargetRec> = {}): TargetRec => ({
  id,
  companyId: `co-${id}`,
  name,
  domain: null,
  website: null,
  industry: 'Retail',
  city: 'Paris',
  country: 'France',
  stand: null,
  priority: null,
  goal: null,
  prepComment: null,
  history: null,
  assigneeIds: [],
  tagIds: [],
  ...over,
})

const meeting = (
  id: string,
  targetId: string,
  ownerId: string,
  status: MeetingStatus,
  over: Partial<MeetingRec> = {},
): MeetingRec => ({
  id,
  targetId,
  contactId: null,
  ownerId,
  status,
  plannedAt: null,
  durationMin: 15,
  unplanned: false,
  interest: null,
  need: null,
  budget: null,
  timing: null,
  decisionMaker: null,
  nextStep: null,
  outcome: null,
  recontact: false,
  news: false,
  ...over,
})

/**
 * Salon de test : 6 entreprises, 3 commerciaux, 8 rencontres (dont 1 imprévue), notes, contacts (un désinscrit,
 * un qui tente une injection de formule), une relance en attente.
 */
export function sampleData(withLogo = true): ExportData {
  return {
    generatedAt: '2027-05-20T09:00:00.000Z',
    team: {
      id: 'team-1',
      name: 'Équipe Démo',
      logo: withLogo ? { bytes: LOGO_PNG, mime: 'image/png' } : null,
      newsEnabled: false,
      newsLabel: 'Actualité ?',
    },
    event: {
      id: 'e1',
      name: 'Tech For Retail 2027',
      startsOn: '2027-05-12',
      endsOn: '2027-05-13',
      venue: 'Paris Expo',
      city: 'Paris',
      timezone: 'Europe/Paris',
    },
    members: [
      { userId: 'u1', name: 'Hugo' },
      { userId: 'u2', name: 'Marie' },
      { userId: 'u3', name: 'Paul' },
    ],
    tags: [
      { id: 't1', label: 'Client', color: '#0f766e', kind: 'type' },
      { id: 't2', label: 'Prospect', color: '#1d4ed8', kind: 'type' },
    ],
    targets: [
      target('ec1', 'Carrefour', {
        priority: 'A',
        stand: 'B12',
        goal: 'demo',
        assigneeIds: ['u1', 'u2'],
        tagIds: ['t1'],
        domain: 'carrefour.com',
        website: 'https://carrefour.com',
        prepComment: 'Parler du POC paiement\net de la caisse mobile',
      }),
      target('ec2', 'Décathlon', {
        priority: 'B',
        stand: 'D4',
        assigneeIds: ['u2'],
        tagIds: ['t2'],
      }),
      target('ec3', 'Zalando', { priority: 'C', stand: 'A7', assigneeIds: ['u1'], tagIds: ['t2'] }),
      target('ec4', 'Fnac Darty', { assigneeIds: ['u3'] }),
      target('ec5', 'Amazon France', { priority: 'A', stand: 'E1', assigneeIds: ['u3'] }),
      target('ec6', 'Leroy Merlin', { priority: 'B' }),
    ],
    contacts: [
      {
        id: 'c1',
        companyId: 'co-ec1',
        firstName: 'Jean',
        lastName: 'Martin',
        jobTitle: 'Directeur innovation',
        email: 'jean.martin@carrefour.com',
        phone: '+33 6 12 34 56 78',
        linkedin: null,
        language: 'fr',
        optOut: false,
      },
      {
        id: 'c2',
        companyId: 'co-ec1',
        firstName: 'Paula',
        lastName: 'Désinscrite',
        jobTitle: null,
        email: 'paula@carrefour.com',
        phone: null,
        linkedin: null,
        language: 'fr',
        optOut: true,
      },
      {
        id: 'c3',
        companyId: 'co-ec2',
        firstName: 'Alice',
        lastName: 'Durand, Dupont',
        jobTitle: 'Head of "Digital"',
        email: 'alice@decathlon.com',
        phone: null,
        linkedin: null,
        language: 'fr',
        optOut: false,
      },
      {
        id: 'c4',
        companyId: 'co-ec3',
        firstName: '=HYPERLINK("http://evil.test","clic")',
        lastName: 'Mallory',
        jobTitle: '-2+3',
        email: 'm@zalando.com',
        phone: null,
        linkedin: null,
        language: 'en',
        optOut: false,
      },
    ],
    meetings: [
      meeting('m1', 'ec1', 'u1', 'done', {
        plannedAt: '2027-05-12T08:30:00.000Z',
        interest: 5,
        nextStep: 'Envoyer le devis',
        need: 'Caisse mobile',
        budget: '50 k€',
        timing: 'T3',
        decisionMaker: 'DSI',
        contactId: 'c1',
      }),
      meeting('m2', 'ec1', 'u2', 'follow_up', {
        plannedAt: '2027-05-13T13:00:00.000Z',
        interest: 4,
        nextStep: 'Rappeler mardi',
      }),
      meeting('m3', 'ec2', 'u2', 'done', { plannedAt: '2027-05-12T12:00:00.000Z', interest: 3 }),
      meeting('m4', 'ec3', 'u1', 'missed', { plannedAt: '2027-05-12T14:00:00.000Z' }),
      meeting('m5', 'ec4', 'u3', 'to_see', { plannedAt: '2027-05-13T09:00:00.000Z' }),
      meeting('m6', 'ec5', 'u3', 'not_interested', {
        plannedAt: '2027-05-12T15:00:00.000Z',
        interest: 2,
      }),
      meeting('m7', 'ec6', 'u2', 'done', {
        plannedAt: null,
        unplanned: true,
        interest: 4,
        nextStep: 'Démo à planifier',
      }),
      meeting('m8', 'ec2', 'u2', 'follow_up', {
        plannedAt: '2027-05-13T08:00:00.000Z',
        interest: 3,
      }),
    ],
    notes: [
      {
        id: 'n1',
        meetingId: 'm1',
        targetId: null,
        authorId: 'u1',
        body: 'Décideur présent, budget validé T3 – très intéressé par l’offre « caisse mobile ».',
        source: 'typed',
        capturedAt: '2027-05-12T08:45:00.000Z',
      },
      {
        id: 'n2',
        meetingId: 'm3',
        targetId: null,
        authorId: 'u2',
        body: 'Veut une démo en juin',
        source: 'dictated',
        capturedAt: '2027-05-12T12:20:00.000Z',
      },
      {
        id: 'n3',
        meetingId: null,
        targetId: 'ec5',
        authorId: 'u3',
        body: 'Croisé au bar, pas de besoin immédiat',
        source: 'typed',
        capturedAt: '2027-05-12T19:00:00.000Z',
      },
    ],
    followUps: [
      {
        id: 'f1',
        meetingId: 'm1',
        assigneeId: 'u1',
        dueOn: '2027-05-20',
        channel: 'email',
        body: 'Envoyer le devis détaillé',
        status: 'todo',
      },
      {
        id: 'f2',
        meetingId: 'm3',
        assigneeId: 'u2',
        dueOn: '2027-05-21',
        channel: 'call',
        body: 'Appeler',
        status: 'done',
      },
    ],
  }
}

/** Beaucoup de données : 400 entreprises, 600 rencontres, des notes longues. */
export function bigData(): ExportData {
  const base = sampleData()
  const targets: TargetRec[] = Array.from({ length: 400 }, (_, i) =>
    target(`b${i}`, `Entreprise numéro ${i} avec un nom assez long pour passer à la ligne`, {
      priority: (['A', 'B', 'C', null] as const)[i % 4]!,
      stand: `${'ABCDEF'[i % 6]}${(i % 60) + 1}`,
      assigneeIds: [`u${(i % 3) + 1}`],
    }),
  )
  const statuses: MeetingStatus[] = [
    'done',
    'follow_up',
    'missed',
    'to_see',
    'not_interested',
    'skipped',
    'in_progress',
  ]
  const meetings = Array.from({ length: 600 }, (_, i) =>
    meeting(`bm${i}`, `b${i % 400}`, `u${(i % 3) + 1}`, statuses[i % statuses.length]!, {
      plannedAt: `2027-05-1${2 + (i % 2)}T${String(8 + (i % 9)).padStart(2, '0')}:00:00.000Z`,
      interest: (i % 5) + 1,
      nextStep: i % 3 === 0 ? 'Rappeler avec la proposition commerciale détaillée' : null,
    }),
  )
  const notes = meetings.slice(0, 200).map((m, i) => ({
    id: `bn${i}`,
    meetingId: m.id,
    targetId: null,
    authorId: m.ownerId,
    body: `Note ${i} : ${'discussion très longue sur le projet '.repeat(12)}`,
    source: 'typed',
    capturedAt: '2027-05-12T10:00:00.000Z',
  }))
  return { ...base, targets, meetings, notes, contacts: [], followUps: [] }
}

// --- faux client Supabase (lecture seule) --------------------------------------------------------------------

type Row = Record<string, unknown>

/** Reproduit les filtres PostgREST utilisés par `fetchExportData` sur des tableaux en mémoire. */
export function fakeClient(tables: Record<string, Row[]>, files: Record<string, Uint8Array> = {}) {
  const calls: { table: string; inSize?: number }[] = []
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
      is: (c: string, v: null) => (
        (rows = rows.filter((r) => (v === null ? r[c] == null : r[c] === v))),
        q
      ),
      in: (c: string, list: unknown[]) => {
        calls.push({ table, inSize: list.length })
        rows = rows.filter((r) => list.includes(r[c]))
        return q
      },
      order: () => q,
      range: (a: number, b: number) => ((rows = rows.slice(a, b + 1)), q),
      single: () =>
        Promise.resolve(
          rows[0]
            ? { data: rows[0], error: null }
            : { data: null, error: { message: 'not found' } },
        ),
      then: (res: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
    }
    return q
  }
  const storage = {
    from: () => ({
      download: async (path: string) =>
        files[path]
          ? { data: new Blob([files[path]!.slice().buffer]), error: null }
          : { data: null, error: { message: 'missing' } },
    }),
  }
  return { client: { from, storage } as unknown as SupabaseClient, calls }
}
