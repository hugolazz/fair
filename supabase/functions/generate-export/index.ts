// Génère un export (Excel, CSV, PDF) côté serveur pour les gros volumes, le dépose dans le bucket privé `exports`
// et renvoie un lien de téléchargement signé (1 h).
//
// Tout se fait sous les droits de l'appelant (son jeton JWT) : la RLS limite les données lues à son équipe et le
// dossier d'écriture à celui de son équipe. Aucune clé secrète n'est utilisée. Le code de génération est partagé avec
// le navigateur (`../_shared/exports`).
import { createClient } from '@supabase/supabase-js'
import { fetchExportData } from '../_shared/exports/fetch.ts'
import { generateExport, parseRequest } from '../_shared/exports/service.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'exports'
const LINK_SECONDS = 3600
const KEEP_MS = 24 * 3600 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'unauthorized' }, 401)

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userErr } = await client.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => null)
  const eventId = String(body?.eventId ?? '')
  if (!UUID.test(eventId)) return json({ error: 'invalid_request' }, 400)
  let request
  try {
    request = parseRequest(body?.request)
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  let data
  try {
    data = await fetchExportData(client, eventId)
  } catch {
    return json({ error: 'not_found' }, 404) // salon inexistant ou d'une autre équipe (RLS)
  }

  let file
  try {
    file = await generateExport(data, request)
  } catch (e) {
    const message = e instanceof Error ? e.message : ''
    return json(
      { error: message === 'no salesperson' ? 'nothing_to_export' : 'generation_failed' },
      message === 'no salesperson' ? 422 : 500,
    )
  }

  const teamId = data.team.id
  const path = `${teamId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${file.filename}`
  const up = await client.storage
    .from(BUCKET)
    .upload(path, file.bytes, { contentType: file.mime, upsert: false })
  if (up.error) return json({ error: 'upload_failed' }, 500)

  // Ménage : les exports de plus de 24 h de cette équipe sont supprimés (le nom commence par l'heure de création).
  const listed = await client.storage.from(BUCKET).list(teamId, { limit: 200 })
  const old = (listed.data ?? [])
    .filter((f) => Date.now() - Number(f.name.split('-')[0]) > KEEP_MS)
    .map((f) => `${teamId}/${f.name}`)
  if (old.length > 0) await client.storage.from(BUCKET).remove(old)

  const signed = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, LINK_SECONDS, { download: file.filename })
  if (signed.error || !signed.data) return json({ error: 'link_failed' }, 500)

  return json({
    url: signed.data.signedUrl,
    filename: file.filename,
    mime: file.mime,
    bytes: file.bytes.length,
    expiresAt: new Date(Date.now() + LINK_SECONDS * 1000).toISOString(),
  })
})
