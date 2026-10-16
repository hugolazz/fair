/** Prénom d'usage tiré d'une adresse e-mail (« camille.martin@x.fr » → « Camille »). Chaîne vide si rien d'exploitable. */
export function firstNameOf(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const first = local.split(/[._+\-\d]+/).find(Boolean) ?? ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

/** Initiales (1 à 2 lettres) d'un nom (« Camille Martin » ou « camille.martin » → « CM », « hugo » → « HU »). */
export function initialsOfName(name: string | null | undefined): string {
  const parts = (name ?? '').split(/[\s._+\-\d]+/).filter(Boolean)
  const letters =
    parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? '').slice(0, 2)
  return letters.toUpperCase() || '?'
}

/** Initiales d'une adresse e-mail (« camille.martin@x.fr » → « CM », « hugo@x.fr » → « HU »). */
export const initialsOf = (email: string | null | undefined): string =>
  initialsOfName((email ?? '').split('@')[0])
