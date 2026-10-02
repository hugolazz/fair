import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, replaceDbForTests } from '../local/db'
import {
  addPhoto,
  createNote,
  createUnplanned,
  editNote,
  ensureMeeting,
  findMyMeeting,
  setCompanyTag,
  updateMeeting,
} from './field'

const ctx = { teamId: 't', eventId: 'e', userId: 'me' }
let n = 0
beforeEach(() => {
  replaceDbForTests(`field-test-${++n}`)
})

describe('rencontre : créée en local à la première saisie', () => {
  it('ne crée qu’une seule rencontre même avec des écritures simultanées', async () => {
    const ids = await Promise.all([
      ensureMeeting(ctx, 'ec1'),
      ensureMeeting(ctx, 'ec1'),
      ensureMeeting(ctx, 'ec1'),
    ])
    expect(new Set(ids).size).toBe(1)
    expect(await db.meetings.count()).toBe(1)
    expect(await db.outbox.count()).toBe(1)
  })

  it('statut, intérêt et champs structurés : une seule opération d’envoi fusionnée', async () => {
    await updateMeeting(ctx, 'ec1', { status: 'follow_up' })
    await updateMeeting(ctx, 'ec1', { interest: 5 })
    await updateMeeting(ctx, 'ec1', {
      need: 'POC paiement',
      budget: '50 k€',
      timing: 'T3',
      decision_maker: 'DSI',
      next_step: 'Envoyer devis',
    })
    const m = await findMyMeeting(ctx, 'ec1')
    expect(m).toMatchObject({
      status: 'follow_up',
      interest: 5,
      need: 'POC paiement',
      owner_id: 'me',
      is_unplanned: false,
    })
    const ops = await db.outbox.toArray()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.payload).toMatchObject({ status: 'follow_up', interest: 5, budget: '50 k€' })
  })

  it('réutilise ma rencontre existante au lieu d’en créer une seconde', async () => {
    const a = await ensureMeeting(ctx, 'ec1')
    await db.outbox.clear()
    expect(await ensureMeeting(ctx, 'ec1')).toBe(a)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('notes', () => {
  it('crée la rencontre et la note ensemble, puis modifie la même note sans multiplier les envois', async () => {
    const id = await createNote(ctx, 'ec1', 'Bon')
    await editNote(id, 'Bon contact')
    await editNote(id, 'Bon contact, rappeler mardi')
    const notes = await db.notes.toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      body: 'Bon contact, rappeler mardi',
      author_id: 'me',
      source: 'typed',
    })
    expect(notes[0]!.meeting_id).toBe((await findMyMeeting(ctx, 'ec1'))!.id)
    const ops = (await db.outbox.toArray()).map((o) => `${o.table}:${o.kind}`)
    expect(ops).toEqual(['meetings:insert', 'notes:insert']) // la note fusionne ses modifications
  })

  it('une note vidée est supprimée', async () => {
    const id = await createNote(ctx, 'ec1', 'à effacer')
    await editNote(id, '   ')
    expect((await db.notes.get(id))!.deleted_at).toBeTruthy()
  })
})

describe('tags', () => {
  it('pose puis retire un tag sans rien envoyer si le tag n’est jamais parti', async () => {
    await setCompanyTag('t', 'c1', 'tag1', true)
    expect(await db.taggings.count()).toBe(1)
    await setCompanyTag('t', 'c1', 'tag1', false)
    expect(await db.taggings.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })
  it('poser deux fois le même tag ne le duplique pas', async () => {
    await setCompanyTag('t', 'c1', 'tag1', true)
    await setCompanyTag('t', 'c1', 'tag1', true)
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('photos', () => {
  it('stocke le fichier en local et une pièce jointe « en attente »', async () => {
    const id = await addPhoto(ctx, 'ec1', new Blob(['jpeg'], { type: 'image/jpeg' }), 'image/jpeg')
    expect(await db.blobs.get(id)).toBeTruthy()
    expect(await db.attachments.get(id)).toMatchObject({
      kind: 'badge_photo',
      status: 'pending',
      owner_table: 'meetings',
      size_bytes: 4,
    })
  })
})

describe('rencontre imprévue', () => {
  it('crée entreprise, participation, assignation, contact, rencontre « imprévue » et note', async () => {
    const { targetId, meetingId } = await createUnplanned(ctx, {
      companyName: '  Nouvelle  Startup ',
      contactName: 'Jean Martin',
      note: 'Croisé au bar',
    })
    expect(await db.companies.toArray()).toMatchObject([
      { name: 'Nouvelle Startup', name_normalized: 'nouvelle startup', source: 'manual' },
    ])
    expect(await db.event_companies.get(targetId)).toMatchObject({ event_id: 'e' })
    expect(await db.event_company_assignees.toArray()).toMatchObject([
      { event_company_id: targetId, user_id: 'me' },
    ])
    expect(await db.contacts.toArray()).toMatchObject([{ first_name: 'Jean', last_name: 'Martin' }])
    expect(await db.meetings.get(meetingId)).toMatchObject({
      is_unplanned: true,
      status: 'done',
      owner_id: 'me',
    })
    expect(await db.notes.toArray()).toMatchObject([{ body: 'Croisé au bar' }])
    // Ordre d'envoi : parents avant enfants.
    expect((await db.outbox.orderBy('seq').toArray()).map((o) => o.table)).toEqual([
      'companies',
      'event_companies',
      'event_company_assignees',
      'contacts',
      'meetings',
      'notes',
    ])
  })

  it('retrouve l’entreprise déjà connue (autre graphie) au lieu d’en créer une seconde', async () => {
    await db.companies.put({
      id: 'c1',
      team_id: 't',
      name: 'Carrefour SA',
      name_normalized: 'carrefour',
      deleted_at: null,
    } as never)
    await createUnplanned(ctx, { companyName: 'CARREFOUR', contactName: '', note: '' })
    expect(await db.companies.count()).toBe(1)
    expect((await db.event_companies.toArray())[0]!.company_id).toBe('c1')
    expect(await db.contacts.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
  })

  it('réutilise la participation existante au salon', async () => {
    await db.companies.put({
      id: 'c1',
      team_id: 't',
      name: 'Acme',
      name_normalized: 'acme',
      deleted_at: null,
    } as never)
    await db.event_companies.put({
      id: 'ec1',
      team_id: 't',
      event_id: 'e',
      company_id: 'c1',
      deleted_at: null,
    } as never)
    const { targetId } = await createUnplanned(ctx, {
      companyName: 'Acme',
      contactName: '',
      note: '',
    })
    expect(targetId).toBe('ec1')
    expect(await db.event_companies.count()).toBe(1)
  })
})
