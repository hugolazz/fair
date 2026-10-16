import type { ExportData } from './types.ts'

/** Nom d'un membre (ou « — » s'il n'est plus dans l'équipe). */
export function memberNames(data: ExportData): (userId: string | null | undefined) => string {
  const names = new Map(data.members.map((m) => [m.userId, m.name]))
  return (id) => (id ? (names.get(id) ?? '—') : '—')
}
