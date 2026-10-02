import { computeBilan } from './bilan.ts'
import { formatDate, formatDateTime, formatEventDates, percent, slug } from './format.ts'
import { GOAL_LABEL, SOURCE_LABEL, priorityLabel, statusLabel } from './labels.ts'
import { COLORS, MARGIN, PAGE_H, PAGE_W, PRIORITY_COLORS, PdfWriter } from './pdf-writer.ts'
import { applyFilters, memberNames } from './select.ts'
import { NO_FILTERS, type ExportData, type MeetingRec, type TargetRec } from './types.ts'

// PDF de compte-rendu : global, par commercial, fiches de rencontre.

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })
const byName = (a: TargetRec, b: TargetRec) => collator.compare(a.name, b.name)

async function newDocument(data: ExportData, title: string) {
  return PdfWriter.create({
    title: `${title} — ${data.event.name}`,
    footerCenter: `${data.team.name} · ${data.event.name}`,
    generatedAt: data.generatedAt,
  })
}

/** Page de garde : logo de l'équipe, titre, salon, dates et lieu. */
async function cover(w: PdfWriter, data: ExportData, title: string, subtitle?: string) {
  let top = PAGE_H - MARGIN
  const logo = await w.image(data.team.logo, MARGIN, top, 170, 70)
  top -= (logo?.h ?? 0) + 70
  w.y = top
  w.text(data.team.name, { size: 12, color: COLORS.muted, gap: 14 })
  w.text(title, { size: 30, bold: true, color: COLORS.brand, gap: 10 })
  w.text(data.event.name, { size: 20, bold: true, gap: 8 })
  if (subtitle) w.text(subtitle, { size: 14, gap: 8 })
  const where = [data.event.venue, data.event.city].filter(Boolean).join(', ')
  const dates = formatEventDates(data.event.startsOn, data.event.endsOn)
  for (const line of [dates, where].filter(Boolean))
    w.text(line, { size: 12, color: COLORS.muted, gap: 2 })
  w.skip(16)
  w.text(`Généré le ${formatDate(data.generatedAt, data.event.timezone)}`, {
    size: 10,
    color: COLORS.muted,
  })
}

const none = (w: PdfWriter, text: string) => w.text(text, { color: COLORS.muted, gap: 8 })

function synthese(w: PdfWriter, data: ExportData) {
  const b = computeBilan(data)
  w.heading('Synthèse', { toc: true, newPage: true })
  w.table({
    columns: [
      { label: 'Indicateur', weight: 4 },
      { label: 'Valeur', weight: 2, align: 'right' },
    ],
    rows: [
      ['Entreprises ciblées', String(b.targets)],
      ['Entreprises rencontrées', `${b.targetsMet} (${percent(b.targetsMet, b.targets)})`],
      ['Rencontres prévues', String(b.meetings.planned)],
      [
        'Rencontres réalisées',
        `${b.meetings.held} (${b.meetings.rate === null ? '—' : `${b.meetings.rate} %`})`,
      ],
      ['Rencontres manquées ou écartées', String(b.meetings.missed)],
      ['Rencontres pas encore traitées', String(b.meetings.pending)],
      ['Rencontres imprévues', String(b.meetings.unplanned)],
    ],
    size: 9.5,
  })

  w.heading('Répartition par statut', { level: 2 })
  w.skip(4)
  w.bars(b.byStatus.map((s) => ({ label: statusLabel(s.status), value: s.count })))

  w.heading('Par priorité', { level: 2 })
  w.skip(4)
  w.table({
    columns: [
      { label: 'Priorité', weight: 2 },
      { label: 'Entreprises', weight: 1.4, align: 'right' },
      { label: 'Rencontrées', weight: 1.4, align: 'right' },
      { label: 'Rencontres', weight: 1.4, align: 'right' },
      { label: 'Réalisées', weight: 1.4, align: 'right' },
    ],
    rows: b.byPriority.map((p) => [
      priorityLabel(p.priority === 'none' ? null : p.priority),
      String(p.targets),
      String(p.met),
      String(p.meetings),
      String(p.held),
    ]),
    fills: b.byPriority.map((p) =>
      p.priority === 'none' ? undefined : { 0: PRIORITY_COLORS[p.priority] },
    ),
  })

  w.heading('Par commercial', { level: 2 })
  w.skip(4)
  if (b.bySalesperson.length === 0) return none(w, 'Aucun commercial.')
  w.table({
    columns: [
      { label: 'Commercial', weight: 2.6 },
      { label: 'Entreprises', weight: 1.3, align: 'right' },
      { label: 'Prévues', weight: 1.1, align: 'right' },
      { label: 'Réalisées', weight: 1.2, align: 'right' },
      { label: 'Manquées', weight: 1.2, align: 'right' },
      { label: 'Intérêt moyen', weight: 1.4, align: 'right' },
    ],
    rows: b.bySalesperson.map((s) => [
      s.name,
      String(s.targets),
      String(s.planned),
      String(s.held),
      String(s.missed),
      s.avgInterest === null ? '—' : s.avgInterest.toFixed(1).replace('.', ','),
    ]),
  })
}

