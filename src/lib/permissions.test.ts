import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMBER_PERMISSIONS,
  effectivePermissions,
  normalizePermissions,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
} from './permissions'

describe('droits des commerciaux', () => {
  it('chaque droit figure dans exactement un thème du tableau', () => {
    const listed = PERMISSION_GROUPS.flatMap((g) => g.keys)
    expect([...listed].sort()).toEqual([...PERMISSION_KEYS].sort())
  })

  it('par défaut : le rôle commercial d’origine (ajouter et modifier des fiches, rien d’autre)', () => {
    const on = PERMISSION_KEYS.filter((k) => DEFAULT_MEMBER_PERMISSIONS[k])
    expect(on).toEqual(['add_companies', 'edit_companies'])
  })

  it('un réglage incomplet, inconnu ou mal formé est complété par les valeurs par défaut', () => {
    expect(normalizePermissions(null)).toEqual(DEFAULT_MEMBER_PERMISSIONS)
    expect(normalizePermissions('x')).toEqual(DEFAULT_MEMBER_PERMISSIONS)
    expect(normalizePermissions({ create_events: true, edit_plan: 'oui', fly: true })).toEqual({
      ...DEFAULT_MEMBER_PERMISSIONS,
      create_events: true,
    })
  })

  it('un admin ou un propriétaire a tous les droits ; un commercial a le réglage de l’équipe', () => {
    const set = { ...DEFAULT_MEMBER_PERMISSIONS, add_companies: false }
    expect(Object.values(effectivePermissions('owner', set)).every(Boolean)).toBe(true)
    expect(Object.values(effectivePermissions('admin', set)).every(Boolean)).toBe(true)
    expect(effectivePermissions('member', set)).toEqual(set)
  })
})
