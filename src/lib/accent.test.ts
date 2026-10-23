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

  it('une couleur déjà lisible garde sa teinte principale', () => {
    expect(buildAccentPalette('#0f766e')['600']).toBe('#0f766e')
  })

  it('toute couleur reste lisible : texte blanc dessus, elle sur sa teinte claire et sur le fond de page', () => {
    const samples = [
      ...ACCENT_PRESETS.map((p) => p.hex),
      '#ffff00', // jaune vif : beaucoup trop clair, il doit être foncé
      '#ffffff',
      '#00ff00',
      '#ff00ff',
      '#7fdbff',
      '#000000',
      '#abcdef',
    ]
    for (const hex of samples) {
      const p = buildAccentPalette(hex)
      expect(contrast(rgb(p['600']), WHITE), hex).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(p['600']), rgb(p['50'])), hex).toBeGreaterThanOrEqual(4.5)
      expect(contrast(rgb(p['600']), rgb('#faf9f6')), hex).toBeGreaterThanOrEqual(4.5)
      // 700 et 900 sont plus foncées que la 600, 50 et 100 plus claires.
      expect(contrast(rgb(p['700']), WHITE), hex).toBeGreaterThanOrEqual(
        contrast(rgb(p['600']), WHITE),
      )
      expect(contrast(rgb(p['900']), WHITE), hex).toBeGreaterThanOrEqual(
        contrast(rgb(p['700']), WHITE),
      )
      expect(contrast(rgb(p['50']), WHITE), hex).toBeLessThan(contrast(rgb(p['100']), WHITE))
    }
  })
})
