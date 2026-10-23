import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, seedEvent, settleAnimations, USERS } from './support'

// Colonnes du tableau des participants (bureau), « comme dans un tableur » : tirer le bord d'un en-tête pour sa largeur,
// tirer l'en-tête pour changer la colonne de place ; « Modifier les colonnes » pour afficher / masquer. Réglage mémorisé
// sur l'appareil de la personne.
const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!
const header = (page: Page, key: string) => box(page, `[role="columnheader"][data-col="${key}"]`)

/** Tire un point de l'écran vers la droite (ou la gauche), par petits pas comme une vraie main. */
async function drag(page: Page, from: { x: number; y: number }, dx: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (dx * i) / 8, from.y)
  await page.mouse.up()
}

test('tirer le bord d’un en-tête change la largeur ; double-clic ou clavier aussi ; mémorisé', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon colonnes', [
    { name: 'Bolt', stand: 'B2' },
    { name: 'Acme', stand: 'A1' },
  ])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  const original = (await header(page, 'stand')).width

  // Tirer le bord droit de « Stand » vers la droite : la colonne s'élargit d'autant.
  const handle = await box(page, '[data-resize="stand"]')
  await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, 80)
  const wider = (await header(page, 'stand')).width
  expect(wider).toBeGreaterThan(original + 60)
  expect(wider).toBeLessThan(original + 100)

  // Mémorisé sur l'appareil : le réglage survit au rechargement.
  await page.reload()
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  expect(Math.abs((await header(page, 'stand')).width - wider)).toBeLessThan(2)

  // Le clavier, sur la poignée (alternative au glisser) : flèche droite = 16 px de plus.
  await page.locator('[data-resize="stand"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(async () => Math.round((await header(page, 'stand')).width))
    .toBe(Math.round(wider + 16))

  // Double-clic sur le bord : largeur d'origine.
  await page.locator('[data-resize="stand"]').dblclick()
  await expect
    .poll(async () => Math.abs((await header(page, 'stand')).width - original))
    .toBeLessThan(2)
})

test('une colonne ne peut pas faire déborder le tableau', async ({ page }) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon largeur', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  const handle = await box(page, '[data-resize="stand"]')
  await drag(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, 3000)
  const row = await page.locator('[role="row"]').first().boundingBox()
  const last = await header(page, 'meeting')
  expect(last.x + last.width).toBeLessThanOrEqual(row!.x + row!.width + 1)
})

test('tirer un en-tête change la colonne de place, sans trier ; les cellules suivent ; mémorisé', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon ordre', [
    { name: 'Bolt', stand: 'B2' },
    { name: 'Acme', stand: 'A1' },
  ])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  const order = async () =>
    await page
      .locator('[role="columnheader"][data-col]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-col')))
  expect(await order()).toEqual([
    'priority',
    'company',
    'stand',
    'tags',
    'shows',
    'assignees',
    'meeting',
  ])

  // Glisser « Stand » avant « Entreprise » (vers la gauche).
  const stand = await header(page, 'stand')
  const company = await header(page, 'company')
  await drag(
    page,
    { x: stand.x + 12, y: stand.y + stand.height / 2 },
    company.x + 20 - (stand.x + 12),
  )
  await expect
    .poll(order)
    .toEqual(['priority', 'stand', 'company', 'tags', 'shows', 'assignees', 'meeting'])
  // Le glisser n'a pas déclenché le tri : seule « Prio » (tri d'origine) est triée, ni « Stand » ni « Entreprise ».
  await expect(page.locator('[role="columnheader"][data-col="stand"]')).not.toHaveAttribute(
    'aria-sort',
    /.+/,
  )
  await expect(page.locator('[role="columnheader"][data-col="company"]')).not.toHaveAttribute(
    'aria-sort',
    /.+/,
  )
  // Les cellules des lignes suivent l'en-tête : le stand est avant l'entreprise.
  const firstRow = page.getByRole('row').nth(1)
  const cells = await firstRow.getByRole('cell').allInnerTexts()
  expect(cells.findIndex((c) => /^(B2|A1)$/.test(c.trim()))).toBeLessThan(
    cells.findIndex((c) => /^(Bolt|Acme)$/.test(c.trim())),
  )

  // Un simple clic sur l'en-tête trie toujours.
  await page.getByRole('button', { name: 'Trier par Entreprise' }).click()
  await expect(page.locator('[role="columnheader"][data-col="company"]')).toHaveAttribute(
    'aria-sort',
    'ascending',
  )

  await page.reload()
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  expect(await order()).toEqual([
    'priority',
    'stand',
    'company',
    'tags',
    'shows',
    'assignees',
    'meeting',
  ])
})

test('« Modifier les colonnes » : afficher / masquer, monter / descendre, rétablir', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon menu', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await expect(page.getByRole('columnheader', { name: /Stand/ })).toBeVisible()
  const order = async () =>
    await page
      .locator('[role="columnheader"][data-col]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-col')))

  await page.getByRole('button', { name: 'Modifier les colonnes' }).click()
  const panel = page.getByRole('dialog', { name: 'Colonnes du tableau' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: 'Entreprise' })).toBeDisabled() // toujours affichée
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
  // Plus de curseurs de largeur : on règle à la souris sur l'en-tête.
  await expect(panel.getByRole('slider')).toHaveCount(0)

  await panel.getByRole('checkbox', { name: 'Stand' }).uncheck()
  await panel.getByRole('checkbox', { name: 'RDV' }).uncheck()
  await panel.getByRole('button', { name: 'Monter la colonne Assigné à' }).click()
  await page.keyboard.press('Escape')
  await expect.poll(order).toEqual(['priority', 'company', 'tags', 'assignees', 'shows'])

  await page.reload()
  await expect.poll(order).toEqual(['priority', 'company', 'tags', 'assignees', 'shows'])
  await page.getByRole('button', { name: 'Modifier les colonnes' }).click()
  await panel.getByRole('button', { name: "Rétablir les colonnes d'origine" }).click()
  await page.keyboard.press('Escape')
  await expect
    .poll(order)
    .toEqual(['priority', 'company', 'stand', 'tags', 'shows', 'assignees', 'meeting'])
})
