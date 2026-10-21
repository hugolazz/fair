import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS } from './support'

// Régression : une note et « À recontacter » saisis sur une entreprise sans rencontre créaient la rencontre en base, mais
// l'état local de la page l'oubliait : en rouvrant la fiche, le champ était vide et la case décochée.
test('« À recontacter » marque la rencontre comme terminée, sans bouton : la ligne d’état le dit', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon terminée', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })

  // Plus de boutons « Enregistrer la note » ni « Rencontre terminée » : tout se fait tout seul.
  await expect(sheet.getByRole('button', { name: 'Enregistrer la note' })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Rencontre terminée' })).toHaveCount(0)
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toHaveCount(0)

  // Cocher « à recontacter » termine la rencontre ; avec une autre action (l'intérêt), décocher ne la rouvre pas.
  await sheet.getByLabel('À recontacter après le salon').check()
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toBeVisible()
  await sheet
    .getByRole('group', { name: 'Intérêt (sur 5)' })
    .getByRole('button', { name: '4 sur 5' })
    .click()
  await sheet.getByLabel('À recontacter après le salon').uncheck()
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toBeVisible()

  // Si c'était la seule action, tout retirer supprime la rencontre : plus rien n'est « terminé ».
  await sheet
    .getByRole('group', { name: 'Intérêt (sur 5)' })
    .getByRole('button', { name: '4 sur 5' })
    .click()
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toHaveCount(0)
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
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toBeVisible()

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
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible() // tout seul, sans bouton
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
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toHaveCount(0)
  await news.check()
  await expect(news).toBeChecked()
  // Comme « À recontacter » : cocher « Actualité ? » termine la rencontre.
  await expect(sheet.getByText('Rencontre marquée comme terminée.')).toBeVisible()

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

test('la note s’enregistre toute seule : à la pause, à la fermeture de la fiche, sans jamais doubler la note', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon auto', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const field = sheet.getByLabel('Note de la rencontre')

  // Après une courte pause : « Note enregistrée », et la rencontre est marquée terminée.
  await field.fill('Premier jet.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()

  // Plusieurs frappes rapprochées : un seul texte final, une seule note.
  await field.pressSequentially(' Suite de la discussion', { delay: 20 })
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()

  // Fermer la fiche tout de suite après avoir tapé (avant la pause) : le texte part quand même.
  await field.pressSequentially(' Et la fin.')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const expected = 'Premier jet. Suite de la discussion Et la fin.'
  await expect(sheet.getByLabel('Note de la rencontre')).toHaveValue(expected)

  // Côté serveur : une seule note pour cette rencontre, avec le texte complet.
  await page.reload()
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  await expect(sheet.getByLabel('Note de la rencontre')).toHaveValue(expected)
  const notes = await sql<{ body: string }>('select body from notes where deleted_at is null')
  expect(notes.map((n) => n.body)).toEqual([expected])
})

test('vider le champ supprime la note : elle ne revient pas, et on peut en écrire une nouvelle', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon vidé', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const field = sheet.getByLabel('Note de la rencontre')

  await field.fill('À supprimer.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()

  // Tout effacer : la note est supprimée, y compris en fermant la fiche tout de suite.
  await field.fill('')
  await expect(sheet.getByText('Note supprimée.')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  await expect(sheet.getByLabel('Note de la rencontre')).toHaveValue('')
  expect(await sql('select id from notes where deleted_at is null')).toEqual([])

  // On peut écrire de nouveau : une nouvelle note, une seule.
  await sheet.getByLabel('Note de la rencontre').fill('Nouvelle note.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  const notes = await sql<{ body: string }>('select body from notes where deleted_at is null')
  expect(notes.map((n) => n.body)).toEqual(['Nouvelle note.'])

  // Vider puis fermer aussitôt (avant la pause) : la suppression part quand même.
  await sheet.getByLabel('Note de la rencontre').fill('')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect
    .poll(async () => (await sql('select id from notes where deleted_at is null')).length)
    .toBe(0)
})

// La rencontre est créée toute seule par le bloc-notes (avec la date du moment) ; quand tout est retiré, elle disparaît.
const liveMeetings = async () =>
  (await sql('select id from meetings where deleted_at is null')).length

test('quand tout est retiré, la rencontre créée par le bloc-notes disparaît, et sa date aussi', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId } = await seedEvent('Salon retiré', [{ name: 'Bolt', stand: 'B2' }])
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  const row = page.getByRole('row', { name: /Bolt/ })
  const open = () => page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const field = sheet.getByLabel('Note de la rencontre')
  const hour = /\d{2}:\d{2}/

  // Une note crée la rencontre : sa date apparaît dans la liste.
  await open()
  await field.fill('Passé au stand.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row).toContainText(hour)
  expect(await liveMeetings()).toBe(1)

  // Tout effacer : la rencontre et sa date disparaissent.
  await open()
  await field.fill('')
  await expect(sheet.getByText('Note supprimée.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row).not.toContainText(hour)
  await expect.poll(liveMeetings).toBe(0)

  // Plusieurs actions : la rencontre reste tant qu'il en reste une, et disparaît avec la dernière.
  await open()
  await sheet
    .getByRole('group', { name: 'Intérêt (sur 5)' })
    .getByRole('button', { name: '3 sur 5' })
    .click()
  await sheet.getByLabel('À recontacter après le salon').check()
  await field.fill('Une note.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  expect(await liveMeetings()).toBe(1)

  await field.fill('')
  await expect(sheet.getByText('Note supprimée.')).toBeVisible()
  expect(await liveMeetings()).toBe(1) // il reste l'intérêt et « à recontacter »
  await sheet
    .getByRole('group', { name: 'Intérêt (sur 5)' })
    .getByRole('button', { name: '3 sur 5' })
    .click()
  await expect.poll(liveMeetings).toBe(1) // il reste « à recontacter »
  await sheet.getByLabel('À recontacter après le salon').uncheck()
  await expect.poll(liveMeetings).toBe(0)
  await page.keyboard.press('Escape')
  await expect(row).not.toContainText(hour)

  // On peut recommencer : une nouvelle rencontre se crée, une seule.
  await open()
  await field.fill('Retour.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  expect(await liveMeetings()).toBe(1)
})

test('un rendez-vous planifié à la main n’est jamais supprimé quand on vide le bloc-notes', async ({
  page,
}) => {
  await resetBackend('team')
  const { eventId, teamId, targetIds } = await seedEvent('Salon planifié', [
    { name: 'Bolt', stand: 'B2' },
  ])
  const [admin] = await sql<{ id: string }>('select id from auth.users where email = $1', [
    USERS.admin,
  ])
  await sql(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, planned_at, planned_duration_min, reminder_minutes, status)
     values (gen_random_uuid(), $1, $2, $3, $4, now() + interval '2 days', 30, 15, 'to_see')`,
    [teamId, eventId, targetIds['Bolt'], admin!.id],
  )
  await login(page, USERS.admin)
  await page.goto(`/events/${eventId}/participants`)
  await page.getByRole('button', { name: 'Bolt' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Bolt' })
  const field = sheet.getByLabel('Note de la rencontre')

  await field.fill('Note sur le rendez-vous.')
  await expect(sheet.getByText('Note enregistrée.')).toBeVisible()
  await field.fill('')
  await expect(sheet.getByText('Note supprimée.')).toBeVisible()
  expect(await liveMeetings()).toBe(1) // le rendez-vous planifié reste
})
