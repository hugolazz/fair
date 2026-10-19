import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type { Session }

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
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
    options: { data: { display_name: displayName } },
  })
  if (error) throw error
  // Sans session, l'inscription attend une confirmation par e-mail (réglage Supabase) : la connexion se fera ensuite.
  return { confirmationNeeded: !data.session }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
