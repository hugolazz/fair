import {
  IMPORT_FIELDS,
  type ColumnMapping,
  type ImportField,
  type RawTable,
  type StoredMapping,
} from '@/db/schemas/import'
import { normalizeEmail, normalizeUrl, stripDiacritics } from './text'

/** Intitulé de colonne → forme comparable : minuscules, sans accents ni ponctuation. */
export function normHeader(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SYNONYMS: Record<ImportField, string[]> = {
  companyName: [
    'societe',
    'entreprise',
    'raison sociale',
    'nom de la societe',
    'nom societe',
    'nom entreprise',
    'nom de l entreprise',
    'company',
    'company name',
    'organisation',
    'organization',
    'exposant',
    'nom exposant',
    'exhibitor',
    'exhibitor name',
    'marque',
    'brand',
    'compte',
    'account',
    'denomination',
    'name',
  ],
  website: [
    'site web',
    'site',
    'site internet',
    'website',
    'web',
    'url',
    'site de l entreprise',
    'domaine',
    'domain',
    'company website',
    'www',
  ],
  stand: [
    'stand',
    'n stand',
    'no stand',
    'numero de stand',
    'numero stand',
    'booth',
    'booth number',
    'stand number',
    'emplacement',
    'hall',
  ],
  industry: [
    'secteur',
    'secteur d activite',
    'activite',
    'industry',
    'sector',
    'categorie',
    'category',
    'domaine d activite',
    'vertical',
    'segment',
  ],
  country: ['pays', 'country'],
  city: ['ville', 'city', 'localite', 'town'],
  contactName: [
    'nom du contact',
    'nom contact',
    'contact',
    'contact name',
    'nom complet',
    'full name',
    'nom et prenom',
    'nom prenom',
    'prenom nom',
    'representant',
    'interlocuteur',
    'participant',
    'visiteur',
    'personne',
    'name',
  ],
  contactFirstName: ['prenom', 'prenom du contact', 'first name', 'firstname', 'given name'],
  contactLastName: ['last name', 'lastname', 'surname', 'nom de famille', 'family name'],
  jobTitle: [
    'poste',
    'fonction',
    'titre',
    'job title',
    'title',
    'role',
    'position',
    'job',
    'intitule du poste',
    'intitule de poste',
    'job role',
  ],
  email: [
    'email',
    'e mail',
    'mail',
    'courriel',
    'adresse email',
    'adresse mail',
    'adresse e mail',
    'email address',
    'contact email',
  ],
  phone: [
    'telephone',
    'tel',
    'phone',
    'mobile',
    'portable',
    'gsm',
    'numero de telephone',
    'phone number',
  ],
}

/** Note de 0 à 1 : intitulé identique à un synonyme = 1 ; synonyme contenu dans l'intitulé = plus faible. */
function headerScore(header: string, field: ImportField): number {
  const n = normHeader(header)
  if (!n) return 0
  const tokens = n.split(' ')
  let best = 0
  for (const syn of SYNONYMS[field]) {
    // « Name » seul est ambigu : plutôt la société que le contact.
    if (n === syn) return syn !== 'name' ? 1 : field === 'companyName' ? 0.5 : 0.45
    const st = syn.split(' ')
    if (st.every((t) => tokens.includes(t)))
      best = Math.max(best, 0.6 + 0.3 * (st.length / tokens.length))
  }
  return best
}

const sampleOf = (table: RawTable, col: number) =>
  table.rows
    .slice(0, 400)
    .map((r) => r[col] ?? '')
    .filter(Boolean)
    .slice(0, 200)

const fraction = (values: string[], test: (v: string) => boolean) =>
  values.length === 0 ? 0 : values.filter(test).length / values.length

function contentScore(sample: string[], field: ImportField): number {
  if (sample.length < 2) return 0
  if (field === 'email')
    return fraction(sample, (v) => normalizeEmail(v).email !== '') >= 0.6 ? 1.1 : 0
  if (field === 'website') {
    return fraction(
      sample,
      (v) => !v.includes('@') && !/\s/.test(v) && normalizeUrl(v).website !== '',
    ) >= 0.6
      ? 0.7
      : 0
  }
  if (field === 'phone') {
    return fraction(
      sample,
      (v) => /^[+()\d\s./-]{8,}$/.test(v) && v.replace(/\D/g, '').length >= 8,
    ) >= 0.7
      ? 0.7
      : 0
  }
  return 0
}

/** Détection automatique : intitulés (FR/EN) puis contenu des colonnes ; une colonne ↔ un champ au maximum. */
export function detectMapping(table: RawTable): ColumnMapping {
  const hasFirstName = table.headers.some((h) => headerScore(h, 'contactFirstName') >= 0.8)
  const candidates: { col: number; field: ImportField; score: number }[] = []

  table.headers.forEach((header, col) => {
    const sample = sampleOf(table, col)
    for (const field of IMPORT_FIELDS) {
      let score = Math.max(headerScore(header, field), contentScore(sample, field))
      // « Nom » seul : nom de famille s'il y a une colonne « Prénom », sinon plutôt la société.
      if (normHeader(header) === 'nom') {
        if (field === 'contactLastName') score = hasFirstName ? 0.95 : 0
        else if (field === 'companyName') score = hasFirstName ? 0 : 0.55
        else if (field === 'contactName') score = hasFirstName ? 0 : 0.5
      }
      if (score >= 0.5) candidates.push({ col, field, score })
    }
  })

  candidates.sort((a, b) => b.score - a.score || a.col - b.col)
  const mapping: ColumnMapping = {}
  const usedCols = new Set<number>()
  for (const { col, field } of candidates) {
    if (usedCols.has(col) || mapping[field] !== undefined) continue
    mapping[field] = col
    usedCols.add(col)
  }
  if (mapping.contactFirstName !== undefined && mapping.contactLastName !== undefined)
    delete mapping.contactName
  return mapping
}

/** Réapplique un mapping mémorisé (par intitulé de colonne), puis complète par la détection automatique. */
export function resolveMapping(
  table: RawTable,
  stored?: StoredMapping | null,
): { mapping: ColumnMapping; restored: number } {
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  let restored = 0
  if (stored) {
    for (const field of IMPORT_FIELDS) {
      const label = stored.columns[field]
      if (!label) continue
      const wanted = normHeader(label)
      const col = table.headers.findIndex((h, i) => !used.has(i) && normHeader(h) === wanted)
      if (col !== -1) {
        mapping[field] = col
        used.add(col)
        restored++
      }
    }
  }
  const detected = detectMapping(table)
  for (const field of IMPORT_FIELDS) {
    const col = detected[field]
    if (mapping[field] === undefined && col !== undefined && !used.has(col)) {
      mapping[field] = col
      used.add(col)
    }
  }
  return { mapping, restored }
}

/** Mapping courant → forme mémorisable (champ → intitulé). */
export function toStoredMapping(
  table: RawTable,
  mapping: ColumnMapping,
  firstRowIsHeader: boolean,
): StoredMapping {
  const columns: StoredMapping['columns'] = {}
  for (const field of IMPORT_FIELDS) {
    const col = mapping[field]
    if (col !== undefined && table.headers[col]) columns[field] = table.headers[col]
  }
  return { firstRowIsHeader, columns }
}