function entreprises(w: PdfWriter, data: ExportData) {
  w.heading('Entreprises', { toc: true, newPage: true })
  const targets = data.targets.slice().sort(byName)
  if (targets.length === 0) return none(w, 'Aucune entreprise pour ces filtres.')
  const owner = memberNames(data)
  const tagLabel = new Map(data.tags.map((t) => [t.id, t.label]))
  const meetingsOf = new Map<string, MeetingRec[]>()
  for (const m of data.meetings)
    meetingsOf.set(m.targetId, [...(meetingsOf.get(m.targetId) ?? []), m])
  w.table({
    columns: [
      { label: 'Entreprise', weight: 3.2 },
      { label: 'Stand', weight: 0.9 },
      { label: 'Prio', weight: 0.6 },
      { label: 'Commerciaux', weight: 2 },
      { label: 'Tags', weight: 1.6 },
      { label: 'Statut', weight: 1.3 },
      { label: 'Int.', weight: 0.6, align: 'right' },
    ],
    rows: targets.map((t) => {
      const ms = (meetingsOf.get(t.id) ?? [])
        .slice()
        .sort((a, b) => (a.plannedAt ?? '').localeCompare(b.plannedAt ?? ''))
      const interests = ms.map((m) => m.interest).filter((i): i is number => i !== null)
      return [
        t.name,
        t.stand ?? '',
        t.priority ?? '–',
        t.assigneeIds.map(owner).join(', '),
        t.tagIds
          .map((id) => tagLabel.get(id) ?? '')
          .filter(Boolean)
          .join(', '),
        ms.length ? statusLabel(ms.at(-1)!.status) : '',
        interests.length ? String(Math.max(...interests)) : '',
      ]
    }),
    fills: targets.map((t) =>
      t.priority ? { 0: PRIORITY_COLORS[t.priority], 2: PRIORITY_COLORS[t.priority] } : undefined,
    ),
  })
}

function rencontres(w: PdfWriter, data: ExportData) {
  w.heading('Rencontres', { toc: true, newPage: true })
  if (data.meetings.length === 0) return none(w, 'Aucune rencontre pour ces filtres.')
  const owner = memberNames(data)
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const ms = data.meetings
    .slice()
    .sort((a, b) => (a.plannedAt ?? '9999').localeCompare(b.plannedAt ?? '9999'))
  w.table({
    columns: [
      { label: 'Date', weight: 1.6 },
      { label: 'Entreprise', weight: 2.4 },
      { label: 'Commercial', weight: 1.6 },
      { label: 'Statut', weight: 1.2 },
      { label: 'Int.', weight: 0.6, align: 'right' },
      { label: 'Prochaine étape', weight: 2.8 },
    ],
    rows: ms.map((m) => [
      formatDateTime(m.plannedAt, data.event.timezone),
      targetById.get(m.targetId)?.name ?? '',
      owner(m.ownerId),
      statusLabel(m.status),
      m.interest === null ? '' : String(m.interest),
      m.nextStep ?? '',
    ]),
  })
}

