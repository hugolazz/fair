import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS } from './support'

// Accessibilité WCAG 2.2 AA : audit axe de chaque écran avec des données réelles, plus la navigation au clavier.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function audit(page: Page, label: string) {
  await page.waitForTimeout(600) // fin de l'animation d'entrée : axe mesure sinon un contraste à mi-opacité
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length} : ${v.nodes[0]?.html.slice(0, 160)}`,
  )
  expect(summary, `${label} : violations d'accessibilité`).toEqual([])
}

let eventId = ''

test.describe.serial('accessibilité', () => {
  test.beforeAll(async () => {
    await resetBackend('team')
    const seeded = await seedEvent('Salon accessibilité', [
      { name: 'Acme', stand: 'A1' },
      { name: 'Bolt', stand: 'B2' },
    ])
    eventId = seeded.eventId
    const [admin] = await sql<{ id: string }>('select id from auth.users where email = $1', [
      USERS.admin,
    ])
    const [team] = await sql<{ id: string }>('select id from teams limit 1')
    await sql(
      `insert into event_company_assignees (event_company_id, user_id, event_id, team_id) values ($1, $2, $3, $4)`,
      [seeded.targetIds['Acme'], admin!.id, eventId, team!.id],
    )
    await sql(
      `insert into meetings (id, team_id, event_id, event_company_id, owner_id, status, planned_at, next_step)
       values (gen_random_uuid(), $1, $2, $3, $4, 'done', now(), 'Envoyer le devis')`,
      [team!.id, eventId, seeded.targetIds['Acme'], admin!.id],
    )
    await sql(`update event_companies set priority = 'A' where id = $1`, [seeded.targetIds['Acme']])
  })

  test('l’audit détecte bien une violation (contrôle de l’outil)', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<img src="x.png">'))
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(violations.map((v) => v.id)).toContain('image-alt')
  })

  test('connexion', async ({ page }) => {
    await page.goto('/login')
    await audit(page, 'connexion')
  })

  const screens: [string, (id: string) => string][] = [
    ['salons', () => '/events'],
    ['aperçu du salon', (id) => `/events/${id}`],
    ['participants', (id) => `/events/${id}/participants`],
    ['ma liste', (id) => `/events/${id}/my-list`],
    ['vue équipe', (id) => `/events/${id}/team`],
    ['plan', (id) => `/events/${id}/plan`],
    ['bilan', (id) => `/events/${id}/bilan`],
    ['exports', (id) => `/events/${id}/exports`],
    ['import', (id) => `/events/${id}/import`],
    ['réglages', () => '/settings'],
  ]
  for (const [label, path] of screens) {
    test(`écran « ${label} » (admin)`, async ({ page }) => {
      await login(page, USERS.admin)
      await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
      await page.goto(path(eventId))
      await page.locator('main h1, main h2').first().waitFor()
      await page.waitForTimeout(500) // fin des transitions et du chargement des données
      await audit(page, label)
    })
  }

  test('fiche entreprise et formulaires ouverts', async ({ page }) => {
    await login(page, USERS.admin)
    await page.goto(`/events/${eventId}/participants`)
    await page.getByRole('button', { name: 'Acme' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'fiche entreprise')
    await page.getByRole('button', { name: 'Ajouter un contact' }).click()
    await expect(page.getByRole('form', { name: 'Nouveau contact' })).toBeVisible()
    await audit(page, 'ajout d’un contact dans la prise de notes')
    await page.getByRole('button', { name: 'Annuler' }).click()

    await page.getByRole('button', { name: 'Modifier la fiche' }).click()
    await expect(page.getByRole('dialog', { name: /^Modifier la fiche/ })).toBeVisible()
    await audit(page, 'modifier la fiche')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    await page.goto(`/events/${eventId}/participants`)
    await page.getByRole('button', { name: 'Ajouter une entreprise' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'ajout manuel d’une entreprise')
    await page.keyboard.press('Escape')

    await page.goto('/events')
    await page
      .getByRole('button', { name: 'Nouveau salon' })
      .or(page.getByRole('link', { name: 'Nouveau salon' }))
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, 'formulaire de salon')
  })

  test('navigation au clavier : lien d’évitement, focus visible, fiche refermable', async ({
    page,
  }) => {
    await login(page, USERS.admin)
    await page.goto(`/events/${eventId}/participants`)
    await page.getByRole('main').waitFor()

    // Premier Tab : le lien d'évitement apparaît et mène au contenu.
    const skip = page.getByRole('link', { name: 'Aller au contenu' })
    // Le focus peut encore être ailleurs tant que la page charge : on repart du début du document à chaque essai.
    await expect(async () => {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.keyboard.press('Tab')
      await expect(skip).toBeFocused({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()

    // Le focus est visible (contour) sur un contrôle quelconque.
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow }
    })
    expect((outline.style !== 'none' && outline.width >= 2) || outline.shadow !== 'none').toBe(true)

    // Une fiche s'ouvre au clavier, garde le focus dedans et se ferme avec Échap en rendant le focus.
    const acme = page.getByRole('button', { name: 'Acme' }).first()
    await acme.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
