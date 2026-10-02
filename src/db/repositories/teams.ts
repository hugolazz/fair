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
