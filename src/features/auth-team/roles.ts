import type { TeamRole } from '@/db/repositories/teams'
import { useReadySession } from './session'

// Deux profils : admin d'équipe (propriétaire ou administrateur) et commercial (membre). Les droits réels sont portés
// par la base (RLS, migration « roles ») : masquer un bouton ici n'est qu'un confort, jamais une protection.

export const isAdminRole = (role: TeamRole): boolean => role === 'owner' || role === 'admin'

export function useIsAdmin(): boolean {
  return isAdminRole(useReadySession().membership.role)
}

/** Peut-on préparer cette entreprise (priorité, objectif, commentaire) ? Admin, ou commercial qui y est assigné. */
export const canPrepareTarget = (admin: boolean, assigneeIds: readonly string[], meId: string) =>
  admin || assigneeIds.includes(meId)

/** Peut-on modifier cette rencontre ? Son commercial, ou un admin. */
export const canEditMeeting = (admin: boolean, ownerId: string, meId: string) =>
  admin || ownerId === meId
