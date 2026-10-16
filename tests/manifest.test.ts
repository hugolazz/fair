import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Critères d'installabilité (Chrome / Edge / Android) : Lighthouse ≥ 12 n'a plus de catégorie PWA, on vérifie le manifest ici.
const root = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.webmanifest'), 'utf8')) as {
  name: string
  short_name: string
  start_url: string
  display: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: string; purpose?: string }[]
}

describe('manifest PWA', () => {
  it('a les champs requis pour être installable', () => {
    expect(manifest.name).toBe('fair')
    expect(manifest.short_name).toBe('fair')
    expect(manifest.start_url).toBe('/')
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display)
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('déclare des icônes 192 et 512 px, dont une maskable, qui existent', () => {
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of manifest.icons) {
      expect(() => readFileSync(join(root, 'public', icon.src))).not.toThrow()
    }
  })
})
