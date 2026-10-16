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

  test('exporter le fichier enrichi en Excel, CSV et PDF', async ({ page }) => {
    await login(page, USERS.newcomer)
    await page
      .getByRole('link', { name: /Tech For Retail 2027/ })
      .first()
      .click()
    await page.getByRole('link', { name: 'Exports' }).click()

    // Trois formats, aucun filtre ni réglage.
    await expect(page.getByRole('radio')).toHaveCount(3)
    await expect(page.getByText(/Filtres|Colonnes|Modèle/)).toHaveCount(0)

    const download = async () => {
      const [d] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Télécharger' }).click(),
      ])
      return d
    }

    // Excel : un onglet « Salon », une ligne par contact, le fichier d'import enrichi.
    await page.getByRole('radio', { name: /^Excel/ }).check({ force: true })
    const xlsx = await download()
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    // Les typings d'ExcelJS attendent l'ancien `Buffer` de @types/node.
    await wb.xlsx.load(
      (await readFile(await xlsx.path())) as unknown as Parameters<typeof wb.xlsx.load>[0],
    )
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Salon'])
    const ws = wb.getWorksheet('Salon')!
    const head = (ws.getRow(1).values as unknown[]).slice(1).map(String)
    expect(head.slice(0, 14)).toEqual([
      'Société',
      'Site web',
      'Stand',
      'Secteur',
      'Pays',
      'Ville',
      'Priorité',
      'Type',
      'Contact',
      'Fonction',
      'E-mail',
      'Téléphone',
      'LinkedIn',
      'Commentaire',
    ])
    const rows = (ws.getSheetValues() as unknown[][]).slice(2)
    const cell = (row: unknown[], label: string) => String(row[head.indexOf(label) + 1] ?? '')
    const find = (pred: (r: unknown[]) => boolean) => rows.find((r) => r && pred(r))!

    // Carrefour : données d'import, historique (CSV puis ajout), rencontre et notes du salon.
    const carrefour = find((r) => cell(r, 'Société') === 'Carrefour')
    expect(cell(carrefour, 'Priorité')).toBe('A')
    expect(cell(carrefour, 'Type')).toBe('Client')
    expect(cell(carrefour, 'Commentaire')).toContain(
      'On a déjà contacté Claire Dubois le 19 janvier 2026',
    )
    expect(cell(carrefour, 'Commentaire')).toContain('Parler retail media')
    expect(cell(carrefour, 'Statut de la rencontre')).toBe('Vu')
    expect(cell(carrefour, 'Intérêt (1-5)')).toBe('4')
    expect(cell(carrefour, 'Prochaine étape')).toBe('Envoyer la démo')
    expect(cell(carrefour, 'Notes du salon')).toContain('Très intéressée par le retail media.')

    // Entreprise et contact saisis à la main : chaque info dans sa colonne, « à recontacter » compris.
    const grace = find((r) => cell(r, 'E-mail') === 'grace@manuelle.example')
    expect(cell(grace, 'Société')).toBe('Startup Manuelle')
    expect(cell(grace, 'Contact')).toBe('Grace Hopper')
    expect(cell(grace, 'Fonction')).toBe('CTO')
    expect(cell(grace, 'Téléphone')).toBe('06 11 22 33 44')
    expect(cell(grace, 'LinkedIn')).toBe('https://www.linkedin.com/in/grace')
    expect(cell(grace, 'À recontacter')).toBe('Oui')
    expect(cell(grace, 'Commentaire')).toContain('Contactée par e-mail le 2 février 2026')

    // CSV et PDF.
    await page.getByRole('radio', { name: /^CSV/ }).check({ force: true })
    const csv = await download()
    expect(csv.suggestedFilename()).toMatch(/\.csv$/)
    expect(await readFile(await csv.path(), 'utf8')).toContain('Société;Site web;Stand')
    await page.getByRole('radio', { name: /^PDF/ }).check({ force: true })
    const pdf = await download()
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
  })
})
