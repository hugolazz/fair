import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'
import { login, resetBackend, sql, USERS } from './support'

// Recadrage du logo de l'équipe (Réglages → Équipe) : rognage automatique des marges vides, curseurs, enregistrement.
// Le faux serveur n'a pas de stockage : téléchargement, adresse signée et envoi sont simulés.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}
/** PNG RGBA w × h, transparent, avec un rectangle plein [x, y, largeur, hauteur]. */
function png(w: number, h: number, box: [number, number, number, number]) {
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x >= box[0] && x < box[0] + box[2] && y >= box[1] && y < box[1] + box[3]
      if (inside) Buffer.from([200, 30, 60, 255]).copy(raw, y * (1 + w * 4) + 1 + x * 4)
    }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test('recadrer le logo : rognage automatique des marges vides, puis enregistrement du logo recadré', async ({
  page,
}) => {
  await resetBackend('team')
  const original = png(80, 40, [30, 15, 20, 10]) // un petit rectangle au milieu d'un grand fond transparent
  let uploaded: Buffer | undefined
  await page.route('**/storage/v1/object/sign/**', (route) =>
    route.fulfill({ json: { signedURL: '/object/sign/attachments/logo.png?token=e2e' } }),
  )
  await page.route('**/storage/v1/object/sign/attachments/logo.png**', (route) =>
    route.fulfill({ contentType: 'image/png', body: original }),
  )
  // Téléchargement (GET) et envoi (POST) passent par la même adresse.
  await page.route('**/storage/v1/object/attachments/**', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ contentType: 'image/png', body: original })
    uploaded = route.request().postDataBuffer() ?? undefined
    return route.fulfill({ json: { Key: 'attachments/team/logo.png' } })
  })
  await sql('update teams set logo_path = $1', ['team/logo.png'])

  await login(page, USERS.admin)
  await page.goto('/settings?section=equipe')
  await page.getByRole('button', { name: 'Recadrer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Recadrer le logo' })
  await expect(dialog.getByRole('slider', { name: /Marge à gauche/ })).toBeVisible()
  const save = dialog.getByRole('button', { name: 'Enregistrer le logo recadré' })
  await expect(save).toBeDisabled() // rien n'a changé

  await dialog.getByRole('button', { name: 'Rogner automatiquement les marges vides' }).click()
  await expect(dialog.getByRole('slider', { name: /Marge à gauche/ })).not.toHaveValue('0')
  await expect(save).toBeEnabled()
  await save.click()

  await expect.poll(() => uploaded !== undefined).toBe(true)
  // Le fichier envoyé est un PNG réduit au dessin (22 × 12 : 20 × 10 et une petite marge).
  const at = uploaded!.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  expect(at).toBeGreaterThan(-1)
  expect([uploaded!.readUInt32BE(at + 16), uploaded!.readUInt32BE(at + 20)]).toEqual([22, 12])
  await expect(dialog).toHaveCount(0)
})
