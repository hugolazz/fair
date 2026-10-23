// Droits des commerciaux (rôle `member`) : un jeu unique par équipe, réglé par les propriétaires et admins.
// Les valeurs par défaut reprennent ce que le rôle commercial pouvait déjà faire (migration `member_permissions`) ; elles
// doivent rester identiques à celles de la colonne SQL `teams.member_permissions` (parité vérifiée dans tests/rls).
// La base (RLS, fonction `has_perm`) applique les droits : l'interface ne fait que griser ou masquer.

export const PERMISSION_KEYS = [
  'create_events',
  'edit_events',
  'import_participants',
  'add_companies',
  'edit_companies',
  'remove_participants',
  'manage_tags',
  'edit_plan',
  'prepare_all_targets',
  'assign_others',
  'edit_colleagues_meetings',
] as const
export type PermissionKey = (typeof PERMISSION_KEYS)[number]
export type Permissions = Record<PermissionKey, boolean>

/** Thèmes du tableau des droits, dans l'ordre d'affichage. */
export const PERMISSION_GROUPS: { id: string; keys: readonly PermissionKey[] }[] = [
  { id: 'events', keys: ['create_events', 'edit_events'] },
  {
    id: 'companies',
    keys: ['import_participants', 'add_companies', 'edit_companies', 'remove_participants'],
  },
  { id: 'preparation', keys: ['prepare_all_targets', 'assign_others', 'edit_colleagues_meetings'] },
  { id: 'organisation', keys: ['manage_tags', 'edit_plan'] },
]

/** Ce que peut faire un commercial tant qu'aucun admin n'a changé le tableau (= le rôle commercial d'origine). */
export const DEFAULT_MEMBER_PERMISSIONS: Permissions = {
  create_events: false,
  edit_events: false,
  import_participants: false,
  add_companies: true,
  edit_companies: true,
  remove_participants: false,
  manage_tags: false,
  edit_plan: false,
  prepare_all_targets: false,
  assign_others: false,
  edit_colleagues_meetings: false,
}

const ALL_ALLOWED = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Permissions

/** Réglage de l'équipe tel que stocké (peut être incomplet ou inconnu) → un jeu complet de booléens. */
export function normalizePermissions(raw: unknown): Permissions {
  const out = { ...DEFAULT_MEMBER_PERMISSIONS }
  if (raw && typeof raw === 'object')
    for (const key of PERMISSION_KEYS) {
      const v = (raw as Record<string, unknown>)[key]
      if (typeof v === 'boolean') out[key] = v
    }
  return out
}

/** Droits effectifs d'un membre : tous pour un admin (propriétaire compris), le réglage de l'équipe pour un commercial. */
export function effectivePermissions(
  role: 'owner' | 'admin' | 'member',
  memberSet: Permissions,
): Permissions {
  return role === 'member' ? memberSet : { ...ALL_ALLOWED }
}
