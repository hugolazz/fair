import { describe, expect, it } from 'vitest'
import {
  ACCENT_PRESETS,
  buildAccentPalette,
  contrast,
  hexToRgb,
  isHexColor,
  mix,
  rgbToHex,
} from './accent'

const rgb = hexToRgb
const WHITE = rgb('#ffffff')
const PAGE = rgb('#faf9f6')

describe('couleur d’accentuation', () => {
  it('reconnaît une couleur #rrggbb et rien d’autre', () => {
    expect(isHexColor('#1d4ed8')).toBe(true)
    expect(isHexColor('#1D4ED8')).toBe(true)
    for (const bad of ['1d4ed8', '#fff', '#12345g', 'red', '', null, 12])
      expect(isHexColor(bad)).toBe(false)
  })

  it('convertit sans perte entre hexadécimal et RVB, et mélange', () => {
    expect(rgbToHex(rgb('#0f766e'))).toBe('#0f766e')
    expect(rgbToHex(mix(rgb('#000000'), WHITE, 0.5))).toBe('#808080')
  })

  it('la couleur choisie est gardée exacte, claire ou foncée (bleu ciel, jaune, presets…)', () => {
    for (const hex of [
      '#38bdf8',
      '#ffee00',
      '#7fdbff',
      '#00ff00',
      '#0f766e',
      '#abcdef',
      ...ACCENT_PRESETS.map((p) => p.hex),
    ])
      expect(buildAccentPalette(hex)['600'], hex).toBe(hex)
  })

  it('le texte posé sur la couleur : blanc sur une couleur foncée, encre sur une claire', () => {
    expect(buildAccentPalette('#1d4ed8').on).toBe('#ffffff')
    expect(buildAccentPalette('#38bdf8').on).not.toBe('#ffffff')
    expect(buildAccentPalette('#ffee00').on).not.toBe('#ffffff')
  })

  it('toute couleur reste lisible : texte sur la couleur, teinte « texte » sur blanc, sur sa teinte claire et sur le fond', () => {
    // Balayage de couleurs, dont les gris moyens (là où ni blanc ni encre ne se lisent sans ajustement).
    const samples: string[] = []
    for (let v = 0; v < 256; v += 17)
      for (let w = 0; w < 256; w += 51)
        samples.push(rgbToHex([v, w, (v * 3 + w) % 256]), rgbToHex([v, v, v]))
    for (const hex of [...samples, '#808080', '#777777', '#ffffff', '#000000']) {
      const p = buildAccentPalette(hex)
      expect(contrast(rgb(p.on), rgb(p['600'])), hex).toBeGreaterThanOrEqual(4.5)
      for (const bg of [WHITE, rgb(p['50']), PAGE])
        expect(contrast(rgb(p.text), bg), hex).toBeGreaterThanOrEqual(4.5)
      // 700 et 900 sont plus foncées que la teinte texte ; 50 est plus claire que 100.
      expect(contrast(rgb(p['700']), WHITE), hex).toBeGreaterThanOrEqual(
        contrast(rgb(p.text), WHITE),
      )
      expect(contrast(rgb(p['900']), WHITE), hex).toBeGreaterThanOrEqual(
        contrast(rgb(p['700']), WHITE),
      )
      expect(contrast(rgb(p['50']), WHITE), hex).toBeLessThanOrEqual(contrast(rgb(p['100']), WHITE))
    }
  })

  it('seule une couleur de luminosité moyenne est ajustée, très légèrement', () => {
    const p = buildAccentPalette('#808080')
    expect(p['600']).not.toBe('#808080')
    const moved = Math.abs(rgb(p['600'])[0] - 128)
    expect(moved).toBeLessThan(20)
  })
})
