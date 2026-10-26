// Recadrage du logo de l'équipe : calculs purs (testés), sans canvas ni DOM.

export type Rect = { x: number; y: number; w: number; h: number }
/** Part (en %) retirée de chaque bord de l'image. */
export type Insets = { left: number; top: number; right: number; bottom: number }

/** Chaque bord retire 45 % au plus : il reste toujours au moins 10 % de l'image dans chaque sens. */
export const MAX_INSET = 45
export const NO_INSETS: Insets = { left: 0, top: 0, right: 0, bottom: 0 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function clampInsets(insets: Insets): Insets {
  return {
    left: clamp(insets.left, 0, MAX_INSET),
    top: clamp(insets.top, 0, MAX_INSET),
    right: clamp(insets.right, 0, MAX_INSET),
    bottom: clamp(insets.bottom, 0, MAX_INSET),
  }
}

/** Zone conservée, en pixels de l'image d'origine. */
export function insetsToRect(insets: Insets, width: number, height: number): Rect {
  const x = Math.round((width * insets.left) / 100)
  const y = Math.round((height * insets.top) / 100)
  const right = Math.round((width * insets.right) / 100)
  const bottom = Math.round((height * insets.bottom) / 100)
  return { x, y, w: Math.max(1, width - x - right), h: Math.max(1, height - y - bottom) }
}

export function rectToInsets(rect: Rect, width: number, height: number): Insets {
  return clampInsets({
    left: (rect.x / width) * 100,
    top: (rect.y / height) * 100,
    right: ((width - rect.x - rect.w) / width) * 100,
    bottom: ((height - rect.y - rect.h) / height) * 100,
  })
}

/**
 * Cadre serré autour du dessin : le fond est celui du coin haut-gauche (transparent, ou sa couleur s'il est opaque). On
 * avance depuis chacun des quatre bords jusqu'à la première ligne ou colonne qui porte du dessin : seules les marges sont
 * lues, pas toute l'image. `null` si l'image est entièrement vide. `rgba` = pixels RGBA (comme `ImageData.data`).
 */
export function trimBounds(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  tolerance = 24,
): Rect | null {
  const at = (x: number, y: number) => (y * width + x) * 4
  const corner = at(0, 0)
  const transparentBackground = (rgba[corner + 3] ?? 255) < 16
  const isInk = (x: number, y: number): boolean => {
    const i = at(x, y)
    if ((rgba[i + 3] ?? 255) < 16) return false // un pixel transparent est toujours du fond
    if (transparentBackground) return true
    const d =
      Math.abs((rgba[i] ?? 0) - (rgba[corner] ?? 0)) +
      Math.abs((rgba[i + 1] ?? 0) - (rgba[corner + 1] ?? 0)) +
      Math.abs((rgba[i + 2] ?? 0) - (rgba[corner + 2] ?? 0))
    return d > tolerance
  }
  const rowHasInk = (y: number) => {
    for (let x = 0; x < width; x++) if (isInk(x, y)) return true
    return false
  }
  let top = 0
  while (top < height && !rowHasInk(top)) top++
  if (top === height) return null
  let bottom = height - 1
  while (bottom > top && !rowHasInk(bottom)) bottom--
  const colHasInk = (x: number) => {
    for (let y = top; y <= bottom; y++) if (isInk(x, y)) return true
    return false
  }
  let left = 0
  while (left < width - 1 && !colHasInk(left)) left++
  let right = width - 1
  while (right > left && !colHasInk(right)) right--
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
}

/** Élargit le cadre d'une petite marge (en % de sa plus grande dimension), sans sortir de l'image. */
export function padRect(rect: Rect, width: number, height: number, percent = 4): Rect {
  const pad = Math.round((Math.max(rect.w, rect.h) * percent) / 100)
  const x = Math.max(0, rect.x - pad)
  const y = Math.max(0, rect.y - pad)
  return {
    x,
    y,
    w: Math.min(width, rect.x + rect.w + pad) - x,
    h: Math.min(height, rect.y + rect.h + pad) - y,
  }
}

/** Taille de l'image enregistrée : la plus grande dimension ne dépasse pas `max` (le logo reste léger). */
export function fitOutput(w: number, h: number, max = 1600): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}
