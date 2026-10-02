import { v7 } from 'uuid'

/** Les identifiants sont générés côté client (UUIDv7) (triables par date de création, utiles pour lier des lignes avant leur insertion). */
export function newId(): string {
  return v7()
}
