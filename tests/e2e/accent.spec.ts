import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, logout, resetBackend, settleAnimations, sql, USERS } from './support'

// Couleur d'accentuation de l'équipe (Réglages → Équipe → Couleur de l'équipe) : le vert d'origine par défaut, réglée par
// un admin pour toute l'équipe.
const brand = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-brand-600').trim(),
  )
const teamAccent = async () =>
  (await sql<{ accent_color: string | null }>('select accent_color from teams limit 1'))[0]
    ?.accent_color

const audit = async (page: Page) => {
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
}

test('un admin règle la couleur de toute l’équipe ; un commercial la voit mais ne la change pas', async ({
  page,
}) => {
  await resetBackend('team')
  await login(page, USERS.admin)
  await page.goto('/settings?section=equipe')
  const green = page.getByRole('radio', { name: 'Vert (par défaut)' })
  await expect(green).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: "Revenir au vert d'origine" })).toHaveCount(0)
  expect(await brand(page)).toBe('#0f766e')

  // Appliquée tout de suite, enregistrée pour l'équipe après une courte pause.
  await page.getByRole('radio', { name: 'Violet' }).click()
  expect(await brand(page)).toBe('#6d28d9')
  await expect.poll(teamAccent).toBe('#6d28d9')
  await audit(page)
  await page.reload()
  expect(await brand(page)).toBe('#6d28d9')
  await expect(page.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true')
  expect(
    await page.evaluate(() =>
      document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    ),
  ).toBe('#6d28d9')

  // Un collègue (commercial) voit la couleur de l'équipe, sans pouvoir la changer.
  await logout(page)
  await login(page, USERS.marie)
  await expect.poll(() => brand(page)).toBe('#6d28d9')
  await page.goto('/settings?section=equipe')
  await expect(page.getByRole('heading', { name: "Couleur de l'équipe" })).toHaveCount(0)
  expect(await brand(page)).toBe('#6d28d9')
  await logout(page)

  // Couleur libre trop claire : foncée automatiquement ; retour au vert d'origine.
  await login(page, USERS.admin)
  await page.goto('/settings?section=equipe')
  await page.locator('input[type="color"]').fill('#ffee00')
  await expect(page.getByText('(active)')).toBeVisible()
  expect(await brand(page)).not.toBe('#ffee00')
  await expect.poll(teamAccent).toBe('#ffee00')
  await audit(page)
  await page.getByRole('button', { name: "Revenir au vert d'origine" }).click()
  expect(await brand(page)).toBe('#0f766e')
  await expect.poll(teamAccent).toBeNull()
  await page.reload()
  expect(await brand(page)).toBe('#0f766e')
})
