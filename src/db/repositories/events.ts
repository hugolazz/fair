// Salons : lecture/écriture directes sur Supabase.
import { supabase } from '@/lib/supabase'
import { newId } from '@/lib/ids'
import {
  eventRowSchema,
  formToColumns,
  type EventFormValues,
  type EventRow,
} from '../schemas/event'

const COLUMNS = 'id, team_id, name, starts_on, ends_on, venue, city, status, goals'

export async function listEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(COLUMNS)
    .is('deleted_at', null)
    .order('starts_on', { ascending: false, nullsFirst: true })
    .order('name')
  if (error) throw error
  return eventRowSchema.array().parse(data)
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from('events')
    .select(COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data ? eventRowSchema.parse(data) : null
}

export async function createEvent(teamId: string, values: EventFormValues): Promise<EventRow> {
  const { data, error } = await supabase
    .from('events')
    .insert({ id: newId(), team_id: teamId, ...formToColumns(values) })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return eventRowSchema.parse(data)
}

export async function updateEvent(id: string, values: EventFormValues): Promise<EventRow> {
  const { data, error } = await supabase
    .from('events')
    .update(formToColumns(values))
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return eventRowSchema.parse(data)
}

/** Soft delete : la ligne reste pour que la sync propage la suppression. */
export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
