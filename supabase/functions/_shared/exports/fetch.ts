import { newsLabelOf } from './labels.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ContactRec,
  ExportData,
  FollowUpRec,
  MeetingRec,
  MeetingStatus,
  NoteRec,
  Priority,
  TargetRec,
  TeamInfo,
} from './types.ts'
import { MEETING_STATUSES } from './types.ts'

// Lecture des données d'un salon pour les exports : requêtes simples (sans jointures PostgREST), sous les droits
// (RLS) de l'appelant — navigateur ou Edge Function avec le jeton de l'utilisateur.

const PAGE = 1000
const IN_CHUNK = 150

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Lit toutes les lignes d'une requête paginée. */
async function paged(
  make: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Row[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** Lit les lignes dont `column` est dans `ids` (par lots, pour garder des URL courtes). */
async function byIds(
  ids: string[],
  make: (
    part: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const out: Row[] = []
  for (const part of chunks(ids, IN_CHUNK))
    out.push(...(await paged((from, to) => make(part, from, to))))
  return out
}

async function loadLogo(client: SupabaseClient, path: string | null): Promise<TeamInfo['logo']> {
  if (!path) return null
  try {
    const { data, error } = await client.storage.from('attachments').download(path)
    if (error || !data) return null
    const bytes = new Uint8Array(await data.arrayBuffer())
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8
    return isPng || isJpg ? { bytes, mime: isPng ? 'image/png' : 'image/jpeg' } : null
  } catch {
    return null // le logo est facultatif : un export ne doit jamais échouer à cause de lui
  }
}

/** Toutes les données d'un salon (non supprimées) pour générer exports et bilan. */
export async function fetchExportData(
  client: SupabaseClient,
  eventId: string,
  now: Date = new Date(),
): Promise<ExportData> {
  const ev = await client
    .from('events')
    .select('id, team_id, name, starts_on, ends_on, venue, city, timezone')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()
  if (ev.error || !ev.data) throw new Error('event not found')
  const e = ev.data as Row
  const teamId = String(e.team_id)

  const teamRes = await client
    .from('teams')
    .select('id, name, logo_path, news_enabled, news_label')
    .eq('id', teamId)
    .single()
  if (teamRes.error || !teamRes.data) throw new Error('team not found')
  const t = teamRes.data as Row

  const ecRows = await paged((from, to) =>
    client
      .from('event_companies')
      .select('id, company_id, stand_label, priority, objective, prep_comment')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('id')
      .range(from, to),
  )
  const companyIds = [...new Set(ecRows.map((r) => String(r.company_id)))]
  const companies = new Map<string, Row>()
  for (const c of await byIds(companyIds, (part, from, to) =>
    client
      .from('companies')
      .select('id, name, domain, website, industry, city, country, history')
      .in('id', part)
      .order('id')
      .range(from, to),
  )) {
    companies.set(String(c.id), c)
  }

  const assignees = new Map<string, string[]>()
  for (const a of await paged((from, to) =>
    client
      .from('event_company_assignees')
      .select('event_company_id, user_id')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('event_company_id')
      .range(from, to),
  )) {
    const k = String(a.event_company_id)
    assignees.set(k, [...(assignees.get(k) ?? []), String(a.user_id)])
  }

  const tagLinks = new Map<string, string[]>()
  for (const l of await byIds(companyIds, (part, from, to) =>
    client
      .from('taggings')
      .select('tag_id, taggable_id')
      .eq('taggable_table', 'companies')
      .in('taggable_id', part)
      .order('taggable_id')
      .range(from, to),
  )) {
    const k = String(l.taggable_id)
    tagLinks.set(k, [...(tagLinks.get(k) ?? []), String(l.tag_id)])
  }

  const targets: TargetRec[] = ecRows.flatMap((r) => {
    const c = companies.get(String(r.company_id))
    if (!c) return []
    return [
      {
        id: String(r.id),
        companyId: String(r.company_id),
        name: String(c.name),
        domain: str(c.domain),
        website: str(c.website),
        industry: str(c.industry),
        city: str(c.city),
        country: str(c.country),
        stand: str(r.stand_label),
        priority: (str(r.priority) as Priority | null) ?? null,
        goal: str(r.objective),
        prepComment: str(r.prep_comment),
        history: str(c.history),
        assigneeIds: assignees.get(String(r.id)) ?? [],
        tagIds: tagLinks.get(String(r.company_id)) ?? [],
      },
    ]
  })

  const tagRows = await paged((from, to) =>
    client
      .from('tags')
      .select('id, label, color, kind')
      .eq('scope', 'company')
      .is('deleted_at', null)
      .order('id')
      .range(from, to),
  )

  const contacts: ContactRec[] = (
    await byIds(companyIds, (part, from, to) =>
      client
        .from('contacts')
        .select(
          'id, company_id, first_name, last_name, job_title, email, phone, linkedin_url, language, opt_out_at, anonymized_at',
        )
        .in('company_id', part)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    )
  )
    .filter((c) => !c.anonymized_at) // un contact anonymisé (RGPD) n'est jamais exporté
    .map((c) => ({
      id: String(c.id),
      companyId: str(c.company_id),
      firstName: str(c.first_name),
      lastName: str(c.last_name),
      jobTitle: str(c.job_title),
      email: str(c.email),
      phone: str(c.phone),
      linkedin: str(c.linkedin_url),
      language: str(c.language),
      optOut: !!c.opt_out_at,
    }))

  const meetings: MeetingRec[] = (
    await paged((from, to) =>
      client
        .from('meetings')
        .select(
          'id, event_company_id, contact_id, owner_id, status, planned_at, planned_duration_min, is_unplanned, interest, need, budget, timing, decision_maker, next_step, outcome, recontact, news',
        )
        .eq('event_id', eventId)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
    )
  ).map((m) => ({
    id: String(m.id),
    targetId: String(m.event_company_id),
    contactId: str(m.contact_id),
    ownerId: m.owner_id ? String(m.owner_id) : '', // vide = ancien membre (compte supprimé)
    status: (MEETING_STATUSES as readonly string[]).includes(String(m.status))
      ? (m.status as MeetingStatus)
      : 'to_see',
    plannedAt: str(m.planned_at),
    durationMin: num(m.planned_duration_min),
    unplanned: !!m.is_unplanned,
    interest: num(m.interest),
    need: str(m.need),
    budget: str(m.budget),
    timing: str(m.timing),
    decisionMaker: str(m.decision_maker),
    nextStep: str(m.next_step),
    outcome: str(m.outcome),
    recontact: m.recontact === true,
    news: m.news === true,
  }))

  const noteCols = 'id, meeting_id, event_company_id, author_id, body, source, captured_at'
  const noteRows = new Map<string, Row>()
  for (const n of await byIds(
    meetings.map((m) => m.id),
    (part, from, to) =>
      client
        .from('notes')
        .select(noteCols)
        .in('meeting_id', part)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
  )) {
    noteRows.set(String(n.id), n)
  }
  for (const n of await byIds(
    targets.map((x) => x.id),
    (part, from, to) =>
      client
        .from('notes')
        .select(noteCols)
        .in('event_company_id', part)
        .is('deleted_at', null)
        .order('id')
        .range(from, to),
  )) {
    noteRows.set(String(n.id), n)
  }
  const notes: NoteRec[] = [...noteRows.values()].map((n) => ({
    id: String(n.id),
    meetingId: str(n.meeting_id),
    targetId: str(n.event_company_id),
    authorId: n.author_id ? String(n.author_id) : '',
    body: String(n.body),
    source: String(n.source),
    capturedAt: String(n.captured_at),
  }))

  const followUps: FollowUpRec[] = (
    await byIds(
      meetings.map((m) => m.id),
      (part, from, to) =>
        client
          .from('follow_ups')
          .select('id, meeting_id, assignee_id, due_on, channel, body, status')
          .in('meeting_id', part)
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
    )
  ).map((u) => ({
    id: String(u.id),
    meetingId: str(u.meeting_id),
    assigneeId: str(u.assignee_id),
    dueOn: str(u.due_on),
    channel: String(u.channel),
    body: str(u.body),
    status: (u.status === 'done' || u.status === 'cancelled'
      ? u.status
      : 'todo') as FollowUpRec['status'],
  }))

  const memberRows = await paged((from, to) =>
    client
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .order('user_id')
      .range(from, to),
  )
  const userIds = memberRows.map((r) => String(r.user_id))
  const profiles = await byIds(userIds, (part, from, to) =>
    client.from('profiles').select('id, display_name').in('id', part).order('id').range(from, to),
  )
  const names = new Map(profiles.map((p) => [String(p.id), str(p.display_name)]))

  return {
    generatedAt: now.toISOString(),
    team: {
      id: teamId,
      name: String(t.name),
      logo: await loadLogo(client, str(t.logo_path)),
      newsEnabled: t.news_enabled === true,
      newsLabel: newsLabelOf(str(t.news_label)),
    },
    event: {
      id: eventId,
      name: String(e.name),
      startsOn: str(e.starts_on),
      endsOn: str(e.ends_on),
      venue: str(e.venue),
      city: str(e.city),
      timezone: str(e.timezone) ?? 'Europe/Paris',
    },
    members: userIds.map((userId) => ({ userId, name: names.get(userId) ?? '—' })),
    tags: tagRows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      color: str(r.color),
      kind: r.kind === 'show' ? ('show' as const) : ('type' as const),
    })),
    targets,
    contacts,
    meetings,
    notes,
    followUps,
  }
}
