import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import { login, openEdit, resetBackend, USERS } from './support'

// Parcours complet d'un admin d'équipe : équipe → salon → import → priorités → rencontre et notes → export Excel.
// fair n'a ni mode hors-ligne ni synchronisation (retirés) : l'étape « noter hors-ligne puis synchroniser » du cahier
// des charges devient « noter, recharger, vérifier que tout est bien enregistré côté serveur ».
test.describe.serial('parcours complet', () => {
  test.beforeAll(async () => {
    await resetBackend('none')
  })

  test('créer l’équipe puis un salon', async ({ page }) => {
    await login(page, USERS.newcomer)
    await expect(page.getByRole('heading', { name: 'Créez votre équipe' })).toBeVisible()
    await page.getByLabel("Nom de l'équipe").fill('Équipe parcours')
    await page.getByRole('button', { name: "Créer l'équipe" }).click()

    await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    await page
      .getByRole('link', { name: 'Nouveau salon' })
      .or(page.getByRole('button', { name: 'Nouveau salon' }))
      .first()
      .click()
    await page.getByLabel('Nom du salon').fill('Tech For Retail 2027')
    await page.getByLabel('Ville').fill('Paris')
    await page.getByLabel('Début').fill('2027-03-10')
    await page.getByLabel('Fin').fill('2027-03-11')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tech For Retail 2027' })).toBeVisible()
  })

  test('importer les participants depuis un CSV', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Importer des participants' }).click()

    await page.locator('input[type=file]').setInputFiles('exemples/participants-50.csv')
    await page.getByRole('button', { name: 'Analyser' }).click()
    await expect(page.getByRole('heading', { name: 'Associez vos colonnes' })).toBeVisible()
    // Les colonnes priorité / type / LinkedIn sont reconnues, et les lignes à plusieurs contacts signalées.
    await expect(page.getByLabel('Priorité (A, B, C)')).toHaveValue(/\d+/)
    await expect(page.getByLabel('Type (client, prospect…)')).toHaveValue(/\d+/)
    await expect(page.getByLabel('LinkedIn du contact')).toHaveValue(/\d+/)
    await expect(page.getByText(/2 ligne\(s\) contiennent plusieurs contacts/)).toBeVisible()
    await page.getByRole('button', { name: "Vérifier avant d'importer" }).click()

    await expect(page.getByRole('heading', { name: "Vérifiez avant d'importer" })).toBeVisible()
    // Les doublons détectés (Carrefour / Carrefour SA) sont fusionnés par défaut ou à décider : on garde le défaut.
    await page.getByRole('button', { name: /^Importer \d+ lignes$/ }).click()
    await expect(page.getByRole('heading', { name: "Rapport d'import" })).toBeVisible()
    await expect(page.getByText('Import terminé')).toBeVisible()
  })

  test('prioriser, s’assigner et préparer une entreprise', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Participants', exact: true }).click()

    await expect(page.getByRole('table')).toBeVisible()
    await page.getByRole('button', { name: 'Carrefour' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Carrefour' })
    await expect(sheet).toBeVisible()
    // « Modifier la fiche » : priorité, historique, assignation au même endroit.
    const edit = await openEdit(page)
    await edit.getByLabel('Ajouter un commercial…').selectOption({ label: 'moi' })
    await expect(edit.getByText('Non assignée')).toHaveCount(0)
    await edit.locator('label', { hasText: /^A$/ }).click()
    await expect(edit.getByRole('radio', { name: 'A', exact: true })).toBeChecked()
    const history = edit.getByLabel("Historique avec l'entreprise")
    await history.fill(`${await history.inputValue()}\nParler retail media`)
    await edit.getByRole('button', { name: 'Enregistrer la fiche' }).click()
    await expect(edit.getByText('Fiche enregistrée.')).toBeVisible()
    await page.keyboard.press('Escape')
    // L'historique complété s'affiche sur la fiche, à la suite du commentaire de l'import.
    await expect(sheet.getByText(/Parler retail media/)).toBeVisible()
    await expect(sheet.getByText(/On a déjà contacté Claire Dubois/)).toBeVisible()
  })

  test('planifier un rendez-vous, rédiger le compte-rendu et ses notes', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Ma liste' }).click()
    await page
      .getByRole('button', { name: /Carrefour/ })
      .first()
      .click()
    const sheet = page.getByRole('dialog', { name: 'Carrefour' })

    // La fiche montre d'emblée le contact clé de l'import, l'historique et le bloc-notes.
    await expect(sheet.getByText('Contact clé')).toBeVisible()
    // L'historique est le commentaire renseigné dans le fichier d'import.
    await expect(
      sheet.getByText(/On a déjà contacté Claire Dubois le 19 janvier 2026/),
    ).toBeVisible()
    await expect(sheet.getByText('Claire Dubois').first()).toBeVisible()
    await expect(sheet.getByRole('heading', { name: 'Notes de la rencontre' })).toBeVisible()

    const edit = await openEdit(page)
    await edit.getByRole('button', { name: 'Planifier un créneau' }).click()
    await edit.getByLabel('Heure').fill('10:30')
    await edit.getByRole('button', { name: 'Enregistrer le créneau' }).click()
    await edit.getByText('Compte-rendu').first().click()
    await edit.getByLabel('Intérêt').selectOption('4')
    await edit.getByLabel('Prochaine étape').fill('Envoyer la démo')
    await edit.getByLabel('Prochaine étape').blur()
    await page.keyboard.press('Escape')

    // Prise de note pendant la rencontre : un champ, un bouton.
    await sheet.getByLabel('Note de la rencontre').fill('Très intéressée par le retail media.')
    await sheet.getByRole('button', { name: 'Enregistrer la note' }).click()
    await expect(sheet.getByText('Très intéressée par le retail media.').first()).toBeVisible()
    await expect(sheet.getByLabel('Note de la rencontre')).toHaveValue('')
    await sheet.getByRole('button', { name: 'Rencontre terminée' }).click()
    await expect(sheet.getByText('Rencontre marquée comme terminée.')).toBeVisible()
  })

  test('une note prise sans rendez-vous planifié crée la rencontre toute seule', async ({
    page,
  }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Participants', exact: true }).click()
    await page.getByRole('button', { name: 'Décathlon' }).first().click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Note de la rencontre').fill('Passé au stand, revenir demain.')
    await sheet.getByRole('button', { name: 'Enregistrer la note' }).click()
    await expect(sheet.getByText('Passé au stand, revenir demain.')).toBeVisible()
  })

  test('plusieurs contacts dans une ligne : contact clé puis autres contacts', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Participants', exact: true }).click()
    await page.getByRole('button', { name: 'Mirakl' }).first().click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Dylan Perrin').first()).toBeVisible()
    await sheet.getByText('Autres contacts (1)').click()
    await expect(sheet.getByText('Sonia Vidal').first()).toBeVisible()
    await expect(sheet.getByRole('link', { name: 'LinkedIn' }).first()).toBeVisible()
  })

  test('modifier la fiche : informations, contact modifié puis supprimé', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Participants', exact: true }).click()
    await page.getByRole('button', { name: 'Mirakl' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Mirakl' })
    const edit = await openEdit(page)

    await edit.getByLabel('Ville').fill('Lyon')
    await edit.getByRole('button', { name: 'Enregistrer la fiche' }).click()
    await expect(edit.getByText('Fiche enregistrée.')).toBeVisible()

    await edit.getByRole('button', { name: 'Modifier le contact Sonia Vidal' }).click()
    const form = edit.getByRole('form', { name: 'Modifier le contact Sonia Vidal' })
    await form.getByLabel('Poste').fill('Directrice Partenariats')
    await form.getByRole('button', { name: 'Enregistrer le contact' }).click()
    await expect(edit.getByText(/Directrice Partenariats/)).toBeVisible()

    await edit.getByRole('button', { name: 'Supprimer le contact Sonia Vidal' }).click()
    await edit.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(edit.getByRole('button', { name: 'Modifier le contact Sonia Vidal' })).toHaveCount(
      0,
    )

    await page.keyboard.press('Escape')
    await expect(sheet.getByText(/Lyon/)).toBeVisible()
    await expect(sheet.getByText(/Autres contacts/)).toHaveCount(0)
  })

  test('ajouter une entreprise et un contact rencontré à la main, à recontacter', async ({
    page,
  }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Participants', exact: true }).click()
    await page.getByRole('button', { name: 'Ajouter une entreprise' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Entreprise', { exact: true }).fill('Startup Manuelle')
    await dialog.getByLabel('Stand').fill('Z42')
    await dialog
      .getByLabel("Historique avec l'entreprise")
      .fill('Contactée par e-mail le 2 février 2026, sans réponse.')
    await dialog.getByLabel('Priorité').selectOption('B')
    await dialog.getByLabel('Prénom').fill('Ada')
    await dialog.getByLabel('Nom', { exact: true }).fill('Lovelace')
    await dialog.getByLabel('E-mail').fill('ada@manuelle.example')
    await dialog.getByLabel('LinkedIn (adresse du profil)').fill('linkedin.com/in/ada-lovelace')
    await dialog.getByRole('button', { name: "Ajouter l'entreprise" }).click()

    // La fiche s'ouvre sur la nouvelle entreprise avec son contact clé.
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('Contact clé')).toBeVisible()
    await expect(sheet.getByText('Ada Lovelace').first()).toBeVisible()
    await expect(sheet.getByText('Contactée par e-mail le 2 février 2026')).toBeVisible()

    // Pendant la rencontre : un autre contact, chaque info dans sa case, et « à recontacter ».
    await sheet.getByRole('button', { name: 'Ajouter un contact' }).click()
    const form = sheet.getByRole('form', { name: 'Nouveau contact' })
    await form.getByLabel('Prénom').fill('Grace')
    await form.getByLabel('Nom', { exact: true }).fill('Hopper')
    await form.getByLabel('Poste').fill('CTO')
    await form.getByLabel('E-mail').fill('grace@manuelle.example')
    await form.getByLabel('Téléphone').fill('06 11 22 33 44')
    await form.getByLabel('LinkedIn (adresse du profil)').fill('https://www.linkedin.com/in/grace')
    await form.getByRole('button', { name: 'Enregistrer le contact' }).click()
    await expect(sheet.getByText('Contact ajouté : Grace Hopper.')).toBeVisible()
    await sheet.getByLabel('Note de la rencontre').fill('Intéressée par une démo.')
    await sheet.getByRole('button', { name: 'Enregistrer la note' }).click()
    await sheet.getByLabel('À recontacter après le salon').check()
    await expect(sheet.getByLabel('À recontacter après le salon')).toBeChecked()
    await expect(sheet.getByText('À recontacter', { exact: true }).first()).toBeVisible()
  })

  test('tout est enregistré côté serveur après rechargement', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Ma liste' }).click()
    await expect(page.getByRole('button', { name: /Carrefour/ }).first()).toBeVisible()
    await page.reload()
    await page
      .getByRole('button', { name: /Carrefour/ })
      .first()
      .click()
    const sheet = page.getByRole('dialog', { name: 'Carrefour' })
    await expect(sheet.getByText('Très intéressée par le retail media.').first()).toBeVisible()
    await expect(sheet.getByText(/Parler retail media/)).toBeVisible()
    const edit = await openEdit(page)
    await edit
      .getByText(/Compte-rendu/)
      .first()
      .click()
    await expect(edit.getByLabel('Prochaine étape')).toHaveValue('Envoyer la démo')
  })

  test('exporter en Excel et relire le fichier', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Exports' }).click()

    await page.getByRole('radio', { name: /Excel/ }).check({ force: true })
    await page.getByLabel('Sur mon ordinateur').check({ force: true })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: "Générer l'export" }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
    const path = await download.path()
    const wb = new ExcelJS.Workbook()
    // Les typings d'ExcelJS attendent l'ancien `Buffer` de @types/node.
    await wb.xlsx.load((await readFile(path)) as unknown as Parameters<typeof wb.xlsx.load>[0])
    expect(wb.worksheets.map((w) => w.name)).toEqual(
      expect.arrayContaining(['Entreprises', 'Contacts', 'Rencontres', 'Notes']),
    )
    const companies = wb.getWorksheet('Entreprises')!
    const names = companies.getColumn(1).values.map((v) => String(v ?? ''))
    expect(names.some((n) => n.includes('Carrefour'))).toBe(true)
    const notes = wb.getWorksheet('Notes')!
    expect(JSON.stringify(notes.getSheetValues())).toContain('Très intéressée par le retail media.')

    // L'entreprise et le contact saisis à la main sont dans l'export, chaque info dans sa colonne, « à recontacter » compris.
    expect(names.some((n) => n.includes('Startup Manuelle'))).toBe(true)
    const contacts = wb.getWorksheet('Contacts')!
    const head = (contacts.getRow(1).values as unknown[]).slice(1).map(String)
    const grace = (contacts.getSheetValues() as unknown[][]).find((r) =>
      r?.includes('grace@manuelle.example'),
    )!
    const cell = (label: string) => String((grace as unknown[])[head.indexOf(label) + 1])
    expect(cell('Prénom')).toBe('Grace')
    expect(cell('Nom')).toBe('Hopper')
    expect(cell('Fonction')).toBe('CTO')
    expect(cell('Téléphone')).toBe('06 11 22 33 44')
    expect(cell('LinkedIn')).toBe('https://www.linkedin.com/in/grace')
    expect(cell('À recontacter')).toBe('Oui')
    const meetings = wb.getWorksheet('Rencontres')!
    expect(JSON.stringify(meetings.getSheetValues())).toContain('Oui')
  })
})
