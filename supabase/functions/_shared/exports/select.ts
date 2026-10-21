import type { ExportData } from './types.ts'

/** Nom d'un membre (ou « — » s'il n'est plus dans l'équipe). */
/**
 * La colonne « Actualité » figure dans les exports si l'équipe a activé la case, ou si au moins une rencontre l'a cochée
 * (les réponses déjà saisies ne disparaissent pas quand on désactive l'option). Sinon elle n'encombre pas le fichier.
 */
export const showsNews = (data: ExportData): boolean =>
  data.team.newsEnabled || data.meetings.some((m) => m.news)

/** Au moins une entreprise a un salon (pastille) : la colonne « Salons » figure alors dans l'Excel et le CSV. */
export const usesShows = (data: ExportData): boolean => {
  const shows = new Set(data.tags.filter((t) => t.kind === 'show').map((t) => t.id))
  return data.targets.some((t) => t.tagIds.some((id) => shows.has(id)))
}

export function memberNames(data: ExportData): (userId: string | null | undefined) => string {
  const names = new Map(data.members.map((m) => [m.userId, m.name]))
  return (id) => (id ? (names.get(id) ?? '—') : '—')
}
