import type { ExportData } from '@shared/exports/types.ts'

export type ModePref = 'auto' | 'local' | 'server'

/** Au-delà de ce nombre de lignes (entreprises, contacts, rencontres, notes), « automatique » génère sur le serveur. */
export const SERVER_THRESHOLD = 1500

export const volume = (d: ExportData): number =>
  d.targets.length + d.contacts.length + d.meetings.length + d.notes.length

/** Où générer : le choix de l'utilisateur, ou selon le volume (gros = serveur, avec lien de téléchargement). */
export function chooseMode(pref: ModePref, d: ExportData): 'local' | 'server' {
  if (pref !== 'auto') return pref
  return volume(d) > SERVER_THRESHOLD ? 'server' : 'local'
}
