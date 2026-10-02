import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { FairDb, setCurrentDb } from '@/db/local/db'
import { localInsert, localUpdate, setClock } from '@/db/local/write'
import { resolveConflict } from '@/db/repositories/conflicts'
import { createEngine } from './engine'
import { FakeRemote, FakeServer } from './fake-remote'
import { nextDelay } from './manager'
import {
  estimateDownload,
  getPin,
  localEventSize,
  removeEventFromDevice,
  setPin,
  touchPins,
} from './offline-events'
import { pickView } from '@/features/offline/pick-view'

/**
 * Scénarios « deux appareils » : un téléphone (A) et un ordinateur (B) partagent le même serveur.
 * Chacun a sa propre base locale, sa propre connexion (coupée ou non) et sa propre horloge.
 */

const EVENT = 'e1'
let n = 0

class Device {
  readonly db: FairDb
  readonly remote: FakeRemote
  online = true
  clock = '2027-05-12T09:00:00.000Z'
  readonly engine
  constructor(
    readonly name: string,
    server: FakeServer,
  ) {
    this.db = new FairDb(`dev-${name}-${++n}`)
    this.remote = new FakeRemote(server)
    this.engine = createEngine({
      remote: this.remote,
      isOnline: () => this.online && !this.remote.offline,
    })
  }
  /** Exécute `fn` « sur cet appareil » (sa base, son horloge). */
  async run<T>(fn: () => Promise<T>, at?: string): Promise<T> {
    setCurrentDb(this.db)
    setClock(() => new Date(at ?? this.clock))
    return fn()
  }
  sync = () => this.run(() => this.engine.sync(EVENT))
  edit = (table: 'meetings' | 'notes', id: string, patch: Record<string, unknown>, at: string) =>
    this.run(() => localUpdate(table, { id }, patch), at)
  goOffline() {
    this.online = false
  }
  goOnline() {
    this.online = true
  }
  get = <T>(table: 'meetings' | 'notes' | 'event_companies', id: string) =>
    this.run(async () => (await this.db[table].get(id)) as T | undefined)
}

let server: FakeServer
let A: Device
let B: Device

const T = (hhmm: string) => `2027-05-12T${hhmm}:00.000Z`

beforeEach(async () => {
  server = new FakeServer()
  server.now = () => Date.parse('2027-05-12T20:00:00.000Z') // le serveur est « après » toutes les éditions des tests
  server.write('events', { id: EVENT, team_id: 't', name: 'Salon', deleted_at: null })
  server.write('companies', {
    id: 'c1',
    team_id: 't',
    name: 'Acme',
    name_normalized: 'acme',
    deleted_at: null,
  })
  server.write('event_companies', {
    id: 'ec1',
    team_id: 't',
    event_id: EVENT,
    company_id: 'c1',
    priority: 'A',
    deleted_at: null,
  })
  server.write('meetings', {
    id: 'm1',
    team_id: 't',
    event_id: EVENT,
    event_company_id: 'ec1',
    owner_id: 'u',
    status: 'to_see',
    interest: null,
    need: null,
    field_updated_at: {},
    deleted_at: null,
  })
  server.write('notes', {
    id: 'n1',
    team_id: 't',
    meeting_id: 'm1',
    author_id: 'u',
    body: 'départ',
    source: 'typed',
    captured_at: T('08:00'),
    deleted_at: null,
  })
  A = new Device('téléphone', server)
  B = new Device('ordinateur', server)
  await A.sync() // les deux appareils téléchargent le salon
  await B.sync()
})

