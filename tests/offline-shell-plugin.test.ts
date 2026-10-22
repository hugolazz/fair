import { describe, expect, it } from 'vitest'
import { offlineShellPlugin } from '../scripts/offline-shell-plugin.ts'

type Emitted = { fileName: string; source: string }

function generate(enabled: boolean, bundle: Record<string, unknown>): Emitted {
  const plugin = offlineShellPlugin({ enabled, root: process.cwd() })
  let emitted: Emitted | undefined
  const hooks = plugin as unknown as {
    configResolved: (c: { publicDir: string }) => void
    generateBundle: (this: { emitFile: (f: Emitted) => void }, o: unknown, b: unknown) => void
  }
  hooks.configResolved({ publicDir: `${process.cwd()}/public` })
  hooks.generateBundle.call({ emitFile: (f) => (emitted = f) }, {}, bundle)
  return emitted!
}

const bundle = {
  'index.html': { type: 'asset', source: '<html></html>' },
  'assets/index-abc.js': { type: 'chunk', code: 'console.log(1)' },
  'assets/index-abc.js.map': { type: 'asset', source: '{}' },
  'assets/pdf-big.js': { type: 'chunk', code: 'x'.repeat(500_000) },
}

describe('service worker généré au build', () => {
  it('liste la page, les fichiers du build et ceux de public/, sans les cartes ni les gros fichiers', () => {
    const { fileName, source } = generate(true, bundle)
    expect(fileName).toBe('sw.js')
    const urls = JSON.parse(/const PRECACHE = (\[[\s\S]*?\])\n/.exec(source)![1]!) as string[]
    expect(urls).toContain('/index.html')
    expect(urls).toContain('/assets/index-abc.js')
    expect(urls).toContain('/manifest.webmanifest')
    expect(urls).not.toContain('/assets/index-abc.js.map')
    expect(urls).not.toContain('/assets/pdf-big.js')
    expect(source).not.toContain('__VERSION__')
    expect(source).not.toContain('__PRECACHE__')
  })

  it('la version change quand un fichier du build change', () => {
    const version = (b: Record<string, unknown>) =>
      /PREFIX \+ '([0-9a-f]+)'/.exec(generate(true, b).source)![1]
    const changed = { ...bundle, 'assets/index-abc.js': { type: 'chunk', code: 'console.log(22)' } }
    expect(version(bundle)).toBe(version(bundle))
    expect(version(changed)).not.toBe(version(bundle))
  })

  it('option désactivée : un service worker qui se désinscrit et efface les copies', () => {
    const { source } = generate(false, bundle)
    expect(source).toContain('registration.unregister()')
    expect(source).toContain('caches.delete')
  })
})
