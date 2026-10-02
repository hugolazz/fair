// Génère les icônes PWA depuis un SVG (pnpm icons). Les PNG générés sont versionnés dans public/.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const out = join(import.meta.dirname, '..', 'public')
mkdirSync(out, { recursive: true })

const BG = '#0f766e'

// Un « f » minuscule dessiné en traits (pas de police, rendu identique partout).
const glyph = `
  <path d="M232 392 V218 C232 168 262 138 316 138" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M184 238 H322" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round"/>`

const svg = (inset = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${inset ? 0 : 112}" fill="${BG}"/>
  <g transform="${inset ? 'translate(51 51) scale(0.8)' : ''}">${glyph}</g>
</svg>`

writeFileSync(join(out, 'favicon.svg'), svg())

const render = (name, size, content) =>
  sharp(Buffer.from(content)).resize(size, size).png().toFile(join(out, name))

await render('pwa-192x192.png', 192, svg())
await render('pwa-512x512.png', 512, svg())
await render('pwa-maskable-512x512.png', 512, svg(1)) // zone de sécurité maskable
await render('apple-touch-icon.png', 180, svg(1))
console.log('Icônes générées dans public/')
