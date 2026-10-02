import { z } from 'zod'

export const floorplanRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  attachment_id: z.string().nullable(),
  width_px: z.number().nullable(),
  height_px: z.number().nullable(),
})

/** Plan du salon : l'image est une pièce jointe (`attachmentId`) dans le bucket privé `attachments`. */
export type Floorplan = {
  id: string
  name: string
  attachmentId: string | null
  width: number
  height: number
}

export const toFloorplan = (r: z.infer<typeof floorplanRowSchema>): Floorplan => ({
  id: r.id,
  name: r.name,
  attachmentId: r.attachment_id,
  width: r.width_px ?? 2000,
  height: r.height_px ?? 1400,
})

export const planPinRowSchema = z.object({
  id: z.string(),
  floorplan_id: z.string(),
  event_company_id: z.string().nullable(),
  stand_label: z.string().nullable(),
  x: z.coerce.number(),
  y: z.coerce.number(),
  review_status: z.enum(['confirmed', 'suggested']),
})

/**
 * Pin posé sur un plan. `x`/`y` sont normalisés (0..1). Un pin relie une entreprise du salon, un simple numéro de
 * stand, ou les deux. `reviewStatus = 'suggested'` est réservé à l'OCR (pas encore implémenté).
 */
export type PlanPin = {
  id: string
  floorplanId: string
  targetId: string | null
  standLabel: string | null
  x: number
  y: number
  reviewStatus: 'confirmed' | 'suggested'
}

export const toPlanPin = (r: z.infer<typeof planPinRowSchema>): PlanPin => ({
  id: r.id,
  floorplanId: r.floorplan_id,
  targetId: r.event_company_id,
  standLabel: r.stand_label,
  x: r.x,
  y: r.y,
  reviewStatus: r.review_status,
})

export const PIN_COLUMNS = 'id, floorplan_id, event_company_id, stand_label, x, y, review_status'
export const FLOORPLAN_COLUMNS = 'id, name, attachment_id, width_px, height_px'
