// Nettoyage et normalisation de cellules : fonctions pures, sans dépendance au DOM.
import { normalizeName, stripDiacritics } from '@/lib/normalize-name'

const PLACEHOLDERS = new Set([
  '-',
  '--',
  '---',
  'n/a',
  'na',
  'n.a.',
  'null',
  'none',
  '#n/a',
  '?',
  'nc',
  'nd',
  'néant',
  'aucun',
  '.',
])

/** Trim, espaces insécables/zéro-largeur supprimés, espaces multiples réduits, valeurs « vides » (N/A, -, null…) neutralisées. */
export function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return PLACEHOLDERS.has(s.toLowerCase()) ? '' : s
}

export { normalizeName, stripDiacritics }

// --- URLs -------------------------------------------------------------------------------------

/** Domaines trop génériques pour identifier une société (réseaux sociaux, messageries…). */
const GENERIC_HOSTS = new Set([
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'google.com',
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'linktr.ee',
  'wixsite.com',
  'business.site',
  'github.com',
])

export type NormalizedUrl = { website: string; domain: string; invalid: boolean }

const EMPTY_URL: NormalizedUrl = { website: '', domain: '', invalid: false }

/** « WWW.Acme.com/fr/?utm=x » → { website: 'https://acme.com/fr', domain: 'acme.com' }. */
export function normalizeUrl(raw: string): NormalizedUrl {
  let s = cleanCell(raw)
  if (!s) return EMPTY_URL
  s = s.replace(/^mailto:/i, '')
  const token = s.split(/[\s;,|]+/).find((t) => t.includes('.')) ?? s.split(/[\s;,|]+/)[0] ?? ''
  s = token.replace(/^[<"'(]+|[>"').,;]+$/g, '')
  if (!s || (s.includes('@') && !s.includes('/'))) return { ...EMPTY_URL, invalid: true }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return { ...EMPTY_URL, invalid: true }
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.split('.').pop()!.length < 2) {
    return { ...EMPTY_URL, invalid: true }
  }
  const path = url.pathname.replace(/\/+$/, '')
  return {
    website: `https://${host}${path === '/' ? '' : path}`,
    domain: GENERIC_HOSTS.has(host) ? '' : host,
    invalid: false,
  }
}

// --- E-mails ------------------------------------------------------------------------------------

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/

/** Extrait une adresse valide de « Jean <JEAN@Acme.com> », « mailto:… » ou d'une liste ; invalid=true si rien d'exploitable. */
export function normalizeEmail(raw: string): { email: string; invalid: boolean } {
  const s = cleanCell(raw)
  if (!s) return { email: '', invalid: false }
  const bracket = /<([^>]+)>/.exec(s)?.[1]
  const candidates = (bracket ? [bracket] : s.split(/[;,\s]+/)).map((c) =>
    c
      .replace(/^mailto:/i, '')
      .replace(/^["'(<]+|[>"').,;:]+$/g, '')
      .toLowerCase(),
  )
  const email = candidates.find((c) => EMAIL_RE.test(c))
  return email ? { email, invalid: false } : { email: '', invalid: true }
}

// --- Noms de personnes ------------------------------------------------------------------------------

const TITLES = new Set([
  'm',
  'mr',
  'mme',
  'mlle',
  'madame',
  'monsieur',
  'mrs',
  'ms',
  'miss',
  'dr',
  'docteur',
  'prof',
  'pr',
])
const PARTICLES = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'van',
  'von',
  'der',
  'den',
  'di',
  'da',
  'dos',
  'del',
  'el',
  'al',
  "d'",
  "l'",
])

const isUpper = (s: string) => s.length > 1 && s === s.toUpperCase() && s !== s.toLowerCase()
const isLower = (s: string) => s === s.toLowerCase() && s !== s.toUpperCase()

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** Met en forme « MARTIN » ou « martin » en « Martin » ; une casse déjà mixte est conservée. */
export function tidyPersonName(s: string): string {
  const cleaned = cleanCell(s)
  return isUpper(cleaned) || isLower(cleaned) ? titleCase(cleaned) : cleaned
}

/** Sépare « Dr Jean-Pierre MARTIN », « MARTIN Jean », « Martin, Jean » ou « Jean de la Fontaine » en prénom / nom. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  let s = cleanCell(full)
  if (!s) return { firstName: '', lastName: '' }
  const tokens0 = s.split(' ')
  while (
    tokens0.length > 1 &&
    TITLES.has(stripDiacritics(tokens0[0]!).toLowerCase().replace(/\.$/, ''))
  )
    tokens0.shift()
  s = tokens0.join(' ')

  const comma = s.indexOf(',')
  if (comma > 0 && comma < s.length - 1) {
    return {
      lastName: tidyPersonName(s.slice(0, comma)),
      firstName: tidyPersonName(s.slice(comma + 1)),
    }
  }
  const tokens = s.split(' ')
  if (tokens.length === 1) return { firstName: '', lastName: tidyPersonName(s) }

  // « MARTIN Jean » : nom de famille en capitales en tête.
  if (isUpper(tokens[0]!) && !isUpper(tokens[tokens.length - 1]!)) {
    let k = 0
    while (k < tokens.length - 1 && isUpper(tokens[k]!)) k++
    return {
      lastName: tidyPersonName(tokens.slice(0, k).join(' ')),
      firstName: tidyPersonName(tokens.slice(k).join(' ')),
    }
  }
  // « Jean de la Fontaine » : particules rattachées au nom.
  let k = tokens.length - 1
  while (k > 1 && PARTICLES.has(tokens[k - 1]!.toLowerCase())) k--
  return {
    firstName: tidyPersonName(tokens.slice(0, k).join(' ')),
    lastName: tidyPersonName(tokens.slice(k).join(' ')),
  }
}

// --- Stand --------------------------------------------------------------------------------------------

/** « stand n° b12 » → « B12 » ; les libellés libres (« Hall 5 - Allée C ») sont simplement nettoyés. */
export function normalizeStand(raw: string): string {
  const s = cleanCell(raw).replace(/^(stand|st\.?|booth|n°|no\.?|#)\s*(n°|no\.?|#)?\s*/i, '')
  return /^[a-z]?\d{1,4}[a-z]?$/i.test(s) ? s.toUpperCase() : s
}
