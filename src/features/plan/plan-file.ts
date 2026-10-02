import { fitWithin, pdfRenderScale } from './lib/image-size'

/** Image prête à être stockée : fichier, type et dimensions en pixels. */
export type PlanImage = { blob: Blob; mime: string; width: number; height: number }

export class PlanFileError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'unreadable' | 'tooLarge' | 'pdfFailed' | 'pdfOffline',
  ) {
    super(reason)
    this.name = 'PlanFileError'
  }
}

const MAX_FILE_BYTES = 40 * 1024 * 1024
const KEEP_ORIGINAL_BYTES = 6 * 1024 * 1024

export const isPdf = (file: Blob & { name?: string }) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')

/** WebP si le navigateur sait l'écrire (plus léger), sinon JPEG. */
async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mime: string }> {
  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q))
  const webp = await toBlob('image/webp', 0.9)
  if (webp && webp.type === 'image/webp') return { blob: webp, mime: 'image/webp' }
  const jpeg = await toBlob('image/jpeg', 0.88)
  if (!jpeg) throw new PlanFileError('unreadable')
  return { blob: jpeg, mime: 'image/jpeg' }
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PlanFileError('unreadable')
  ctx.fillStyle = '#fff' // PDF / PNG transparents : fond blanc, sinon les lignes noires disparaissent en thème sombre
  ctx.fillRect(0, 0, width, height)
  return { canvas, ctx }
}

async function fromImage(file: Blob): Promise<PlanImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PlanFileError('unreadable')
  }
  try {
    const out = fitWithin(bitmap.width, bitmap.height)
    const keep =
      out.scale === 1 &&
      file.size <= KEEP_ORIGINAL_BYTES &&
      /^image\/(png|jpeg|webp)$/.test(file.type)
    if (keep) {
      return { blob: file, mime: file.type, width: bitmap.width, height: bitmap.height }
    }
    const { canvas, ctx } = newCanvas(out.width, out.height)
    ctx.drawImage(bitmap, 0, 0, out.width, out.height)
    return { ...(await encode(canvas)), width: out.width, height: out.height }
  } finally {
    bitmap.close()
  }
}

/**
 * Première page d'un PDF → image. pdf.js (≈ 1 Mo) n'est chargé qu'ici, à la demande : il n'alourdit pas
 * l'application pour ceux qui n'importent pas de PDF.
 */
async function fromPdf(file: Blob): Promise<PlanImage> {
  try {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    try {
      const doc = await task.promise
      const page = await doc.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: pdfRenderScale(base.width, base.height) })
      const width = Math.round(viewport.width)
      const height = Math.round(viewport.height)
      const { canvas, ctx } = newCanvas(width, height)
      await page.render({ canvasContext: ctx, canvas, viewport }).promise
      return { ...(await encode(canvas)), width, height }
    } finally {
      void task.destroy()
    }
  } catch (e) {
    // Hors-ligne, le module pdf.js (chargé à la demande) n'est pas disponible : on le dit clairement.
    throw e instanceof PlanFileError
      ? e
      : new PlanFileError(navigator.onLine ? 'pdfFailed' : 'pdfOffline')
  }
}

/** Image ou PDF → image de plan optimisée. Lève `PlanFileError` avec la raison à afficher. */
export async function prepareFloorplanImage(file: File): Promise<PlanImage> {
  if (file.size > MAX_FILE_BYTES) throw new PlanFileError('tooLarge')
  if (isPdf(file)) return fromPdf(file)
  if (!file.type.startsWith('image/')) throw new PlanFileError('unsupported')
  return fromImage(file)
}
