import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS, settleAnimations } from './support'

// Écritures hors ligne : sans réseau, la note et les cases sont gardées sur l'appareil (file d'attente) et partent toutes
// seules au retour de la connexion. La bannière dit « Hors ligne : N modifications en attente d'envoi ».
const WAITING = /Hors ligne : \d+ modifications? en attente d.envoi\./

const liveMeetings = async () =>
  (await sql('select id from meetings where deleted_at is null')).length
const liveNotes = () => sql<{ body: string }>('select body from notes where deleted_at is null')

/** « Revenir en ligne » comme le ferait le navigateur : l'événement déclenche l'envoi tout de suite. */
const backOnline = async (page: Page) => {
  await page.context().setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
}

async function openSheet(page: Page, name: string, eventId: string) {
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name }).first().click()
  return page.getByRole('dialog', { name })
}

test('hors ligne : la note est gardée sur l’appareil, puis part toute seule au retour du réseau', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon hors ligne', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  const sheet = await openSheet(page, 'Bolt', eventId)
  const field = sheet.getByLabel('Note de la rencontre')
  await expect(field).toBeEditable()

  await page.context().setOffline(true)
  await field.fill('Note prise sans réseau.')

  // La note est sur l'appareil, la bannière le dit, la base n'a encore rien reçu.
  await expect(page.getByText(WAITING)).toBeVisible()
  await expect(sheet.getByText("Note gardée sur l'appareil, en attente d'envoi.")).toBeVisible()
  expect(await liveNotes()).toEqual([])
  expect(await liveMeetings()).toBe(0)
  // La bannière est accessible (contraste, rôle) pendant qu'elle est affichée.
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
  // Le champ reste utilisable : on peut continuer à écrire.
  await field.pressSequentially(' Suite.')
  await expect(page.getByText(WAITING)).toBeVisible()

  // Retour du réseau : tout part, une seule note, la rencontre est créée et terminée.
  await backOnline(page)
  await expect(page.locator('[role=status][data-pending="0"]')).toBeAttached()
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  expect((await liveNotes()).map((n) => n.body)).toEqual(['Note prise sans réseau. Suite.'])
  expect(
    await sql<{ status: string }>('select status from meetings where deleted_at is null'),
  ).toEqual([{ status: 'done' }])
})

test('hors ligne : les cases et l’intérêt passent aussi par la file ; tout retirer avant l’envoi n’envoie rien', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon hors ligne 2', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  const sheet = await openSheet(page, 'Bolt', eventId)
  const interest = sheet
    .getByRole('group', { name: 'Intérêt (sur 5)' })
    .getByRole('button', { name: '3 sur 5' })

  await page.context().setOffline(true)
  await interest.click()
  await sheet.getByLabel('À recontacter après le salon').check()
  await expect(page.getByText(WAITING)).toBeVisible()
  expect(await liveMeetings()).toBe(0)

  // Tout retirer avant que rien ne soit parti : la rencontre n'a jamais existé côté serveur, la file se vide.
  await interest.click()
  await sheet.getByLabel('À recontacter après le salon').uncheck()
  await expect(page.getByText(WAITING)).toHaveCount(0)
  await backOnline(page)
  await page.waitForTimeout(500)
  expect(await liveMeetings()).toBe(0)

  // Ce qui reste est bien envoyé : intérêt et case, sur une rencontre créée et terminée.
  await page.context().setOffline(true)
  await interest.click()
  await sheet.getByLabel('Actualité ?').count() // (option non activée : la case n'existe pas)
  await expect(page.getByText(WAITING)).toBeVisible()
  await backOnline(page)
  await expect(page.locator('[role=status][data-pending="0"]')).toBeAttached()
  expect(
    await sql<{ interest: number; status: string }>(
      'select interest, status from meetings where deleted_at is null',
    ),
  ).toEqual([{ interest: 3, status: 'done' }])
})

test('les modifications en attente survivent à un rechargement de la page, et partent ensuite', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon rechargement', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  // Une première visite crée les tags par défaut (une écriture) : on la fait avant de couper les écritures.
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  // Lecture permise, écriture coupée : comme un réseau de salon qui lâche juste au moment d'envoyer.
  await page.route('**/rest/v1/**', (route) =>
    ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort(),
  )
  const sheet = await openSheet(page, 'Bolt', eventId)
  await sheet.getByLabel('Note de la rencontre').fill('Note avant rechargement.')
  await expect(page.getByText(WAITING)).toBeVisible()
  expect(await liveNotes()).toEqual([])

  // iOS recharge parfois la page : la file est relue depuis l'appareil, et la rencontre reste visible dans la liste.
  await page.reload()
  await expect(page.getByText(WAITING)).toBeVisible()
  await expect(page.getByRole('row', { name: /Bolt/ })).toContainText(/\d{2}:\d{2}/)
  expect(await liveNotes()).toEqual([])

  await page.unroute('**/rest/v1/**')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('[role=status][data-pending="0"]')).toBeAttached()
  expect((await liveNotes()).map((n) => n.body)).toEqual(['Note avant rechargement.'])
})

test('une note écrite sans avoir pu lire l’existante reprend celle qui existe : jamais deux notes', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId, teamId, targetIds } = await seedEvent('Salon doublon', [
    { name: 'Bolt', stand: 'B2' },
  ])
  const [admin] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.admin,
  ])
  const [meeting] = await sql<{ id: string }>(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status)
     values (gen_random_uuid(), $1, $2, $3, $4, now(), 'done') returning id`,
    [teamId, eventId, targetIds['Bolt'], admin!.id],
  )
  await sql(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at)
     values (gen_random_uuid(), $1, $2, $3, 'Note déjà enregistrée.', 'typed', now())`,
    [teamId, meeting!.id, admin!.id],
  )

  await login(page, USERS.admin)
  // La lecture des notes échoue (réseau capricieux) : le champ est vide mais utilisable.
  await page.route('**/rest/v1/notes**', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  )
  const sheet = await openSheet(page, 'Bolt', eventId)
  const field = sheet.getByLabel('Note de la rencontre')
  await expect(field).toBeEditable()
  await expect(field).toHaveValue('')
  await field.fill('Nouveau texte.')
  // L'envoi a besoin de lire l'existante pour la reprendre : tant que la lecture échoue, la note attend sur l'appareil.
  await expect(sheet.getByText("Note gardée sur l'appareil, en attente d'envoi.")).toBeVisible()
  expect((await liveNotes()).map((n) => n.body)).toEqual(['Note déjà enregistrée.'])

  // Le réseau redevient normal : l'existante est reprise et mise à jour, une seule note en base.
  await page.unroute('**/rest/v1/notes**')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('[role=status][data-pending="0"]')).toBeAttached()
  expect((await liveNotes()).map((n) => n.body)).toEqual(['Nouveau texte.'])
})
