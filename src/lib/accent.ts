// Couleur d'accentuation : le vert de la charte par défaut, ou une couleur choisie dans Réglages → Apparence. Elle ne
// change que cinq teintes (`--color-brand-*`, définies dans src/index.css) ; tout le reste de l'appli les suit.
// Les teintes d'une couleur choisie sont calculées pour rester lisibles (WCAG AA) : on fonce la couleur jusqu'à ce que
// du texte blanc dessus, et elle-même sur sa teinte claire, atteignent 4,5:1.

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

export type AccentPalette = Record<'50' | '100' | '600' | '700' | '900', string>

/** Les cinq teintes d'une couleur d'accentuation, lisibles : texte blanc sur la 600, la 600 sur la 50 et sur le fond. */
export function buildAccentPalette(hex: string): AccentPalette {
  let base = hexToRgb(hex)
  const tint50 = (c: Rgb) => mix(c, WHITE, 0.88)
  // Le fond de page (#faf9f6) est un peu moins clair que le blanc : on vise le plus strict des trois.
  for (
    let i = 0;
    i < 40 &&
    Math.min(contrast(base, WHITE), contrast(base, tint50(base)), contrast(base, [250, 249, 246])) <
      MIN_CONTRAST;
    i++
  ) {
    base = mix(base, BLACK, 0.05)
  }
  return {
    '50': rgbToHex(tint50(base)),
    '100': rgbToHex(mix(base, WHITE, 0.83)),
    '600': rgbToHex(base),
    '700': rgbToHex(mix(base, BLACK, 0.25)),
    '900': rgbToHex(mix(base, BLACK, 0.5)),
  }
}

// --- Appliquer et mémoriser (cet appareil) ------------------------------------------------------------------------

const TOKENS = ['50', '100', '600', '700', '900'] as const

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
