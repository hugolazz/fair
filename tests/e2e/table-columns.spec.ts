import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, seedEvent, settleAnimations, USERS } from './support'

// « Modifier les colonnes » (tableau des participants, bureau) : colonnes visibles et largeur de chacune, mémorisées sur
// l'appareil de la personne.
const trackCount = (page: Page) =>
  page.evaluate(
    () =>
      getComputedStyle(document.querySelector('[role="row"]')!).gridTemplateColumns.split(' ')
        .length,
  )
const headerWidth = async (page: Page, name: string) =>
  (await page.getByRole('columnheader', { name }).boundingBox())!.width

test('choisir les colonnes visibles et leur largeur ; le réglage est mémorisé et se rétablit', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon colonnes', [
    { name: 'Bolt', stand: 'B2' },
    { name: 'Acme', stand: 'A1' },
  ])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: 'Stand' })).toBeVisible()
  expect(await trackCount(page)).toBe(8) // la case de sélection + 7 colonnes
  const original = await headerWidth(page, 'Entreprise')

  const open = () => page.getByRole('button', { name: 'Modifier les colonnes' }).click()
  await open()
  const panel = page.getByRole('dialog', { name: 'Colonnes du tableau' })
  await expect(panel).toBeVisible()
  // « Entreprise » ne se masque pas.
  await expect(panel.getByRole('checkbox', { name: 'Entreprise' })).toBeDisabled()
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])

  // Masquer « Stand » et « RDV » : colonnes et cellules disparaissent.
  await panel.getByRole('checkbox', { name: 'Stand' }).uncheck()
  await panel.getByRole('checkbox', { name: 'RDV' }).uncheck()
  await expect(panel.getByRole('slider', { name: 'Largeur de la colonne Stand' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('columnheader', { name: 'Stand' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'RDV' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Entreprise' })).toBeVisible()
  expect(await trackCount(page)).toBe(6)

  // Élargir « Entreprise » : la colonne grandit.
  const before = await headerWidth(page, 'Entreprise')
  await open()
  const slider = panel.getByRole('slider', { name: 'Largeur de la colonne Entreprise' })
  await slider.fill('250')
  await expect(slider).toHaveAttribute('aria-valuetext', '250 %')
  await page.keyboard.press('Escape')
  expect(await headerWidth(page, 'Entreprise')).toBeGreaterThan(before)

  // Mémorisé sur l'appareil : le réglage survit au rechargement.
  await page.reload()
  await expect(page.getByRole('columnheader', { name: 'Entreprise' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Stand' })).toHaveCount(0)
  expect(await trackCount(page)).toBe(6)
  await open()
  await expect(panel.getByRole('slider', { name: 'Largeur de la colonne Entreprise' })).toHaveValue(
    '250',
  )

  // Rétablir : tout revient, aux largeurs d'origine.
  await panel.getByRole('button', { name: "Rétablir les colonnes d'origine" }).click()
  await expect(panel.getByRole('checkbox', { name: 'Stand' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('columnheader', { name: 'Stand' })).toBeVisible()
  expect(await trackCount(page)).toBe(8)
  expect(Math.abs((await headerWidth(page, 'Entreprise')) - original)).toBeLessThan(2)
})
