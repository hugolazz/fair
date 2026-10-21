import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, openEdit, resetBackend, seedEvent, sql, USERS } from './support'

// Pastilles « salons » : les colonnes de salons du fichier d'import (une croix = présent ou à venir) deviennent des
// pastilles de couleur sur la fiche de l'entreprise et dans le tableau, avec un filtre. Les dates des salons sont
// éloignées (2020, 2099) pour que « passé » et « à venir » ne changent jamais avec l'horloge.
const CSV = [
  'Société;Site;Stand;Tech For Retail 09/20;Salon futur (03/99)',
  'Carrefour;carrefour.com;B12;x;x',
  'Auchan;auchan.fr;C05;x;',
  'Fnac;fnac.com;D01;;',
].join('\n')

test('les colonnes de salons de l’import deviennent des pastilles, filtrables et modifiables', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon pastilles', [])
  await login(page, USERS.admin)

  // --- Import ---
  await page.goto(`/events/${eventId}/import`)
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'salons.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await page.getByRole('button', { name: 'Importer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Associez vos colonnes' })).toBeVisible()
  // Les deux colonnes de croix sont proposées d'office, avec le nombre d'entreprises cochées.
  const group = page.getByRole('group', { name: 'Colonnes à transformer en pastilles de salons' })
  await expect(group.getByLabel('Tech For Retail 09/20 (2 entreprise(s) cochée(s))')).toBeChecked()
  await expect(group.getByLabel('Salon futur (03/99) (1 entreprise(s) cochée(s))')).toBeChecked()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: "Confirmer l'import" }).click()
  await expect(page.getByRole('heading', { name: 'Import terminé' })).toBeVisible()
  await page.getByRole('link', { name: 'Valider', exact: true }).click()

  // --- Tableau : pastilles courtes (sans la date), une colonne « Salons » ---
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader', { name: 'Salons' })).toBeVisible()
  const carrefour = page.getByRole('row', { name: /Carrefour/ })
  await expect(carrefour.getByText('TFR', { exact: true })).toBeVisible() // « Tech For Retail » abrégé
  await expect(carrefour.getByText('Salon futur', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('row', { name: /Fnac/ }).getByText('TFR', { exact: true }),
  ).toHaveCount(0)
  // Les pastilles restent dans leur colonne : elles ne chevauchent jamais les colonnes voisines.
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll('[data-show-pill]')]
      .filter((pill) => {
        const cell = pill.closest('[role=cell]')!.getBoundingClientRect()
        const r = pill.getBoundingClientRect()
        return r.right > cell.right + 0.5 || r.left < cell.left - 0.5
      })
      .map((pill) => pill.textContent),
  )
  expect(overflowing).toEqual([])

  // --- Filtre par salon ---
  await page.getByRole('button', { name: 'Salon', exact: true }).click()
  await page.getByRole('button', { name: 'Salon futur (03/99)' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('row', { name: /Carrefour/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Auchan/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /Fnac/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Salon · 1/ }).click()
  await page.getByRole('button', { name: 'Effacer' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('row', { name: /Fnac/ })).toBeVisible()

  // --- Fiche : libellés entiers, « était présent » et « sera présent » (aussi pour les lecteurs d'écran) ---
  await page.getByRole('button', { name: 'Carrefour' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Carrefour' })
  await expect(sheet.getByText('Tech For Retail 09/20')).toBeVisible()
  await expect(sheet.getByText('Salon futur (03/99)')).toBeVisible()
  await expect(sheet.getByText('(était présent)')).toBeAttached()
  await expect(sheet.getByText('(sera présent)')).toBeAttached()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 140)}`),
    'fiche avec pastilles',
  ).toEqual([])

  // --- Modifier la fiche : retirer un salon, en ajouter un nouveau (admin) ---
  const edit = await openEdit(page)
  const salons = edit.getByRole('group', { name: "Salons de l'entreprise" })
  await salons.getByRole('button', { name: 'Tech For Retail 09/20' }).click()
  await edit.getByLabel('Ajouter un salon').fill('Salon bonus 01/99')
  await edit.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(salons.getByRole('button', { name: 'Salon bonus 01/99' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(sheet.getByText('Salon bonus 01/99')).toBeVisible()
  await expect(sheet.getByText('Tech For Retail 09/20')).toHaveCount(0)
})

test('un admin choisit l’abréviation d’un salon dans « Modifier la fiche », et peut revenir à l’automatique', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId, teamId, targetIds } = await seedEvent('Salon abréviations', [
    { name: 'Bolt', stand: 'B2' },
  ])
  const [ec] = await sql<{ company_id: string }>(
    'select company_id from event_companies where id = $1',
    [targetIds['Bolt']],
  )
  const [tag] = await sql<{ id: string }>(
    `insert into tags (id, team_id, label, scope, kind, color)
     values (gen_random_uuid(), $1, 'Tech For Retail 03/26', 'company', 'show', '#0f766e') returning id`,
    [teamId],
  )
  await sql(
    `insert into taggings (tag_id, taggable_table, taggable_id, team_id) values ($1, 'companies', $2, $3)`,
    [tag!.id, ec!.company_id, teamId],
  )

  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  const row = page.getByRole('row', { name: /Bolt/ })
  await expect(row.getByText('TFR', { exact: true })).toBeVisible() // abréviation automatique

  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const edit = await openEdit(page)
  await edit.getByText('Abréviations des salons').click()
  const field = edit.getByLabel('Abréviation de Tech For Retail 03/26')
  await expect(field).toHaveAttribute('placeholder', 'TFR') // l’automatique est proposée

  // Une abréviation choisie remplace l’automatique dans la liste, pour toutes les entreprises.
  await field.fill('TFR26')
  await field.press('Enter')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(row.getByText('TFR26', { exact: true })).toBeVisible()
  expect(await sql('select short_label from tags where id = $1', [tag!.id])).toEqual([
    { short_label: 'TFR26' },
  ])

  // Vider le champ : retour à l’abréviation automatique.
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const edit2 = await openEdit(page)
  await edit2.getByText('Abréviations des salons').click()
  const field2 = edit2.getByLabel('Abréviation de Tech For Retail 03/26')
  await expect(field2).toHaveValue('TFR26')
  await field2.fill('')
  await field2.press('Enter')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(row.getByText('TFR', { exact: true })).toBeVisible()
  expect(await sql('select short_label from tags where id = $1', [tag!.id])).toEqual([
    { short_label: null },
  ])
})
