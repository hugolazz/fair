import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, USERS } from './support'

// Régression : une note et « À recontacter » saisis sur une entreprise sans rencontre créaient la rencontre en base, mais
// l'état local de la page l'oubliait : en rouvrant la fiche, le champ était vide et la case décochée.
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
