import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, replaceDbForTests } from '@/db/local/db'
import { localInsert, localUpdate } from '@/db/local/write'
import { createEngine } from './engine'
import { FakeRemote } from './fake-remote'

let n = 0
let remote: FakeRemote
let online = true
const engine = () => createEngine({ remote, isOnline: () => online })

beforeEach(() => {
  replaceDbForTests(`sync-test-${++n}`)
  remote = new FakeRemote()
  online = true
})

const company = (id: string) => ({
  id,
  team_id: 't',
  name: id,
  name_normalized: id,
  deleted_at: null,
})
const ec = (id: string, companyId: string) => ({
  id,
  team_id: 't',
  event_id: 'e1',
  company_id: companyId,
  deleted_at: null,
})
const meeting = (id: string, ecId: string) => ({
  id,
  team_id: 't',
  event_id: 'e1',
  event_company_id: ecId,
  owner_id: 'u',
  status: 'to_see',
  deleted_at: null,
})

describe('envoi (push)', () => {
  it('envoie dans l’ordre de création : les parents avant les enfants', async () => {
    await localInsert('companies', company('c1'))
    await localInsert('event_companies', ec('ec1', 'c1'))
    await localInsert('meetings', meeting('m1', 'ec1'))
    const res = await engine().push()
    expect(res).toEqual({ sent: 3, failed: 0, conflicts: 0, stopped: false })
    expect(remote.pushLog.map((o) => o.table)).toEqual(['companies', 'event_companies', 'meetings'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('hors-ligne : tout reste en attente, rien n’est perdu, puis part au retour du réseau', async () => {
    await localInsert('meetings', meeting('m1', 'ec1'))
    await localUpdate('meetings', { id: 'm1' }, { status: 'done' })
    remote.offline = true
    expect((await engine().push()).stopped).toBe(true)
    expect(await db.outbox.count()).toBe(1)
    expect((await db.outbox.toArray())[0]!.attempts).toBe(1)

    remote.offline = false
    expect(await engine().push()).toEqual({ sent: 1, failed: 0, conflicts: 0, stopped: false })
    expect(remote.tables.get('meetings')).toMatchObject([{ id: 'm1', status: 'done' }])
  })

  it('ne tente rien quand le navigateur se déclare hors-ligne', async () => {
    await localInsert('meetings', meeting('m1', 'ec1'))
    online = false
    expect((await engine().push()).stopped).toBe(true)
    expect(remote.pushLog).toHaveLength(0)
  })

  it('met un refus définitif en quarantaine sans bloquer les opérations suivantes', async () => {
    await localInsert('meetings', meeting('bad', 'ec1'))
    await localInsert('meetings', meeting('good', 'ec1'))
    remote.reject = (op) => (op.key.id === 'bad' ? 'violates row-level security' : null)
    const res = await engine().push()
    expect(res).toEqual({ sent: 1, failed: 1, conflicts: 0, stopped: false })
    const left = await db.outbox.toArray()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ failed: true, lastError: 'violates row-level security' })
    // « Forcer la sync » redonne sa chance à l’opération refusée.
    remote.reject = () => null
    const e = engine()
    await e.retryFailed()
    expect((await e.push()).sent).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('est idempotent : renvoyer la même ligne ne crée pas de doublon', async () => {
    await localInsert('meetings', meeting('m1', 'ec1'))
    await engine().push()
    await localInsert('meetings', meeting('m1', 'ec1')) // rejeu après une coupure
    await engine().push()
    expect(remote.tables.get('meetings')).toHaveLength(1)
  })

  it('une opération restée « en cours » après un plantage redevient envoyable', async () => {
    await localInsert('meetings', meeting('m1', 'ec1'))
    const [op] = await db.outbox.toArray()
    await db.outbox.update(op!.seq!, { locked: true })
    const e = engine()
    await e.recover()
    expect((await e.push()).sent).toBe(1)
  })

  it('envoie la photo dans le stockage avant la ligne de pièce jointe', async () => {
    const att = {
      id: 'a1',
      team_id: 't',
      owner_table: 'meetings',
      owner_id: 'm1',
      kind: 'badge_photo',
      mime: 'image/jpeg',
      status: 'pending',
      storage_path: null,
      deleted_at: null,
    }
    await db.blobs.put({
      id: 'a1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      mime: 'image/jpeg',
    })
    await localInsert('attachments', att)
    await engine().push()
    expect([...remote.uploads.keys()]).toEqual(['t/a1.jpg'])
    expect(remote.tables.get('attachments')).toMatchObject([
      { id: 'a1', status: 'uploaded', storage_path: 't/a1.jpg' },
    ])
    expect(await db.attachments.get('a1')).toMatchObject({
      status: 'uploaded',
      storage_path: 't/a1.jpg',
    })
  })

  it('photo hors-ligne : reste en attente (fichier conservé), partira au retour du réseau', async () => {
    await db.blobs.put({ id: 'a1', blob: new Blob(['x']), mime: 'image/jpeg' })
    await localInsert('attachments', {
      id: 'a1',
      team_id: 't',
      owner_table: 'meetings',
      owner_id: 'm1',
      kind: 'badge_photo',
      mime: 'image/jpeg',
      status: 'pending',
      deleted_at: null,
    })
    remote.offline = true
    await engine().push()
    expect(remote.uploads.size).toBe(0)
    expect(await db.blobs.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('lecture (pull)', () => {
  it('récupère les changements d’un collègue via le curseur server_seq, sans relire ce qui est déjà connu', async () => {
    remote.serverWrite('event_companies', ec('ec1', 'c1'))
    remote.serverWrite('meetings', meeting('m1', 'ec1'))
    const e = engine()
    await e.pull('e1')
    expect(await db.meetings.count()).toBe(1)
    const cursor = (await db.sync_state.get('cursor:meetings:e1'))!.value as number
    expect(cursor).toBeGreaterThan(0)

    remote.serverWrite('meetings', { ...meeting('m1', 'ec1'), status: 'done' })
    remote.pushLog = []
    await e.pull('e1')
    expect((await db.meetings.get('m1'))!.status).toBe('done')
  })

  it('ne lit que le salon demandé', async () => {
    remote.serverWrite('event_companies', ec('ec1', 'c1'))
    remote.serverWrite('event_companies', { ...ec('ec2', 'c2'), event_id: 'autre' })
    await engine().pull('e1')
    expect((await db.event_companies.toArray()).map((r) => r.id)).toEqual(['ec1'])
  })

  it('n’écrase jamais une ligne qui a une modification locale en attente', async () => {
    remote.serverWrite('meetings', meeting('m1', 'ec1'))
    const e = engine()
    await e.pull('e1')
    await localUpdate('meetings', { id: 'm1' }, { status: 'done', need: 'POC' })
    remote.serverWrite('meetings', { ...meeting('m1', 'ec1'), status: 'not_interested' }) // un collègue modifie
    await e.pull('e1')
    expect(await db.meetings.get('m1')).toMatchObject({ status: 'done', need: 'POC' })
    // Une fois envoyée, la modification locale l’emporte sur le serveur (dernier écrit gagne, par champ).
    await e.push()
    expect(remote.tables.get('meetings')![0]).toMatchObject({ status: 'done', need: 'POC' })
  })

  it('supprime localement les taggings retirés par un collègue, sauf modification locale en attente', async () => {
    remote.serverWrite('taggings', {
      tag_id: 'tag',
      taggable_table: 'companies',
      taggable_id: 'c1',
      team_id: 't',
    })
    const e = engine()
    await e.pull('e1')
    expect(await db.taggings.count()).toBe(1)
    remote.tables.set('taggings', []) // retiré côté serveur
    await e.pull('e1')
    expect(await db.taggings.count()).toBe(0)
  })

  it('un pull hors-ligne ne fait rien', async () => {
    online = false
    remote.serverWrite('meetings', meeting('m1', 'ec1'))
    await engine().pull('e1')
    expect(await db.meetings.count()).toBe(0)
  })
})

describe('sync complète', () => {
  it('envoie puis lit, et signale hors-ligne / erreur / ok', async () => {
    const phases: string[] = []
    const e = createEngine({
      remote,
      isOnline: () => online,
      onStatus: (p) => p.phase && phases.push(p.phase),
    })
    await localInsert('meetings', meeting('m1', 'ec1'))
    remote.serverWrite('event_companies', ec('ec9', 'c9'))
    await e.sync('e1')
    expect(phases).toEqual(['syncing', 'idle'])
    expect(await db.event_companies.get('ec9')).toBeTruthy()

    phases.length = 0
    online = false
    await e.sync('e1')
    expect(phases).toEqual(['offline'])
  })

  it('un cycle lancé hors-ligne ne bloque pas les suivants (régression : verrou périmé)', async () => {
    const e = engine()
    await localInsert('meetings', meeting('m1', 'ec1'))
    online = false
    await e.sync('e1') // se termine aussitôt : « hors-ligne »
    online = true
    await e.sync('e1') // doit réellement s'exécuter
    expect(remote.tables.get('meetings')).toHaveLength(1)
  })

  it('un seul cycle à la fois', async () => {
    const e = engine()
    await localInsert('meetings', meeting('m1', 'ec1'))
    const [a, b] = [e.sync('e1'), e.sync('e1')]
    await Promise.all([a, b])
    expect(remote.pushLog).toHaveLength(1)
  })
})
