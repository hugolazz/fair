import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, settleAnimations, sql, USERS } from './support'

// Retirer des participants du salon (admins) : sélection par cases, barre d'actions, confirmation, et seconde confirmation
// quand des données (rencontres, notes) ont déjà été saisies.
const liveParticipants = async () =>
  (
    await sql<{ name: string }>(
      `select c.name from event_companies ec join companies c on c.id = ec.company_id
       where ec.deleted_at is null order by c.name`,
    )
  ).map((r) => r.name)

test('l’admin retire des entreprises du salon, avec une seconde confirmation si des données existent', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId, targetIds } = await seedEvent('Salon à nettoyer', [
    { name: 'Acme' },
    { name: 'Bolt' },
    { name: 'Cobalt' },
  ])
  await sql(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status)
     select gen_random_uuid(), team_id, event_id, id, (select id from auth.users where email = $2), now(), 'done'
     from event_companies where id = $1`,
    [targetIds['Bolt'], USERS.admin],
  )
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('button', { name: 'Acme' }).first()).toBeVisible()

  // Une entreprise sans donnée : une seule confirmation.
  await page.getByRole('checkbox', { name: /Acme/ }).check()
  const bar = page.getByRole('toolbar', { name: 'Actions sur la sélection' })
  await bar.getByRole('button', { name: 'Retirer du salon' }).click()
  const first = page.getByRole('dialog', { name: 'Retirer 1 entreprise du salon ?' })
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
  await first.getByRole('button', { name: 'Retirer du salon' }).click()
  await expect(page.getByText('1 entreprise retirée du salon.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Acme' })).toHaveCount(0)
  expect(await liveParticipants()).toEqual(['Bolt', 'Cobalt'])

  // Une entreprise avec une rencontre : « Annuler » à la seconde étape ne retire rien, « Oui » retire tout.
  await page.getByRole('checkbox', { name: /Bolt/ }).check()
  await page.getByRole('checkbox', { name: /Cobalt/ }).check()
  await bar.getByRole('button', { name: 'Retirer du salon' }).click()
  await page
    .getByRole('dialog', { name: 'Retirer 2 entreprises du salon ?' })
    .getByRole('button', { name: 'Retirer du salon' })
    .click()
  const second = page.getByRole('dialog', { name: 'Des données ont déjà été saisies' })
  await expect(second.getByText('Bolt')).toBeVisible()
  await expect(second.getByText('Cobalt')).toHaveCount(0)
  await second.getByRole('button', { name: 'Annuler' }).click()
  expect(await liveParticipants()).toEqual(['Bolt', 'Cobalt'])

  await bar.getByRole('button', { name: 'Retirer du salon' }).click()
  await page
    .getByRole('dialog', { name: 'Retirer 2 entreprises du salon ?' })
    .getByRole('button', { name: 'Retirer du salon' })
    .click()
  await page
    .getByRole('dialog', { name: 'Des données ont déjà été saisies' })
    .getByRole('button', { name: 'Oui, tout supprimer' })
    .click()
  await expect(page.getByText('2 entreprises retirées du salon.')).toBeVisible()
  expect(await liveParticipants()).toEqual([])
  expect(await sql('select id from meetings where deleted_at is null')).toEqual([])
  // Les entreprises, elles, existent toujours.
  expect((await sql('select id from companies where deleted_at is null')).length).toBe(3)
})

test('un commercial n’a pas le bouton « Retirer du salon »', async ({ page }) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon commercial', [{ name: 'Acme' }])
  await login(page, USERS.marie)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('checkbox', { name: /Acme/ }).check()
  await expect(page.getByRole('toolbar', { name: 'Actions sur la sélection' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retirer du salon' })).toHaveCount(0)
})
