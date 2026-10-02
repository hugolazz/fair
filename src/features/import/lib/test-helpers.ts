import type { CleanRow, KnownCompany } from '@/db/schemas/import'
import { normalizeName } from './text'

type RowOpts = {
  domain?: string
  website?: string
  stand?: string
  industry?: string
  email?: string
  first?: string
  last?: string
  job?: string
}

/** Fabrique une ligne nettoyée pour les tests de déduplication et de plan. */
export function row(rowNumber: number, name: string, o: RowOpts = {}): CleanRow {
  const hasContact = o.email || o.first || o.last
  return {
    rowNumber,
    company: {
      name,
      nameKey: normalizeName(name),
      website: o.website ?? (o.domain ? `https://${o.domain}` : ''),
      domain: o.domain ?? '',
      stand: o.stand ?? '',
      industry: o.industry ?? '',
      country: '',
      city: '',
    },
    contact: hasContact
      ? {
          firstName: o.first ?? '',
          lastName: o.last ?? '',
          jobTitle: o.job ?? '',
          email: o.email ?? '',
          phone: '',
        }
      : null,
    warnings: [],
  }
}

export function known(id: string, name: string, o: Partial<KnownCompany> = {}): KnownCompany {
  return {
    id,
    name,
    nameKey: normalizeName(name),
    domain: null,
    website: null,
    industry: null,
    country: null,
    city: null,
    ...o,
  }
}

/** Générateur d'identifiants déterministe. */
export function counter(prefix = 'id') {
  let n = 0
  return () => `${prefix}-${++n}`
}
