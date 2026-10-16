import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import { login, resetBackend, USERS } from './support'

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
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('radio', { name: 'A', exact: true }).check({ force: true })
    await sheet.getByLabel('Commentaire de préparation').fill('Parler retail media')
    await sheet.getByLabel('Commentaire de préparation').blur()
    await sheet.getByLabel('Ajouter un commercial…').selectOption({ label: 'moi' })
    await expect(sheet.getByText('Non assignée')).toHaveCount(0)
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
    const sheet = page.getByRole('dialog')

    await sheet.getByRole('button', { name: 'Planifier un créneau' }).click()
    await sheet.getByLabel('Heure').fill('10:30')
    await sheet.getByRole('button', { name: 'Enregistrer le créneau' }).click()

    await sheet.getByText('Compte-rendu').first().click()
    await sheet.getByLabel('Statut').selectOption('done')
    await sheet.getByLabel('Intérêt').selectOption('4')
    await sheet.getByLabel('Prochaine étape').fill('Envoyer la démo')
    await sheet.getByLabel('Prochaine étape').blur()
    await sheet.getByLabel('Nouvelle note').fill('Très intéressée par le retail media.')
    await sheet.getByRole('button', { name: 'Ajouter la note' }).click()
    await expect(sheet.getByText('Très intéressée par le retail media.')).toBeVisible()
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
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByLabel('Commentaire de préparation')).toHaveValue('Parler retail media')
    await sheet
      .getByText(/Compte-rendu/)
      .first()
      .click()
    await expect(sheet.getByLabel('Prochaine étape')).toHaveValue('Envoyer la démo')
    await expect(sheet.getByText('Très intéressée par le retail media.')).toBeVisible()
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
  })
})
