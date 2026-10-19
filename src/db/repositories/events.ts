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
    .insert({ id: newId(), team_id: teamId, status: 'preparing', ...formToColumns(values) })
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

/** Suppression logique : la ligne reste en base (réservé aux admins : un refus RLS ne renvoie aucune ligne). */
export async function deleteEvent(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed or not found')
}

export type DuplicateOptions = {
  name: string
  startsOn: string
  endsOn: string
  /** Copier la liste des participants (priorité, objectif, commentaire ; ni stands ni assignations). */
  copyParticipants: boolean
  /** Copier le mapping du dernier import. */
  copyMapping: boolean
}

/** Duplique un salon comme modèle (fonction SQL `duplicate_event`, réservée aux admins). Renvoie le nouveau salon. */
export async function duplicateEvent(id: string, o: DuplicateOptions): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_event', {
    p_event: id,
    p_name: o.name,
    p_starts_on: o.startsOn || null,
    p_ends_on: o.endsOn || null,
    p_copy_participants: o.copyParticipants,
    p_copy_mapping: o.copyMapping,
  })
  if (error) throw error
  return data as string
}
