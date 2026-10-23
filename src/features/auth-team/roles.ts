import type { TeamRole } from '@/db/repositories/teams'
import type { PermissionKey } from '@/lib/permissions'
import { useReadySession } from './session'

// Deux profils : admin d'équipe (propriétaire ou administrateur) et commercial (membre). Les droits réels sont portés
// par la base (RLS, migration « roles ») : masquer un bouton ici n'est qu'un confort, jamais une protection.

export const isAdminRole = (role: TeamRole): boolean => role === 'owner' || role === 'admin'

export function useIsAdmin(): boolean {
  return isAdminRole(useReadySession().membership.role)
}

/** Peut-on préparer cette entreprise (priorité, stand) ? Avec le droit de tout préparer (admins : toujours), ou si on y est assigné. */
export const canPrepareTarget = (
  canPrepareAll: boolean,
  assigneeIds: readonly string[],
  meId: string,
) => canPrepareAll || assigneeIds.includes(meId)

/** Peut-on modifier cette rencontre ? Son commercial, ou avec le droit sur les rendez-vous des collègues (admins : toujours). */
export const canEditMeeting = (canEditColleagues: boolean, ownerId: string, meId: string) =>
  canEditColleagues || ownerId === meId

/** A-t-on ce droit ? Tout pour un admin ; pour un commercial, selon le tableau des droits de l'équipe. */
export function useCan(key: PermissionKey): boolean {
  return useReadySession().membership.permissions[key]
}
