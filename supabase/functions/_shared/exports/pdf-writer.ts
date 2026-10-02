import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib'
import { GENERATED_WITH } from './labels.ts'
import type { Priority, TeamInfo } from './types.ts'

// Petit moteur de mise en page PDF (A4) : texte qui passe à la ligne, titres, tableaux à en-tête répété,
// sommaire avec les vrais numéros de page, pied de page « généré avec fair » sur toutes les pages.

export const PAGE_W = 595.28
export const PAGE_H = 841.89
export const MARGIN = 44
export const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_H = 34

export const COLORS = {
  brand: rgb(0.059, 0.463, 0.431),
  ink: rgb(0.09, 0.11, 0.16),
  muted: rgb(0.38, 0.42, 0.48),
  line: rgb(0.82, 0.85, 0.88),
  band: rgb(0.95, 0.97, 0.97),
  white: rgb(1, 1, 1),
}

export const PRIORITY_COLORS: Record<Priority, RGB> = {
  A: rgb(0.996, 0.792, 0.792),
  B: rgb(0.992, 0.902, 0.541),
  C: rgb(0.749, 0.859, 0.996),
}

export type TextOpts = {
  size?: number
  bold?: boolean
  color?: RGB
  x?: number
  width?: number
  /** Espace sous le bloc (pt). */
  gap?: number
  align?: 'left' | 'center' | 'right'
  maxLines?: number
}

export type TableColumn = { label: string; weight: number; align?: 'left' | 'right' | 'center' }
export type TableSpec = {
  columns: TableColumn[]
  rows: string[][]
  /** Couleur de fond par cellule : `fills[ligne][colonne]`. */
  fills?: (Record<number, RGB> | undefined)[]
  size?: number
  maxLines?: number
}

type TocEntry = { title: string; page: PDFPage }

export class PdfWriter {
  readonly doc: PDFDocument
  readonly regular: PDFFont
  readonly bold: PDFFont
  page!: PDFPage
  /** Ordonnée courante : haut libre de la page (en points depuis le bas). */
  y = 0
  private toc: TocEntry[] = []
  private charsets = new Map<PDFFont, Set<number>>()
  private footerCenter: string

