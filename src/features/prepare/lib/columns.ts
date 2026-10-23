// Colonnes du tableau des participants (bureau) : lesquelles sont visibles, et leur largeur. Calculs purs (testés) ;
// la mémorisation (par appareil) est dans `use-column-prefs.ts`.

export const COLUMN_KEYS = [
  'priority',
  'company',
  'stand',
  'tags',
  'shows',
  'assignees',
  'meeting',
] as const
export type ColumnKey = (typeof COLUMN_KEYS)[number]

/** Largeur d'origine d'une colonne : fixe (rem), ou souple (minimum en rem, part de l'espace restant en fr). */
type Track = { kind: 'fixed'; rem: number } | { kind: 'flex'; min: number; fr: number }

export const COLUMN_TRACKS: Record<ColumnKey, Track> = {
  priority: { kind: 'fixed', rem: 3 },
  company: { kind: 'flex', min: 12, fr: 2.4 },
  stand: { kind: 'fixed', rem: 4.5 },
  tags: { kind: 'flex', min: 7, fr: 1.4 },
  shows: { kind: 'flex', min: 9, fr: 1.8 },
  assignees: { kind: 'flex', min: 6, fr: 1 },
  meeting: { kind: 'fixed', rem: 8 },
}

/** « Entreprise » reste toujours affichée : sans elle, une ligne ne dirait plus de qui elle parle. */
export const ALWAYS_VISIBLE: readonly ColumnKey[] = ['company']

export const SCALE_MIN = 50
export const SCALE_MAX = 250
export const SCALE_STEP = 10
export const SCALE_DEFAULT = 100

/** Réglage de l'utilisateur : colonnes masquées, et largeur en % de la largeur d'origine (absent = 100 %). */
export type ColumnPrefs = { hidden: ColumnKey[]; scale: Partial<Record<ColumnKey, number>> }
export const DEFAULT_PREFS: ColumnPrefs = { hidden: [], scale: {} }

const isKey = (v: unknown): v is ColumnKey => (COLUMN_KEYS as readonly unknown[]).includes(v)

export const clampScale = (v: number): number =>
  Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v / SCALE_STEP) * SCALE_STEP))

/** Un réglage lu du stockage (peut être ancien, incomplet ou altéré) → un réglage valide. */
export function normalizePrefs(raw: unknown): ColumnPrefs {
  const out: ColumnPrefs = { hidden: [], scale: {} }
  if (!raw || typeof raw !== 'object') return out
  const { hidden, scale } = raw as { hidden?: unknown; scale?: unknown }
  if (Array.isArray(hidden))
    out.hidden = [...new Set(hidden.filter(isKey))].filter((k) => !ALWAYS_VISIBLE.includes(k))
  if (scale && typeof scale === 'object')
    for (const [key, value] of Object.entries(scale))
      if (
        isKey(key) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value !== SCALE_DEFAULT
      )
        out.scale[key] = clampScale(value)
  return out
}

export const isDefaultPrefs = (p: ColumnPrefs): boolean =>
  p.hidden.length === 0 && Object.keys(p.scale).length === 0

export const visibleColumns = (p: ColumnPrefs): ColumnKey[] =>
  COLUMN_KEYS.filter((k) => !p.hidden.includes(k))

export const scaleOf = (p: ColumnPrefs, key: ColumnKey): number => p.scale[key] ?? SCALE_DEFAULT

const rem = (n: number) => `${Math.round(n * 1000) / 1000}rem`
const fr = (n: number) => `${Math.round(n * 1000) / 1000}fr`

function trackOf(key: ColumnKey, p: ColumnPrefs): string {
  const f = scaleOf(p, key) / 100
  const t = COLUMN_TRACKS[key]
  return t.kind === 'fixed' ? rem(t.rem * f) : `minmax(${rem(t.min * f)},${fr(t.fr * f)})`
}

/** `grid-template-columns` du tableau : la case de sélection, puis les colonnes visibles. */
export const gridTemplate = (p: ColumnPrefs): string =>
  ['2.75rem', ...visibleColumns(p).map((k) => trackOf(k, p))].join(' ')

/**
 * Largeur minimale du tableau. Réglage d'origine : 46 rem, comme avant. Sinon la somme des minimums des colonnes
 * visibles (+ la case de sélection), pour que masquer ou élargir des colonnes ne tasse pas celles qui restent.
 */
export function tableMinWidth(p: ColumnPrefs): string {
  if (isDefaultPrefs(p)) return '46rem'
  const total = visibleColumns(p).reduce((sum, k) => {
    const t = COLUMN_TRACKS[k]
    return sum + (scaleOf(p, k) / 100) * (t.kind === 'fixed' ? t.rem : t.min)
  }, 2.75)
  return rem(total)
}

export function toggleColumn(p: ColumnPrefs, key: ColumnKey, visible: boolean): ColumnPrefs {
  if (ALWAYS_VISIBLE.includes(key)) return p
  const hidden = visible ? p.hidden.filter((k) => k !== key) : [...new Set([...p.hidden, key])]
  return { ...p, hidden }
}

export function setScale(p: ColumnPrefs, key: ColumnKey, percent: number): ColumnPrefs {
  const value = clampScale(percent)
  const scale = { ...p.scale }
  if (value === SCALE_DEFAULT) delete scale[key]
  else scale[key] = value
  return { ...p, scale }
}
