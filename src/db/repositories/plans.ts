// Plan du salon : plans (image), pins et rattachement aux entreprises, directement sur Supabase.
import { z } from 'zod'
import { newId } from '@/lib/ids'
import { supabase } from '@/lib/supabase'
import {
  FLOORPLAN_COLUMNS,
  PIN_COLUMNS,
  floorplanRowSchema,
  planPinRowSchema,
  toFloorplan,
  toPlanPin,
  type Floorplan,
  type PlanPin,
} from '../schemas/plan'

export type PlanCtx = { teamId: string; eventId: string }
export type NewPlanImage = { blob: Blob; mime: string; width: number; height: number }

const BUCKET = 'attachments'
const extOf = (mime: string) =>
  mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'

const pathRow = z.object({ storage_path: z.string().nullable() })

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Comme check, mais la donnée doit exister. */
function need<T>(res: { data: T | null; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  if (res.data === null || res.data === undefined) throw new Error('not found')
  return res.data as NonNullable<T>
}

export async function listPlans(eventId: string): Promise<Floorplan[]> {
  const rows = check(
    await supabase
      .from('floorplans')
      .select(FLOORPLAN_COLUMNS)
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('id'), // les UUIDv7 se trient par date de création
  )
  return floorplanRowSchema.array().parse(rows).map(toFloorplan)
}

/** Adresse temporaire (1 h) de l'image d'un plan : le bucket est privé. */
export async function getPlanImageUrl(attachmentId: string): Promise<string> {
  const att = pathRow.parse(
    need(await supabase.from('attachments').select('storage_path').eq('id', attachmentId).single()),
  )
  if (!att.storage_path) throw new Error('plan image has no file')
  const signed = need(await supabase.storage.from(BUCKET).createSignedUrl(att.storage_path, 3600))
  return signed.signedUrl
}

/** Crée un plan : l'image part dans le stockage, puis la pièce jointe et la ligne du plan. */
export async function createPlan(ctx: PlanCtx, name: string, image: NewPlanImage): Promise<string> {
  const planId = newId()
  const fileId = newId()
  const path = `${ctx.teamId}/${fileId}.${extOf(image.mime)}`
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, image.blob, { contentType: image.mime })
  if (up.error) throw new Error(up.error.message)
  try {
    check(
      await supabase.from('attachments').insert({
        id: fileId,
        team_id: ctx.teamId,
        owner_table: 'floorplans',
        owner_id: planId,
        kind: 'floorplan',
        storage_path: path,
        mime: image.mime,
        size_bytes: image.blob.size,
        status: 'uploaded',
      }),
    )
    check(
      await supabase.from('floorplans').insert({
        id: planId,
        team_id: ctx.teamId,
        event_id: ctx.eventId,
        name,
        attachment_id: fileId,
        width_px: image.width,
        height_px: image.height,
      }),
    )
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([path]) // pas de fichier orphelin
    throw e
  }
  return planId
}

/** Supprime le plan, ses pins et son image (suppression logique des lignes, le fichier est retiré). */
export async function deletePlan(plan: Floorplan): Promise<void> {
  const now = new Date().toISOString()
  check(
    await supabase
      .from('plan_pins')
      .update({ deleted_at: now })
      .eq('floorplan_id', plan.id)
      .is('deleted_at', null),
  )
  check(await supabase.from('floorplans').update({ deleted_at: now }).eq('id', plan.id))
  if (plan.attachmentId) {
    const att = pathRow.parse(
      need(
        await supabase
          .from('attachments')
          .select('storage_path')
          .eq('id', plan.attachmentId)
          .single(),
      ),
    )
    check(
      await supabase.from('attachments').update({ deleted_at: now }).eq('id', plan.attachmentId),
    )
    if (att.storage_path) await supabase.storage.from(BUCKET).remove([att.storage_path])
  }
}

// --- Pins ------------------------------------------------------------------------------------------------------

export async function listPins(planId: string): Promise<PlanPin[]> {
  const rows = check(
    await supabase
      .from('plan_pins')
      .select(PIN_COLUMNS)
      .eq('floorplan_id', planId)
      .is('deleted_at', null)
      .order('id')
      .limit(5000),
  )
  return planPinRowSchema.array().parse(rows).map(toPlanPin)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const clean = (s: string | null | undefined) => {
  const v = (s ?? '').trim()
  return v === '' ? null : v
}

export type NewPin = {
  floorplanId: string
  x: number
  y: number
  /** Entreprise du salon (`event_companies.id`) ; vide = numéro de stand seul. */
  targetId?: string | null
  standLabel?: string | null
}

/**
 * Si la participation n'a pas de numéro de stand, celui saisi sur le pin la complète : il apparaît dans la
 * préparation, et la clé de stand sert ensuite au rapprochement avec le plan.
 */
async function fillTargetStand(targetId: string | null | undefined, stand: string | null) {
  if (!targetId || !stand) return
  check(
    await supabase
      .from('event_companies')
      .update({ stand_label: stand })
      .eq('id', targetId)
      .is('stand_label', null),
  )
}

export async function addPin(ctx: PlanCtx, pin: NewPin): Promise<string> {
  const stand = clean(pin.standLabel)
  const targetId = pin.targetId ?? null
  if (!targetId && !stand) throw new Error('pin needs a company or a stand')
  const id = newId()
  check(
    await supabase.from('plan_pins').insert({
      id,
      team_id: ctx.teamId,
      event_id: ctx.eventId,
      floorplan_id: pin.floorplanId,
      event_company_id: targetId,
      stand_label: stand,
      x: clamp01(pin.x),
      y: clamp01(pin.y),
    }),
  )
  await fillTargetStand(targetId, stand)
  return id
}

export async function movePin(id: string, x: number, y: number): Promise<void> {
  check(
    await supabase
      .from('plan_pins')
      .update({ x: clamp01(x), y: clamp01(y) })
      .eq('id', id),
  )
}

export type PinPatch = { targetId?: string | null; standLabel?: string | null }

/** Relie / délie une entreprise, change le numéro de stand. Un pin garde toujours au moins l'un des deux. */
export async function updatePin(pin: PlanPin, patch: PinPatch): Promise<void> {
  const targetId = 'targetId' in patch ? (patch.targetId ?? null) : pin.targetId
  const stand = 'standLabel' in patch ? clean(patch.standLabel) : pin.standLabel
  if (!targetId && !stand) throw new Error('pin needs a company or a stand')
  check(
    await supabase
      .from('plan_pins')
      .update({ event_company_id: targetId, stand_label: stand })
      .eq('id', pin.id),
  )
  await fillTargetStand(targetId, stand)
}

export async function removePin(id: string): Promise<void> {
  check(
    await supabase.from('plan_pins').update({ deleted_at: new Date().toISOString() }).eq('id', id),
  )
}

/** Annule une suppression (« Annuler » juste après avoir retiré un pin). */
export async function restorePin(id: string): Promise<void> {
  check(await supabase.from('plan_pins').update({ deleted_at: null }).eq('id', id))
}
