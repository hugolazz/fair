import { expect, test } from '@playwright/test'
import { login, resetBackend, sql, USERS } from './support'

// Lecture hors ligne : après l'ouverture d'un salon en ligne, ses fiches (contacts, notes, historique des entreprises qui
// me sont assignées) sont copiées sur l'appareil. Sans réseau, ou avec un réseau trop lent, on les lit depuis la copie.
async function seed() {
  await resetBackend('team')
  const [team] = await sql<{ id: string }>('select id from teams limit 1')
  const [admin] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.admin,
  ])
  const event = async (name: string, startsOn: string) =>
    (
      await sql<{ id: string }>(
        `insert into events (id, team_id, name, status, starts_on) values (gen_random_uuid(), $1, $2, 'preparing', $3) returning id`,
        [team!.id, name, startsOn],
      )
    )[0]!.id
  const oldEvent = await event('Salon ancien', '2025-03-10')
  const currentEvent = await event('Salon courant', '2027-03-10')

  const company = async (name: string, first: string, last: string) => {
    const [c] = await sql<{ id: string }>(
      `insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), $1, $2, lower($2)) returning id`,
      [team!.id, name],
    )
    await sql(
      `insert into contacts (id, team_id, company_id, first_name, last_name) values (gen_random_uuid(), $1, $2, $3, $4)`,
      [team!.id, c!.id, first, last],
    )
    return c!.id
  }
  const bolt = await company('Bolt', 'Grace', 'Hopper')
  const acme = await company('Acme', 'Ada', 'Lovelace')
  const eventCompany = async (eventId: string, companyId: string) =>
    (
      await sql<{ id: string }>(
        `insert into event_companies (id, team_id, event_id, company_id) values (gen_random_uuid(), $1, $2, $3) returning id`,
        [team!.id, eventId, companyId],
      )
    )[0]!.id
  const boltOld = await eventCompany(oldEvent, bolt)
  const boltNow = await eventCompany(currentEvent, bolt)
  await eventCompany(currentEvent, acme)

  // Bolt m'est assignée (son historique est copié) et a une rencontre au salon précédent, avec une note.
  await sql(
    `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
    [boltNow, admin!.id, currentEvent, team!.id],
  )
  const [meeting] = await sql<{ id: string }>(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status, interest)
     values (gen_random_uuid(), $1, $2, $3, $4, '2025-03-10 10:00', 'done', 4) returning id`,
    [team!.id, oldEvent, boltOld, admin!.id],
  )
  await sql(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at)
     values (gen_random_uuid(), $1, $2, $3, 'Parlé retail media en 2025.', 'typed', now())`,
    [team!.id, meeting!.id, admin!.id],
  )
  return { currentEvent }
}

test('hors ligne : on ouvre les fiches du salon depuis la copie enregistrée sur l’appareil', async ({
  page,
}) => {
  const { currentEvent } = await seed()
  await login(page, USERS.admin)
  await page.goto(`/events/${currentEvent}/participants`)
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  // La copie du salon se prépare en arrière-plan, la bannière le dit.
  await expect(page.getByText(/Prêt pour le hors ligne/)).toBeVisible({ timeout: 20_000 })

  // Plus de réseau : les fiches s'ouvrent, avec leurs contacts, et la bannière dit d'où viennent les données.
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Acme' }).first().click()
  const acme = page.getByRole('dialog', { name: 'Acme' })
  await expect(acme.getByText('Ada Lovelace').first()).toBeVisible()
  await expect(page.getByText(/Données enregistrées le/)).toBeVisible()
  await page.keyboard.press('Escape')

  // Une entreprise qui m'est assignée a aussi son historique des autres salons.
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const bolt = page.getByRole('dialog', { name: 'Bolt' })
  await expect(bolt.getByText('Grace Hopper').first()).toBeVisible()
  await bolt.getByText('Autres salons fair (1)').click()
  await expect(bolt.getByText('Salon ancien')).toBeVisible()
  await expect(bolt.getByText('Parlé retail media en 2025.')).toBeVisible()
  await expect(bolt.getByText(/Intérêt : 4\/5/)).toBeVisible()
})

test('réseau trop lent : la liste s’affiche tout de suite depuis la copie, sans attendre la réponse', async ({
  page,
}) => {
  const { currentEvent } = await seed()
  await login(page, USERS.admin)
  await page.goto(`/events/${currentEvent}/participants`)
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible()
  await expect(page.getByText(/Prêt pour le hors ligne/)).toBeVisible({ timeout: 20_000 })

  // Un réseau de salon qui ne répond pas à la lecture de la liste : elle reste suspendue, la liste vient de la copie.
  const pending: (() => void)[] = []
  await page.route('**/rest/v1/event_companies**', (route) => {
    if (route.request().method() === 'GET') pending.push(() => void route.abort())
    else void route.continue()
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Bolt' }).first()).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: 'Acme' }).first()).toBeVisible()
  pending.forEach((release) => release())
})
