// Export du salon : lecture de toutes les données du salon, sous les droits de l'utilisateur connecté.
import { fetchExportData } from '@shared/exports/fetch.ts'
import type { ExportData } from '@shared/exports/types.ts'
import { supabase } from '@/lib/supabase'

export function loadExportData(eventId: string): Promise<ExportData> {
  return fetchExportData(supabase, eventId)
}
