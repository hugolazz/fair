import type { ExportRequest, ExportResult } from '@shared/exports/service.ts'
import type { ExportData } from '@shared/exports/types.ts'
import {
  ServerExportError,
  requestServerExport,
  type ServerExport,
} from '@/db/repositories/exports'
import { chooseMode, type ModePref } from './lib/mode'

export type ExportOutcome =
  | { kind: 'file'; result: ExportResult; where: 'local' | 'fallback' }
  | { kind: 'link'; link: ServerExport }

/** Génération dans le navigateur : les bibliothèques (Excel, PDF) ne sont chargées qu'à ce moment. */
async function generateLocal(data: ExportData, request: ExportRequest): Promise<ExportResult> {
  const { generateExport } = await import('@shared/exports/service.ts')
  return generateExport(data, request)
}

/**
 * Lance un export : en local, ou sur le serveur (lien de téléchargement). En mode « automatique », un serveur
 * injoignable ou sans la fonction déployée bascule sur la génération locale.
 */
export async function runExport(opts: {
  eventId: string
  data: ExportData
  request: ExportRequest
  pref: ModePref
}): Promise<ExportOutcome> {
  const mode = chooseMode(opts.pref, opts.data)
  if (mode === 'local')
    return { kind: 'file', result: await generateLocal(opts.data, opts.request), where: 'local' }
  try {
    return { kind: 'link', link: await requestServerExport(opts.eventId, opts.request) }
  } catch (e) {
    if (opts.pref === 'auto' && e instanceof ServerExportError && e.code === 'unavailable') {
      return {
        kind: 'file',
        result: await generateLocal(opts.data, opts.request),
        where: 'fallback',
      }
    }
    throw e
  }
}
