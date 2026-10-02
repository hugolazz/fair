/** Limites d'une image de plan : lisible en zoomant, sans saturer la mémoire d'un téléphone (canvas iOS ≈ 16,7 Mpx). */
export const PLAN_MAX_SIDE = 4096
export const PLAN_MAX_PIXELS = 12_000_000

/** Dimensions de sortie : jamais agrandi, côté long et nombre de pixels bornés, proportions conservées. */
export function fitWithin(
  w: number,
  h: number,
  maxSide = PLAN_MAX_SIDE,
  maxPixels = PLAN_MAX_PIXELS,
): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)))
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  }
}

/**
 * Échelle de rendu d'une page PDF (dimensions en points) : on agrandit une petite page (A4 → ~3 000 px de haut)
 * pour que les numéros de stand restent lisibles en zoomant, dans les limites de taille ci-dessus.
 */
export function pdfRenderScale(pageW: number, pageH: number): number {
  return Math.min(
    8,
    PLAN_MAX_SIDE / Math.max(pageW, pageH),
    Math.sqrt(PLAN_MAX_PIXELS / (pageW * pageH)),
  )
}
