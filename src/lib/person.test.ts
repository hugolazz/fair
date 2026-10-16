import { describe, expect, it } from 'vitest'
import { firstNameOf, initialsOf, initialsOfName } from './person'

describe('firstNameOf', () => {
  it('tire le prénom de la partie locale de l’e-mail', () => {
    expect(firstNameOf('camille.martin@exemple.fr')).toBe('Camille')
    expect(firstNameOf('HUGO@exemple.fr')).toBe('Hugo')
    expect(firstNameOf('jean-pierre_dupont@x.fr')).toBe('Jean')
  })
  it('renvoie une chaîne vide sans e-mail exploitable', () => {
    expect(firstNameOf(undefined)).toBe('')
    expect(firstNameOf('123@x.fr')).toBe('')
  })
})

describe('initialsOfName', () => {
  it('prend les initiales d’un nom complet ou les deux premières lettres', () => {
    expect(initialsOfName('Camille Martin')).toBe('CM')
    expect(initialsOfName('hugo')).toBe('HU')
    expect(initialsOfName('')).toBe('?')
  })
})

describe('initialsOf', () => {
  it('prend les initiales de deux mots, ou les deux premières lettres', () => {
    expect(initialsOf('camille.martin@exemple.fr')).toBe('CM')
    expect(initialsOf('hugo@exemple.fr')).toBe('HU')
  })
  it('renvoie « ? » si rien d’exploitable', () => {
    expect(initialsOf(null)).toBe('?')
  })
})
