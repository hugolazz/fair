// Invite un collègue : crée l'invitation (RLS : réservé aux admins de l'équipe) puis envoie l'e-mail « fair ».
// - Nouvel utilisateur : e-mail d'invitation (template `invite`).
// - Utilisateur déjà inscrit : lien magique (template `magic_link`) ; l'invitation est acceptée à sa connexion
//   par la RPC accept_pending_invitations().
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => null)
  const teamId = String(body?.teamId ?? '')
  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase()
  const role = body?.role === 'admin' ? 'admin' : 'member'
  if (!UUID.test(teamId) || !EMAIL.test(email)) return json({ error: 'invalid_input' }, 400)

  // L'insertion passe par la RLS de l'appelant : seuls les admins/owners de l'équipe y arrivent.
  const { error: insertErr } = await userClient
    .from('team_invitations')
    .insert({ team_id: teamId, email, role, invited_by: userData.user.id })
  if (insertErr && insertErr.code !== '23505') {
    // 23505 = invitation déjà en attente : on renvoie simplement l'e-mail.
    return json({ error: 'forbidden' }, 403)
  }

  const admin = createClient(url, serviceKey)
  // Nouveau compte : 
eeds_password fait passer la personne par le choix d'un mot de passe à sa première connexion.
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl,
    data: { needs_password: true },
  })
  if (inviteErr) {
    // Compte existant : on envoie un lien magique à la place.
    const anon = createClient(url, anonKey)
    const { error: otpErr } = await anon.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: siteUrl, shouldCreateUser: false },
    })
    if (otpErr) return json({ error: 'email_failed' }, 502)
  }

  return json({ ok: true })
})
