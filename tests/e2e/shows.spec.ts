import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, openEdit, resetBackend, seedEvent, USERS } from './support'

// Pastilles « salons » : les colonnes de salons du fichier d'import (une croix = présent ou à venir) deviennent des
// pastilles de couleur sur la fiche de l'entreprise et dans le tableau, avec un filtre. Les dates des salons sont
// éloignées (2020, 2099) pour que « passé » et « à venir » ne changent jamais avec l'horloge.
const CSV = [
  'Société;Site;Stand;Salon passé 09/20;Salon futur (03/99)',
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
  await expect(group.getByLabel('Salon passé 09/20 (2 entreprise(s) cochée(s))')).toBeChecked()
  await expect(group.getByLabel('Salon futur (03/99) (1 entreprise(s) cochée(s))')).toBeChecked()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: "Confirmer l'import" }).click()
  await expect(page.getByRole('heading', { name: 'Import terminé' })).toBeVisible()
  await page.getByRole('link', { name: 'Valider', exact: true }).click()

  // --- Tableau : pastilles courtes (sans la date), une colonne « Salons » ---
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader', { name: 'Salons' })).toBeVisible()
  const carrefour = page.getByRole('row', { name: /Carrefour/ })
  await expect(carrefour.getByText('Salon passé')).toBeVisible()
  await expect(carrefour.getByText('Salon futur')).toBeVisible()
  await expect(page.getByRole('row', { name: /Fnac/ }).getByText('Salon passé')).toHaveCount(0)

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
  await expect(sheet.getByText('Salon passé 09/20')).toBeVisible()
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
  await salons.getByRole('button', { name: 'Salon passé 09/20' }).click()
  await edit.getByLabel('Ajouter un salon').fill('Salon bonus 01/99')
  await edit.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await expect(salons.getByRole('button', { name: 'Salon bonus 01/99' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(sheet.getByText('Salon bonus 01/99')).toBeVisible()
  await expect(sheet.getByText('Salon passé 09/20')).toHaveCount(0)
})
