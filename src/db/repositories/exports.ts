// Exports en masse : lecture des données d'un salon (sous les droits de l'utilisateur) et génération côté serveur.
import { fetchExportData } from '@shared/exports/fetch.ts'
import type { ExportRequest } from '@shared/exports/service.ts'
import type { ExportData } from '@shared/exports/types.ts'
import { supabase } from '@/lib/supabase'

export function loadExportData(eventId: string): Promise<ExportData> {
  return fetchExportData(supabase, eventId)
}

export type ServerExport = {
  /** Lien signé de téléchargement (valable 1 h). */
  url: string
  filename: string
  mime: string
  bytes: number
  expiresAt: string
}

export type ServerExportErrorCode = 'unavailable' | 'not_found' | 'nothing_to_export' | 'failed'

export class ServerExportError extends Error {
  readonly code: ServerExportErrorCode
  constructor(code: ServerExportErrorCode) {
    super(code)
    this.name = 'ServerExportError'
    this.code = code
  }
}

/**
 * Génère l'export sur le serveur (Edge Function `generate-export`) et renvoie un lien de téléchargement.
 * `unavailable` = fonction non déployée ou injoignable : l'appelant peut générer en local à la place.
 */
export async function requestServerExport(
  eventId: string,
  request: ExportRequest,
): Promise<ServerExport> {
  const { data, error } = await supabase.functions.invoke('generate-export', {
    body: { eventId, request },
  })
  if (error) {
    let body: { error?: string } | null = null
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response)
      body = (await ctx.json().catch(() => null)) as { error?: string } | null
    if (body?.error === 'not_found') throw new ServerExportError('not_found')
    if (body?.error === 'nothing_to_export') throw new ServerExportError('nothing_to_export')
    if (body?.error) throw new ServerExportError('failed')
    throw new ServerExportError('unavailable') // pas de réponse de notre fonction : non déployée ou réseau
  }
  const r = data as Partial<ServerExport> | null
  if (!r || typeof r.url !== 'string' || typeof r.filename !== 'string')
    throw new ServerExportError('failed')
  return {
    url: r.url,
    filename: r.filename,
    mime: r.mime ?? 'application/octet-stream',
    bytes: r.bytes ?? 0,
    expiresAt: r.expiresAt ?? '',
  }
}
