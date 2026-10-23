import { z } from 'zod'
import { cacheKeys } from '@/db/cache-keys'
import { cachedRead } from '@/lib/cache/cache'
import { supabase } from '@/lib/supabase'

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

const membershipSchema = z.object({
  role: z.enum(TEAM_ROLES),
  teams: z.object({
    id: z.string(),
    name: z.string(),
    news_enabled: z.boolean().default(false),
    accent_color: z.string().nullable().default(null),
  }),
})
export type Membership = {
  teamId: string
  teamName: string
  role: TeamRole
  /** La case « Actualité ? » est activée pour l'équipe (réglage d'équipe). */
  newsEnabled: boolean
  /** Couleur d'accentuation de l'équipe (#rrggbb) ; `null` = le vert d'origine. */
  accentColor: string | null
}

export type Member = { userId: string; role: TeamRole; displayName: string }

/** Équipe de l'utilisateur ; sans réseau, la dernière connue (l'appli s'ouvre hors ligne). */
export const fetchMembership = (userId: string): Promise<Membership | null> =>
  cachedRead(cacheKeys.membership(userId), () => fetchMembershipNetwork(userId))

async function fetchMembershipNetwork(userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('role, teams!inner(id, name, news_enabled, accent_color)')
    .eq('user_id', userId)
    .is('teams.deleted_at', null)
    // L'équipe rejointe en dernier (il n'y a pas de sélecteur d'équipe) : quand on en quitte une, la précédente reprend la main.
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  const parsed = membershipSchema.parse({ role: row.role, teams: row.teams })
  return {
    teamId: parsed.teams.id,
    teamName: parsed.teams.name,
    role: parsed.role,
    newsEnabled: parsed.teams.news_enabled,
    accentColor: parsed.teams.accent_color,
  }
}

export async function createTeam(name: string): Promise<void> {
  const { error } = await supabase.rpc('create_team', { p_name: name })
  if (error) throw error
}

export type TeamHit = { id: string; name: string; memberCount: number }

const teamHitsSchema = z.array(
  z.object({ id: z.string(), name: z.string(), member_count: z.number() }),
)

/** Équipes dont le nom contient `query` (2 caractères au moins) : de quoi choisir celle à rejoindre. */
export async function searchTeams(query: string): Promise<TeamHit[]> {
  const { data, error } = await supabase.rpc('search_teams', { p_query: query })
  if (error) throw error
  return teamHitsSchema
    .parse(data ?? [])
    .map((t) => ({ id: t.id, name: t.name, memberCount: t.member_count }))
}

/** Rejoint une équipe existante, comme commercial. */
export async function joinTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('join_team', { p_team: teamId })
  if (error) throw error
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) throw error
}

/** Active ou retire la case « Actualité ? » des notes de rencontre pour toute l'équipe (admins seulement). */
export async function setNewsEnabled(teamId: string, enabled: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('teams')
    .update({ news_enabled: enabled })
    .eq('id', teamId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed or not found')
}

/** Couleur d'accentuation de toute l'équipe (admins seulement) ; `null` revient au vert d'origine. */
export async function setTeamAccent(teamId: string, color: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('teams')
    .update({ accent_color: color })
    .eq('id', teamId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed or not found')
}

// --- Logo de l'équipe (en-tête des PDF) ---------------------------------------------------------------------------

export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_TYPES = ['image/png', 'image/jpeg'] as const

/** Adresse temporaire du logo (aperçu), `null` si l'équipe n'en a pas. */
export async function fetchTeamLogoUrl(teamId: string): Promise<string | null> {
  const { data, error } = await supabase.from('teams').select('logo_path').eq('id', teamId).single()
  if (error) throw error
  const path = (data as { logo_path: string | null } | null)?.logo_path
  if (!path) return null
  const signed = await supabase.storage.from('attachments').createSignedUrl(path, 3600)
  return signed.data?.signedUrl ?? null
}

/** Enregistre le logo (PNG ou JPEG, 2 Mo maximum) : fichier dans le stockage privé, chemin dans l'équipe. */
export async function uploadTeamLogo(teamId: string, file: File): Promise<void> {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type) || file.size > LOGO_MAX_BYTES) {
    throw new Error('invalid logo')
  }
  const path = `${teamId}/logo.${file.type === 'image/png' ? 'png' : 'jpg'}`
  const up = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (up.error) throw up.error
  const { error } = await supabase.from('teams').update({ logo_path: path }).eq('id', teamId)
  if (error) throw error
}

/** Le fichier du logo (pour le recadrer). */
export async function downloadTeamLogo(teamId: string): Promise<Blob> {
  const { data, error } = await supabase.from('teams').select('logo_path').eq('id', teamId).single()
  if (error) throw error
  const path = (data as { logo_path: string | null } | null)?.logo_path
  if (!path) throw new Error('no logo')
  const file = await supabase.storage.from('attachments').download(path)
  if (file.error || !file.data) throw file.error ?? new Error('download failed')
  return file.data
}

/** Remplace le logo par une nouvelle version (recadrage) ; l'ancien fichier est retiré s'il porte un autre nom. */
export async function replaceTeamLogo(teamId: string, file: File): Promise<void> {
  const { data } = await supabase.from('teams').select('logo_path').eq('id', teamId).single()
  const oldPath = (data as { logo_path: string | null } | null)?.logo_path
  await uploadTeamLogo(teamId, file)
  const newPath = `${teamId}/logo.${file.type === 'image/png' ? 'png' : 'jpg'}`
  if (oldPath && oldPath !== newPath) await supabase.storage.from('attachments').remove([oldPath])
}

export async function removeTeamLogo(teamId: string): Promise<void> {
  const { data } = await supabase.from('teams').select('logo_path').eq('id', teamId).single()
  const path = (data as { logo_path: string | null } | null)?.logo_path
  const { error } = await supabase.from('teams').update({ logo_path: null }).eq('id', teamId)
  if (error) throw error
  if (path) await supabase.storage.from('attachments').remove([path])
}

export async function listMembers(teamId: string): Promise<Member[]> {
  const { data: members, error } = await supabase
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .order('created_at')
  if (error) throw error
  const ids = (members ?? []).map((m) => m.user_id as string)
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)
  if (pErr) throw pErr
  const names = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? '']),
  )
  return (members ?? []).map((m) => ({
    userId: m.user_id as string,
    role: m.role as TeamRole,
    displayName: names.get(m.user_id as string) ?? '',
  }))
}

/** Change le rôle d'un membre (admin d'équipe ou commercial). Réservé aux admins ; le propriétaire ne change pas ici. */
export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { data, error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed or not found')
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed or not found')
}

/**
 * Quitte l'équipe. Propriétaire avec des collègues : la propriété passe au plus ancien admin (à défaut, au plus ancien
 * membre) ; propriétaire seul : l'équipe est fermée (masquée, données conservées).
 */
export async function leaveTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_team', { p_team: teamId })
  if (error) throw error
}