  private constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont, footerCenter: string) {
    this.doc = doc
    this.regular = regular
    this.bold = bold
    this.footerCenter = footerCenter
  }

  static async create(opts: {
    title: string
    footerCenter: string
    generatedAt: string
  }): Promise<PdfWriter> {
    const doc = await PDFDocument.create()
    doc.setTitle(opts.title)
    doc.setCreator('fair')
    doc.setProducer('fair')
    doc.setCreationDate(new Date(opts.generatedAt))
    doc.setModificationDate(new Date(opts.generatedAt))
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const w = new PdfWriter(doc, regular, bold, opts.footerCenter)
    w.newPage()
    return w
  }

  // --- texte ---------------------------------------------------------------------------------------------

  /** Remplace ce que la police standard ne sait pas écrire (jamais d'erreur d'encodage). */
  clean(text: string, font: PDFFont = this.regular): string {
    let set = this.charsets.get(font)
    if (!set) {
      set = new Set(font.getCharacterSet())
      this.charsets.set(font, set)
    }
    let out = ''
    for (const ch of text
      .normalize('NFC')
      .replace(/[\u202F\u2007\u2009]/g, ' ')
      .replace(/\t/g, ' ')) {
      const cp = ch.codePointAt(0)!
      if (cp < 32) continue
      out += set.has(cp) ? ch : '?'
    }
    return out
  }

  private font(bold?: boolean) {
    return bold ? this.bold : this.regular
  }

  width(text: string, size: number, bold = false): number {
    return this.font(bold).widthOfTextAtSize(this.clean(text, this.font(bold)), size)
  }

  /** Coupe un texte en lignes de largeur maximale `maxWidth` (les \n sont respectés). */
  wrap(text: string, size: number, maxWidth: number, bold = false): string[] {
    const font = this.font(bold)
    const fits = (s: string) => font.widthOfTextAtSize(this.clean(s, font), size) <= maxWidth
    const lines: string[] = []
    for (const para of text.split(/\r?\n/)) {
      let line = ''
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word
        if (fits(next)) {
          line = next
          continue
        }
        if (line) lines.push(line)
        line = word
        // Un mot plus large que la ligne est coupé.
        while (!fits(line) && line.length > 1) {
          let cut = line.length - 1
          while (cut > 1 && !fits(line.slice(0, cut))) cut--
          lines.push(line.slice(0, cut))
          line = line.slice(cut)
        }
      }
      lines.push(line)
    }
    return lines
  }

  private clip(
    lines: string[],
    maxLines?: number,
    bold = false,
    size = 10,
    maxWidth = CONTENT_W,
  ): string[] {
    if (!maxLines || lines.length <= maxLines) return lines
    const kept = lines.slice(0, maxLines)
    let last = `${kept[maxLines - 1]}…`
    while (this.width(last, size, bold) > maxWidth && last.length > 2)
      last = `${last.slice(0, -2)}…`
    kept[maxLines - 1] = last
    return kept
  }

  private drawLine(
    text: string,
    x: number,
    baseline: number,
    size: number,
    bold: boolean,
    color: RGB,
    w: number,
    align: TextOpts['align'],
  ) {
    const font = this.font(bold)
    const t = this.clean(text, font)
    const tw = font.widthOfTextAtSize(t, size)
    const dx = align === 'right' ? w - tw : align === 'center' ? (w - tw) / 2 : 0
    this.page.drawText(t, { x: x + dx, y: baseline, size, font, color })
  }

  /** Écrit un paragraphe à la position courante et descend. */
  text(text: string, o: TextOpts = {}): void {
    const size = o.size ?? 10
    const x = o.x ?? MARGIN
    const width = o.width ?? CONTENT_W - (x - MARGIN)
    const lineH = size * 1.3
    const lines = this.clip(this.wrap(text, size, width, o.bold), o.maxLines, o.bold, size, width)
    for (const line of lines) {
      this.ensure(lineH)
      this.drawLine(line, x, this.y - size, size, !!o.bold, o.color ?? COLORS.ink, width, o.align)
      this.y -= lineH
    }
    this.y -= o.gap ?? 4
  }

  /** Titre ; `toc: true` l'ajoute au sommaire (niveau 1). */
  heading(title: string, opts: { level?: 1 | 2; toc?: boolean; newPage?: boolean } = {}): void {
    const level = opts.level ?? 1
    if (opts.newPage) this.newPage()
    const size = level === 1 ? 16 : 12
    this.ensure(size * 2.5)
    if (opts.toc) this.toc.push({ title, page: this.page })
    this.text(title, {
      size,
      bold: true,
      color: level === 1 ? COLORS.brand : COLORS.ink,
      gap: level === 1 ? 2 : 0,
    })
    if (level === 1) {
      this.page.drawLine({
        start: { x: MARGIN, y: this.y + 1 },
        end: { x: MARGIN + CONTENT_W, y: this.y + 1 },
        thickness: 1.2,
        color: COLORS.brand,
      })
      this.y -= 8
    }
  }

  // --- pages ------------------------------------------------------------------------------------------------

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN
  }

  /** Passe à la page suivante s'il ne reste pas `h` points. Renvoie true si une page a été ajoutée. */
  ensure(h: number): boolean {
    if (this.y - h >= MARGIN + FOOTER_H) return false
    this.newPage()
    return true
  }

  skip(h: number) {
    this.y -= h
  }

  get remaining(): number {
    return this.y - (MARGIN + FOOTER_H)
  }

  // --- éléments -------------------------------------------------------------------------------------------

  async image(
    img: TeamInfo['logo'],
    x: number,
    top: number,
    maxW: number,
    maxH: number,
  ): Promise<{ w: number; h: number } | null> {
    if (!img) return null
    let pic: PDFImage
    try {
      pic =
        img.mime === 'image/png'
          ? await this.doc.embedPng(img.bytes)
          : await this.doc.embedJpg(img.bytes)
    } catch {
      return null // logo illisible : le PDF se génère sans
    }
    const k = Math.min(maxW / pic.width, maxH / pic.height, 1)
    const w = pic.width * k
    const h = pic.height * k
    this.page.drawImage(pic, { x, y: top - h, width: w, height: h })
    return { w, h }
  }

  rect(x: number, top: number, w: number, h: number, color: RGB) {
    this.page.drawRectangle({ x, y: top - h, width: w, height: h, color })
  }

  /** Tableau : en-tête répété à chaque page, hauteur de ligne selon le texte, couleurs de cellule. */
  table(spec: TableSpec): void {
    const size = spec.size ?? 8.5
    const lineH = size * 1.3
    const pad = 3.5
    const total = spec.columns.reduce((n, c) => n + c.weight, 0)
    const widths = spec.columns.map((c) => (c.weight / total) * CONTENT_W)

    const header = () => {
      const h = lineH + pad * 2
      this.ensure(h + lineH * 2)
      this.rect(MARGIN, this.y, CONTENT_W, h, COLORS.brand)
      let x = MARGIN
      spec.columns.forEach((c, i) => {
        this.drawLine(
          c.label,
          x + pad,
          this.y - pad - size,
          size,
          true,
          COLORS.white,
          widths[i]! - pad * 2,
          c.align,
        )
        x += widths[i]!
      })
      this.y -= h
    }

    header()
    spec.rows.forEach((cells, r) => {
      const wrapped = cells.map((c, i) =>
        this.clip(
          this.wrap(c, size, widths[i]! - pad * 2),
          spec.maxLines ?? 6,
          false,
          size,
          widths[i]! - pad * 2,
        ),
      )
      const h = Math.max(...wrapped.map((l) => l.length), 1) * lineH + pad * 2
      if (this.ensure(h)) header()
      if (r % 2 === 1) this.rect(MARGIN, this.y, CONTENT_W, h, COLORS.band)
      let x = MARGIN
      spec.columns.forEach((c, i) => {
        const fill = spec.fills?.[r]?.[i]
        if (fill) this.rect(x, this.y, widths[i]!, h, fill)
        wrapped[i]!.forEach((line, k) =>
          this.drawLine(
            line,
            x + pad,
            this.y - pad - size - k * lineH,
            size,
            false,
            COLORS.ink,
            widths[i]! - pad * 2,
            c.align,
          ),
        )
        x += widths[i]!
      })
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - h },
        end: { x: MARGIN + CONTENT_W, y: this.y - h },
        thickness: 0.4,
        color: COLORS.line,
      })
      this.y -= h
    })
    this.y -= 10
  }

  /** Barres horizontales (étiquette, valeur) : répartition par statut. */
  bars(
    items: { label: string; value: number }[],
    opts: { width?: number; color?: RGB; size?: number } = {},
  ): void {
    const size = opts.size ?? 9
    const labelW = 96
    const width = opts.width ?? CONTENT_W
    const barW = width - labelW - 34
    const max = Math.max(1, ...items.map((i) => i.value))
    for (const it of items) {
      this.ensure(size * 1.9)
      this.drawLine(it.label, MARGIN, this.y - size, size, false, COLORS.ink, labelW - 6, 'left')
      const w = (it.value / max) * barW
      this.rect(
        MARGIN + labelW,
        this.y - 1,
        Math.max(w, it.value > 0 ? 1.5 : 0),
        size + 2,
        opts.color ?? COLORS.brand,
      )
      this.drawLine(
        String(it.value),
        MARGIN + labelW + w + 4,
        this.y - size,
        size,
        true,
        COLORS.ink,
        30,
        'left',
      )
      this.y -= size * 1.9
    }
    this.y -= 6
  }

  // --- fin --------------------------------------------------------------------------------------------------

  /** Insère le sommaire (page 2) puis écrit les pieds de page ; renvoie le PDF. */
  async finish(opts: { toc?: boolean } = {}): Promise<Uint8Array> {
    if (opts.toc && this.toc.length > 0) {
      const page = this.doc.insertPage(1, [PAGE_W, PAGE_H])
      const keep = this.page
      const keepY = this.y
      this.page = page
      this.y = PAGE_H - MARGIN
      this.heading('Sommaire')
      this.skip(6)
      const pages = this.doc.getPages()
      for (const e of this.toc) {
        this.ensure(20)
        const n = String(pages.indexOf(e.page) + 1)
        const title = this.clean(e.title)
        const tw = this.regular.widthOfTextAtSize(title, 11)
        const nw = this.regular.widthOfTextAtSize(n, 11)
        this.drawLine(title, MARGIN, this.y - 11, 11, false, COLORS.ink, CONTENT_W, 'left')
        this.drawLine(n, MARGIN, this.y - 11, 11, false, COLORS.ink, CONTENT_W, 'right')
        // pointillés entre le titre et le numéro
        const dots = Math.max(
          0,
          Math.floor((CONTENT_W - tw - nw - 12) / this.regular.widthOfTextAtSize('.', 11)),
        )
        this.page.drawText('.'.repeat(dots), {
          x: MARGIN + tw + 6,
          y: this.y - 11,
          size: 11,
          font: this.regular,
          color: COLORS.line,
        })
        this.y -= 20
      }
      this.page = keep
      this.y = keepY
    }

    const pages = this.doc.getPages()
    pages.forEach((p, i) => {
      p.drawLine({
        start: { x: MARGIN, y: MARGIN + 12 },
        end: { x: PAGE_W - MARGIN, y: MARGIN + 12 },
        thickness: 0.5,
        color: COLORS.line,
      })
      const small = 8
      const left = this.clean(GENERATED_WITH)
      const center = this.clean(this.footerCenter)
      const right = `page ${i + 1} / ${pages.length}`
      p.drawText(left, {
        x: MARGIN,
        y: MARGIN,
        size: small,
        font: this.regular,
        color: COLORS.muted,
      })
      const cw = this.regular.widthOfTextAtSize(center, small)
      p.drawText(center, {
        x: (PAGE_W - cw) / 2,
        y: MARGIN,
        size: small,
        font: this.regular,
        color: COLORS.muted,
      })
      const rw = this.regular.widthOfTextAtSize(right, small)
      p.drawText(right, {
        x: PAGE_W - MARGIN - rw,
        y: MARGIN,
        size: small,
        font: this.regular,
        color: COLORS.muted,
      })
    })
    return this.doc.save()
  }
}
