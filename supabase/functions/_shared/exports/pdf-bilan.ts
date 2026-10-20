import { computeBilan, type Bilan } from './bilan.ts'
import { formatDate, formatEventDates, percent } from './format.ts'
import { interestLabel, priorityLabel, statusLabel } from './labels.ts'
import { COLORS, CONTENT_W, MARGIN, PAGE_W, PRIORITY_COLORS, PdfWriter } from './pdf-writer.ts'
import type { ExportData } from './types.ts'

// Bilan du salon en UNE page : indicateurs, statuts, priorités, commerciaux, top opportunités, actions en attente.

type Limits = { reps: number; opportunities: number; actions: number }

/** Essais successifs, du plus détaillé au plus compact, jusqu'à ce que tout tienne sur une page. */
const ATTEMPTS: Limits[] = [
  { reps: 8, opportunities: 6, actions: 6 },
  { reps: 6, opportunities: 5, actions: 5 },
  { reps: 4, opportunities: 4, actions: 4 },
  { reps: 3, opportunities: 3, actions: 3 },
  { reps: 2, opportunities: 2, actions: 2 },
  { reps: 1, opportunities: 1, actions: 1 },
  { reps: 0, opportunities: 0, actions: 0 },
]

async function draw(
  data: ExportData,
  b: Bilan,
  limits: Limits,
): Promise<{ bytes: Uint8Array; pages: number }> {
  const w = await PdfWriter.create({
    title: `Bilan — ${data.event.name}`,
    footerCenter: `${data.team.name} · ${data.event.name}`,
    generatedAt: data.generatedAt,
  })

  // En-tête
  const top = w.y
  const logo = await w.image(data.team.logo, PAGE_W - MARGIN - 110, top, 110, 40)
  w.text('Bilan du salon', { size: 22, bold: true, color: COLORS.brand, gap: 2 })
  w.text(data.event.name, { size: 13, bold: true, gap: 2 })
  const where = [formatEventDates(data.event.startsOn, data.event.endsOn), data.event.city]
    .filter(Boolean)
    .join(' · ')
  w.text(
    `${where}${where ? ' · ' : ''}généré le ${formatDate(data.generatedAt, data.event.timezone)}`,
    { size: 9, color: COLORS.muted, gap: 8 },
  )
  w.y = Math.min(w.y, top - (logo?.h ?? 0) - 6)

  // Indicateurs
  const kpis = [
    { value: `${b.targetsMet} / ${b.targets}`, label: 'entreprises rencontrées' },
    {
      value: `${b.meetings.held} / ${b.meetings.planned}`,
      label:
        b.meetings.rate === null
          ? 'rencontres réalisées'
          : `rencontres réalisées (${b.meetings.rate} %)`,
    },
    { value: String(b.meetings.missed), label: 'manquées ou écartées' },
    { value: String(b.meetings.unplanned), label: 'rencontres imprévues' },
  ]
  const gap = 8
  const bw = (CONTENT_W - gap * 3) / 4
  const boxTop = w.y
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (bw + gap)
    w.rect(x, boxTop, bw, 50, COLORS.band)
    w.rect(x, boxTop, 3, 50, COLORS.brand)
    w.page.drawText(w.clean(k.value, w.bold), {
      x: x + 10,
      y: boxTop - 24,
      size: 18,
      font: w.bold,
      color: COLORS.ink,
    })
    const lines = w.wrap(k.label, 8, bw - 14)
    lines.slice(0, 2).forEach((l, j) =>
      w.page.drawText(w.clean(l), {
        x: x + 10,
        y: boxTop - 36 - j * 9.5,
        size: 8,
        font: w.regular,
        color: COLORS.muted,
      }),
    )
  })
  w.y = boxTop - 50 - 12

  // Statuts (une ligne) et priorités
  w.heading('Répartition par statut', { level: 2 })
  w.skip(2)
  w.text(b.byStatus.map((s) => `${statusLabel(s.status)} ${s.count}`).join('  ·  '), {
    size: 9,
    gap: 8,
  })

  w.heading('Par priorité', { level: 2 })
  w.skip(3)
  w.table({
    columns: [
      { label: 'Priorité', weight: 2 },
      { label: 'Entreprises', weight: 1.3, align: 'right' },
      { label: 'Rencontrées', weight: 1.3, align: 'right' },
      { label: 'Taux', weight: 1, align: 'right' },
      { label: 'Rencontres réalisées', weight: 1.8, align: 'right' },
    ],
    rows: b.byPriority.map((p) => [
      priorityLabel(p.priority === 'none' ? null : p.priority),
      String(p.targets),
      String(p.met),
      percent(p.met, p.targets),
      `${p.held} / ${p.meetings}`,
    ]),
    fills: b.byPriority.map((p) =>
      p.priority === 'none' ? undefined : { 0: PRIORITY_COLORS[p.priority] },
    ),
    size: 8,
  })

  const more = (n: number) => (n > 0 ? [`+ ${n} autre${n > 1 ? 's' : ''}`] : [])

  // Commerciaux
  w.heading('Par commercial', { level: 2 })
  w.skip(3)
  if (b.bySalesperson.length === 0 || limits.reps === 0) {
    w.text(
      b.bySalesperson.length === 0 ? 'Aucun commercial.' : `${b.bySalesperson.length} commerciaux.`,
      { size: 9, color: COLORS.muted },
    )
  } else {
    const shown = b.bySalesperson.slice(0, limits.reps)
    w.table({
      columns: [
        { label: 'Commercial', weight: 2.6 },
        { label: 'Entreprises', weight: 1.2, align: 'right' },
        { label: 'Prévues', weight: 1, align: 'right' },
        { label: 'Réalisées', weight: 1.1, align: 'right' },
        { label: 'Manquées', weight: 1.1, align: 'right' },
        { label: 'Intérêt moy.', weight: 1.3, align: 'right' },
      ],
      rows: [
        ...shown.map((s) => [
          s.name,
          String(s.targets),
          String(s.planned),
          String(s.held),
          String(s.missed),
          s.avgInterest === null ? '—' : interestLabel(s.avgInterest),
        ]),
        ...more(b.bySalesperson.length - shown.length).map((t) => [t, '', '', '', '', '']),
      ],
      size: 8,
    })
  }

  // Top opportunités
  w.heading('Top opportunités', { level: 2 })
  w.skip(3)
  if (b.topOpportunities.length === 0 || limits.opportunities === 0) {
    w.text(
      b.topOpportunities.length === 0
        ? 'Aucune opportunité qualifiée (renseignez l’intérêt des rencontres).'
        : `${b.topOpportunities.length} opportunités.`,
      { size: 9, color: COLORS.muted, gap: 8 },
    )
  } else {
    const shown = b.topOpportunities.slice(0, limits.opportunities)
    w.table({
      columns: [
        { label: 'Entreprise', weight: 2.8 },
        { label: 'Prio', weight: 0.6 },
        { label: 'Intérêt', weight: 0.9, align: 'right' },
        { label: 'Commercial', weight: 1.7 },
        { label: 'Prochaine étape', weight: 3 },
      ],
      rows: shown.map((o) => [
        o.company,
        o.priority ?? '–',
        interestLabel(o.interest),
        o.owner,
        o.nextStep ?? '',
      ]),
      fills: shown.map((o) => (o.priority ? { 1: PRIORITY_COLORS[o.priority] } : undefined)),
      size: 8,
      maxLines: 2,
    })
  }

  // Actions de suivi en attente
  w.heading(`Actions de suivi en attente (${b.pendingActions.length})`, { level: 2 })
  w.skip(3)
  if (b.pendingActions.length === 0 || limits.actions === 0) {
    w.text(
      b.pendingActions.length === 0
        ? 'Aucune action en attente.'
        : `${b.pendingActions.length} actions en attente.`,
      { size: 9, color: COLORS.muted },
    )
  } else {
    const shown = b.pendingActions.slice(0, limits.actions)
    w.table({
      columns: [
        { label: 'Entreprise', weight: 2.8 },
        { label: 'Commercial', weight: 1.7 },
        { label: 'Échéance', weight: 1.2 },
        { label: 'À faire', weight: 3.2 },
      ],
      rows: [
        ...shown.map((a) => [
          a.company,
          a.owner,
          a.dueOn ? formatDate(a.dueOn) : '',
          a.action ?? '',
        ]),
        ...more(b.pendingActions.length - shown.length).map((t) => [t, '', '', '']),
      ],
      size: 8,
      maxLines: 2,
    })
  }

  return { bytes: await w.finish(), pages: w.doc.getPageCount() }
}

/** Bilan du salon : un PDF d'une seule page (les listes longues sont tronquées avec « + n autres »). */
export async function buildBilanPdf(data: ExportData): Promise<Uint8Array> {
  const bilan = computeBilan(data)
  let last: Uint8Array | null = null
  for (const limits of ATTEMPTS) {
    const r = await draw(data, bilan, limits)
    last = r.bytes
    if (r.pages === 1) return r.bytes
  }
  return last!
}
