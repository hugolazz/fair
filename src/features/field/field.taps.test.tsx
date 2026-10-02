// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, replaceDbForTests } from '@/db/local/db'
import '@/lib/i18n'
import FieldFiche from './field-fiche'
import FieldHome from './field-home'

/**
 * MESURE : nombre de taps pour les gestes clés du mode terrain, avec les vrais écrans, sur une base
 * locale (aucun réseau). Un « tap » = un clic/toucher ; la frappe au clavier ou la dictée ne compte pas.
 * Le budget fait échouer le test si un geste devient plus long.
 */

class TapUser {
  taps = 0
  readonly user = userEvent.setup()
  async tap(el: Element) {
    this.taps++
    await this.user.click(el)
  }
}

const ctx = { teamId: 't', eventId: 'e1', userId: 'me' }
const results: { geste: string; taps: number; budget: number; ms: number }[] = []

function Layout() {
  return <Outlet context={{ ctx }} />
}

function renderField(path = '/events/e1/field') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/:eventId/field" element={<Layout />}>
          <Route index element={<FieldHome />} />
          <Route path=":targetId" element={<FieldFiche />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

let n = 0
beforeAll(() => {
  // jsdom n'a pas ResizeObserver (utilisé par le fenêtrage des listes).
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

beforeEach(async () => {
  replaceDbForTests(`taps-${++n}`)
  await db.events.put({
    id: 'e1',
    team_id: 't',
    name: 'Tech For Retail',
    starts_on: null,
    ends_on: null,
    city: null,
    deleted_at: null,
  })
  await db.companies.bulkPut([
    {
      id: 'c1',
      team_id: 't',
      name: 'Carrefour',
      name_normalized: 'carrefour',
      domain: null,
      website: null,
      industry: 'Retail',
      city: null,
      country: null,
      deleted_at: null,
    },
    {
      id: 'c2',
      team_id: 't',
      name: 'Décathlon',
      name_normalized: 'decathlon',
      domain: null,
      website: null,
      industry: 'Sport',
      city: null,
      country: null,
      deleted_at: null,
    },
  ])
  await db.event_companies.bulkPut([
    {
      id: 'ec1',
      team_id: 't',
      event_id: 'e1',
      company_id: 'c1',
      stand_label: 'B12',
      priority: 'A',
      objective: null,
      prep_comment: null,
      deleted_at: null,
    },
    {
      id: 'ec2',
      team_id: 't',
      event_id: 'e1',
      company_id: 'c2',
      stand_label: 'B2',
      priority: 'B',
      objective: null,
      prep_comment: null,
      deleted_at: null,
    },
  ])
  await db.tags.put({
    id: 'tag1',
    team_id: 't',
    label: 'Prospect',
    color: '#1d4ed8',
    scope: 'company',
    deleted_at: null,
  })
})

afterEach(cleanup)

afterAll(() => {
  const rows = results.map(
    (r) =>
      `  ${r.geste.padEnd(48)} ${String(r.taps).padStart(2)} tap(s)   (budget ${r.budget})   ${r.ms.toFixed(0)} ms`,
  )
  process.stdout.write(`\n=== Mode terrain : nombre de taps par geste ===\n${rows.join('\n')}\n\n`)
})

async function measure(geste: string, budget: number, run: (u: TapUser) => Promise<void>) {
  const u = new TapUser()
  const t0 = performance.now()
  await run(u)
  results.push({ geste, taps: u.taps, budget, ms: performance.now() - t0 })
  expect(u.taps).toBeLessThanOrEqual(budget)
}

describe('taps pour agir sur le terrain', () => {
  it('écrire une note : 1 tap (ouvrir la fiche), la frappe est enregistrée seule', async () => {
    await measure('Écrire une note (depuis l’accueil)', 1, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('link', { name: /Carrefour/ })) // le champ de note est déjà actif
      expect(await screen.findByRole('textbox', { name: /Note/ })).toHaveFocus()
      await u.user.keyboard('Décideur présent, rappeler mardi')
      await waitFor(async () =>
        expect((await db.notes.toArray()).map((x) => x.body)).toEqual([
          'Décideur présent, rappeler mardi',
        ]),
      )
    })
    // La note est liée à ma rencontre, créée automatiquement, sans aucun bouton « enregistrer ».
    const [note] = await db.notes.toArray()
    const meeting = await db.meetings.get(note!.meeting_id!)
    expect(meeting).toMatchObject({ owner_id: 'me', event_company_id: 'ec1' })
    expect((await db.outbox.toArray()).map((o) => o.table)).toEqual(['meetings', 'notes'])
  })

  it('écrire une note et revenir à la liste : 2 taps', async () => {
    await measure('Écrire une note + revenir à la liste', 2, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('link', { name: /Carrefour/ }))
      await screen.findByRole('textbox', { name: /Note/ })
      await u.user.keyboard('RAS')
      await u.tap(screen.getByRole('button', { name: 'Terminé' }))
      await screen.findByRole('link', { name: /Décathlon/ })
    })
    expect(await db.notes.count()).toBe(1) // enregistrée en quittant l'écran, sans attendre le délai d'auto-enregistrement
  })

  it('changer le statut : 2 taps (ouvrir + statut)', async () => {
    await measure('Statut « Vu » (ouvrir + 1 tap)', 2, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('link', { name: /Carrefour/ }))
      await u.tap(await screen.findByRole('button', { name: 'Vu' }))
      await waitFor(async () => expect((await db.meetings.toArray())[0]?.status).toBe('done'))
    })
  })

  it('note + statut + intérêt : 3 taps', async () => {
    await measure('Note + statut « À relancer » + intérêt 4', 3, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('link', { name: /Carrefour/ }))
      await screen.findByRole('textbox', { name: /Note/ })
      await u.user.keyboard('Veut une démo')
      await u.tap(screen.getByRole('button', { name: 'À relancer' }))
      await u.tap(screen.getByRole('radio', { name: 'Intérêt 4' }))
      await waitFor(async () => {
        expect((await db.meetings.toArray())[0]).toMatchObject({ status: 'follow_up', interest: 4 })
        expect(await db.notes.count()).toBe(1)
      })
    })
    // Une seule rencontre, une seule note : les écritures concurrentes ne créent pas de doublon.
    expect(await db.meetings.count()).toBe(1)
    expect(await db.notes.count()).toBe(1)
  })

  it('poser un tag : 2 taps', async () => {
    await measure('Tag « Prospect » (ouvrir + 1 tap)', 2, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('link', { name: /Carrefour/ }))
      await u.tap(await screen.findByRole('button', { name: 'Prospect' }))
      await waitFor(async () => expect(await db.taggings.count()).toBe(1))
    })
  })

  it('rencontre imprévue : 2 taps (bouton flottant + créer), 3 champs', async () => {
    await measure('Rencontre imprévue (3 champs → fiche ouverte)', 2, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('button', { name: /Imprévue/ }))
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('textbox', { name: 'Entreprise' })).toHaveFocus() // saisie immédiate
      await u.user.keyboard('Nouvelle Startup')
      await u.user.type(within(dialog).getByRole('textbox', { name: 'Contact' }), 'Jean Martin')
      await u.user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Croisé au bar')
      await u.tap(within(dialog).getByRole('button', { name: /Créer et ouvrir/ }))
      expect(await screen.findByRole('heading', { name: 'Nouvelle Startup' })).toBeInTheDocument()
    })
    expect(await db.companies.where('name_normalized').equals('nouvelle startup').count()).toBe(1)
    expect(await db.notes.toArray()).toMatchObject([{ body: 'Croisé au bar' }])
  })

  it('trouver une entreprise par la recherche instantanée : 1 tap pour ouvrir, 0 pour chercher', async () => {
    await measure('Rechercher « deca » puis ouvrir la fiche', 2, async (u) => {
      renderField()
      await u.tap(await screen.findByRole('searchbox')) // focus du champ
      await u.user.keyboard('deca')
      expect(screen.queryByRole('link', { name: /Carrefour/ })).not.toBeInTheDocument()
      await u.tap(await screen.findByRole('link', { name: /Décathlon/ }))
      expect(await screen.findByRole('textbox', { name: /Note/ })).toHaveFocus()
    })
  })
})
