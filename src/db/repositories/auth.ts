import type { Session } from '@supabase/supabase-js'
import { clearCache } from '@/lib/cache/cache'
import { deleteOutbox } from '@/lib/outbox/storage'
import { isRetryableError } from '@/lib/network-error'
import { supabase } from '@/lib/supabase'

export type { Session }

export async function getSession(): Promise<Session | null> {
  const stored = readStoredSession()
  const expired = stored?.expires_at !== undefined && stored.expires_at * 1000 < Date.now() + 60_000
  // Jeton à renouveler : supabase-js réessaie longuement quand le réseau manque. L'appli ne doit pas rester sur
  // « Chargement… » : passé ce délai, la session gardée sur l'appareil sert (le renouvellement continue en tâche de fond).
  const attempt = supabase.auth.getSession()
  attempt.catch(() => {})
  const fallback =
    stored && expired
      ? new Promise<null>((resolve) =>
          setTimeout(resolve, navigator.onLine === false ? 300 : 4_000, null),
        )
      : null
  try {
    const result = await (fallback ? Promise.race([attempt, fallback]) : attempt)
    if (result === null) return stored
    if (result.error) throw result.error
    return result.data.session
  } catch (e) {
    // Un refus du serveur est une vraie erreur ; une coupure réseau ne ferme pas la session.
    if (stored && isRetryableError(e)) return stored
    throw e
  }
}

/** La session gardée par supabase-js dans le stockage du navigateur (jeton éventuellement expiré). */
function readStoredSession(): Session | null {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey
    const raw = key ? globalThis.localStorage?.getItem(key) : null
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return null
    const s = parsed as Partial<Session>
    return s.access_token && s.refresh_token && s.user?.id ? (s as Session) : null
  } catch {
    return null
  }
}

/** Retourne la fonction de désabonnement. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

/**
 * Connexion automatique pour le DÉVELOPPEMENT uniquement : si VITE_DEV_EMAIL et VITE_DEV_PASSWORD sont
 * définis dans .env.local, on ouvre la session de ce compte (créé à la main dans Supabase) sans passer par
 * l'e-mail. Désactivé dans le build de production (`import.meta.env.DEV` est faux : le code est éliminé).
 */
export async function devAutoSignIn(): Promise<void> {
  if (!import.meta.env.DEV) return
  const email = import.meta.env.VITE_DEV_EMAIL as string | undefined
  const password = import.meta.env.VITE_DEV_PASSWORD as string | undefined
  if (!email || !password) return
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) console.warn(`Connexion de dev impossible : ${error.message}`)
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Crée le compte ; le nom d'usage alimente le profil (trigger `handle_new_user`). */
export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<{ confirmationNeeded: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Le lien de confirmation ramène sur le site d'où l'on s'inscrit (il doit figurer dans les « Redirect URLs » de Supabase).
    options: {
      data: { display_name: displayName },
      ...(typeof window === 'undefined' ? {} : { emailRedirectTo: window.location.origin }),
    },
  })
  if (error) throw error
  // Sans session, l'inscription attend une confirmation par e-mail (réglage Supabase) : la connexion se fera ensuite.
  return { confirmationNeeded: !data.session }
}

/**
 * Envoie le lien de réinitialisation. Supabase répond pareil que l'adresse existe ou non : l'appelant ne doit jamais
 * révéler si un compte existe. Le lien ramène sur `/reset-password` (adresse à lister dans les « Redirect URLs »).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    ...(typeof window === 'undefined'
      ? {}
      : { redirectTo: `${window.location.origin}/reset-password` }),
  })
  if (error) throw error
}

/**
 * Change le mot de passe de la session en cours (session de récupération ouverte par le lien de l'e-mail).
 */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Message de l'erreur levée quand le mot de passe actuel saisi est faux. */
export const WRONG_CURRENT_PASSWORD = 'wrong_current_password'

/**
 * Change le mot de passe en exigeant l'actuel : on se reconnecte avec lui avant d'accepter le nouveau, pour qu'une session
 * laissée ouverte sur un poste ne suffise pas à prendre la main sur le compte.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
  if (error) throw new Error(WRONG_CURRENT_PASSWORD)
  await updatePassword(newPassword)
}

/**
 * Supprime le compte de l'appelant (RPC `delete_my_account`) puis tout ce qui reste sur l'appareil : copie locale, file
 * d'attente d'écritures, session. Les notes et rencontres saisies restent à l'équipe, sans nom.
 */
export async function deleteMyAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
  await clearCache()
  await deleteOutbox(`fair-outbox:${userId}`)
  // Le compte n'existe plus côté serveur : on ne garde que le nettoyage local de la session.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
}

export async function signOut(): Promise<void> {
  await clearCache() // rien de lu ne reste sur l'appareil après la déconnexion
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
