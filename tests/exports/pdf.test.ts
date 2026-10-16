import { describe, expect, it } from 'vitest'
import { buildBilanPdf } from '@shared/exports/pdf-bilan.ts'
import { buildEventReportPdf } from '@shared/exports/pdf-reports.ts'
import { PdfWriter } from '@shared/exports/pdf-writer.ts'
import { bigData, sampleData } from './fixtures'
import { readPdf, readPdfBoxes, type TextBox } from './pdf-text'

const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, 5)) === '%PDF-'

describe('PDF global du salon', () => {
  it('est un PDF avec page de garde, sommaire, synthèse, entreprises, rencontres et notes', async () => {
    const bytes = await buildEventReportPdf(sampleData())
    expect(isPdf(bytes)).toBe(true)
    const pdf = await readPdf(bytes)
    expect(pdf.pages.length).toBe(6) // garde, sommaire, synthèse, entreprises, rencontres, notes

    const [cover, toc] = pdf.pages
    expect(cover).toContain('Compte-rendu du salon')
    expect(cover).toContain('Tech For Retail 2027')
    expect(cover).toContain('Équipe Démo')
    expect(cover).toContain('du 12/05/2027 au 13/05/2027')
    expect(cover).toContain('Paris Expo')
    expect(toc).toContain('Sommaire')
  })

  it('le sommaire renvoie aux bons numéros de page', async () => {
    const pdf = await readPdf(await buildEventReportPdf(sampleData()))
    for (const title of ['Synthèse', 'Entreprises', 'Rencontres', 'Notes']) {
      const page =
        pdf.pages.findIndex((p, i) => i > 1 && new RegExp(`^\\s*${title}\\b`).test(p)) + 1
      expect(page, `page du titre « ${title} »`).toBeGreaterThan(2)
      // L'entrée du sommaire porte ce même numéro (pdf.js restitue : titre, numéro, puis les points de conduite).
      expect(pdf.pages[1]).toMatch(new RegExp(`${title}\\s+${page}\\s`))
    }
  })

  it('porte « généré avec fair » et « page n / N » en pied de CHAQUE page', async () => {
    const pdf = await readPdf(await buildEventReportPdf(sampleData()))
    pdf.pages.forEach((text, i) => {
      expect(text).toContain('généré avec fair')
      expect(text).toContain(`page ${i + 1} / ${pdf.pages.length}`)
      expect(text).toContain('Équipe Démo · Tech For Retail 2027')
      expect(text).not.toMatch(/\b(Fair|FAIR)\b/)
    })
  })

  it('la synthèse reprend les chiffres du bilan', async () => {
    const pdf = await readPdf(await buildEventReportPdf(sampleData()))
    const s = pdf.pages[2]!
    expect(s).toMatch(/Entreprises ciblées 6/)
    expect(s).toMatch(/Entreprises rencontrées 4 \(67 %\)/)
    expect(s).toMatch(/Rencontres prévues 7/)
    expect(s).toMatch(/Rencontres réalisées 5 \(71 %\)/)
    expect(s).toMatch(/Rencontres imprévues 1/)
    expect(s).toContain('Par commercial')
    expect(s).toContain('Marie')
  })

  it('liste les entreprises, rencontres et notes', async () => {
    const pdf = await readPdf(await buildEventReportPdf(sampleData()))
    const companies = pdf.pages[3]!
    for (const n of [
      'Carrefour',
      'Décathlon',
      'Zalando',
      'Fnac Darty',
      'Amazon France',
      'Leroy Merlin',
    ])
      expect(companies).toContain(n)
    expect(companies).toContain('Hugo, Marie')
    const meetings = pdf.pages[4]!
    expect(meetings).toContain('12/05/2027 10:30') // heure de Paris
    expect(meetings).toContain('Envoyer le devis')
    const notes = pdf.pages[5]!
    expect(notes).toContain('Décideur présent, budget validé T3')
    expect(notes).toContain('Croisé au bar')
  })

  it('embarque le logo de l’équipe (et fonctionne sans)', async () => {
    expect((await readPdf(await buildEventReportPdf(sampleData(true)))).images).toBe(1)
    expect((await readPdf(await buildEventReportPdf(sampleData(false)))).images).toBe(0)
  })

  it('un logo corrompu ne fait pas échouer l’export', async () => {
    const d = sampleData()
    d.team.logo = { bytes: new Uint8Array([1, 2, 3, 4]), mime: 'image/png' }
    const bytes = await buildEventReportPdf(d)
    expect(isPdf(bytes)).toBe(true)
  })

  it('beaucoup de données : plusieurs pages, en-têtes de tableau répétés, pieds de page partout', async () => {
    const pdf = await readPdf(await buildEventReportPdf(bigData()))
    expect(pdf.pages.length).toBeGreaterThan(15)
    // Le tableau des entreprises s'étend sur plusieurs pages, et son en-tête est répété sur chacune.
    const tablePages = pdf.pages.filter((p) =>
      /Entreprise Stand Prio Commerciaux Tags Statut Int\./.test(p),
    )
    expect(tablePages.length).toBeGreaterThan(3)
    for (const p of tablePages) expect(p).toContain('Entreprise numéro')
    // Les 400 entreprises sont toutes présentes.
    const all = tablePages.join(' ')
    for (const i of [0, 199, 399]) expect(all).toContain(`Entreprise numéro ${i} `)
    pdf.pages.forEach((p, i) => expect(p).toContain(`page ${i + 1} / ${pdf.pages.length}`))
  })

  it('écrit proprement les caractères hors de la police standard (pas d’erreur)', async () => {
    const d = sampleData()
    d.notes[0]!.body = 'Émoji 🎉, japonais 日本語, tiret – et guillemets « » ’ “ ”, espace fine !'
    const pdf = await readPdf(await buildEventReportPdf(d))
    const notes = pdf.pages[5]!
    expect(notes).toContain('Émoji')
    expect(notes).toContain('tiret – et guillemets « »')
  })
})

