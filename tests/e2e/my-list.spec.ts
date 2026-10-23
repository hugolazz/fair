import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS } from './support'

// « Ma liste » : recherche dans mes cibles, « + » pour ajouter une entreprise qui m'est assignée, et les entreprises déjà
// vues grisées, en bas de la liste.
test('Ma liste : recherche, ajout d’une entreprise, entreprises vues grisées en bas', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId, targetIds, teamId } = await seedEvent('Salon ma liste', [
    { name: 'Alpha', stand: 'A1' },
    { name: 'Bravo', stand: 'B2' },
    { name: 'Charlie', stand: 'C3' },
    { name: 'Delta', stand: 'D4' },
  ])
  const [me] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.marie,
  ])
  const [other] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.paul,
  ])
  for (const name of ['Alpha', 'Bravo', 'Charlie'])
    await sql(
      `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
      [targetIds[name], me!.id, eventId, teamId],
    )
  // Delta est assignée à une collègue : jamais dans ma liste.
  await sql(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
    [targetIds['Delta'], other!.id, eventId, teamId],
  )
  // Alpha, la première par ordre alphabétique, est déjà vue (par moi) : elle doit descendre en bas.
  await sql(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status)
     values (gen_random_uuid(), $1, $2, $3, $4, now(), 'done')`,
    [teamId, eventId, targetIds['Alpha'], me!.id],
  )

  await login(page, USERS.marie)
  await page.goto(`/events/${eventId}/my-list`)
  const names = () =>
    page
      .locator('main ul > li button')
      .evaluateAll((els) => els.map((e) => e.querySelector('span.truncate')?.textContent ?? ''))
  await expect.poll(names).toEqual(['Bravo', 'Charlie', 'Alpha'])
  // L'entreprise vue est grisée et le dit en toutes lettres (jamais la couleur seule).
  const alpha = page.locator('button[data-seen="true"]')
  await expect(alpha).toHaveCount(1)
  await expect(alpha).toContainText('Alpha')
  await expect(alpha).toContainText('Vue')

  // Recherche dans ma liste (nom, stand…), et seulement dans ma liste.
  const search = page.getByRole('searchbox', { name: 'Rechercher dans ma liste' })
  await search.fill('charl')
  await expect.poll(names).toEqual(['Charlie'])
  await search.fill('d4')
  await expect(page.getByText('Aucune entreprise de votre liste ne correspond')).toBeVisible()
  await search.fill('')
  await expect.poll(names).toEqual(['Bravo', 'Charlie', 'Alpha'])

  // « + » : ajouter une entreprise directement assignée à moi, sans case à cocher.
  await page.getByRole('button', { name: 'Ajouter une entreprise' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une entreprise' })
  await expect(dialog.getByLabel("M'assigner cette entreprise")).toHaveCount(0)
  await dialog.getByLabel('Entreprise', { exact: true }).fill('Echo Nouvelle')
  await dialog.getByRole('button', { name: 'Ajouter' }).click()
  await expect(page.getByRole('dialog', { name: 'Echo Nouvelle' })).toBeVisible() // sa fiche s'ouvre
  await page.keyboard.press('Escape')
  await expect.poll(names).toEqual(['Bravo', 'Charlie', 'Echo Nouvelle', 'Alpha'])
  const assigned = await sql<{ n: number }>(
    `select count(*)::int as n from event_company_assignees a join event_companies ec on ec.id = a.event_company_id
     join companies c on c.id = ec.company_id where c.name = 'Echo Nouvelle' and a.user_id = $1 and a.deleted_at is null`,
    [me!.id],
  )
  expect(assigned[0]!.n).toBe(1)
})
