import { expect, test } from '@playwright/test'
import { login, resetBackend, sql, USERS } from './support'

// « Autres salons fair (N) » : pour chaque ancien salon fair où l'entreprise a eu une rencontre, le nom, la date, le contact
// vu, l'intérêt sur 5, « à recontacter », « Actualité » (seulement si l'équipe a activé l'option) et les notes.
test('l’historique des autres salons fair montre l’essentiel, et « Actualité » seulement si l’option est activée', async ({
  page,
}) => {
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

  const [company] = await sql<{ id: string }>(
    `insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), $1, 'Bolt', 'bolt') returning id`,
    [team!.id],
  )
  for (const [e, stand] of [
    [oldEvent, 'A1'],
    [currentEvent, 'B2'],
  ] as const)
    await sql(
      `insert into event_companies (id, team_id, event_id, company_id, stand_label) values (gen_random_uuid(), $1, $2, $3, $4)`,
      [team!.id, e, company!.id, stand],
    )
  const [contact] = await sql<{ id: string }>(
    `insert into contacts (id, team_id, company_id, first_name, last_name) values (gen_random_uuid(), $1, $2, 'Grace', 'Hopper') returning id`,
    [team!.id, company!.id],
  )
  const [oldEc] = await sql<{ id: string }>('select id from event_companies where event_id = $1', [
    oldEvent,
  ])
  const [meeting] = await sql<{ id: string }>(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status, interest, recontact, news, next_step, contact_id)
     values (gen_random_uuid(), $1, $2, $3, $4, '2025-03-10 10:00', 'done', 4, true, true, 'Envoyer le devis', $5) returning id`,
    [team!.id, oldEvent, oldEc!.id, admin!.id, contact!.id],
  )
  await sql(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at)
     values (gen_random_uuid(), $1, $2, $3, 'On a parlé retail media.', 'typed', now())`,
    [team!.id, meeting!.id, admin!.id],
  )

  const openHistory = async () => {
    await page.goto(`/events/${currentEvent}/participants`)
    await page.getByRole('button', { name: 'Bolt' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Bolt' })
    await sheet.getByText('Autres salons fair (1)').click()
    return sheet
  }

  await login(page, USERS.admin)
  let sheet = await openHistory()

  // Le nom et la date du salon, le contact vu, l'intérêt sur 5, « à recontacter » et la note.
  await expect(sheet.getByText('Salon ancien')).toBeVisible()
  await expect(sheet.getByText(/10 mars 2025|10\/03\/2025|mars 2025/i).first()).toBeVisible()
  await expect(sheet.getByText(/Contact vu : Grace Hopper/)).toBeVisible()
  await expect(sheet.getByText(/Intérêt : 4\/5/)).toBeVisible()
  await expect(sheet.getByText('À recontacter', { exact: true }).first()).toBeVisible()
  await expect(sheet.getByText('On a parlé retail media.')).toBeVisible()
  // Le reste n'est plus affiché (prochaine étape, stand, résultat…).
  await expect(sheet.getByText('Envoyer le devis')).toHaveCount(0)
  await expect(sheet.getByText('Prochaine étape')).toHaveCount(0)

  // Équipe sans l'option « Actualité ? » : elle n'apparaît pas, même cochée à l'époque.
  await expect(sheet.getByText('Actualité', { exact: true })).toHaveCount(0)

  // L'équipe active l'option : « Actualité » apparaît.
  await sql('update teams set news_enabled = true where id = $1', [team!.id])
  sheet = await openHistory()
  await expect(sheet.getByText('Actualité', { exact: true })).toBeVisible()
})
