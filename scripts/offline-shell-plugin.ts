import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import type { Plugin } from 'vite'

/** Au-delà, un fichier ne part pas dans la copie d'installation (il est gardé à sa première utilisation). */
const MAX_PRECACHE_BYTES = 400_000

function listPublicFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory()
      ? listPublicFiles(full, `${prefix}${name}/`)
      : [`${prefix}${name}`]
  })
}

/**
 * Émet `sw.js` : le service worker de l'appli (copie des fichiers du build pour l'ouvrir sans réseau), ou, si l'option
 * hors ligne n'est pas activée, un service worker qui se désinscrit (retour arrière sans toucher aux appareils).
 */
export function offlineShellPlugin(options: { enabled: boolean; root: string }): Plugin {
  let publicDir = ''
  return {
    name: 'fair-offline-shell',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_, bundle) {
      const source = readFileSync(
        join(options.root, 'sw', options.enabled ? 'service-worker.js' : 'kill-switch.js'),
        'utf8',
      )
      if (!options.enabled) {
        this.emitFile({ type: 'asset', fileName: 'sw.js', source })
        return
      }
      const hash = createHash('sha1')
      const urls = new Set<string>(['/index.html'])
      for (const [name, file] of Object.entries(bundle)) {
        if (name.endsWith('.map')) continue
        const bytes =
          file.type === 'chunk' ? Buffer.byteLength(file.code) : Buffer.byteLength(file.source)
        hash.update(`${name}:${bytes}`)
        if (name === 'index.html' || bytes > MAX_PRECACHE_BYTES) continue
        urls.add(`/${name}`)
      }
      for (const name of listPublicFiles(publicDir).sort()) {
        hash.update(readFileSync(join(publicDir, name)))
        if (name === 'sw.js') continue
        urls.add(`/${posix.normalize(name)}`)
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: source
          .replace('__VERSION__', hash.digest('hex').slice(0, 12))
          .replace('/* __PRECACHE__ */ []', JSON.stringify([...urls].sort(), null, 2)),
      })
    },
  }
}
