import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  login,
  logout,
  openEdit,
  resetBackend,
  seedEvent,
  settleAnimations,
  sql,
  USERS,
} from './support'

// Droits des commerciaux (Réglages → Équipe → « Droits des commerciaux ») : un tableau réservé aux propriétaire et admins ;
// chaque case s'applique à toute l'équipe, côté interface comme côté base.
const stored = async () =>
  (
    await sql<{ p: Record<string, boolean> }>('select member_permissions as p from teams limit 1')
  )[0]!.p

const cell = (right: string) => `Commerciaux : ${right}`

test('un admin règle les droits des commerciaux ; ils sont appliqués à l’interface de l’équipe', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon droits', [{ name: 'Bolt', stand: 'B2' }])

  // Le tableau : une ligne par droit, les droits d'origine cochés (ajouter et modifier des fiches).
  await login(page, USERS.admin)
  await page.goto('/settings?section=equipe')
  await expect(page.getByRole('heading', { name: 'Droits des commerciaux' })).toBeVisible()
  const importRight = page.getByRole('checkbox', {
    name: cell('Importer des participants depuis un fichier'),
  })
  const createRight = page.getByRole('checkbox', { name: cell('Créer et dupliquer un salon') })
  await expect(importRight).not.toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: cell('Ajouter une entreprise à la main') }),
  ).toBeChecked()
  await expect(page.getByRole('button', { name: 'Rétablir les droits par défaut' })).toBeDisabled()
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id} : ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])

  // Un commercial n'a, au départ, ni l'import ni la création de salon.
  await logout(page)
  await login(page, USERS.marie)
  await page.goto(`/events/${eventId}`)
  await expect(page.getByRole('link', { name: 'Importer' })).toHaveCount(0)
  await page.goto(`/events/${eventId}/import`)
  await expect(page.getByText("Vous n'avez pas le droit d'utiliser cette page.")).toBeVisible()
  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Nouveau salon' })).toHaveCount(0)
  // … et il ne voit pas le tableau des droits.
  await page.goto('/settings?section=equipe')
  await expect(page.getByRole('heading', { name: 'Droits des commerciaux' })).toHaveCount(0)
  await logout(page)

  // L'admin accorde l'import et la création de salon.
  await login(page, USERS.admin)
  await page.goto('/settings?section=equipe')
  await importRight.check()
  await expect(page.getByText('Droits enregistrés.')).toBeVisible()
  await createRight.check()
  await expect.poll(async () => (await stored())['create_events']).toBe(true)
  expect((await stored())['import_participants']).toBe(true)
  await expect(page.getByRole('button', { name: 'Rétablir les droits par défaut' })).toBeEnabled()

  // Le commercial voit maintenant l'import et le bouton « Nouveau salon ».
  await logout(page)
  await login(page, USERS.marie)
  await page.goto(`/events/${eventId}`)
  await expect(page.getByRole('link', { name: 'Importer' })).toBeVisible()
  await page.goto(`/events/${eventId}/import`)
  await expect(page.getByText("Vous n'avez pas le droit d'utiliser cette page.")).toHaveCount(0)
  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Nouveau salon' })).toBeVisible()
  await logout(page)

  // Rétablir les droits par défaut ferme tout.
  await login(page, USERS.admin)
  await page.goto('/settings?section=equipe')
  await page.getByRole('button', { name: 'Rétablir les droits par défaut' }).click()
  await expect.poll(async () => (await stored())['create_events']).toBe(false)
  expect((await stored())['import_participants']).toBe(false)
  await expect(importRight).not.toBeChecked()
})

test('sans le droit de modifier les fiches, la fiche d’entreprise est en lecture seule pour un commercial', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon lecture', [{ name: 'Bolt', stand: 'B2' }])
  await sql(
    `update teams set member_permissions = jsonb_set(member_permissions, '{edit_companies}', 'false')`,
  )
  await login(page, USERS.marie)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const edit = await openEdit(page)
  await expect(edit.getByLabel('Entreprise', { exact: true })).toBeDisabled()
  await expect(edit.getByText(/pas le droit de modifier les informations/)).toBeVisible()
  // Le bloc-notes, lui, reste ouvert : chacun tient ses propres notes.
  await page.keyboard.press('Escape')
  await expect(sheet.getByLabel('Note de la rencontre')).toBeEditable()
})
