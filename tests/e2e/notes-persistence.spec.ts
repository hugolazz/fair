import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, USERS } from './support'

// Régression : une note et « À recontacter » saisis sur une entreprise sans rencontre créaient la rencontre en base, mais
// l'état local de la page l'oubliait : en rouvrant la fiche, le champ était vide et la case décochée.
test('« À recontacter » marque la rencontre comme terminée ; le bouton « Rencontre terminée » reste visible', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon terminée', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const finish = sheet.getByRole('button', { name: 'Rencontre terminée' })

  // Visible dès le départ, même sans rencontre, et pas encore « terminée ».
  await expect(finish).toBeVisible()
  await expect(finish).toHaveAttribute('aria-pressed', 'false')

  // Cocher « à recontacter » termine la rencontre ; décocher ne la rouvre pas.
  await sheet.getByLabel('À recontacter après le salon').check()
  await expect(finish).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByLabel('À recontacter après le salon').uncheck()
  await expect(finish).toHaveAttribute('aria-pressed', 'true')

  // Le bouton se clique encore : il rouvre la rencontre, puis la termine de nouveau.
  await finish.click()
  await expect(finish).toHaveAttribute('aria-pressed', 'false')
  await finish.click()
  await expect(finish).toHaveAttribute('aria-pressed', 'true')
})

test('l’intérêt se donne d’un appui dans le bloc-notes, se retire en retouchant la note, et reste enregistré', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon intérêt', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const group = sheet.getByRole('group', { name: 'Intérêt (sur 5)' })
  const four = group.getByRole('button', { name: '4 sur 5' })

  // Sans rencontre, un appui crée la rencontre, donne la note et la marque comme terminée.
  await four.click()
  await expect(four).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'Rencontre terminée' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Choisir une autre note remplace la première.
  await group.getByRole('button', { name: '2 sur 5' }).click()
  await expect(four).toHaveAttribute('aria-pressed', 'false')

  // Conservé en fermant puis rouvrant la fiche.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const two = sheet.getByRole('group', { name: 'Intérêt (sur 5)' }).getByRole('button', {
    name: '2 sur 5',
  })
  await expect(two).toHaveAttribute('aria-pressed', 'true')

  // Retoucher la note choisie l'efface.
  await two.click()
  await expect(two).toHaveAttribute('aria-pressed', 'false')
})

test('note et « à recontacter » conservés en fermant puis rouvrant la fiche, et en changeant d’onglet', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon notes', [{ name: 'Acme', stand: 'A1' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Acme' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Acme' })
  await sheet.getByLabel('Note de la rencontre').fill('Intéressée par une démo.')
  await sheet.getByRole('button', { name: 'Enregistrer la note' }).click()
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  await sheet.getByLabel('À recontacter après le salon').check()
  await expect(sheet.getByLabel('À recontacter après le salon')).toBeChecked()

  // Fermer la fiche puis la rouvrir, sans recharger la page.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Acme' }).first().click()
  await expect(sheet.getByLabel('Note de la rencontre')).toHaveValue('Intéressée par une démo.')
  await expect(sheet.getByLabel('À recontacter après le salon')).toBeChecked()

  // Quitter la liste des participants et y revenir.
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Aperçu' }).click()
  await page.getByRole('link', { name: 'Participants', exact: true }).click()
  await page.getByRole('button', { name: 'Acme' }).first().click()
  await expect(sheet.getByLabel('Note de la rencontre')).toHaveValue('Intéressée par une démo.')
  await expect(sheet.getByLabel('À recontacter après le salon')).toBeChecked()
})

test('« Actualité ? » : une case activée dans les réglages de l’équipe, sous « À recontacter »', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon actualité', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  await expect(sheet.getByLabel('À recontacter après le salon')).toBeVisible()
  // Désactivée par défaut : la case n'existe pas.
  await expect(sheet.getByLabel('Actualité ?')).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Un admin l'active dans les réglages.
  await page.goto('/settings')
  await page.getByLabel('Ajouter la case « Actualité ? »').check()
  await expect(page.getByText('Réglage enregistré.')).toBeVisible()

  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const news = sheet.getByLabel('Actualité ?')
  await expect(news).not.toBeChecked() // décochée de base
  const finish = sheet.getByRole('button', { name: 'Rencontre terminée' })
  await expect(finish).toHaveAttribute('aria-pressed', 'false')
  await news.check()
  await expect(news).toBeChecked()
  // Comme « À recontacter » : cocher « Actualité ? » termine la rencontre.
  await expect(finish).toHaveAttribute('aria-pressed', 'true')

  // La réponse est conservée en fermant puis rouvrant la fiche.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  await expect(sheet.getByLabel('Actualité ?')).toBeChecked()

  // Désactivée de nouveau : la case disparaît de la fiche.
  await page.keyboard.press('Escape')
  await page.goto('/settings')
  await page.getByLabel('Ajouter la case « Actualité ? »').uncheck()
  await expect(page.getByText('Réglage enregistré.')).toBeVisible()
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  await expect(sheet.getByLabel('Actualité ?')).toHaveCount(0)
})
