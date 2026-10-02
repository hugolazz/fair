import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPdf } from './pdf-text'

// L'Edge Function s'exécute sous Deno ; ici on simule `Deno.serve` et le client Supabase pour tester sa logique
// (authentification, validation, génération, dépôt dans le bucket, purge, lien signé).

type Row = Record<string, unknown>
const EVENT = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  uploads: [] as { bucket: string; path: string; bytes: Uint8Array; contentType: string }[],
  listed: [] as { name: string }[],
  removed: [] as string[],
  uploadError: false,
  tables: {} as Record<string, Row[]>,
  files: {} as Record<string, Uint8Array>,
}))

vi.mock('@supabase/supabase-js', async () => {
  const { fakeClient: make } = await import('./fixtures')
  return {
    createClient: () => {
      const base = make(state.tables, state.files).client as unknown as Record<string, unknown>
      const baseStorage = (base.storage as { from: (b: string) => object }).from('x')
      return {
        ...base,
        auth: {
          getUser: async () =>
            state.user
              ? { data: { user: state.user }, error: null }
              : { data: { user: null }, error: { message: 'jwt' } },
        },
        storage: {
          from: (bucket: string) => ({
            ...baseStorage,
            upload: async (path: string, bytes: Uint8Array, opts: { contentType: string }) => {
              if (state.uploadError) return { error: { message: 'boom' } }
              state.uploads.push({ bucket, path, bytes, contentType: opts.contentType })
              return { error: null }
            },
            list: async () => ({ data: state.listed, error: null }),
            remove: async (paths: string[]) => (state.removed.push(...paths), { error: null }),
            createSignedUrl: async (path: string, seconds: number, opts: { download: string }) => ({
              data: {
                signedUrl: `https://storage.test/sign/${path}?t=${seconds}&dl=${opts.download}`,
              },
              error: null,
            }),
          }),
        },
      }
    },
  }
})

type Handler = (req: Request) => Promise<Response>
let handler: Handler

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: (h: Handler) => void (handler = h),
    env: { get: (k: string) => ({ SUPABASE_URL: 'http://x.test', SUPABASE_ANON_KEY: 'anon' })[k] },
  })
  const path = '../../supabase/functions/generate-export/index.ts'
  await import(/* @vite-ignore */ path)
})

beforeEach(() => {
  state.user = { id: 'u1' }
  state.uploads = []
  state.listed = []
  state.removed = []
  state.uploadError = false
  state.files = {}
  state.tables = {
    events: [
      {
        id: EVENT,
        team_id: TEAM,
        name: 'Salon',
        starts_on: '2027-05-12',
        ends_on: null,
        venue: null,
        city: 'Paris',
        timezone: 'Europe/Paris',
        deleted_at: null,
      },
    ],
    teams: [{ id: TEAM, name: 'Équipe', logo_path: null }],
    companies: [
      {
        id: 'c1',
        name: 'Carrefour',
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
        event_id: EVENT,
        company_id: 'c1',
        stand_label: 'B1',
        priority: 'A',
        objective: null,
        prep_comment: null,
        deleted_at: null,
      },
    ],
    event_company_assignees: [
      { event_company_id: 'ec1', user_id: 'u1', event_id: EVENT, deleted_at: null },
    ],
    taggings: [],
    tags: [],
    contacts: [],
    meetings: [
      {
        id: 'm1',
        event_id: EVENT,
        event_company_id: 'ec1',
        contact_id: null,
        owner_id: 'u1',
        status: 'done',
        planned_at: '2027-05-12T08:00:00Z',
        planned_duration_min: 15,
        is_unplanned: false,
        interest: 4,
        need: null,
        budget: null,
        timing: null,
        decision_maker: null,
        next_step: null,
        outcome: null,
        deleted_at: null,
      },
    ],
    notes: [],
    follow_ups: [],
    team_members: [{ team_id: TEAM, user_id: 'u1' }],
    profiles: [{ id: 'u1', display_name: 'Hugo' }],
  }
})

