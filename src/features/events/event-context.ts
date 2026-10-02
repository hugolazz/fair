import { useOutletContext } from 'react-router-dom'
import type { EventRow } from '@/db/schemas/event'

export type EventOutletContext = { event: EventRow; reload: () => void }

/** Salon courant, fourni par EventLayout à toutes ses pages (aperçu, participants, ma liste). */
export function useEvent(): EventOutletContext {
  return useOutletContext<EventOutletContext>()
}