describe('coupure réseau', () => {
  it('tout s’enregistre localement hors-ligne, puis part au retour du réseau', async () => {
    A.goOffline()
    await A.edit('meetings', 'm1', { status: 'follow_up' }, T('10:00'))
    await A.run(() =>
      localInsert('notes', {
        id: 'n2',
        team_id: 't',
        meeting_id: 'm1',
        author_id: 'u',
        body: 'écrite sans réseau',
        source: 'typed',
        captured_at: T('10:01'),
        deleted_at: null,
      }),
    )
    await A.sync()
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({ status: 'to_see' }) // rien n'est parti
    expect(await A.run(() => A.db.outbox.count())).toBe(2)
    expect((await A.get<{ status: string }>('meetings', 'm1'))!.status).toBe('follow_up') // l'appareil, lui, est à jour

    A.goOnline()
    await A.sync()
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({ status: 'follow_up' })
    expect(server.find('notes', { id: 'n2' })).toMatchObject({ body: 'écrite sans réseau' })
    expect(await A.run(() => A.db.outbox.count())).toBe(0)
  })

  it('coupure EN PLEIN envoi : reprise là où on s’est arrêté, sans doublon', async () => {
    for (const id of ['n2', 'n3', 'n4']) {
      await A.run(() =>
        localInsert('notes', {
          id,
          team_id: 't',
          meeting_id: 'm1',
          author_id: 'u',
          body: id,
          source: 'typed',
          captured_at: T('10:00'),
          deleted_at: null,
        }),
      )
    }
    A.remote.pushesLeft = 1 // le réseau tombe après le premier envoi
    await A.sync()
    expect(
      server
        .rows('notes')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['n1', 'n2'])
    expect(await A.run(() => A.db.outbox.count())).toBe(2)

    A.remote.offline = false
    A.remote.pushesLeft = Infinity
    await A.sync()
    expect(
      server
        .rows('notes')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(await A.run(() => A.db.outbox.count())).toBe(0)
  })

  it('rejouer une opération déjà reçue (plantage avant l’accusé) ne duplique rien', async () => {
    const note = {
      id: 'n2',
      team_id: 't',
      meeting_id: 'm1',
      author_id: 'u',
      body: 'une fois',
      source: 'typed',
      captured_at: T('10:00'),
      deleted_at: null,
    }
    await A.run(() => localInsert('notes', note))
    await A.sync()
    await A.run(() => localInsert('notes', note)) // l'appareil rejoue la même création
    await A.sync()
    expect(server.rows('notes').filter((r) => r.id === 'n2')).toHaveLength(1)
  })
})

describe('édition sur deux appareils : rencontres (dernier écrit gagne par champ)', () => {
  it.each([
    ['le téléphone se synchronise en premier', 'AB'],
    ['l’ordinateur se synchronise en premier', 'BA'],
  ])('même champ : la modification la plus RÉCENTE gagne, %s', async (_label, order) => {
    A.goOffline()
    B.goOffline()
    await A.edit('meetings', 'm1', { status: 'done' }, T('10:00'))
    await B.edit('meetings', 'm1', { status: 'follow_up' }, T('10:05')) // plus récent
    A.goOnline()
    B.goOnline()
    for (const d of order) await (d === 'A' ? A : B).sync()
    await A.sync()
    await B.sync()
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({ status: 'follow_up' })
    // Les deux appareils convergent vers la même valeur.
    expect((await A.get<{ status: string }>('meetings', 'm1'))!.status).toBe('follow_up')
    expect((await B.get<{ status: string }>('meetings', 'm1'))!.status).toBe('follow_up')
  })

  it('champs différents : les deux modifications sont conservées', async () => {
    A.goOffline()
    B.goOffline()
    await A.edit('meetings', 'm1', { status: 'done' }, T('10:00'))
    await B.edit('meetings', 'm1', { need: 'POC paiement', interest: 5 }, T('10:02'))
    A.goOnline()
    B.goOnline()
    await A.sync()
    await B.sync()
    await A.sync()
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({
      status: 'done',
      need: 'POC paiement',
      interest: 5,
    })
    expect(await A.get('meetings', 'm1')).toMatchObject({
      status: 'done',
      need: 'POC paiement',
      interest: 5,
    })
  })

  it('une vieille modification faite hors-ligne n’écrase PAS une modification plus récente faite en ligne', async () => {
    B.goOffline()
    await B.edit('meetings', 'm1', { status: 'not_interested' }, T('10:00')) // B édite à 10h, hors-ligne
    await A.edit('meetings', 'm1', { status: 'done' }, T('12:00')) // A édite à midi, en ligne
    await A.sync()
    B.goOnline()
    await B.sync() // B revient à 13h avec sa modification de 10h
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({ status: 'done' })
    expect((await B.get<{ status: string }>('meetings', 'm1'))!.status).toBe('done') // B reprend la valeur du serveur
  })

  it('une horloge déréglée dans le futur ne verrouille pas le champ', async () => {
    await A.edit('meetings', 'm1', { status: 'done' }, '2099-01-01T00:00:00.000Z') // téléphone avec une date folle
    await A.sync()
    await B.edit('meetings', 'm1', { status: 'follow_up' }, T('15:00'))
    await B.sync()
    // Le serveur a ramené 2099 à « maintenant » (20 h) : la modification de B (15 h) est plus ancienne et perd,
    // mais le champ n'est pas bloqué pour toujours.
    expect(server.find('meetings', { id: 'm1' })!.field_updated_at).toMatchObject({
      status: T('20:00'),
    })
    await B.edit('meetings', 'm1', { status: 'follow_up' }, '2027-05-13T08:00:00.000Z')
    await B.sync()
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({ status: 'follow_up' })
  })
})

describe('édition sur deux appareils : notes (les deux versions sont conservées)', () => {
  async function concurrentEdit() {
    A.goOffline()
    B.goOffline()
    await A.edit('notes', 'n1', { body: 'version du téléphone' }, T('10:00'))
    await B.edit('notes', 'n1', { body: 'version de l’ordinateur' }, T('10:01'))
    A.goOnline()
    B.goOnline()
    await A.sync() // le téléphone passe en premier
    await B.sync() // l'ordinateur arrive après : conflit
    await A.sync()
  }

  it('une modification simultanée ne perd AUCUN texte : original = serveur, copie = version perdante', async () => {
    await concurrentEdit()
    const bodies = server
      .rows('notes')
      .map((r) => r.body)
      .sort()
    expect(bodies).toEqual(['version de l’ordinateur', 'version du téléphone'])
    // Sur l'ordinateur (qui a perdu la course) : un conflit est signalé, les deux notes sont visibles.
    const conflicts = await B.run(() => B.db.conflicts.toArray())
    expect(conflicts).toMatchObject([
      { status: 'open', mine: 'version de l’ordinateur', theirs: 'version du téléphone' },
    ])
    expect((await B.get<{ body: string }>('notes', 'n1'))!.body).toBe('version du téléphone')
    // Le téléphone reçoit aussi la copie après sa synchronisation.
    const onA = await A.run(() => A.db.notes.toArray())
    expect(onA.map((x) => x.body).sort()).toEqual([
      'version de l’ordinateur',
      'version du téléphone',
    ])
    // Le gagnant n'a aucun conflit à traiter.
    expect(await A.run(() => A.db.conflicts.count())).toBe(0)
  })

  it('« Garder la mienne » : l’original prend mon texte, la copie disparaît, tout se propage', async () => {
    await concurrentEdit()
    const [c] = await B.run(() => B.db.conflicts.toArray())
    await B.run(() => resolveConflict(c!.id, 'mine'))
    await B.sync()
    await A.sync()
    const live = server.rows('notes').filter((r) => !r.deleted_at)
    expect(live.map((r) => r.body)).toEqual(['version de l’ordinateur'])
    expect((await A.get<{ body: string }>('notes', 'n1'))!.body).toBe('version de l’ordinateur')
    expect(await B.run(() => B.db.conflicts.where('status').equals('open').count())).toBe(0)
  })

  it('« Garder l’autre » : on garde la version du serveur, notre copie est supprimée', async () => {
    await concurrentEdit()
    const [c] = await B.run(() => B.db.conflicts.toArray())
    await B.run(() => resolveConflict(c!.id, 'theirs'))
    await B.sync()
    expect(
      server
        .rows('notes')
        .filter((r) => !r.deleted_at)
        .map((r) => r.body),
    ).toEqual(['version du téléphone'])
  })

  it('« Garder les deux » : rien ne change, le conflit est simplement clos', async () => {
    await concurrentEdit()
    const [c] = await B.run(() => B.db.conflicts.toArray())
    await B.run(() => resolveConflict(c!.id, 'both'))
    await B.sync()
    expect(server.rows('notes').filter((r) => !r.deleted_at)).toHaveLength(2)
    expect(await B.run(() => B.db.conflicts.where('status').equals('open').count())).toBe(0)
  })

  it('pas de faux conflit quand l’autre appareil a d’abord récupéré la dernière version', async () => {
    await A.edit('notes', 'n1', { body: 'v2 depuis le téléphone' }, T('10:00'))
    await A.sync()
    await B.sync() // l'ordinateur récupère v2
    await B.edit('notes', 'n1', { body: 'v3 depuis l’ordinateur' }, T('10:30'))
    await B.sync()
    expect(server.find('notes', { id: 'n1' })!.body).toBe('v3 depuis l’ordinateur')
    expect(await B.run(() => B.db.conflicts.count())).toBe(0)
  })

  it('pas de faux conflit quand le MÊME appareil modifie plusieurs fois, avec des synchronisations entre', async () => {
    for (const [i, body] of ['a', 'ab', 'abc'].entries()) {
      await A.edit('notes', 'n1', { body }, T(`10:0${i}`))
      await A.sync()
    }
    expect(server.find('notes', { id: 'n1' })!.body).toBe('abc')
    expect(await A.run(() => A.db.conflicts.count())).toBe(0)
  })

  it('la même modification faite sur les deux appareils n’est pas un conflit', async () => {
    A.goOffline()
    B.goOffline()
    await A.edit('notes', 'n1', { body: 'identique' }, T('10:00'))
    await B.edit('notes', 'n1', { body: 'identique' }, T('10:01'))
    A.goOnline()
    B.goOnline()
    await A.sync()
    await B.sync()
    expect(await B.run(() => B.db.conflicts.count())).toBe(0)
    expect(server.rows('notes')).toHaveLength(1)
  })
})

describe('upload différé des photos', () => {
  const photo = {
    id: 'a1',
    team_id: 't',
    owner_table: 'meetings',
    owner_id: 'm1',
    kind: 'badge_photo',
    mime: 'image/jpeg',
    size_bytes: 1,
    status: 'pending',
    storage_path: null,
    deleted_at: null,
  }

  it('un envoi de photo qui échoue ne retarde PAS les notes ; la photo part plus tard', async () => {
    await A.run(async () => {
      await A.db.blobs.put({
        id: 'a1',
        blob: new Blob(['x'], { type: 'image/jpeg' }),
        mime: 'image/jpeg',
      })
      await localInsert('attachments', photo) // créée AVANT la note
      await localInsert('notes', {
        id: 'n2',
        team_id: 't',
        meeting_id: 'm1',
        author_id: 'u',
        body: 'après la photo',
        source: 'typed',
        captured_at: T('10:00'),
        deleted_at: null,
      })
    })
    A.remote.uploadFails = true
    await A.sync()
    expect(server.find('notes', { id: 'n2' })).toBeTruthy() // la note est passée devant
    expect(server.find('attachments', { id: 'a1' })).toBeUndefined()
    expect(server.uploads.size).toBe(0)
    expect(await A.run(() => A.db.blobs.count())).toBe(1) // le fichier reste sur l'appareil

    A.remote.uploadFails = false
    await A.sync()
    expect([...server.uploads.keys()]).toEqual(['t/a1.jpg'])
    expect(server.find('attachments', { id: 'a1' })).toMatchObject({
      status: 'uploaded',
      storage_path: 't/a1.jpg',
    })
  })
})

describe('reprise espacée après échec', () => {
  it('20 s en temps normal, puis 4 s, 8 s, 16 s… plafonné à 60 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(nextDelay)).toEqual([
      20_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ])
  })
})

