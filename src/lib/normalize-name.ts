export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036F]/g, '')
}

const LEGAL_TOKENS = new Set([
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'sa',
  'snc',
  'sci',
  'scop',
  'se',
  'spa',
  'srl',
  'gmbh',
  'ag',
  'bv',
  'nv',
  'plc',
  'llc',
  'llp',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ab',
  'oy',
  'group',
  'groupe',
  'holding',
  'holdings',
])

/**
 * Clé de comparaison d'un nom de société (rapprochement entre salons, doublons) :
 * casse, accents, ponctuation, parenthèses, forme juridique et « groupe » ignorés.
 */
export function normalizeName(name: string): string {
  const base = stripDiacritics(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’`.]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const tokens = base.split(' ').filter(Boolean)
  while (tokens.length > 1 && LEGAL_TOKENS.has(tokens[tokens.length - 1]!)) tokens.pop()
  if (tokens.length > 1 && ['the', 'le', 'la', 'les'].includes(tokens[0]!)) tokens.shift()
  return tokens.join(' ') || base || stripDiacritics(name).toLowerCase().trim()
}
