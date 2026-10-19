import { toIso } from '@/lib/calendar'

const slot = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** « mer. 12 mai, 14:30 » (fuseau de l'appareil). */
export const formatSlot = (iso: string) => slot.format(new Date(iso))
export const formatDay = (iso: string) => day.format(new Date(iso))
export const formatTime = (iso: string) => time.format(new Date(iso))

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO (UTC) → valeurs des champs `date` et `time` du formulaire, dans le fuseau de l'appareil. */
export function toLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: toIso(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** Champs `date` + `time` (heure locale de l'appareil) → ISO UTC ; null si incomplet ou invalide. */
export function fromLocalInputs(date: string, timeValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(timeValue)) return null
  const d = new Date(`${date}T${timeValue}:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
