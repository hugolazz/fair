import { describe, expect, it } from 'vitest'
import { emptyEventForm, eventFormSchema, formToColumns } from './event'

describe('eventFormSchema', () => {
  it('exige un nom', () => {
    const r = eventFormSchema.safeParse({ ...emptyEventForm, name: '   ' })
    expect(r.success).toBe(false)
  })

  it('refuse une fin antérieure au début', () => {
    const r = eventFormSchema.safeParse({
      ...emptyEventForm,
      name: 'x',
      startsOn: '2027-05-14',
      endsOn: '2027-05-12',
    })
    expect(r.success).toBe(false)
  })

  it('accepte des dates vides et convertit en null pour la base', () => {
    const r = eventFormSchema.parse({ ...emptyEventForm, name: ' Tech For Retail ' })
    expect(formToColumns(r)).toMatchObject({
      name: 'Tech For Retail',
      starts_on: null,
      ends_on: null,
      goals: {},
    })
  })

  it('range les objectifs dans goals.text', () => {
    const r = eventFormSchema.parse({ ...emptyEventForm, name: 'x', goals: '20 rencontres' })
    expect(formToColumns(r).goals).toEqual({ text: '20 rencontres' })
  })
})
