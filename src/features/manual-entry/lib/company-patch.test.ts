import { describe, expect, it } from 'vitest'
import { emptyCompanyForm, toCompanyPatch } from './manual'

describe('toCompanyPatch', () => {
  it('nettoie comme à l’import : nom normalisé, domaine tiré du site, champs vides à null', () => {
    expect(
      toCompanyPatch({
        ...emptyCompanyForm,
        name: '  Carrefour SA ',
        website: 'WWW.Carrefour.com/',
        industry: ' Distribution ',
        city: 'Paris',
        history: ' Déjà contacté le 19 janvier 2026 ',
      }),
    ).toEqual({
      name: 'Carrefour SA',
      name_normalized: 'carrefour',
      website: 'https://carrefour.com',
      domain: 'carrefour.com',
      industry: 'Distribution',
      city: 'Paris',
      country: null,
      history: 'Déjà contacté le 19 janvier 2026',
    })
  })
  it('un site vidé retire le domaine', () => {
    const p = toCompanyPatch({ ...emptyCompanyForm, name: 'Acme' })
    expect(p).toMatchObject({ website: null, domain: null, history: null })
  })
})
