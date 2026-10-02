import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

import type { ExportRequest } from '@shared/exports/service.ts'
import { ServerExportError, requestServerExport } from './exports'

const request: ExportRequest = {
  kind: 'pdf-bilan',
  filters: { statuses: [], priorities: [], assigneeIds: [], tagIds: [] },
}

const httpError = (status: number, body: unknown) => ({
  error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) },
  data: null,
})

describe('génération côté serveur (Edge Function)', () => {
  beforeEach(() => invoke.mockReset())

  it('envoie le salon et la demande, renvoie le lien signé', async () => {
    invoke.mockResolvedValue({
      data: {
        url: 'https://x.test/s',
        filename: 'a.pdf',
        mime: 'application/pdf',
        bytes: 1234,
        expiresAt: '2027-01-01T00:00:00Z',
      },
      error: null,
    })
    const r = await requestServerExport('e1', request)
    expect(invoke).toHaveBeenCalledWith('generate-export', { body: { eventId: 'e1', request } })
    expect(r).toEqual({
      url: 'https://x.test/s',
      filename: 'a.pdf',
      mime: 'application/pdf',
      bytes: 1234,
      expiresAt: '2027-01-01T00:00:00Z',
    })
  })

  it('traduit les erreurs de NOTRE fonction', async () => {
    invoke.mockResolvedValue(httpError(404, { error: 'not_found' }))
    await expect(requestServerExport('e1', request)).rejects.toMatchObject({ code: 'not_found' })
    invoke.mockResolvedValue(httpError(422, { error: 'nothing_to_export' }))
    await expect(requestServerExport('e1', request)).rejects.toMatchObject({
      code: 'nothing_to_export',
    })
    invoke.mockResolvedValue(httpError(500, { error: 'generation_failed' }))
    await expect(requestServerExport('e1', request)).rejects.toMatchObject({ code: 'failed' })
  })

  it('fonction non déployée (404 de la passerelle) ou réseau coupé : « unavailable », pour pouvoir générer en local', async () => {
    invoke.mockResolvedValue(
      httpError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }),
    )
    await expect(requestServerExport('e1', request)).rejects.toMatchObject({ code: 'unavailable' })
    invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') },
    })
    await expect(requestServerExport('e1', request)).rejects.toBeInstanceOf(ServerExportError)
    await expect(requestServerExport('e1', request)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('une réponse inattendue est une erreur, pas un lien vide', async () => {
    invoke.mockResolvedValue({ data: { nope: true }, error: null })
    await expect(requestServerExport('e1', request)).rejects.toMatchObject({ code: 'failed' })
  })
})
