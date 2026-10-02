import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type LocalAttachment,
  type LocalCompany,
  type LocalEventCompany,
  type LocalMeeting,
  type LocalNote,
  type LocalTag,
} from '@/db/local/db'
import { buildFieldRows, type FieldRow } from './lib/list'

/**
 * Lecture 100 % locale (IndexedDB) : rien ici ne dépend du réseau. `useLiveQuery` se remet à jour tout seul
 * à chaque écriture locale ou à chaque lot reçu de la synchronisation.
 */

export function useFieldRows(eventId: string, userId: string): FieldRow[] | undefined {
  return useLiveQuery(async () => {
    const [targets, assignees, meetings] = await Promise.all([
      db.event_companies.where('event_id').equals(eventId).toArray(),
      db.event_company_assignees.where('event_id').equals(eventId).toArray(),
      db.meetings.where('event_id').equals(eventId).toArray(),
    ])
    const found = await db.companies.bulkGet([...new Set(targets.map((t) => t.company_id))])
    const companies = found.filter((c): c is LocalCompany => !!c)
    return buildFieldRows({ targets, companies, assignees, meetings, userId })
  }, [eventId, userId])
}

export function useLocalEvent(eventId: string) {
  return useLiveQuery(() => db.events.get(eventId), [eventId])
}

export function useCompanyTags(): LocalTag[] {
  return (
    useLiveQuery(async () => {
      const all = await db.tags.toArray()
      return all
        .filter((t) => !t.deleted_at && t.scope === 'company')
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    }, []) ?? []
  )
}

export type Fiche = {
  target: LocalEventCompany
  company: LocalCompany | undefined
  meeting: LocalMeeting | undefined
  notes: LocalNote[]
  photos: LocalAttachment[]
  tagIds: string[]
}

/** Tout ce qu'il faut pour la fiche rencontre ; `undefined` = en cours de lecture, `null` = cible inconnue. */
export function useFiche(targetId: string, userId: string): Fiche | null | undefined {
  return useLiveQuery(async () => {
    const target = await db.event_companies.get(targetId)
    if (!target || target.deleted_at) return null
    const company = await db.companies.get(target.company_id)
    const mine = (await db.meetings.where('event_company_id').equals(targetId).toArray())
      .filter((m) => m.owner_id === userId && !m.deleted_at)
      .sort((a, b) => a.id.localeCompare(b.id))
      .at(-1)
    const notes = mine
      ? (await db.notes.where('meeting_id').equals(mine.id).toArray())
          .filter((n) => !n.deleted_at)
          .sort((a, b) => a.id.localeCompare(b.id))
      : []
    const photos = mine
      ? (await db.attachments.where('owner_id').equals(mine.id).toArray()).filter(
          (a) => !a.deleted_at,
        )
      : []
    const tagIds = (await db.taggings.where('taggable_id').equals(target.company_id).toArray()).map(
      (t) => t.tag_id,
    )
    return { target, company, meeting: mine, notes, photos, tagIds }
  }, [targetId, userId])
}
