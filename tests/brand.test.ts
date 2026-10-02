import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const SCANNED = [
  'src',
  'supabase/templates',
  'supabase/functions',
  'supabase/config.toml',
  'index.html',
  'public/manifest.webmanifest',
  'scripts',
]
const EXT = new Set([
  '.ts',
  '.tsx',
  '.json',
  '.webmanifest',
  '.html',
  '.toml',
  '.css',
  '.mjs',
  '.md',
])

function walk(path: string): string[] {
  const s = statSync(join(root, path))
  if (!s.isDirectory()) return [path]
  return readdirSync(join(root, path)).flatMap((f) => walk(join(path, f)))
}

describe('branding', () => {
  it('écrit « fair » toujours en minuscules (jamais « Fair » ni « FAIR »)', () => {
    const offenders: string[] = []
    for (const file of SCANNED.flatMap(walk).filter((f) => EXT.has(extname(f)))) {
      const text = readFileSync(join(root, file), 'utf8')
      // « fair » comme mot ; exclut les mots composés anglais type « fairly ».
      if (/\b(Fair|FAIR)\b/.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('déclare name et short_name « fair » dans le manifest PWA', () => {
    const manifest = JSON.parse(
      readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'),
    ) as {
      name: string
      short_name: string
    }
    expect(manifest.name).toBe('fair')
    expect(manifest.short_name).toBe('fair')
  })
})
