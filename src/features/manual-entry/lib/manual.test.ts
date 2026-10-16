import { describe, expect, it } from 'vitest'
import {
  emptyCompanyForm,
  emptyContactForm,
  toCleanRow,
  validateCompany,
  validateContact,
} from './manual'

describe('validateContact', () => {
  it('exige un prénom, un nom ou un e-mail', () => {
    expect(validateContact({ ...emptyContactForm, jobTitle: 'CTO' }).errors).toEqual({
      identity: true,
    })
    expect(validateContact({ ...emptyContactForm, firstName: 'Ada' }).errors).toBeUndefined()
    expect(validateContact({ ...emptyContactForm, email: 'ada@acme.io' }).errors).toBeUndefined()
  })
  it('refuse un e-mail ou un LinkedIn invalide', () => {
    const r = validateContact({
      ...emptyContactForm,
      firstName: 'Ada',
      email: 'ada@',
      linkedin: 'pas un lien',
    })
    expect(r.errors).toEqual({ email: true, linkedin: true })
  })
  it('nettoie : e-mail en minuscules, LinkedIn complété, nom en capitales corrigé', () => {
    const r = validateContact({
      firstName: ' ada ',
      lastName: 'LOVELACE',
      jobTitle: ' CTO ',
      email: 'Ada@Acme.IO',
      phone: ' 06 11 22 33 44 ',
      linkedin: 'linkedin.com/in/ada/',
    })
    expect(r.value).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      jobTitle: 'CTO',
      email: 'ada@acme.io',
      phone: '06 11 22 33 44',
      linkedin: 'https://linkedin.com/in/ada',
    })
  })
})

describe('validateCompany et toCleanRow', () => {
  it('exige un nom ; un contact commencé doit être exploitable', () => {
    expect(validateCompany(emptyCompanyForm)).toEqual({ name: true })
    expect(
      validateCompany({
        ...emptyCompanyForm,
        name: 'Acme',
        contact: { ...emptyContactForm, jobTitle: 'CTO' },
      }),
    ).toEqual({ contact: { identity: true } })
    expect(validateCompany({ ...emptyCompanyForm, name: 'Acme', website: 'pas de site' })).toEqual({
      website: true,
    })
  })
  it('produit la même ligne qu’un import de fichier', () => {
    const row = toCleanRow({
      ...emptyCompanyForm,
      name: 'Carrefour SA',
      website: 'WWW.Carrefour.com/',
      stand: 'stand b12',
      priority: 'A',
      tag: 'Client',
      contact: { ...emptyContactForm, firstName: 'Claire', lastName: 'Dubois' },
    })
    expect(row.company).toMatchObject({
      name: 'Carrefour SA',
      nameKey: 'carrefour',
      domain: 'carrefour.com',
      stand: 'B12',
      priority: 'A',
      tag: 'Client',
    })
    expect(row.contacts).toHaveLength(1)
  })
  it('sans contact saisi, aucune ligne de contact', () => {
    expect(toCleanRow({ ...emptyCompanyForm, name: 'Solo' }).contacts).toEqual([])
  })
})
