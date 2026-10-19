import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, resetBackend, seedEvent, sql, USERS } from './support'

// Mobile d'abord : accessibilité (axe), pas de défilement horizontal de la page et cibles tactiles ≥ 44 px.
let eventId = ''

test.beforeAll(async () => {
  await resetBackend('team')
  const seeded = await seedEvent('Salon mobile', [
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
  await sql(`update event_companies set priority = 'A' where id = $1`, [seeded.targetIds['Acme']])
})

// Écrans sans connexion : visités déconnecté.
const PUBLIC = new Set(['connexion', 'création de compte'])

const SCREENS: [string, (id: string) => string][] = [
  ['connexion', () => '/login'],
  ['création de compte', () => '/signup'],
  ['salons', () => '/events'],
  ['participants', (id) => `/events/${id}/participants`],
  ['ma liste', (id) => `/events/${id}/my-list`],
  ['vue équipe', (id) => `/events/${id}/team`],
  ['exports', (id) => `/events/${id}/exports`],
  ['réglages', () => '/settings'],
]

for (const [label, path] of SCREENS) {
  test(`mobile « ${label} » : axe, pas de débordement, cibles tactiles`, async ({ page }) => {
    if (!PUBLIC.has(label)) {
      await login(page, USERS.admin)
      await expect(page.getByRole('heading', { name: 'Salons' })).toBeVisible()
    }
    await page.goto(path(eventId))
    await page.locator('main h1, main h2').first().waitFor({ state: 'attached' })
    await page.waitForTimeout(500)

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([])

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'la page ne doit pas défiler horizontalement').toBeLessThanOrEqual(0)

    const small = await page.evaluate(() => {
      const out: string[] = []
      const nodes = document.querySelectorAll<HTMLElement>(
        'button, a[href], select, input:not([type=hidden]):not(.sr-only), textarea, [role=tab], [role=button]',
      )
      for (const el of nodes) {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue
        if (el.closest('.sr-only')) continue // lien d'évitement : n'apparaît qu'au focus clavier
        if (el.closest('p, li > span, [aria-hidden=true]') && el.tagName === 'A') continue // lien dans une phrase
        // Une case à cocher ou un radio cachés visuellement sont activés par leur libellé de ≥ 44 px.
        const target = el.closest('label') ?? el
        const t = target.getBoundingClientRect()
        if (t.height < 43.5 || t.width < 43.5) {
          const name = el.innerText || el.getAttribute('aria-label') || el.outerHTML.slice(0, 90)
          out.push(
            `${el.tagName.toLowerCase()} « ${name.slice(0, 90)} » ${Math.round(t.width)}×${Math.round(t.height)}`,
          )
        }
      }
      return out
    })
    expect(small, 'cibles tactiles de moins de 44 px').toEqual([])
  })
}
