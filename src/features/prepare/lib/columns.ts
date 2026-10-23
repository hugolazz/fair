// Colonnes du tableau des participants (bureau) : lesquelles sont visibles, dans quel ordre, et leur largeur (réglée à la
// souris, comme dans un tableur). Calculs purs (testés) ; la mémorisation (par appareil) est dans `use-column-prefs.ts`.

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

/** Largeur d'une colonne réglée à la souris : entre ces bornes (en pixels). */
export const WIDTH_MIN = 48
export const WIDTH_MAX = 900
/** Pas des flèches du clavier sur la poignée de largeur. */
export const WIDTH_STEP = 16
/** Largeur de la case de sélection (en pixels), à gauche du tableau. */
export const SELECT_WIDTH = 44

/**
 * Réglage de l'utilisateur : colonnes masquées, ordre des colonnes, et largeur (en pixels) des seules colonnes que
 * l'utilisateur a élargies ou rétrécies ; les autres gardent leur largeur d'origine, qui s'adapte à la page.
 */
export type ColumnPrefs = {
  hidden: ColumnKey[]
  order: ColumnKey[]
  widths: Partial<Record<ColumnKey, number>>
}
export const DEFAULT_PREFS: ColumnPrefs = { hidden: [], order: [...COLUMN_KEYS], widths: {} }

const isKey = (v: unknown): v is ColumnKey => (COLUMN_KEYS as readonly unknown[]).includes(v)

export const clampWidth = (px: number): number =>
  Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(px)))

/** Un ordre lu du stockage (partiel, doublons, clés inconnues) → un ordre complet et sans doublon. */
function normalizeOrder(raw: unknown): ColumnKey[] {
  const seen = Array.isArray(raw) ? [...new Set(raw.filter(isKey))] : []
  return [...seen, ...COLUMN_KEYS.filter((k) => !seen.includes(k))]
}

/** Un réglage lu du stockage (peut être ancien, incomplet ou altéré) → un réglage valide. */
export function normalizePrefs(raw: unknown): ColumnPrefs {
  const out: ColumnPrefs = { hidden: [], order: [...COLUMN_KEYS], widths: {} }
  if (!raw || typeof raw !== 'object') return out
  const { hidden, order, widths } = raw as { hidden?: unknown; order?: unknown; widths?: unknown }
  if (Array.isArray(hidden))
    out.hidden = [...new Set(hidden.filter(isKey))].filter((k) => !ALWAYS_VISIBLE.includes(k))
  out.order = normalizeOrder(order)
  if (widths && typeof widths === 'object')
    for (const [key, value] of Object.entries(widths))
      if (isKey(key) && typeof value === 'number' && Number.isFinite(value))
        out.widths[key] = clampWidth(value)
  return out
}

export const isDefaultPrefs = (p: ColumnPrefs): boolean =>
  p.hidden.length === 0 &&
  Object.keys(p.widths).length === 0 &&
  p.order.every((k, i) => k === COLUMN_KEYS[i])

/** Colonnes affichées, dans l'ordre choisi. */
export const visibleColumns = (p: ColumnPrefs): ColumnKey[] =>
  p.order.filter((k) => !p.hidden.includes(k))

const rem = (n: number) => `${Math.round(n * 1000) / 1000}rem`
const fr = (n: number) => `${Math.round(n * 1000) / 1000}fr`

function trackOf(key: ColumnKey, p: ColumnPrefs): string {
  const width = p.widths[key]
  if (width !== undefined) return `${width}px`
  const t = COLUMN_TRACKS[key]
  return t.kind === 'fixed' ? rem(t.rem) : `minmax(${rem(t.min)},${fr(t.fr)})`
}

/** `grid-template-columns` du tableau : la case de sélection, puis les colonnes visibles dans l'ordre choisi. */
export const gridTemplate = (p: ColumnPrefs): string =>
  [`${SELECT_WIDTH}px`, ...visibleColumns(p).map((k) => trackOf(k, p))].join(' ')

/** Plus petite largeur qu'une colonne peut prendre sans réglage : son minimum d'origine (en pixels). */
export function minWidthOf(key: ColumnKey): number {
  const t = COLUMN_TRACKS[key]
  return Math.round((t.kind === 'fixed' ? t.rem : t.min) * 16)
}

/**
 * Largeur minimale du tableau. Réglage d'origine : 46 rem, comme avant. Sinon la somme des largeurs réglées ou des
 * minimums des colonnes visibles (+ la case de sélection), pour que masquer ou élargir ne tasse pas celles qui restent.
 */
export function tableMinWidth(p: ColumnPrefs): string {
  if (isDefaultPrefs(p)) return '46rem'
  const px = visibleColumns(p).reduce(
    (sum, k) => sum + (p.widths[k] ?? minWidthOf(k)),
    SELECT_WIDTH,
  )
  return rem(px / 16)
}

export function toggleColumn(p: ColumnPrefs, key: ColumnKey, visible: boolean): ColumnPrefs {
  if (ALWAYS_VISIBLE.includes(key)) return p
  const hidden = visible ? p.hidden.filter((k) => k !== key) : [...new Set([...p.hidden, key])]
  return { ...p, hidden }
}

/** Fixe la largeur d'une colonne (en pixels) ; `null` lui rend sa largeur d'origine. */
export function setWidth(p: ColumnPrefs, key: ColumnKey, px: number | null): ColumnPrefs {
  const widths = { ...p.widths }
  if (px === null) delete widths[key]
  else widths[key] = clampWidth(px)
  return { ...p, widths }
}

/** Place `key` juste avant `before` (ou en dernier si `before` est `null`), parmi toutes les colonnes. */
export function moveColumn(p: ColumnPrefs, key: ColumnKey, before: ColumnKey | null): ColumnPrefs {
  if (key === before) return p
  const rest = p.order.filter((k) => k !== key)
  const at = before === null ? rest.length : rest.indexOf(before)
  if (at < 0) return p
  const order = [...rest.slice(0, at), key, ...rest.slice(at)]
  return order.every((k, i) => k === p.order[i]) ? p : { ...p, order }
}

/** Décale une colonne d'un cran vers la gauche (-1) ou la droite (+1), parmi toutes les colonnes. */
export function shiftColumn(p: ColumnPrefs, key: ColumnKey, direction: -1 | 1): ColumnPrefs {
  const i = p.order.indexOf(key)
  const j = i + direction
  if (i < 0 || j < 0 || j >= p.order.length) return p
  const order = [...p.order]
  ;[order[i], order[j]] = [order[j]!, order[i]!]
  return { ...p, order }
}

/**
 * Où déposer une colonne glissée à l'abscisse `x` : la colonne avant laquelle l'insérer (`null` = à la fin), d'après les
 * bords de chaque colonne visible (`rects`, dans l'ordre affiché).
 */
export function dropTarget(
  rects: readonly { key: ColumnKey; left: number; width: number }[],
  x: number,
): ColumnKey | null {
  for (const r of rects) if (x < r.left + r.width / 2) return r.key
  return null
}
