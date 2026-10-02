import { v7 } from 'uuid'

/** Les identifiants sont générés côté client (UUIDv7) pour permettre la création hors-ligne. */
export function newId(): string {
  return v7()
}
