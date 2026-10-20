import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, resetBackend, sql } from './support'

// Invitation d'un collègue : la personne invitée choisit son mot de passe, puis entre dans l'équipe qui l'invite
// (même si elle avait créé sa propre équipe avant). L'envoi de l'e-mail (fonction `invite-member`) n'est pas simulé ici :
// on pose directement l'invitation et le drapeau « mot de passe à choisir » qu'elle crée.

async function signUp(page: Page, first: string, email: string) {
  await page.goto('/signup')
  await page.getByLabel('Prénom').fill(first)
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('heading', { name: 'Rejoignez une équipe' })).toBeVisible()
}

async function signOutAndIn(page: Page, email: string) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await page.goto('/login')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

const invite = (email: string) =>
  sql(
    `insert into team_invitations (team_id, email, role) select id, $1, 'member' from teams where name = 'Équipe e2e'`,
    [email],
  )

test.describe.serial('invitation', () => {
  test.beforeAll(async () => {
    await resetBackend('team')
  })

  test('une personne invitée choisit son mot de passe avant tout, puis arrive dans l’équipe', async ({
    page,
  }) => {
    await signUp(page, 'Inès', 'ines@fair.test')
    // Ce que la fonction d'invitation crée : une invitation en attente et le drapeau « mot de passe à choisir ».
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await invite('ines@fair.test')
    await sql(
      `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"needs_password": true}'::jsonb where email = 'ines@fair.test'`,
    )

    await page.goto('/login')
    await page.getByLabel('Adresse e-mail').fill('ines@fair.test')
    await page.getByLabel('Mot de passe').fill(PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // Écran d'accueil du mot de passe : on ne peut aller nulle part ailleurs tant qu'il n'est pas choisi.
    await expect(page.getByRole('heading', { name: 'Bienvenue dans fair' })).toBeVisible()
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Bienvenue dans fair' })).toBeVisible()

    await page.getByLabel('Nouveau mot de passe').fill('mot-de-passe-choisi-1')
    await page.getByLabel('Confirmez le mot de passe').fill('mot-de-passe-choisi-1')
    await page.getByRole('button', { name: 'Enregistrer et entrer' }).click()

    // Directement dans l'équipe qui l'a invitée, sans écran de choix d'équipe.
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    await page.goto('/settings')
    await expect(page.getByLabel("Nom de l'équipe").or(page.getByText('Équipe e2e'))).toBeVisible()
    // Le drapeau est retiré : plus de renvoi vers le choix du mot de passe.
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
  })

  test('une personne qui avait sa propre équipe bascule entièrement vers l’équipe qui l’invite', async ({
    page,
  }) => {
    await signUp(page, 'Solène', 'solene@fair.test')
    await page.getByRole('button', { name: 'Utiliser sans équipe' }).click()
    await page.goto('/settings')
    await expect(page.getByLabel("Nom de l'équipe")).toHaveValue('Équipe de Solène')

    // Une invitation arrive : à la prochaine connexion, l'équipe qui invite remplace la sienne.
    await invite('solene@fair.test')
    await signOutAndIn(page, 'solene@fair.test')
    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    await page.goto('/settings')
    await expect(page.getByText('Équipe e2e').first()).toBeVisible()
    await expect(page.getByLabel("Nom de l'équipe")).toHaveCount(0) // simple membre : pas de renommage
  })
})