function notes(w: PdfWriter, data: ExportData) {
  w.heading('Notes', { toc: true, newPage: true })
  if (data.notes.length === 0) return none(w, 'Aucune note pour ces filtres.')
  const owner = memberNames(data)
  const meetingTarget = new Map(data.meetings.map((m) => [m.id, m.targetId]))
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const groups = new Map<string, typeof data.notes>()
  for (const n of data.notes) {
    const tid = (n.meetingId ? meetingTarget.get(n.meetingId) : n.targetId) ?? ''
    groups.set(tid, [...(groups.get(tid) ?? []), n])
  }
  const ordered = [...groups.entries()]
    .map(([tid, list]) => ({ t: targetById.get(tid), list }))
    .sort((a, b) => collator.compare(a.t?.name ?? '', b.t?.name ?? ''))
  for (const { t, list } of ordered) {
    w.ensure(60)
    w.heading(
      [t?.name ?? 'Sans entreprise', t?.stand && `stand ${t.stand}`].filter(Boolean).join(' · '),
      { level: 2 },
    )
    w.skip(2)
    for (const n of list.slice().sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
      w.ensure(36)
      w.text(
        `${formatDateTime(n.capturedAt, data.event.timezone)} · ${owner(n.authorId)}${SOURCE_LABEL[n.source] && n.source !== 'typed' ? ` · ${SOURCE_LABEL[n.source]}` : ''}`,
        {
          size: 8,
          color: COLORS.muted,
          gap: 1,
        },
      )
      w.text(n.body, { size: 9.5, x: MARGIN + 8, gap: 7 })
    }
    w.skip(4)
  }
}

async function report(data: ExportData, title: string, subtitle?: string): Promise<Uint8Array> {
  const w = await newDocument(data, title)
  await cover(w, data, title, subtitle)
  synthese(w, data)
  entreprises(w, data)
  rencontres(w, data)
  notes(w, data)
  return w.finish({ toc: true })
}

/** PDF global du salon : page de garde, sommaire, synthèse, entreprises, rencontres, notes. */
export function buildEventReportPdf(data: ExportData): Promise<Uint8Array> {
  return report(data, 'Compte-rendu du salon')
}

export type RepPdf = { userId: string; name: string; filename: string; bytes: Uint8Array }

/** Un PDF par commercial (ses entreprises et ses rencontres). Les commerciaux sans activité sont ignorés. */
export async function buildRepReportPdfs(data: ExportData): Promise<RepPdf[]> {
  const base = `fair-${slug(data.event.name)}`
  const out: RepPdf[] = []
  const owner = memberNames(data)
  const users = new Set<string>([
    ...data.meetings.map((m) => m.ownerId),
    ...data.targets.flatMap((t) => t.assigneeIds),
  ])
  for (const userId of [...users].sort((a, b) => collator.compare(owner(a), owner(b)))) {
    const mine = applyFilters(data, { ...NO_FILTERS, assigneeIds: [userId] })
    if (mine.targets.length === 0) continue
    const name = owner(userId)
    out.push({
      userId,
      name,
      filename: `${base}-${slug(name)}.pdf`,
      bytes: await report(mine, 'Compte-rendu commercial', `Commercial : ${name}`),
    })
  }
  return out
}

function kv(w: PdfWriter, label: string, value: string | null | undefined) {
  if (!value || !value.trim()) return
  w.ensure(16)
  const top = w.y
  w.text(label, { size: 9, bold: true, color: COLORS.muted, width: 110, gap: 0, maxLines: 1 })
  const after = w.y
  w.y = top
  w.text(value, { size: 10, x: MARGIN + 120, gap: 5 })
  w.y = Math.min(after, w.y)
}

