// Relecture d'un PDF généré : texte de chaque page (pdf.js, build Node) et nombre d'images embarquées.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

export type ReadPdf = { pages: string[]; images: number }
export type TextBox = { str: string; x: number; y: number; w: number; h: number }

/** Boîtes englobantes du texte de chaque page (points PDF, origine en bas à gauche). */
export async function readPdfBoxes(bytes: Uint8Array): Promise<TextBox[][]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const doc = await task.promise
  const out: TextBox[][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    out.push(
      content.items.flatMap((it) =>
        'str' in it && it.str.trim() !== ''
          ? [
              {
                str: it.str,
                x: it.transform[4]!,
                y: it.transform[5]!,
                w: it.width,
                h: it.height || Math.abs(it.transform[3]!),
              },
            ]
          : [],
      ),
    )
  }
  await task.destroy()
  return out
}

export async function readPdf(bytes: Uint8Array): Promise<ReadPdf> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const doc = await task.promise
  const pages: string[] = []
  let images = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // Les éléments d'une même ligne sont séparés par une espace ; un saut de ligne marque une nouvelle ligne visuelle.
    pages.push(
      content.items
        .map((it) => ('str' in it ? it.str + ('hasEOL' in it && it.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .replace(/[ ]+/g, ' '),
    )
    const ops = await page.getOperatorList()
    images += ops.fnArray.filter(
      (f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject,
    ).length
  }
  await task.destroy()
  return { pages, images }
}
