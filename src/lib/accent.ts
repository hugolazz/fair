// Couleur d'accentuation : le vert de la charte par défaut, ou la couleur choisie par l'équipe. Elle ne change que sept
// variables (`--color-brand-*`, définies dans src/index.css) ; tout le reste de l'appli les suit. La couleur choisie est
// gardée exacte ; le texte posé dessus et la teinte « texte » sont calculés pour rester lisibles (WCAG AA).

export type Rgb = readonly [number, number, number]

const MIN_CONTRAST = 4.5
const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

export const ACCENT_STORAGE_KEY = 'fair-accent'
const HEX = /^#[0-9a-f]{6}$/i

/** Le vert d'origine, dont `theme-color` (barre du navigateur) suit la couleur d'accentuation. */
export const DEFAULT_ACCENT = '#0f766e'

/** Couleurs proposées (le vert, par défaut, est une absence de réglage). */
export const ACCENT_PRESETS = [
  { id: 'blue', hex: '#1d4ed8' },
  { id: 'violet', hex: '#6d28d9' },
  { id: 'pink', hex: '#be185d' },
  { id: 'orange', hex: '#c2410c' },
  { id: 'slate', hex: '#475569' },
] as const

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value)

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Arrondit au pixel : les contrastes se calculent sur la couleur réellement affichée. */
const snap = ([r, g, b]: Rgb): Rgb => [Math.round(r), Math.round(g), Math.round(b)]

export const rgbToHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Mélange `a` avec `b` : `amount` = part de `b` (0 à 1). */
export const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  a[0] + (b[0] - a[0]) * amount,
  a[1] + (b[1] - a[1]) * amount,
  a[2] + (b[2] - a[2]) * amount,
]

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export type AccentPalette = Record<'50' | '100' | '600' | '700' | '900' | 'on' | 'text', string>

/** Encre posée sur une couleur d'accentuation claire (le plus foncé de la charte). */
const INK: Rgb = [19, 26, 24]
const PAGE: Rgb = [250, 249, 246]

/**
 * Les teintes d'une couleur d'accentuation. La couleur choisie (600) est gardée **telle quelle** : elle sert de fond.
 * Seul le texte posé dessus s'adapte (`on` : blanc, ou encre si elle est claire), ainsi que la teinte `text` (texte,
 * soulignements, contours de focus sur fond clair), foncée jusqu'à 4,5:1. Seule une couleur de luminosité moyenne, où ni
 * le blanc ni l'encre ne se lisent, est légèrement ajustée.
 */
export function buildAccentPalette(hex: string): AccentPalette {
  let fill = hexToRgb(hex)
  const onFor = (c: Rgb): Rgb => (contrast(c, WHITE) >= contrast(c, INK) ? WHITE : INK)
  for (let i = 0; i < 60 && contrast(fill, onFor(fill)) < MIN_CONTRAST; i++) {
    fill = snap(mix(fill, onFor(fill) === WHITE ? BLACK : WHITE, 0.02))
  }
  const tint50 = snap(mix(fill, WHITE, 0.88))
  let text = fill
  for (
    let i = 0;
    i < 60 &&
    Math.min(contrast(text, WHITE), contrast(text, tint50), contrast(text, PAGE)) < MIN_CONTRAST;
    i++
  ) {
    text = snap(mix(text, BLACK, 0.04))
  }
  return {
    '50': rgbToHex(tint50),
    '100': rgbToHex(mix(fill, WHITE, 0.83)),
    '600': rgbToHex(fill),
    '700': rgbToHex(mix(text, BLACK, 0.25)),
    '900': rgbToHex(mix(text, BLACK, 0.5)),
    on: rgbToHex(onFor(fill)),
    text: rgbToHex(text),
  }
}

// --- Appliquer et mémoriser (cet appareil) ------------------------------------------------------------------------

const TOKENS = ['50', '100', '600', '700', '900', 'on', 'text'] as const

/** Applique la couleur à la page ; `null` rend le vert d'origine (les valeurs de index.css reprennent la main). */
export function applyAccent(hex: string | null): void {
  const root = document.documentElement
  const palette = hex && isHexColor(hex) ? buildAccentPalette(hex) : null
  for (const token of TOKENS) {
    if (palette) root.style.setProperty(`--color-brand-${token}`, palette[token])
    else root.style.removeProperty(`--color-brand-${token}`)
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', palette ? palette['600'] : DEFAULT_ACCENT)
}

export function loadAccent(): string | null {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY)
    return isHexColor(stored) ? stored.toLowerCase() : null
  } catch {
    return null // stockage indisponible (navigation privée…) : le vert d'origine
  }
}

/** Mémorise et applique ; `null` revient au vert d'origine. */
export function saveAccent(hex: string | null): void {
  try {
    if (hex) localStorage.setItem(ACCENT_STORAGE_KEY, hex.toLowerCase())
    else localStorage.removeItem(ACCENT_STORAGE_KEY)
  } catch {
    // Non mémorisé : la couleur ne vaut que pour cette session.
  }
  applyAccent(hex)
}
