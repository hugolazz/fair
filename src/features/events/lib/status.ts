import { todayIso } from '@/lib/calendar'

/** Les trois états d'un salon, déduits de ses dates : jamais saisis à la main. */
export type SalonStatus = 'preparing' | 'live' | 'done'

/**
 * « En préparation » jusqu'à la veille du premier jour (et sans date), « En cours » du premier au dernier jour
 * inclus, « Passé » dès le lendemain du dernier jour. Un salon sans date de fin dure un jour.
 */
export function eventStatus(
  e: { starts_on: string | null; ends_on: string | null },
  today: string = todayIso(),
): SalonStatus {
  if (!e.starts_on) return 'preparing'
  const end = e.ends_on && e.ends_on >= e.starts_on ? e.ends_on : e.starts_on
  if (today < e.starts_on) return 'preparing'
  if (today <= end) return 'live'
  return 'done'
}
