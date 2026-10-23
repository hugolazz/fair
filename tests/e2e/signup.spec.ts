import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, resetBackend, settleAnimations } from './support'

// Création de compte : nom d'usage, recherche d'une équipe par son nom, rejoindre / créer / travailler seul.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function signUp(page: Page, first: string, last: string, email: string) {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Créer un compte' }).click()
  await page.getByLabel('Prénom').fill(first)
  await page.getByLabel('Nom', { exact: true }).fill(last)
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('heading', { name: 'Rejoignez une équipe' })).toBeVisible()
}

async function audit(page: Page, label: string) {
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`),
    `${label} : violations d'accessibilité`,
  ).toEqual([])
}

test.describe.serial('création de compte', () => {
  test.beforeAll(async () => {
    await resetBackend('team')
  })

  test('valide les champs avant d’envoyer', async ({ page }) => {
    await page.goto('/signup')
    await audit(page, 'création de compte')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText('Indiquez votre prénom.')).toBeVisible()
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible()
    await expect(page.getByText(/au moins 8 caractères/)).toBeVisible()
  })

  test('rejoindre une équipe trouvée par son nom, sous son nom d’usage', async ({ page }) => {
    await signUp(page, 'Camille', 'Martin', 'camille@fair.test')
    await audit(page, 'choix de l’équipe')

    await page.getByLabel("Nom de l'équipe").fill('zzz inconnue')
    await expect(page.getByText('Aucune équipe ne porte ce nom.')).toBeVisible()
    await page.getByLabel("Nom de l'équipe").fill('équipe e2')
    await expect(page.getByText('3 membres')).toBeVisible()
    await page.getByRole('button', { name: "Rejoindre l'équipe Équipe e2e" }).click()

    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    await expect(page.getByText('Bonjour Camille')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mon compte' })).toHaveText('CM')

    // Le nom d'usage se modifie dans les réglages et remplace l'e-mail partout.
    await page.goto('/settings')
    await expect(page.getByLabel("Nom d'usage (prénom et nom)")).toHaveValue('Camille Martin')
    await page.getByLabel("Nom d'usage (prénom et nom)").fill('Camille Martin-Dupont')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).first().click()
    await expect(page.getByText('Profil enregistré.')).toBeVisible()
    await page.getByRole('tab', { name: 'Équipe' }).click()
    await expect(page.getByText('Camille Martin-Dupont (vous)')).toBeVisible()
  })

  test('utiliser sans équipe crée une équipe à son nom', async ({ page }) => {
    await signUp(page, 'Léa', 'Durand', 'lea@fair.test')
    await page.getByRole('button', { name: 'Utiliser sans équipe' }).click()
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    await page.goto('/settings?section=equipe')
    await expect(page.getByLabel("Nom de l'équipe")).toHaveValue('Équipe de Léa Durand')
  })

  test('créer une équipe, et refuser un compte déjà existant', async ({ page }) => {
    await signUp(page, 'Paul', 'Roux', 'paul.roux@fair.test')
    await page.getByRole('button', { name: 'Créer une équipe' }).click()
    await audit(page, 'création d’équipe')
    await page.getByLabel("Nom de l'équipe").fill('Mon équipe')
    await page.getByRole('button', { name: "Créer l'équipe" }).click()
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()

    await page.getByRole('link', { name: 'Mon compte' }).click()
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await page.goto('/signup')
    await page.getByLabel('Prénom').fill('Paul')
    await page.getByLabel('Adresse e-mail').fill('paul.roux@fair.test')
    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText('Un compte existe déjà avec cette adresse e-mail.')).toBeVisible()
  })
})
