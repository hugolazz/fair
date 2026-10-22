import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS } from './support'

// Ouverture sans réseau : le service worker garde l'appli sur l'appareil, la session et l'équipe sont reprises de la copie
// locale. Seul fichier où le service worker est actif (voir playwright.config.ts).
test.use({ serviceWorkers: 'allow' })

const WAITING = /Hors ligne : \d+ modifications? en attente d.envoi\./

/** Ouvre le salon en ligne, attend que la copie soit prête et que le service worker tienne la page. */
async function prepareOnline(page: Page, eventId: string) {
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  await expect(page.locator('[role=status][data-offline-ready=true]')).toBeAttached({
    timeout: 20_000,
  })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
}

test('hors ligne : l’appli se rouvre sans réseau et une note écrite là part au retour de la connexion', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon sans réseau', [{ name: 'Bolt', stand: 'B2' }])
  await prepareOnline(page, eventId)

  await page.context().setOffline(true)
  await page.reload() // démarrage à froid : page, session, équipe et liste viennent de l'appareil
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  await expect(page.getByText(/Données enregistrées le/)).toBeVisible()

  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  await sheet.getByLabel('Note de la rencontre').fill('Écrite après un rechargement hors ligne.')
  await expect(page.getByText(WAITING)).toBeVisible()

  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText('Tout est synchronisé.')).toBeVisible()
  await expect
    .poll(async () =>
      (await sql<{ body: string }>('select body from notes where deleted_at is null')).map(
        (n) => n.body,
      ),
    )
    .toEqual(['Écrite après un rechargement hors ligne.'])
})

test('hors ligne : un jeton expiré ne ferme pas la session (elle se renouvelle au retour du réseau)', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon jeton expiré', [{ name: 'Bolt' }])
  await prepareOnline(page, eventId)

  // Le jeton a expiré pendant la panne : on le périme dans le stockage de l'appareil.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!
    const session = JSON.parse(localStorage.getItem(key)!) as { expires_at: number }
    session.expires_at = Math.floor(Date.now() / 1000) - 3600
    localStorage.setItem(key, JSON.stringify(session))
  })
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toHaveCount(0)

  // Le réseau revient : le jeton se renouvelle et une note écrite entre-temps part.
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  await page
    .getByRole('dialog', { name: 'Bolt' })
    .getByLabel('Note de la rencontre')
    .fill('Après le jeton.')
  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(
      async () =>
        (await sql<{ body: string }>('select body from notes where deleted_at is null')).length,
      { timeout: 45_000 },
    )
    .toBe(1)
  await expect(page.getByRole('heading', { name: 'Connexion' })).toHaveCount(0)
})
