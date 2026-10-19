import { describe, expect, it } from 'vitest'
import { eventStatus } from './status'

const salon = { starts_on: '2027-03-24', ends_on: '2027-03-26' }

describe('statut d’un salon selon la date du jour', () => {
  it('est en préparation jusqu’à la veille du premier jour', () => {
    expect(eventStatus(salon, '2026-10-19')).toBe('preparing')
    expect(eventStatus(salon, '2027-03-23')).toBe('preparing')
  })

  it('est en cours du premier au dernier jour inclus', () => {
    expect(eventStatus(salon, '2027-03-24')).toBe('live')
    expect(eventStatus(salon, '2027-03-25')).toBe('live')
    expect(eventStatus(salon, '2027-03-26')).toBe('live')
  })

  it('est passé dès le lendemain du dernier jour', () => {
    expect(eventStatus(salon, '2027-03-27')).toBe('done')
    expect(eventStatus(salon, '2030-01-01')).toBe('done')
  })

  it('sans date de fin, dure un jour ; sans date, reste en préparation', () => {
    const oneDay = { starts_on: '2027-03-24', ends_on: null }
    expect(eventStatus(oneDay, '2027-03-24')).toBe('live')
    expect(eventStatus(oneDay, '2027-03-25')).toBe('done')
    expect(eventStatus({ starts_on: null, ends_on: null }, '2099-01-01')).toBe('preparing')
    expect(eventStatus({ starts_on: null, ends_on: '2020-01-01' }, '2099-01-01')).toBe('preparing')
  })

  it('ignore une date de fin antérieure au début', () => {
    expect(eventStatus({ starts_on: '2027-03-24', ends_on: '2027-03-20' }, '2027-03-25')).toBe(
      'done',
    )
  })
})
