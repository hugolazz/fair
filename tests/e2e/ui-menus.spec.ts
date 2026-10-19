import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, USERS } from './support'

// Menus déroulants et calendriers aux couleurs de l'appli (écran non tactile : les sélecteurs natifs ne servent que sur mobile).
async function openNewEventDialog(page: Page) {
  await login(page, USERS.admin)
  await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
  await page
    .getByRole('link', { name: 'Nouveau salon' })
    .or(page.getByRole('button', { name: 'Nouveau salon' }))
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Nouveau salon' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe.serial('menus et calendriers', () => {
  test.beforeAll(async () => {
    await resetBackend('team')
  })

  test('calendrier : choisir un jour, au clic et au clavier, valeur ISO dans le champ', async ({
    page,
  }) => {
    const dialog = await openNewEventDialog(page)

    // Le 15 du mois prochain, au clic.
    const target = new Date()
    target.setMonth(target.getMonth() + 1, 15)
    const full = new Intl.DateTimeFormat('fr', { dateStyle: 'full' }).format(target)
    const iso = new Intl.DateTimeFormat('sv-SE').format(target) // aaaa-mm-jj
    await dialog.getByRole('button', { name: /Début/ }).click()
    const picker = page.getByRole('dialog', { name: /Début/ })
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: 'Mois suivant' }).click()
    await picker.getByRole('button', { name: full }).click()
    await expect(picker).toHaveCount(0)
    await expect(dialog.getByLabel('Début')).toHaveValue(iso)
    await expect(dialog.getByRole('button', { name: /Début/ })).toContainText(
      String(target.getFullYear()),
    )

    // Au clavier : flèche droite = lendemain, Entrée valide ; la fenêtre du salon reste ouverte.
    await dialog.getByRole('button', { name: /Fin/ }).click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(dialog.getByLabel('Fin')).not.toHaveValue('')
    await expect(dialog).toBeVisible()

    // Le salon n'a plus de champ « Statut » : il est « En préparation » à la création, puis suit les dates.
    await expect(dialog.getByText('Statut')).toHaveCount(0)

    // Liste déroulante aux couleurs de l'appli (Réglages → rôle d'un membre).
    await page.keyboard.press('Escape')
    await page.goto('/settings')
    const role = page.getByRole('button', { name: /^Rôle de paul Commercial/ })
    await role.click()
    await page.getByRole('option', { name: "Admin d'équipe" }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Rôle de paul Admin d'équipe/ })).toBeVisible()
  })

  test('accessibilité : calendrier et liste ouverts (axe)', async ({ page }) => {
    const dialog = await openNewEventDialog(page)
    const audit = async (label: string) => {
      await page.waitForTimeout(600) // fin de l'animation d'ouverture
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`),
        `${label} : violations d'accessibilité`,
      ).toEqual([])
    }
    await dialog.getByRole('button', { name: /Début/ }).click()
    await expect(page.getByRole('dialog', { name: /Début/ })).toBeVisible()
    await audit('calendrier ouvert')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /Début/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.goto('/settings')
    await page.getByRole('button', { name: /^Rôle de marie Commercial/ }).click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await audit('liste ouverte')
  })
})
