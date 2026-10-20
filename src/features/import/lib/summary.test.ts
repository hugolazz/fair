import { describe, expect, it } from 'vitest'
import { i18n } from '@/lib/i18n'
import { summaryText } from './summary'

const t = i18n.getFixedT('fr', 'import') as (k: string, o?: Record<string, unknown>) => string

describe('phrase de synthèse de l’import', () => {
  it('accorde les nombres et annonce l’ajout avant l’import', () => {
    expect(summaryText(t, 50, 63, 'review')).toBe(
      'Prêt : 50 entreprises et 63 contacts seront ajoutés à ce salon.',
    )
    expect(summaryText(t, 1, 1, 'review')).toBe(
      'Prêt : 1 entreprise et 1 contact seront ajoutés à ce salon.',
    )
  })

  it('après l’import, dit simplement ce qui a été ajouté', () => {
    expect(summaryText(t, 50, 63, 'report')).toBe(
      '50 entreprises et 63 contacts ajoutés à ce salon.',
    )
  })

  it('sans contact, ne parle que des entreprises', () => {
    expect(summaryText(t, 12, 0, 'review')).toBe(
      'Prêt : 12 entreprises seront ajoutées à ce salon.',
    )
    expect(summaryText(t, 12, 0, 'report')).toBe('12 entreprises ajoutées à ce salon.')
  })
})