describe('indicateur d’état', () => {
  it('choisit l’état le plus important : conflits > hors-ligne > erreur > synchronisation > en attente > à jour', () => {
    expect(pickView({ phase: 'idle', pending: 0, conflicts: 0 })).toBe('ok')
    expect(pickView({ phase: 'idle', pending: 3, conflicts: 0 })).toBe('pending')
    expect(pickView({ phase: 'syncing', pending: 3, conflicts: 0 })).toBe('syncing')
    expect(pickView({ phase: 'error', pending: 3, conflicts: 0 })).toBe('error')
    expect(pickView({ phase: 'offline', pending: 3, conflicts: 0 })).toBe('offline')
    expect(pickView({ phase: 'offline', pending: 3, conflicts: 2 })).toBe('conflicts')
  })
})

describe('salons téléchargés pour le terrain', () => {
  it('annonce une taille avant téléchargement, d’après les nombres de lignes du serveur', async () => {
    const est = await estimateDownload(A.remote, EVENT)
    expect(est.targets).toBe(1)
    expect(est.bytes).toBeGreaterThan(0)
    for (let i = 0; i < 100; i++)
      server.write('event_companies', {
        id: `x${i}`,
        team_id: 't',
        event_id: EVENT,
        company_id: 'c1',
      })
    expect((await estimateDownload(A.remote, EVENT)).bytes).toBeGreaterThan(est.bytes + 30_000)
  })

  it('mesure l’espace réellement utilisé, photos comprises', async () => {
    const before = await A.run(() => localEventSize(EVENT))
    expect(before).toBeGreaterThan(0)
    await A.run(async () => {
      await A.db.blobs.put({
        id: 'p',
        blob: new Blob([new Uint8Array(50_000)]),
        mime: 'image/jpeg',
      })
      await A.db.attachments.put({
        id: 'p',
        team_id: 't',
        owner_table: 'meetings',
        owner_id: 'm1',
        kind: 'badge_photo',
        storage_path: null,
        mime: 'image/jpeg',
        size_bytes: 50_000,
        status: 'uploaded',
        deleted_at: null,
      })
    })
    expect((await A.run(() => localEventSize(EVENT))) - before).toBeGreaterThanOrEqual(50_000)
  })

  it('refuse de retirer un salon tant que des modifications ne sont pas envoyées, puis le retire', async () => {
    await A.run(() => setPin(EVENT, { pinnedAt: T('09:00'), syncedAt: null }))
    A.goOffline()
    await A.edit('meetings', 'm1', { status: 'done' }, T('10:00'))
    expect(await A.run(() => removeEventFromDevice(EVENT))).toEqual({ ok: false, pending: 1 })
    expect(await A.run(() => A.db.event_companies.count())).toBe(1) // rien n'a été supprimé

    A.goOnline()
    await A.sync()
    expect(await A.run(() => removeEventFromDevice(EVENT))).toEqual({ ok: true })
    expect(await A.run(() => A.db.event_companies.count())).toBe(0)
    expect(await A.run(() => A.db.meetings.count())).toBe(0)
    expect(await A.run(() => getPin(EVENT))).toBeUndefined()
    expect(server.find('meetings', { id: 'm1' })).toMatchObject({ status: 'done' }) // les données serveur sont intactes
  })

  it('marque les salons comme mis à jour après une synchronisation', async () => {
    await A.run(() => setPin(EVENT, { pinnedAt: T('09:00'), syncedAt: null }))
    await A.run(() => touchPins([EVENT], new Date(T('11:00'))))
    expect((await A.run(() => getPin(EVENT)))!.syncedAt).toBe(T('11:00'))
  })

  it('ne lit aucune ligne de salon tant qu’aucun salon n’est téléchargé (envoi seul)', async () => {
    const C = new Device('tablette', server)
    await C.run(() => C.engine.sync([]))
    expect(await C.run(() => C.db.event_companies.count())).toBe(0)
    expect(await C.run(() => C.db.companies.count())).toBe(0)
  })
})
