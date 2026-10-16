import {
  type CleanRow,
  type ColumnMapping,
  type ContactDraft,
  type RawTable,
  type RemovedCounts,
  type RowError,
  type RowWarning,
} from '@/db/schemas/import'
import { normHeader } from './mapping'
import {
  cleanCell,
  normalizeEmail,
  normalizeLinkedin,
  normalizeName,
  normalizePriority,
  oneLine,
  normalizeStand,
  normalizeUrl,
  splitFullName,
  tidyPersonName,
} from './text'

// Plusieurs contacts dans une même ligne d'entreprise : séparés par « ; », « | » ou un retour à la ligne, et alignés
// position par position entre les colonnes (nom 1 ↔ e-mail 1 ↔ téléphone 1…).
const LIST_SEP = /\s*(?:\n|;|\|)\s*/
const EMAIL_SEP = /[\s;,|]+/
const parts = (s: string, sep: RegExp) =>
  s
    .split(sep)
    .map((p) => cleanCell(p))
    .filter(Boolean)

export function extractContacts(cell: (f: keyof ColumnMapping) => string): {
  contacts: ContactDraft[]
  warnings: RowWarning[]
} {
  const warnings: RowWarning[] = []
  const firsts = parts(cell('contactFirstName'), LIST_SEP)
  const lasts = parts(cell('contactLastName'), LIST_SEP)
  const fulls = parts(cell('contactName'), LIST_SEP)
  const splitNames = firsts.length > 0 || lasts.length > 0
  const nameCount = splitNames ? Math.max(firsts.length, lasts.length) : fulls.length
  const mails = parts(cell('email'), EMAIL_SEP)
  const many = nameCount > 1 || (nameCount === 0 && mails.length > 1)
  const n = many ? (nameCount > 1 ? nameCount : mails.length) : 1
  if (many && nameCount > 1 && mails.length > 0 && mails.length !== nameCount)
    warnings.push('contacts_mismatch')

  // Un seul contact : la cellule entière sert de valeur (un poste ou un téléphone peut contenir « / » ou « ; »).
  const list = (f: keyof ColumnMapping, sep = LIST_SEP) =>
    many ? parts(cell(f), sep) : [oneLine(cell(f))]
  const emails = many ? mails : [oneLine(cell('email'))]
  const phones = list('phone')
  const jobs = list('jobTitle')
  const links = list('contactLinkedin')

  const contacts: ContactDraft[] = []
  for (let i = 0; i < n; i++) {
    const mail = normalizeEmail(emails[i] ?? '')
    if (mail.invalid) warnings.push('invalid_email')
    const link = normalizeLinkedin(links[i] ?? '')
    if (link.invalid) warnings.push('invalid_linkedin')
    const { firstName, lastName } = splitNames
      ? { firstName: tidyPersonName(firsts[i] ?? ''), lastName: tidyPersonName(lasts[i] ?? '') }
      : splitFullName(fulls[i] ?? '')
    const c: ContactDraft = {
      firstName,
      lastName,
      jobTitle: cleanCell(jobs[i] ?? ''),
      email: mail.email,
      phone: cleanCell(phones[i] ?? ''),
      linkedin: link.url,
    }
    const hasIdentity = c.email !== '' || c.firstName !== '' || c.lastName !== ''
    const hasAny = hasIdentity || c.jobTitle !== '' || c.phone !== '' || c.linkedin !== ''
    if (hasAny && !hasIdentity) warnings.push('contact_incomplete')
    if (hasIdentity) contacts.push(c)
  }
  return { contacts, warnings }
}

export type CleanResult = { rows: CleanRow[]; errors: RowError[]; removed: RemovedCounts }

/** Applique le mapping : nettoie chaque cellule, retire lignes vides / en-têtes répétés, signale les lignes inexploitables. */
export function cleanRows(table: RawTable, mapping: ColumnMapping): CleanResult {
  const rows: CleanRow[] = []
  const errors: RowError[] = []
  const removed: RemovedCounts = { empty: 0, repeatedHeader: 0 }

  const nameCol = mapping.companyName
  const headerKey = nameCol !== undefined ? normHeader(table.headers[nameCol] ?? '') : ''

  table.rows.forEach((raw, i) => {
    const rowNumber = table.rowNumbers[i]!
    if (raw.every((c) => c === '')) {
      removed.empty++
      return
    }
    // `cell` garde les retours à la ligne (séparateur de contacts), `get` les aplatit.
    const cell = (f: keyof ColumnMapping) =>
      mapping[f] === undefined ? '' : (raw[mapping[f]!] ?? '')
    const get = (f: keyof ColumnMapping) => oneLine(cell(f))

    const name = get('companyName')
    if (headerKey && normHeader(name) === headerKey) {
      removed.repeatedHeader++
      return
    }
    // Ligne de total en pied de tableau : ni société ni erreur.
    if (
      /^(total|totaux|sous[- ]?total|somme|sum)$/i.test(name) &&
      raw.filter(Boolean).length === 1
    ) {
      removed.empty++
      return
    }
    if (!name) {
      errors.push({ rowNumber, code: 'missing_company', raw })
      return
    }

    const warnings: RowWarning[] = []
    const url = normalizeUrl(get('website'))
    if (url.invalid) warnings.push('invalid_url')
    const priority = normalizePriority(get('priority'))
    const extracted = extractContacts(cell)
    warnings.push(...extracted.warnings)

    rows.push({
      rowNumber,
      company: {
        name,
        nameKey: normalizeName(name),
        website: url.website,
        domain: url.domain,
        stand: normalizeStand(get('stand')),
        industry: cleanCell(get('industry')),
        country: cleanCell(get('country')),
        city: cleanCell(get('city')),
        priority,
        tag: cleanCell(get('tag')),
        comment: cleanCell(cell('comment'), true),
      },
      contacts: extracted.contacts,
      warnings,
    })
  })
  return { rows, errors, removed }
}
