import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Charge un fichier d'exemple de tests/fixtures/import sous forme d'ArrayBuffer. */
export function fixture(name: string): ArrayBuffer {
  const b = readFileSync(join(import.meta.dirname, 'import', name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
