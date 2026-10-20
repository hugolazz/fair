import { expect, test } from '@playwright/test'
import { login, PASSWORD, resetBackend, USERS } from './support'

// Réglages : changer son mot de passe, quitter l'équipe.
test.describe.serial('réglages du compte', () => {
  test.beforeAll(async () => {
    await resetBackend('team')
  })

  test('changer son mot de passe : contrôles, puis confirmation', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Mot de passe' })).toBeVisible()

    const change = page.getByRole('button', { name: 'Changer le mot de passe' })

    // Le mot de passe actuel est exigé.
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('nouveau-mot-de-passe-1')
    await page.getByLabel('Confirmez le mot de passe').fill('nouveau-mot-de-passe-1')
    await change.click()
    await expect(page.getByText('Saisissez votre mot de passe actuel.')).toBeVisible()

    // Un mauvais mot de passe actuel est refusé : rien n'est modifié.
    await page.getByLabel('Mot de passe actuel').fill('pas-le-bon-mot-de-passe')
    await change.click()
    await expect(page.getByText('Le mot de passe actuel est incorrect.')).toBeVisible()

    await page.getByLabel('Mot de passe actuel').fill(PASSWORD)
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('court')
    await page.getByLabel('Confirmez le mot de passe').fill('court')
    await change.click()
    await expect(page.getByText(/au moins 8 caractères/)).toBeVisible()

    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('nouveau-mot-de-passe-1')
    await page.getByLabel('Confirmez le mot de passe').fill('autre-mot-de-passe-22')
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible()

    await page.getByLabel('Confirmez le mot de passe').fill('nouveau-mot-de-passe-1')
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(page.getByText('Mot de passe modifié.')).toBeVisible()
    // Les champs sont vidés après l'enregistrement.
    await expect(page.getByLabel('Nouveau mot de passe', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Mot de passe actuel')).toHaveValue('')
  })

  test('les réglages n’ont plus d’invitation de collègue : on rejoint une équipe par son nom', async ({
    page,
  }) => {
    await login(page, USERS.admin)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Mot de passe' })).toBeVisible()
    await expect(page.getByText('Inviter un collègue')).toHaveCount(0)
    await expect(page.getByRole('button', { name: "Envoyer l'invitation" })).toHaveCount(0)
  })

  test('quitter l’équipe : on peut changer d’avis, puis on est renvoyé vers le choix d’une équipe', async ({
    page,
  }) => {
    await login(page, USERS.marie)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: "Quitter l'équipe" })).toBeVisible()

    // Annuler la confirmation : on reste dans l'équipe.
    page.once('dialog', (d) => void d.dismiss())
    await page.getByRole('button', { name: "Quitter l'équipe" }).click()
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()

    // Confirmer : plus d'équipe, donc l'écran de choix d'une équipe.
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: "Quitter l'équipe" }).click()
    await expect(page.getByRole('heading', { name: 'Rejoignez une équipe' })).toBeVisible()

    // Elle peut rejoindre une équipe de nouveau.
    await page.getByLabel("Nom de l'équipe").fill('équipe e2')
    await page.getByRole('button', { name: "Rejoindre l'équipe Équipe e2e" }).click()
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
  })

  test('un propriétaire seul ferme son équipe en la quittant', async ({ page }) => {
    // « Utiliser sans équipe » : équipe à une personne dont on est propriétaire.
    await page.goto('/signup')
    await page.getByLabel('Prénom').fill('Théo')
    await page.getByLabel('Adresse e-mail').fill('theo@fair.test')
    await page.getByLabel('Mot de passe').fill('e2e-password-1')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await page.getByRole('button', { name: 'Utiliser sans équipe' }).click()
    await page.goto('/settings')
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: "Quitter l'équipe" }).click()
    await expect(page.getByRole('heading', { name: 'Rejoignez une équipe' })).toBeVisible()
    // L'équipe fermée n'apparaît plus dans la recherche.
    await page.getByLabel("Nom de l'équipe").fill('Équipe de Théo')
    await expect(page.getByText('Aucune équipe ne porte ce nom.')).toBeVisible()
  })
})
