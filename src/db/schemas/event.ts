import { z } from 'zod'

export const EVENT_STATUSES = ['draft', 'preparing', 'live', 'done', 'archived'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

/** Ligne `events` telle que renvoyée par Supabase (validée à la frontière). */
export const eventRowSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  name: z.string(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  venue: z.string().nullable(),
  city: z.string().nullable(),
  status: z.enum(EVENT_STATUSES),
  goals: z.object({ text: z.string().optional() }).passthrough().nullable(),
})
export type EventRow = z.infer<typeof eventRowSchema>

const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/)

/** Formulaire salon. Les messages d'erreur sont des clés i18n (namespace `events`). */
export const eventFormSchema = z
  .object({
    name: z.string().trim().min(1, 'errors.nameRequired'),
    startsOn: optionalDate,
    endsOn: optionalDate,
    venue: z.string().trim(),
    city: z.string().trim(),
    status: z.enum(EVENT_STATUSES),
    goals: z.string().trim(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    path: ['endsOn'],
    message: 'errors.datesOrder',
  })
export type EventFormValues = z.infer<typeof eventFormSchema>

export const emptyEventForm: EventFormValues = {
  name: '',
  startsOn: '',
  endsOn: '',
  venue: '',
  city: '',
  status: 'draft',
  goals: '',
}

export function eventToForm(e: EventRow): EventFormValues {
  return {
    name: e.name,
    startsOn: e.starts_on ?? '',
    endsOn: e.ends_on ?? '',
    venue: e.venue ?? '',
    city: e.city ?? '',
    status: e.status,
    goals: e.goals?.text ?? '',
  }
}

/** Valeurs de formulaire → colonnes SQL (chaîne vide = null). */
export function formToColumns(v: EventFormValues) {
  return {
    name: v.name,
    starts_on: v.startsOn || null,
    ends_on: v.endsOn || null,
    venue: v.venue || null,
    city: v.city || null,
    status: v.status,
    goals: v.goals ? { text: v.goals } : {},
  }
}
