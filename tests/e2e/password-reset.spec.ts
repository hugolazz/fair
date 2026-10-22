import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, USERS, settleAnimations } from './support'

// Mot de passe oublié : demande du lien, puis choix du nouveau mot de passe (session de récupération).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function audit(page: Page, label: string) {
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`),
    `${label} : violations d'accessibilité`,
  ).toEqual([])
}

test.describe.serial('mot de passe oublié', () => {
  test.beforeAll(async () => {
    await resetBackend('team')
  })

  test('demande du lien depuis la connexion, même réponse pour une adresse inconnue', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
    await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible()
    await audit(page, 'mot de passe oublié')

    await page.getByLabel('Adresse e-mail').fill('pas-un-mail')
    await page.getByRole('button', { name: 'Envoyer le lien' }).click()
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible()

    await page.getByLabel('Adresse e-mail').fill('inconnu@fair.test')
    await page.getByRole('button', { name: 'Envoyer le lien' }).click()
    await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible()
    await expect(page.getByText(/Si un compte existe avec cette adresse/)).toBeVisible()
    await page.getByRole('link', { name: 'Retour à la connexion' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('sans session (lien périmé), la page propose d’en demander un autre', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: 'Lien invalide ou expiré' })).toBeVisible()
    await audit(page, 'lien invalide')
    await page.getByRole('link', { name: 'Demander un nouveau lien' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('avec la session de récupération : contrôles, puis nouveau mot de passe enregistré', async ({
    page,
  }) => {
    await login(page, USERS.admin)
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    // Le lien de l'e-mail ouvre une session : /reset-password ne la renvoie pas vers l'appli.
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible()
    await audit(page, 'nouveau mot de passe')

    await page.getByLabel('Nouveau mot de passe').fill('court')
    await page.getByLabel('Confirmez le mot de passe').fill('court')
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(page.getByText(/au moins 8 caractères/).first()).toBeVisible()

    await page.getByLabel('Nouveau mot de passe').fill('nouveau-mot-de-passe-1')
    await page.getByLabel('Confirmez le mot de passe').fill('autre-mot-de-passe-2')
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible()

    await page.getByLabel('Confirmez le mot de passe').fill('nouveau-mot-de-passe-1')
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(page.getByText('Mot de passe modifié. Vous êtes connecté.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
  })
})
