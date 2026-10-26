import { fetchKeyContacts } from '@/db/repositories/targets'
import type { TargetContact } from '@/db/schemas/prepare'
import { useAsync } from '@/lib/use-async'

const NONE: Record<string, TargetContact> = {}

/** Contacts clés par entreprise du salon, chargés seulement quand une colonne « contact clé » est affichée. */
export function useKeyContacts(eventId: string, enabled: boolean): Record<string, TargetContact> {
  const result = useAsync(
    () => (enabled ? fetchKeyContacts(eventId) : Promise.resolve(NONE)),
    [eventId, enabled],
  )
  return result.data ?? NONE
}
