import { loadExportData } from '@/db/repositories/exports'
import { useAsync } from '@/lib/use-async'

/** Toutes les données du salon pour les exports et le bilan (lues sous les droits de l'utilisateur). */
export function useExportData(eventId: string) {
  return useAsync(() => loadExportData(eventId), [eventId])
}
