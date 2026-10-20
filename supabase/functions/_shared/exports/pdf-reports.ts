import { computeBilan } from './bilan.ts'
import { formatDate, formatDateTime, formatEventDates, percent } from './format.ts'
import { SOURCE_LABEL, interestLabel, priorityLabel, statusLabel } from './labels.ts'
import { COLORS, MARGIN, PAGE_H, PRIORITY_COLORS, PdfWriter } from './pdf-writer.ts'
import { memberNames, showsNews } from './select.ts'
import type { ExportData, MeetingRec, TargetRec } from './types.ts'

// PDF de compte-rendu du salon : page de garde, sommaire, synthèse, entreprises, rencontres, notes.

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
      s.avgInterest === null ? '—' : interestLabel(s.avgInterest),
    ]),
  })
}

function entreprises(w: PdfWriter, data: ExportData) {
  w.heading('Entreprises', { toc: true, newPage: true })
  const targets = data.targets.slice().sort(byName)
  if (targets.length === 0) return none(w, 'Aucune entreprise.')
  const owner = memberNames(data)
  const news = showsNews(data)
  const tagLabel = new Map(data.tags.map((t) => [t.id, t.label]))
  const meetingsOf = new Map<string, MeetingRec[]>()
  for (const m of data.meetings)
    meetingsOf.set(m.targetId, [...(meetingsOf.get(m.targetId) ?? []), m])
  w.table({
    columns: [
      { label: 'Entreprise', weight: 2.8 },
      { label: 'Stand', weight: 0.9 },
      { label: 'Prio', weight: 0.6 },
      { label: 'Commerciaux', weight: 2 },
      { label: 'Tags', weight: 1.6 },
      { label: 'Statut', weight: 1.3 },
      { label: 'Intérêt', weight: 1, align: 'right' },
      { label: 'Recontacter', weight: 1.3 },
      ...(news ? [{ label: 'Actualité', weight: 1.1 }] : []),
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
        interests.length ? interestLabel(Math.max(...interests)) : '',
        ms.some((m) => m.recontact) ? 'Oui' : '',
        ...(news ? [ms.some((m) => m.news) ? 'Oui' : ''] : []),
      ]
    }),
    fills: targets.map((t) =>
      t.priority ? { 0: PRIORITY_COLORS[t.priority], 2: PRIORITY_COLORS[t.priority] } : undefined,
    ),
  })
}

function rencontres(w: PdfWriter, data: ExportData) {
  w.heading('Rencontres', { toc: true, newPage: true })
  if (data.meetings.length === 0) return none(w, 'Aucune rencontre.')
  const owner = memberNames(data)
  const targetById = new Map(data.targets.map((t) => [t.id, t]))
  const ms = data.meetings
    .slice()
    .sort((a, b) => (a.plannedAt ?? '9999').localeCompare(b.plannedAt ?? '9999'))
  w.table({
    columns: [
      { label: 'Date', weight: 2 },
      { label: 'Entreprise', weight: 3 },
      { label: 'Commercial', weight: 2 },
      { label: 'Statut', weight: 1.5 },
      { label: 'Intérêt', weight: 0.9, align: 'right' },
      { label: 'Recontacter', weight: 1.3 },
      ...(showsNews(data) ? [{ label: 'Actualité', weight: 1.1 }] : []),
    ],
    rows: ms.map((m) => [
      formatDateTime(m.plannedAt, data.event.timezone),
      targetById.get(m.targetId)?.name ?? '',
      owner(m.ownerId),
      statusLabel(m.status),
      m.interest === null ? '' : interestLabel(m.interest),
      m.recontact ? 'Oui' : '',
      ...(showsNews(data) ? [m.news ? 'Oui' : ''] : []),
    ]),
  })
}

function notes(w: PdfWriter, data: ExportData) {
  w.heading('Notes', { toc: true, newPage: true })
  if (data.notes.length === 0) return none(w, 'Aucune note.')
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
