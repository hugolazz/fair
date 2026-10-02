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
  normalizeName,
  normalizeStand,
  normalizeUrl,
  splitFullName,
  tidyPersonName,
} from './text'

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
    const get = (f: keyof ColumnMapping) =>
      mapping[f] === undefined ? '' : (raw[mapping[f]!] ?? '')

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
    const mail = normalizeEmail(get('email'))
    if (mail.invalid) warnings.push('invalid_email')

    let firstName = tidyPersonName(get('contactFirstName'))
    let lastName = tidyPersonName(get('contactLastName'))
    if (!firstName && !lastName) ({ firstName, lastName } = splitFullName(get('contactName')))
    const contact: ContactDraft = {
      firstName,
      lastName,
      jobTitle: cleanCell(get('jobTitle')),
      email: mail.email,
      phone: cleanCell(get('phone')),
    }
    const hasIdentity = contact.email !== '' || contact.firstName !== '' || contact.lastName !== ''
    const hasAny = hasIdentity || contact.jobTitle !== '' || contact.phone !== ''
    if (hasAny && !hasIdentity) warnings.push('contact_incomplete')

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
      },
      contact: hasIdentity ? contact : null,
      warnings,
    })
  })
  return { rows, errors, removed }
}
