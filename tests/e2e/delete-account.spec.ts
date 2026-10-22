import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, settleAnimations, sql, USERS } from './support'

// Suppression de son compte (Réglages) : confirmation par la saisie de son adresse e-mail ; le compte disparaît de la
// base, les notes saisies restent à l'équipe, sans auteur.
test('un commercial supprime son compte ; ses notes restent à l’équipe', async ({ page }) => {
  await resetBackend('team')
  const { eventId, targetIds } = await seedEvent('Salon compte', [{ name: 'Acme' }])
  const [marie] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.marie,
  ])
  const [team] = await sql<{ id: string }>('select id from teams limit 1')
  const [meeting] = await sql<{ id: string }>(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status)
     values (gen_random_uuid(), $1, $2, $3, $4, now(), 'done') returning id`,
    [team!.id, eventId, targetIds['Acme'], marie!.id],
  )
  await sql(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at)
     values (gen_random_uuid(), $1, $2, $3, 'Compte-rendu de Marie', 'typed', now())`,
    [team!.id, meeting!.id, marie!.id],
  )

  await login(page, USERS.marie)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
  const dialog = page.getByRole('dialog', { name: 'Supprimer définitivement votre compte ?' })
  const confirm = dialog.getByRole('button', { name: 'Supprimer définitivement' })
  await expect(confirm).toBeDisabled()
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])

  // Une autre adresse ne suffit pas ; la bonne débloque le bouton.
  await dialog.getByLabel(/Pour confirmer, saisissez votre adresse e-mail/).fill('autre@fair.test')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Pour confirmer/).fill(USERS.marie)
  await confirm.click()

  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  expect(await sql('select id from auth.users where email = $1', [USERS.marie])).toEqual([])
  expect(await sql('select id from profiles where id = $1', [marie!.id])).toEqual([])
  expect(
    await sql(`select id from notes where body = 'Compte-rendu de Marie' and author_id is null`),
  ).toHaveLength(1)
})
