import { describe, expect, it } from 'vitest'
import { fromLocalInputs, toLocalInputs } from './format'

describe('champs date/heure ↔ ISO', () => {
  it('fait l’aller-retour dans le fuseau de l’appareil', () => {
    const iso = fromLocalInputs('2027-05-12', '14:30')!
    expect(toLocalInputs(iso)).toEqual({ date: '2027-05-12', time: '14:30' })
    expect(iso).toMatch(/Z$/)
  })
  it('refuse un champ incomplet ou invalide', () => {
    expect(fromLocalInputs('', '14:30')).toBeNull()
    expect(fromLocalInputs('2027-05-12', '')).toBeNull()
    expect(fromLocalInputs('2027-13-45', '14:30')).toBeNull()
  })
})