/** Une fiche par rencontre (une page chacune) : entreprise, contact, déroulé, champs structurés, notes. */
export async function buildMeetingSheetsPdf(data: ExportData): Promise<Uint8Array> {
  const w = await newDocument(data, 'Fiches de rencontre')
  const owner = memberNames(data)
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const contactById = new Map(data.contacts.map((c) => [c.id, c]))
  const notesOf = new Map<string, typeof data.notes>()
  for (const n of data.notes)
    if (n.meetingId) notesOf.set(n.meetingId, [...(notesOf.get(n.meetingId) ?? []), n])
  const meetings = data.meetings
    .filter((m) => targetById.has(m.targetId))
    .sort(
      (a, b) =>
        (a.plannedAt ?? '9999').localeCompare(b.plannedAt ?? '9999') ||
        collator.compare(targetById.get(a.targetId)!.name, targetById.get(b.targetId)!.name),
    )

  if (meetings.length === 0) {
    w.text('Fiches de rencontre', { size: 20, bold: true, color: COLORS.brand })
    none(w, 'Aucune rencontre pour ces filtres.')
    return w.finish()
  }

  let first = true
  for (const m of meetings) {
    if (!first) w.newPage()
    first = false
    const t = targetById.get(m.targetId)!
    const top = w.y
    const logo = await w.image(data.team.logo, PAGE_W - MARGIN - 90, top, 90, 36)
    w.text('Fiche de rencontre', { size: 9, color: COLORS.muted, gap: 2 })
    w.text(data.event.name, { size: 9, color: COLORS.muted, gap: 8 })
    w.y = Math.min(w.y, top - (logo?.h ?? 0) - 6)
    w.text(t.name, { size: 22, bold: true, color: COLORS.brand, gap: 4 })
    if (t.priority) {
      w.rect(MARGIN, w.y + 2, 4, 14, PRIORITY_COLORS[t.priority])
      w.text(
        `${priorityLabel(t.priority)}${t.goal ? ` · objectif : ${GOAL_LABEL[t.goal] ?? t.goal}` : ''}`,
        { size: 10, x: MARGIN + 10, gap: 3 },
      )
    }
    w.text(
      [t.stand && `Stand ${t.stand}`, t.industry, [t.city, t.country].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · '),
      { color: COLORS.muted, gap: 14 },
    )

    w.heading('Rencontre', { level: 2 })
    w.skip(4)
    kv(
      w,
      'Date',
      formatDateTime(m.plannedAt, data.event.timezone) +
        (m.durationMin ? ` (${m.durationMin} min)` : ''),
    )
    kv(w, 'Commercial', owner(m.ownerId))
    kv(w, 'Statut', statusLabel(m.status) + (m.unplanned ? ' (imprévue)' : ''))
    kv(w, 'Intérêt', m.interest === null ? '' : `${m.interest} / 5`)

    const c = m.contactId ? contactById.get(m.contactId) : undefined
    if (c) {
      w.skip(6)
      w.heading('Contact', { level: 2 })
      w.skip(4)
      kv(w, 'Nom', [c.firstName, c.lastName].filter(Boolean).join(' '))
      kv(w, 'Fonction', c.jobTitle)
      kv(w, 'E-mail', c.email)
      kv(w, 'Téléphone', c.phone)
    }

    const structured: [string, string | null][] = [
      ['Besoin', m.need],
      ['Budget', m.budget],
      ['Timing', m.timing],
      ['Décideur', m.decisionMaker],
      ['Issue', m.outcome],
      ['Prochaine étape', m.nextStep],
    ]
    if (structured.some(([, v]) => v && v.trim())) {
      w.skip(6)
      w.heading('Qualification', { level: 2 })
      w.skip(4)
      for (const [label, v] of structured) kv(w, label, v)
    }

    const list = (notesOf.get(m.id) ?? [])
      .slice()
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    w.skip(6)
    w.heading('Notes', { level: 2 })
    w.skip(4)
    if (list.length === 0) none(w, 'Aucune note.')
    for (const n of list) {
      w.ensure(36)
      w.text(`${formatDateTime(n.capturedAt, data.event.timezone)} · ${owner(n.authorId)}`, {
        size: 8,
        color: COLORS.muted,
        gap: 1,
      })
      w.text(n.body, { size: 10, x: MARGIN + 8, gap: 7 })
    }
  }
  return w.finish()
}
