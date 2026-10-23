import { expect, test } from '@playwright/test'
import { login, resetBackend, sql, USERS } from './support'

// Logo de l'équipe en haut de l'accueil : rien s'il n'y en a pas, centré s'il y en a un. (Le faux serveur n'a pas de
// stockage : les adresses signées et l'image sont simulées.)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test('l’accueil n’affiche aucun logo sans image, et le logo de l’équipe centré avec', async ({
  page,
}) => {
  await resetBackend('team')
  await page.route('**/storage/v1/object/sign/**', (route) =>
    route.fulfill({
      json: { signedURL: '/object/sign/attachments/logo.png?token=e2e' },
    }),
  )
  await page.route('**/storage/v1/object/sign/attachments/logo.png**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PNG }),
  )
  await login(page, USERS.marie)
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Vos salons' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Logo de l’équipe|Logo de l'équipe/ })).toHaveCount(0)

  await sql('update teams set logo_path = $1', ['team/logo.png'])
  await page.reload()
  const logo = page.getByRole('img', { name: /Logo de l.équipe/ })
  await expect(logo).toBeVisible()
  // Centré horizontalement dans la page, au-dessus du titre.
  const [box, view, title] = await Promise.all([
    logo.boundingBox(),
    page.viewportSize(),
    page.getByRole('heading', { name: 'Vos salons' }).boundingBox(),
  ])
  expect(Math.abs(box!.x + box!.width / 2 - view!.width / 2)).toBeLessThan(2)
  expect(box!.y + box!.height).toBeLessThanOrEqual(title!.y)
})
