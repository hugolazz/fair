import { supabase } from '@/lib/supabase'

/** Nom d'usage (« Prénom Nom ») de l'utilisateur ; chaîne vide si le profil n'en a pas. */
export async function fetchMyDisplayName(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data?.display_name as string | null | undefined) ?? ''
}

export async function updateMyDisplayName(userId: string, name: string): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('profile not found')
}
