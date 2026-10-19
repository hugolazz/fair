import { describe, expect, it } from 'vitest'
import { addDays, addMonths, monthWeeks, parseIso, toIso } from './calendar'

describe('calendrier', () => {
  it('lit et écrit les dates ISO, et refuse les dates impossibles', () => {
    expect(toIso(parseIso('2027-03-10')!)).toBe('2027-03-10')
    expect(parseIso('2027-02-30')).toBeNull()
    expect(parseIso('10/03/2027')).toBeNull()
    expect(parseIso('')).toBeNull()
  })

  it('ajoute des jours en passant les fins de mois et d’année', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
  })

  it('ajoute des mois en ramenant au dernier jour du mois plus court', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2027-03-15', -3)).toBe('2026-12-15')
  })

  it('dispose un mois en semaines commençant le lundi', () => {
    // Mars 2027 : le 1er est un lundi, le 31 un mercredi.
    const weeks = monthWeeks(2027, 2)
    expect(weeks[0]![0]).toBe('2027-03-01')
    expect(weeks.at(-1)).toEqual(['2027-03-29', '2027-03-30', '2027-03-31', null, null, null, null])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    // Octobre 2026 : le 1er est un jeudi, trois cases vides avant.
    expect(monthWeeks(2026, 9)[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })
})