describe('bilan en une page', () => {
  it('tient sur UNE page avec les indicateurs, répartitions, top opportunités et actions', async () => {
    const bytes = await buildBilanPdf(sampleData())
    expect(isPdf(bytes)).toBe(true)
    const pdf = await readPdf(bytes)
    expect(pdf.pages).toHaveLength(1)
    const t = pdf.pages[0]!
    expect(t).toContain('Bilan du salon')
    expect(t).toContain('Tech For Retail 2027')
    expect(t).toContain('4 / 6') // entreprises rencontrées
    expect(t).toContain('5 / 7') // rencontres réalisées / prévues
    expect(t).toContain('rencontres réalisées (71 %)')
    expect(t).toContain('Vu 3')
    expect(t).toContain('À relancer 2')
    expect(t).toContain('Priorité A')
    expect(t).toContain('Top opportunités')
    expect(t).toContain('Carrefour')
    expect(t).toContain('Envoyer le devis')
    expect(t).toContain('Actions de suivi en attente (3)')
    expect(t).toContain('Envoyer le devis détaillé')
    expect(t).toContain('généré avec fair')
    expect(t).toContain('page 1 / 1')
    expect(pdf.images).toBe(1)
  })

  it('reste sur une page même avec des centaines d’entreprises et de rencontres', async () => {
    const d = bigData()
    d.members = Array.from({ length: 30 }, (_, i) => ({
      userId: `u${i + 1}`,
      name: `Commercial ${i + 1}`,
    }))
    d.targets.forEach((t, i) => (t.assigneeIds = [`u${(i % 30) + 1}`]))
    d.meetings.forEach((m, i) => (m.ownerId = `u${(i % 30) + 1}`))
    const pdf = await readPdf(await buildBilanPdf(d))
    expect(pdf.pages).toHaveLength(1)
    expect(pdf.pages[0]).toContain('Bilan du salon')
    expect(pdf.pages[0]).toMatch(/\+ \d+ autres?/) // les listes longues sont tronquées
  })

  it('fonctionne sans aucune donnée', async () => {
    const pdf = await readPdf(
      await buildBilanPdf({
        ...sampleData(false),
        targets: [],
        meetings: [],
        notes: [],
        contacts: [],
        followUps: [],
      }),
    )
    expect(pdf.pages).toHaveLength(1)
    expect(pdf.pages[0]).toContain('Aucune action en attente')
  })
})

describe('mise en page : rien ne dépasse, rien ne se chevauche', () => {
  const W = 595.28
  const H = 841.89

  function check(pages: TextBox[][]) {
    pages.forEach((boxes, p) => {
      for (const b of boxes) {
        expect(b.x, `« ${b.str} » (page ${p + 1}) déborde à gauche`).toBeGreaterThanOrEqual(43)
        expect(b.x + b.w, `« ${b.str} » (page ${p + 1}) déborde à droite`).toBeLessThanOrEqual(
          W - 43,
        )
        expect(b.y, `« ${b.str} » (page ${p + 1}) sort en bas`).toBeGreaterThan(0)
        expect(b.y + b.h, `« ${b.str} » (page ${p + 1}) sort en haut`).toBeLessThan(H)
      }
      // Recouvrement : deux blocs de texte ne doivent pas se superposer (tolérance 1 pt).
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!
          const b = boxes[j]!
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const overlapY = Math.min(a.y + a.h * 0.8, b.y + b.h * 0.8) - Math.max(a.y, b.y)
          expect(
            overlapX > 1 && overlapY > 1,
            `« ${a.str} » et « ${b.str} » se chevauchent (page ${p + 1})`,
          ).toBe(false)
        }
      }
    })
  }

  it('PDF global', async () => check(await readPdfBoxes(await buildEventReportPdf(sampleData()))))
  it('PDF global, gros volume', async () =>
    check((await readPdfBoxes(await buildEventReportPdf(bigData()))).slice(0, 8)))
  it('bilan', async () => check(await readPdfBoxes(await buildBilanPdf(sampleData()))))
  it('bilan, gros volume', async () => check(await readPdfBoxes(await buildBilanPdf(bigData()))))
})

describe('moteur de mise en page', () => {
  it('coupe les mots trop longs et respecte les retours à la ligne', async () => {
    const w = await PdfWriter.create({
      title: 't',
      footerCenter: 'x',
      generatedAt: '2027-01-01T00:00:00Z',
    })
    const lines = w.wrap('a'.repeat(200), 10, 100)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(w.width(l, 10)).toBeLessThanOrEqual(100)
    expect(w.wrap('un\ndeux', 10, 300)).toEqual(['un', 'deux'])
  })

  it('remplace les caractères non pris en charge au lieu de planter', async () => {
    const w = await PdfWriter.create({
      title: 't',
      footerCenter: 'x',
      generatedAt: '2027-01-01T00:00:00Z',
    })
    expect(w.clean('é–“”🎉日')).toBe('é–“”??')
  })
})