const call = (
  body: unknown,
  headers: Record<string, string> = { Authorization: 'Bearer jwt' },
  method = 'POST',
) =>
  handler(
    new Request('http://fn.test/generate-export', {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
  )

const ok = { eventId: EVENT, request: { kind: 'pdf-bilan', filters: {} } }

describe('Edge Function generate-export', () => {
  it('répond aux requêtes CORS et refuse les autres méthodes', async () => {
    expect((await call(null, {}, 'OPTIONS')).status).toBe(200)
    expect((await call(null, {}, 'GET')).status).toBe(405)
  })

  it('refuse sans jeton ou avec un jeton invalide', async () => {
    expect((await call(ok, {})).status).toBe(401)
    state.user = null
    expect((await call(ok)).status).toBe(401)
    expect(state.uploads).toHaveLength(0)
  })

  it('refuse une demande invalide (identifiant de salon, type d’export) sans rien générer', async () => {
    expect((await call({ eventId: 'pas-un-uuid', request: ok.request })).status).toBe(400)
    expect((await call({ eventId: EVENT, request: { kind: 'exe' } })).status).toBe(400)
    expect((await call({ eventId: EVENT })).status).toBe(400)
    expect(state.uploads).toHaveLength(0)
  })

  it('salon inconnu (ou d’une autre équipe, invisible par RLS) : 404', async () => {
    state.tables.events = []
    const r = await call(ok)
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'not_found' })
  })

  it('génère le fichier, le dépose dans le dossier de l’équipe et renvoie un lien signé', async () => {
    const r = await call(ok)
    expect(r.status).toBe(200)
    const body = (await r.json()) as {
      url: string
      filename: string
      mime: string
      bytes: number
      expiresAt: string
    }

    expect(state.uploads).toHaveLength(1)
    const up = state.uploads[0]!
    expect(up.bucket).toBe('exports')
    expect(up.path.startsWith(`${TEAM}/`)).toBe(true)
    expect(up.path).toMatch(/^[0-9a-f-]+\/\d+-[0-9a-f]{8}-fair-salon-bilan-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(up.contentType).toBe('application/pdf')
    // Le fichier déposé est bien le bilan d'une page.
    expect((await readPdf(up.bytes)).pages).toHaveLength(1)

    expect(body.filename).toMatch(/^fair-salon-bilan-.*\.pdf$/)
    expect(body.mime).toBe('application/pdf')
    expect(body.bytes).toBe(up.bytes.length)
    expect(body.url).toContain(up.path)
    expect(body.url).toContain('t=3600') // lien valable 1 h
    expect(body.url).toContain(`dl=${body.filename}`)
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(3500 * 1000)
  })

  it('génère aussi un Excel, un CSV et une archive de PDF', async () => {
    const kinds: [object, string][] = [
      [{ kind: 'xlsx', filters: {} }, '.xlsx'],
      [
        {
          kind: 'csv',
          filters: {},
          template: {
            columns: [{ header: 'Nom', source: { field: 'company.name' } }],
            includeCompaniesWithoutContact: true,
          },
        },
        '.csv',
      ],
      [{ kind: 'pdf-reps', filters: {} }, '.zip'],
    ]
    for (const [request, ext] of kinds) {
      state.uploads = []
      const r = await call({ eventId: EVENT, request })
      expect(r.status, JSON.stringify(request)).toBe(200)
      expect(state.uploads[0]!.path.endsWith(ext)).toBe(true)
    }
  })

  it('supprime les exports de plus de 24 h de l’équipe, garde les récents', async () => {
    const old = `${Date.now() - 25 * 3600 * 1000}-aaaaaaaa-fair-vieux.xlsx`
    const recent = `${Date.now() - 2 * 3600 * 1000}-bbbbbbbb-fair-recent.xlsx`
    state.listed = [{ name: old }, { name: recent }]
    await call(ok)
    expect(state.removed).toEqual([`${TEAM}/${old}`])
  })

  it('erreurs claires : aucun commercial, échec de dépôt', async () => {
    const none = await call({
      eventId: EVENT,
      request: { kind: 'pdf-reps', filters: { tagIds: ['inconnu'] } },
    })
    expect(none.status).toBe(422)
    expect(await none.json()).toEqual({ error: 'nothing_to_export' })
    state.uploadError = true
    const failed = await call(ok)
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'upload_failed' })
  })

  it('n’utilise que le jeton de l’appelant : jamais de clé de service', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('supabase/functions/generate-export/index.ts', 'utf8'),
    )
    expect(source).not.toMatch(/SERVICE_ROLE|service_role/)
  })
})
