import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, replaceDbForTests } from './db'
import { localDelete, localInsert, localUpdate } from './write'

let n = 0
beforeEach(() => {
  replaceDbForTests(`write-test-${++n}`)
})

const meeting = (id: string) => ({
  id,
  team_id: 't',
  event_id: 'e',
  event_company_id: 'ec',
  owner_id: 'u',
  status: 'to_see',
  deleted_at: null,
})

describe('écriture locale d’abord', () => {
  it('écrit la ligne ET l’opération d’envoi dans la même transaction', async () => {
    await localInsert('meetings', meeting('m1'))
    expect(await db.meetings.get('m1')).toMatchObject({ id: 'm1', status: 'to_see' })
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({
      table: 'meetings',
      kind: 'insert',
      rowKey: 'meetings:m1',
      key: { id: 'm1' },
    })
  })

  it('fusionne les modifications successives dans l’insert non encore envoyé', async () => {
    await localInsert('meetings', meeting('m1'))
    await localUpdate('meetings', { id: 'm1' }, { status: 'done' })
    await localUpdate('meetings', { id: 'm1' }, { interest: 4 })
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.kind).toBe('insert')
    expect(ops[0]!.payload).toMatchObject({ status: 'done', interest: 4, owner_id: 'u' })
    expect(await db.meetings.get('m1')).toMatchObject({ status: 'done', interest: 4 })
  })

  it('regroupe les modifications d’une ligne déjà envoyée en une seule opération de mise à jour', async () => {
    await db.meetings.put(meeting('m2') as never)
    await localUpdate('meetings', { id: 'm2' }, { status: 'done' })
    await localUpdate('meetings', { id: 'm2' }, { need: 'POC' })
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'update', payload: { status: 'done', need: 'POC' } })
  })

  it('ne fusionne jamais dans une opération en cours d’envoi (verrouillée)', async () => {
    await localInsert('meetings', meeting('m1'))
    const [op] = await db.outbox.toArray()
    await db.outbox.update(op!.seq!, { locked: true })
    await localUpdate('meetings', { id: 'm1' }, { status: 'done' })
    const ops = await db.outbox.orderBy('seq').toArray()
    expect(ops.map((o) => o.kind)).toEqual(['insert', 'update'])
    expect(ops[0]!.payload).not.toHaveProperty('interest')
    expect(ops[1]!.payload).toEqual({ status: 'done' })
  })

  it('ignore la modification d’une ligne inconnue', async () => {
    await localUpdate('meetings', { id: 'nope' }, { status: 'done' })
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('suppression physique (taggings)', () => {
  const tagging = { tag_id: 'tag', taggable_table: 'companies', taggable_id: 'c1', team_id: 't' }
  const key = { tag_id: 'tag', taggable_table: 'companies', taggable_id: 'c1' }

  it('annule tout quand la ligne n’est jamais partie au serveur', async () => {
    await localInsert('taggings', tagging)
    await localDelete('taggings', key)
    expect(await db.taggings.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('envoie une suppression pour une ligne déjà connue du serveur', async () => {
    await db.taggings.put(tagging as never)
    await localDelete('taggings', key)
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'delete', table: 'taggings', key })
  })
})
