import { useMemo } from 'react'
import { fetchKeyContacts } from '@/db/repositories/targets'
import type { TargetContact } from '@/db/schemas/prepare'
import { useAsync } from '@/lib/use-async'

const NONE: Record<string, TargetContact> = {}

/** Contacts clés par entreprise, chargés seulement quand une colonne « contact clé » est affichée. */
export function useKeyContacts(teamId: string, enabled: boolean): Record<string, TargetContact> {
  const result = useAsync(
    () => (enabled ? fetchKeyContacts(teamId) : Promise.resolve(NONE)),
    [teamId, enabled],
  )
  return useMemo(() => result.data ?? NONE, [result.data])
}
