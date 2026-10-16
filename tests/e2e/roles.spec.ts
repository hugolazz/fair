import { expect, test, type Page } from '@playwright/test'
import { login, logout, resetBackend, seedEvent, sql, USERS } from './support'

async function userId(email: string): Promise<string> {
  const [u] = await sql<{ id: string }>('select id from auth.users where email = $1', [email])
  return u!.id
}

async function openEvent(page: Page, name: string) {
  await page.goto('/events')
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click()
}

test.describe.serial('rôles : admin d’équipe et commercial', () => {
  let eventId = ''
  let targets: Record<string, string> = {}

  test.beforeAll(async () => {
    await resetBackend('team')
    const seeded = await seedEvent('Salon rôles', [
      { name: 'Acme', stand: 'A1' },
      { name: 'Bolt', stand: 'B2' },
      { name: 'Cyan', stand: 'C3' },
    ])
    eventId = seeded.eventId
    targets = seeded.targetIds
  })

  test('un commercial ne crée ni n’importe de salon', async ({ page }) => {
    await login(page, USERS.marie)
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nouveau salon' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Nouveau salon' })).toHaveCount(0)

    await page.goto(`/events/${eventId}/import`)
    await expect(page.getByText("Cette page est réservée aux admins d'équipe.")).toBeVisible()

    await openEvent(page, 'Salon rôles')
    await expect(page.getByRole('link', { name: 'Importer des participants' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Dupliquer comme modèle' })).toHaveCount(0)
  })

  test('un commercial prépare seulement les entreprises qui lui sont assignées', async ({
    page,
  }) => {
    await login(page, USERS.marie)
    await openEvent(page, 'Salon rôles')
    await page.getByRole('link', { name: 'Participants', exact: true }).click()
    await page.getByRole('button', { name: 'Acme' }).first().click()
    const sheet = page.getByRole('dialog')

    await expect(sheet.getByText(/ne vous est pas assignée/)).toBeVisible()
    await expect(sheet.getByRole('radio', { name: 'A', exact: true })).toBeDisabled()
    await expect(sheet.getByLabel('Commentaire de préparation')).toBeDisabled()
    // Il ne peut s'assigner que lui-même.
    const options = await sheet
      .getByLabel('Ajouter un commercial…')
      .locator('option')
      .allTextContents()
    expect(options).toEqual(['Ajouter un commercial…', 'moi'])

    await sheet.getByLabel('Ajouter un commercial…').selectOption({ label: 'moi' })
    await expect(sheet.getByRole('radio', { name: 'A', exact: true })).toBeEnabled()
    await sheet.getByRole('radio', { name: 'A', exact: true }).check({ force: true })
    await expect(sheet.getByRole('radio', { name: 'A', exact: true })).toBeChecked()
  })

  test('un commercial ne règle pas les rôles de l’équipe', async ({ page }) => {
    await login(page, USERS.marie)
    await page.goto('/settings')
    await expect(page.getByRole('combobox', { name: /Rôle de/ })).toHaveCount(0)
  })

  test('la vue équipe montre qui a rencontré quelle entreprise et le risque de doublon', async ({
    page,
  }) => {
    const [marie, paul] = [await userId(USERS.marie), await userId(USERS.paul)]
    const [team] = await sql<{ id: string }>('select id from teams limit 1')
    // Marie a rencontré Bolt ; Paul la vise aussi ; Cyan n'a été vue par personne.
    for (const u of [marie, paul]) {
      await sql(
        `insert into event_company_assignees (event_company_id, user_id, event_id, team_id)
         values ($1, $2, $3, $4) on conflict do nothing`,
        [targets['Bolt'], u, eventId, team!.id],
      )
    }
    await sql(
      `insert into meetings (id, team_id, event_id, event_company_id, owner_id, status, planned_at, next_step)
       values (gen_random_uuid(), $1, $2, $3, $4, 'done', now(), 'Envoyer le devis')`,
      [team!.id, eventId, targets['Bolt'], marie],
    )

    await login(page, USERS.admin)
    await openEvent(page, 'Salon rôles')
    await page.getByRole('link', { name: 'Équipe', exact: true }).click()
    const row = page.getByRole('row', { name: /Bolt/ })
    await expect(row).toContainText('marie')
    await expect(row).toContainText('paul')
    await expect(row).toContainText('Doublon possible')
    await expect(row).toContainText('Envoyer le devis')

    await page.getByRole('button', { name: 'Risque de doublon' }).click()
    await expect(page.getByRole('row', { name: /Acme/ })).toHaveCount(0)
    await expect(page.getByRole('row', { name: /Bolt/ })).toBeVisible()
  })

  test('un admin peut changer le rôle d’un membre', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/settings')
    const select = page.getByRole('combobox', { name: /Rôle de paul/i })
    await select.selectOption('admin')
    await expect(select).toHaveValue('admin')
    await page.reload()
    await expect(page.getByRole('combobox', { name: /Rôle de paul/i })).toHaveValue('admin')
    await logout(page)
  })

  test('un admin duplique un salon comme modèle', async ({ page }) => {
    await login(page, USERS.admin)
    await openEvent(page, 'Salon rôles')
    await page.getByRole('button', { name: 'Dupliquer comme modèle' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nom du nouveau salon').fill('Salon rôles 2028')
    await dialog.getByLabel(/Copier la liste des participants/).check()
    await dialog.getByRole('button', { name: 'Dupliquer le salon' }).click()
    await expect(page.getByRole('heading', { name: 'Salon rôles 2028' })).toBeVisible()

    await page.getByRole('link', { name: 'Participants', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Acme' }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  })
})
