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
 * Cadre serré autour du dessin : on ignore le fond (transparent, ou la couleur du coin haut-gauche si l'image est
 * opaque). `null` si l'image est entièrement vide. `rgba` = pixels RGBA de l'image (comme `ImageData.data`).
 */
export function trimBounds(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  tolerance = 24,
): Rect | null {
  const at = (x: number, y: number) => (y * width + x) * 4
  let transparent = false
  for (let i = 3; i < width * height * 4 && !transparent; i += 4)
    transparent = (rgba[i] ?? 255) < 16
  const bg = at(0, 0)
  const isBackground = (x: number, y: number): boolean => {
    const i = at(x, y)
    if ((rgba[i + 3] ?? 255) < 16) return true
    if (transparent) return false
    const d =
      Math.abs((rgba[i] ?? 0) - (rgba[bg] ?? 0)) +
      Math.abs((rgba[i + 1] ?? 0) - (rgba[bg + 1] ?? 0)) +
      Math.abs((rgba[i + 2] ?? 0) - (rgba[bg + 2] ?? 0))
    return d <= tolerance
  }
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (!isBackground(x, y)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
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
