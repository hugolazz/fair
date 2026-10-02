// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/lib/i18n'

const requestServerExport = vi.hoisted(() => vi.fn())
vi.mock('@/db/repositories/exports', async () => {
  const { sampleData: data } = await import('../../../tests/exports/fixtures')
  class ServerExportError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  }
  return { loadExportData: async () => data(), requestServerExport, ServerExportError }
})

import BilanPage from './bilan-page'
import ExportsPage from './exports-page'

// Le chargement paresseux d'ExcelJS / pdf-lib est lent quand toute la suite tourne en parallèle.
configure({ asyncUtilTimeout: 15_000 })

const event = { id: 'e1', name: 'Tech For Retail 2027' }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Outlet context={{ event, reload: () => {} }} />}>
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/bilan" element={<BilanPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

/** Fichiers « téléchargés » : on capte le Blob donné à URL.createObjectURL au clic sur le lien. */
let downloads: { name: string; blob: Blob }[] = []

beforeEach(() => {
  downloads = []
  let last: Blob | null = null
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: (b: Blob) => ((last = b), 'blob:test'),
      revokeObjectURL: () => {},
    }),
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download && last) downloads.push({ name: this.download, blob: last })
  })
  requestServerExport.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

describe('écran Exports', () => {
  it('Excel : filtre par priorité, désélectionne des colonnes, télécharge un .xlsx au bon contenu', async () => {
    const user = userEvent.setup()
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })

    // Le compteur suit les filtres.
    expect(await screen.findByText(/6 entreprise\(s\) · 8 rencontre\(s\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Priorité A' }))
    expect(
      screen.getByText(/2 entreprise\(s\) · 3 rencontre\(s\) · 2 contact\(s\) · 2 note\(s\)/),
    ).toBeInTheDocument()

    // Colonnes : on retire « Secteur » de l'onglet Entreprises.
    const companies = screen.getByRole('group', { name: 'Entreprises' })
    await user.click(within(companies).getByRole('checkbox', { name: 'Secteur' }))

    await user.click(screen.getByRole('button', { name: /Générer l'export/ }))
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 20_000 })

    expect(downloads[0]!.name).toBe('fair-tech-for-retail-2027-export-2027-05-20.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await bytesOf(downloads[0]!.blob)) as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Entreprises')!
    const headers = (ws.getRow(1).values as unknown[]).slice(1)
    expect(headers).not.toContain('Secteur')
    expect(headers).toContain('Entreprise')
    expect(ws.getColumn(1).values.slice(2)).toEqual(['Amazon France', 'Carrefour']) // seulement la priorité A
    expect(
      await screen.findByText(/Fichier téléchargé : fair-tech-for-retail-2027-export/),
    ).toBeInTheDocument()
  })

  it('CSV : modèle HubSpot par défaut, aperçu du mapping, contenu du fichier', async () => {
    const user = userEvent.setup()
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })
    await user.click(screen.getByRole('radio', { name: /CSV pour CRM/ }))

    const table = screen.getByRole('table', { name: /HubSpot/ })
    expect(within(table).getByText('Lead Status')).toBeInTheDocument()
    expect(within(table).getByText(/Statut de la rencontre|Rencontre : statut/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Générer l'export/ }))
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 20_000 })
    expect(downloads[0]!.name).toBe('fair-tech-for-retail-2027-hubspot-contacts-2027-05-20.csv')
    const text = new TextDecoder().decode(await bytesOf(downloads[0]!.blob))
    const rows = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    }).data
    expect(rows.map((r) => r['Email'])).toEqual([
      'jean.martin@carrefour.com',
      'alice@decathlon.com',
      'm@zalando.com',
    ])
  })

  it('CSV : un modèle personnalisé (dupliqué puis modifié) est utilisé et mémorisé', async () => {
    const user = userEvent.setup()
    localStorage.clear()
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })
    await user.click(screen.getByRole('radio', { name: /CSV pour CRM/ }))
    await user.click(screen.getByRole('button', { name: /Dupliquer pour le modifier/ }))

    // L'éditeur apparaît : on renomme la première colonne.
    const header = screen.getAllByRole('textbox', { name: 'Colonne du CSV' })[0]!
    await user.clear(header)
    await user.type(header, 'Prénom du contact')

    await user.click(screen.getByRole('button', { name: /Générer l'export/ }))
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 20_000 })
    const text = new TextDecoder().decode(await bytesOf(downloads[0]!.blob))
    expect(text.split('\r\n')[0]!.startsWith('Prénom du contact,Last Name')).toBe(true)
    expect(localStorage.getItem('fair.csvTemplates.v1')).toContain('Prénom du contact')
  })

  it('PDF par commercial : une archive ZIP', async () => {
    const user = userEvent.setup()
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })
    await user.click(screen.getByRole('radio', { name: /PDF de compte-rendu/ }))
    await user.click(screen.getByRole('radio', { name: /Un PDF par commercial/ }))
    await user.click(screen.getByRole('button', { name: /Générer l'export/ }))
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 15_000 })
    expect(downloads[0]!.name).toMatch(/par-commercial.*\.zip$/)
    expect(Array.from((await bytesOf(downloads[0]!.blob)).slice(0, 2))).toEqual([0x50, 0x4b])
  }, 30_000)

  it('génération côté serveur : affiche le lien de téléchargement et son échéance', async () => {
    const user = userEvent.setup()
    requestServerExport.mockResolvedValue({
      url: 'https://exemple.test/signed/export.xlsx',
      filename: 'fair-export.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: 2_500_000,
      expiresAt: '2027-05-20T10:00:00.000Z',
    })
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })
    await user.click(screen.getByRole('radio', { name: /Sur le serveur/ }))
    await user.click(screen.getByRole('button', { name: /Générer l'export/ }))

    const link = await screen.findByRole('link', { name: /Télécharger le fichier/ })
    expect(link).toHaveAttribute('href', 'https://exemple.test/signed/export.xlsx')
    expect(screen.getByText(/Fichier prêt : fair-export.xlsx \(2,4 Mo\)/)).toBeInTheDocument()
    expect(screen.getByText(/valable jusqu'à/)).toBeInTheDocument()
    expect(requestServerExport).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ kind: 'xlsx' }),
    )
    expect(downloads).toHaveLength(0) // rien n'est généré dans le navigateur
  })

  it('serveur indisponible en mode automatique volontaire : message clair, pas de fichier', async () => {
    const user = userEvent.setup()
    const { ServerExportError } = await import('@/db/repositories/exports')
    requestServerExport.mockRejectedValue(new ServerExportError('unavailable'))
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })
    await user.click(screen.getByRole('radio', { name: /Sur le serveur/ }))
    await user.click(screen.getByRole('button', { name: /Générer l'export/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/pas disponible/)
    expect(downloads).toHaveLength(0)
  })

  it('aucune entreprise ne correspond : génération impossible, explication', async () => {
    const user = userEvent.setup()
    renderAt('/exports')
    await screen.findByRole('heading', { name: 'Exports' })
    await user.click(screen.getByRole('checkbox', { name: 'Prospect' }))
    await user.click(screen.getByRole('checkbox', { name: 'Priorité A' })) // Prospect ∩ priorité A = rien
    expect(screen.getByRole('button', { name: /Générer l'export/ })).toBeDisabled()
    expect(screen.getByText(/Aucune entreprise ne correspond/)).toBeInTheDocument()
  })
})

describe('écran Bilan', () => {
  it('affiche les indicateurs, répartitions, top opportunités et actions en attente', async () => {
    renderAt('/bilan')
    await screen.findByRole('heading', { name: 'Bilan du salon' })
    expect(screen.getByText('4 / 6')).toBeInTheDocument()
    expect(screen.getByText(/rencontres réalisées \/ prévues \(71 %\)/)).toBeInTheDocument()
    expect(screen.getByText('5 / 7')).toBeInTheDocument()

    const top = screen.getByRole('heading', { name: 'Top opportunités' }).closest('section')!
    expect(within(top).getAllByRole('listitem')[0]).toHaveTextContent('Carrefour')
    expect(within(top).getAllByRole('listitem')[0]).toHaveTextContent('5 / 5')

    const pending = screen
      .getByRole('heading', { name: /Actions de suivi en attente \(3\)/ })
      .closest('section')!
    expect(pending).toHaveTextContent('Envoyer le devis détaillé')

    const sales = screen.getByRole('heading', { name: 'Par commercial' }).closest('section')!
    expect(within(sales).getByRole('rowheader', { name: 'Marie' })).toBeInTheDocument()
  })

  it('exporte le bilan en PDF d’une page', async () => {
    const user = userEvent.setup()
    renderAt('/bilan')
    await screen.findByRole('heading', { name: 'Bilan du salon' })
    await user.click(screen.getByRole('button', { name: /Exporter en PDF/ }))
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 15_000 })
    expect(downloads[0]!.name).toBe('fair-tech-for-retail-2027-bilan-2027-05-20.pdf')
    const bytes = await bytesOf(downloads[0]!.blob)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const { readPdf } = await import('../../../tests/exports/pdf-text')
    expect((await readPdf(bytes)).pages).toHaveLength(1)
  }, 30_000)
})
