import type { CompanyPatch, NewContact } from '@/db/repositories/targets'
import type { CleanRow } from '@/db/schemas/import'
import type { Priority } from '@/db/schemas/prepare'
import {
  normalizeEmail,
  normalizeLinkedin,
  normalizeName,
  normalizeStand,
  normalizeUrl,
  tidyPersonName,
} from '@/features/import/lib/text'

// Saisie manuelle d'une entreprise et de ses contacts : les mêmes règles de nettoyage que l'import de fichier, pour que
// ce qui est tapé à la main se range exactement comme ce qui vient d'un tableur (et s'exporte de la même façon).

export type ContactForm = {
  firstName: string
  lastName: string
  jobTitle: string
  email: string
  phone: string
  linkedin: string
}

export const emptyContactForm: ContactForm = {
  firstName: '',
  lastName: '',
  jobTitle: '',
  email: '',
  phone: '',
  linkedin: '',
}

export type CompanyForm = {
  name: string
  website: string
  stand: string
  industry: string
  city: string
  country: string
  priority: Priority | ''
  /** Libellé d'un tag de l'équipe (client, prospect…), vide = aucun. */
  tag: string
  /** Historique avec l'entreprise (« déjà contacté M. X le 19 janvier pour… »). */
  history: string
  contact: ContactForm
}

export const emptyCompanyForm: CompanyForm = {
  name: '',
  website: '',
  stand: '',
  industry: '',
  city: '',
  country: '',
  priority: '',
  tag: '',
  history: '',
  contact: emptyContactForm,
}

export type ContactErrors = { identity?: true; email?: true; linkedin?: true }

const filled = (c: ContactForm) => Object.values(c).some((v) => v.trim() !== '')

/** Un contact doit avoir au moins un prénom, un nom ou un e-mail ; e-mail et LinkedIn, s'ils sont saisis, doivent être valides. */
export function validateContact(
  c: ContactForm,
): { value: NewContact; errors?: undefined } | { value?: undefined; errors: ContactErrors } {
  const errors: ContactErrors = {}
  const mail = normalizeEmail(c.email)
  const link = normalizeLinkedin(c.linkedin)
  if (mail.invalid) errors.email = true
  if (link.invalid) errors.linkedin = true
  if (!c.firstName.trim() && !c.lastName.trim() && !mail.email) errors.identity = true
  if (Object.keys(errors).length > 0) return { errors }
  return {
    value: {
      firstName: tidyPersonName(c.firstName),
      lastName: tidyPersonName(c.lastName),
      jobTitle: c.jobTitle.trim(),
      email: mail.email,
      phone: c.phone.trim(),
      linkedin: link.url,
    },
  }
}

export type CompanyErrors = { name?: true; website?: true; contact?: ContactErrors }

export function validateCompany(f: CompanyForm): CompanyErrors {
  const errors: CompanyErrors = {}
  if (!f.name.trim()) errors.name = true
  if (f.website.trim() && normalizeUrl(f.website).invalid) errors.website = true
  // Le contact est facultatif, mais s'il est commencé il doit être exploitable.
  if (filled(f.contact)) {
    const v = validateContact(f.contact)
    if (v.errors) errors.contact = v.errors
  }
  return errors
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

/** Formulaire valide → informations de l'entreprise à enregistrer (« Modifier la fiche »), nettoyées comme à l'import. */
export function toCompanyPatch(f: CompanyForm): CompanyPatch {
  const url = normalizeUrl(f.website)
  const name = f.name.trim()
  return {
    name,
    name_normalized: normalizeName(name),
    website: orNull(url.website),
    domain: orNull(url.domain),
    industry: orNull(f.industry),
    city: orNull(f.city),
    country: orNull(f.country),
    history: orNull(f.history),
  }
}

/** Formulaire valide → ligne « nettoyée », comme si elle venait d'un fichier (le contact saisi est le contact clé). */
export function toCleanRow(f: CompanyForm): CleanRow {
  const url = normalizeUrl(f.website)
  const contact = filled(f.contact) ? validateContact(f.contact).value : undefined
  const name = f.name.trim()
  return {
    rowNumber: 1,
    company: {
      name,
      nameKey: normalizeName(name),
      website: url.website,
      domain: url.domain,
      stand: normalizeStand(f.stand),
      industry: f.industry.trim(),
      country: f.country.trim(),
      city: f.city.trim(),
      priority: f.priority || null,
      tag: f.tag.trim(),
      comment: f.history.trim(),
    },
    contacts: contact ? [contact] : [],
    warnings: [],
  }
}
