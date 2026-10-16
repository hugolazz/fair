import { z } from 'zod'
import { supabase } from '@/lib/supabase'

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

const membershipSchema = z.object({
  role: z.enum(TEAM_ROLES),
  teams: z.object({ id: z.string(), name: z.string() }),
})
export type Membership = { teamId: string; teamName: string; role: TeamRole }

export type Member = { userId: string; role: TeamRole; displayName: string }
export type Invitation = { id: string; email: string; role: TeamRole }

/** Rejoint les équipes dont une invitation attend cette adresse e-mail. */
export async function acceptPendingInvitations(): Promise<void> {
  const { error } = await supabase.rpc('accept_pending_invitations')
  if (error) throw error
}

export async function fetchMembership(userId: string): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('role, teams!inner(id, name)')
    .eq('user_id', userId)
    .is('teams.deleted_at', null)
    .order('created_at')
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  const parsed = membershipSchema.parse({ role: row.role, teams: row.teams })
  return { teamId: parsed.teams.id, teamName: parsed.teams.name, role: parsed.role }
}

export async function createTeam(name: string): Promise<void> {
  const { error } = await supabase.rpc('create_team', { p_name: name })
  if (error) throw error
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) throw error
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

export async function listInvitations(teamId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('team_invitations')
    .select('id, email, role')
    .eq('team_id', teamId)
    .is('accepted_at', null)
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((i) => ({
    id: i.id as string,
    email: i.email as string,
    role: i.role as TeamRole,
  }))
}

export async function cancelInvitation(id: string): Promise<void> {
  const { error } = await supabase.from('team_invitations').delete().eq('id', id)
  if (error) throw error
}

/** Crée l'invitation et envoie l'e-mail « fair » via l'Edge Function `invite-member`. */
export async function inviteMember(
  teamId: string,
  email: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await supabase.functions.invoke('invite-member', {
    body: { teamId, email, role },
  })
  if (error) throw error
}
