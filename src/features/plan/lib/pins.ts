import { buildSearchKey, type Priority, type Target } from '@/db/schemas/prepare'
import type { PlanPin } from '@/db/schemas/plan'
import { standKey } from './stand-key'

/** Un pin prêt à être affiché : couleur et lettre selon la priorité de l'entreprise reliée. */
export type PinView = {
  id: string
  x: number
  y: number
  /** Participation reliée ; `null` = numéro de stand seul. */
  targetId: string | null
  /** Nom de l'entreprise, sinon le numéro de stand. */
  name: string
  stand: string
  priority: Priority | null
  /** Détection automatique pas encore validée (OCR, plus tard). */
  suggested: boolean
}

export function buildPinViews(pins: PlanPin[], targets: Target[]): PinView[] {
  const byId = new Map(targets.map((t) => [t.id, t]))
  return pins.map((p) => {
    const target = p.targetId ? byId.get(p.targetId) : undefined
    const stand = p.standLabel ?? target?.stand ?? ''
    return {
      id: p.id,
      x: p.x,
      y: p.y,
      targetId: target ? target.id : null,
      name: target?.name ?? (stand || '?'),
      stand,
      priority: target?.priority ?? null,
      suggested: p.reviewStatus === 'suggested',
    }
  })
}

/** Identifiants des participations déjà placées sur un plan. */
export function placedTargetIds(pins: PlanPin[]): Set<string> {
  return new Set(pins.filter((p) => p.targetId).map((p) => p.targetId!))
}

const RANK = { A: 0, B: 1, C: 2 } as const
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/**
 * Entreprises à proposer pour un nouveau pin : celles dont le numéro de stand correspond à celui saisi d'abord
 * (« B-05 » retrouve « B5 »), puis les non placées avant les déjà placées, par priorité puis par nom.
 */
export function rankTargets(
  rows: Target[],
  opts: { query?: string; standLabel?: string; placed: Set<string> },
): Target[] {
  const terms = buildSearchKey([opts.query ?? ''])
    .split(/\s+/)
    .filter(Boolean)
  const wanted = standKey(opts.standLabel)
  const matchesStand = (r: Target) => wanted !== null && standKey(r.stand) === wanted
  return rows
    .filter((r) => terms.every((w) => r.searchKey.includes(w)))
    .sort(
      (a, b) =>
        Number(matchesStand(b)) - Number(matchesStand(a)) ||
        Number(opts.placed.has(a.id)) - Number(opts.placed.has(b.id)) ||
        (a.priority ? RANK[a.priority] : 3) - (b.priority ? RANK[b.priority] : 3) ||
        collator.compare(a.name, b.name),
    )
}
