import { describe, expect, it } from 'vitest'
import {
  clampInsets,
  fitOutput,
  insetsToRect,
  NO_INSETS,
  padRect,
  rectToInsets,
  trimBounds,
} from './logo-crop'

/** Image RGBA w × h, fond (r,g,b,a) et un carré plein (r,g,b,255) en [x, y, côté]. */
function image(
  w: number,
  h: number,
  bg: [number, number, number, number],
  box?: [number, number, number, number],
) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set(bg, i * 4)
  if (box)
    for (let y = box[1]; y < box[1] + box[3]; y++)
      for (let x = box[0]; x < box[0] + box[2]; x++) data.set([20, 30, 40, 255], (y * w + x) * 4)
  return data
}

describe('rognage automatique', () => {
  it('trouve le dessin sur fond transparent', () => {
    const data = image(40, 30, [0, 0, 0, 0], [10, 5, 12, 8])
    expect(trimBounds(data, 40, 30)).toEqual({ x: 10, y: 5, w: 12, h: 8 })
  })

  it('trouve le dessin sur un fond uni opaque (blanc), à la tolérance près', () => {
    const data = image(40, 30, [255, 255, 255, 255], [4, 6, 10, 10])
    data.set([250, 252, 255, 255], (0 * 40 + 1) * 4) // bruit de compression, ignoré
    expect(trimBounds(data, 40, 30)).toEqual({ x: 4, y: 6, w: 10, h: 10 })
  })

  it('le fond est celui du coin : une image opaque garde ses pixels transparents comme du fond, un dessin collé au bord est trouvé', () => {
    const data = image(20, 10, [255, 255, 255, 255], [0, 3, 5, 4]) // dessin touchant le bord gauche
    data.set([0, 0, 0, 0], (5 * 20 + 15) * 4) // un trou transparent dans le fond blanc : toujours du fond
    expect(trimBounds(data, 20, 10)).toEqual({ x: 0, y: 3, w: 5, h: 4 })
  })

  it('un dessin d’un seul pixel est trouvé', () => {
    const data = image(9, 9, [0, 0, 0, 0], [4, 7, 1, 1])
    expect(trimBounds(data, 9, 9)).toEqual({ x: 4, y: 7, w: 1, h: 1 })
  })

  it('une image sans dessin (vide ou unie) donne `null`', () => {
    expect(trimBounds(image(8, 8, [0, 0, 0, 0]), 8, 8)).toBeNull()
    expect(trimBounds(image(8, 8, [255, 255, 255, 255]), 8, 8)).toBeNull()
  })

  it('une petite marge est ajoutée autour du dessin, sans sortir de l’image', () => {
    expect(padRect({ x: 10, y: 5, w: 100, h: 40 }, 200, 100, 4)).toEqual({
      x: 6,
      y: 1,
      w: 108,
      h: 48,
    })
    expect(padRect({ x: 1, y: 0, w: 198, h: 100 }, 200, 100, 4)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 100,
    })
  })
})

describe('curseurs de recadrage', () => {
  it('convertit des marges en pourcentage en zone en pixels, et inversement', () => {
    const rect = insetsToRect({ left: 10, top: 20, right: 10, bottom: 0 }, 200, 100)
    expect(rect).toEqual({ x: 20, y: 20, w: 160, h: 80 })
    expect(rectToInsets(rect, 200, 100)).toEqual({ left: 10, top: 20, right: 10, bottom: 0 })
    expect(insetsToRect(NO_INSETS, 200, 100)).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })

  it('ne laisse jamais disparaître l’image : 45 % au plus par bord', () => {
    expect(clampInsets({ left: 80, top: -5, right: 45, bottom: 12 })).toEqual({
      left: 45,
      top: 0,
      right: 45,
      bottom: 12,
    })
  })

  it('ramène une grande image à 1600 px au plus, sans agrandir une petite', () => {
    expect(fitOutput(3200, 1600)).toEqual({ w: 1600, h: 800 })
    expect(fitOutput(300, 100)).toEqual({ w: 300, h: 100 })
    expect(fitOutput(1, 1)).toEqual({ w: 1, h: 1 })
  })
})
