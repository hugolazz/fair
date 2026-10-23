import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS } from './support'

// Colonnes supplémentaires du tableau des participants : décochées par défaut, cochées à volonté (« Modifier les colonnes »).
test('colonnes supplémentaires : décochées par défaut, secteur, pays, historique, contact clé, intérêt…', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId, targetIds, teamId } = await seedEvent('Salon colonnes+', [
    { name: 'Bolt', stand: 'B2' },
    { name: 'Acme', stand: 'A1' },
  ])
  await sql(
    `update companies set industry = 'Retail', country = 'France', city = 'Paris',
       history = 'Client depuis 2023 avec deux démos' where name = 'Bolt'`,
  )
  const [bolt] = await sql<{ id: string }>(`select id from companies where name = 'Bolt'`)
  // Deux contacts : le premier saisi est le contact clé.
  await sql(
    `insert into contacts (id, team_id, company_id, first_name, last_name, job_title, email, phone, linkedin_url)
     values ('00000000-0000-7000-8000-000000000001', $1, $2, 'Ada', 'Lovelace', 'CTO', 'ada@bolt.test', '0102030405', 'linkedin.com/in/ada'),
            ('00000000-0000-7000-8000-000000000002', $1, $2, 'Zoé', 'Autre', 'RH', 'zoe@bolt.test', null, null)`,
    [teamId, bolt!.id],
  )
  const [admin] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.admin,
  ])
  await sql(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, status, interest, recontact)
     values (gen_random_uuid(), $1, $2, $3, $4, now(), 'done', 4, true)`,
    [teamId, eventId, targetIds['Bolt'], admin!.id],
  )

  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  // Par défaut : aucune colonne supplémentaire.
  for (const name of ['Secteur', 'Pays', 'Historique', 'Contact clé', 'Intérêt /5'])
    await expect(page.getByRole('columnheader', { name })).toHaveCount(0)

  await page.getByRole('button', { name: 'Modifier les colonnes' }).click()
  const panel = page.getByRole('dialog', { name: 'Colonnes du tableau' })
  for (const name of [
    'Secteur',
    'Pays',
    'Ville',
    'Site web',
    'Historique',
    'Contacts',
    'Contact clé',
    'Poste du contact clé',
    'E-mail du contact clé',
    'Téléphone du contact clé',
    'LinkedIn du contact clé',
    'Intérêt /5',
    'Statut',
    'À recontacter',
  ])
    await expect(panel.getByRole('checkbox', { name, exact: true })).not.toBeChecked()
  // « Actualité » n'existe que si l'équipe a activé la case optionnelle.
  await expect(panel.getByRole('checkbox', { name: 'Actualité' })).toHaveCount(0)

  for (const name of [
    'Secteur',
    'Pays',
    'Historique',
    'Contact clé',
    'Poste du contact clé',
    'E-mail du contact clé',
    'Intérêt /5',
    'Statut',
    'À recontacter',
  ])
    await panel.getByRole('checkbox', { name, exact: true }).check()
  await page.keyboard.press('Escape')

  const row = page.getByRole('row').filter({ hasText: 'Bolt' })
  await expect(row.getByRole('cell', { name: 'Retail', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'France', exact: true })).toBeVisible()
  // Le premier contact saisi est le contact clé.
  await expect(row.getByRole('cell', { name: 'Ada Lovelace', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'CTO', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'ada@bolt.test', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: '4/5', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'Vu', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: 'Oui', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: /Client depuis 2023 avec deux démos/ })).toBeVisible()
  // Une entreprise sans ces données : cellules vides, sans erreur.
  const acme = page.getByRole('row').filter({ hasText: 'Acme' })
  await expect(acme.getByRole('cell', { name: 'Retail' })).toHaveCount(0)

  // Les colonnes cochées sont mémorisées ; trier sur « Secteur » fonctionne.
  await page.reload()
  await expect(page.getByRole('columnheader', { name: /Secteur/ })).toBeVisible()
  await page.getByRole('button', { name: 'Trier par Secteur' }).click()
  await expect(page.locator('[role="columnheader"][data-col="industry"]')).toHaveAttribute(
    'aria-sort',
    'ascending',
  )
  await expect(page.locator('[role="row"]').nth(1)).toContainText('Bolt') // « Retail » avant les vides

  // « Actualité » apparaît quand l'équipe active la case, sous l'intitulé qu'elle lui donne.
  await sql(`update teams set news_enabled = true, news_label = 'Démo demandée ?'`)
  await page.reload()
  await page.getByRole('button', { name: 'Modifier les colonnes' }).click()
  await expect(
    panel.getByRole('checkbox', { name: 'Démo demandée', exact: true }),
  ).not.toBeChecked()
})

test('Alt + flèches sur la poignée : la colonne change de place au clavier', async ({ page }) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon clavier', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  await page.locator('[data-resize="stand"]').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect
    .poll(() =>
      page
        .locator('[role="columnheader"][data-col]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-col'))),
    )
    .toEqual(['priority', 'stand', 'company', 'tags', 'shows', 'assignees', 'meeting'])
})
