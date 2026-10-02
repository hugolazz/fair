import { CircleCheck, Eye, Phone, ThumbsDown, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MeetingStatus } from '@/db/local/db'
import { MEETING_STATUSES } from '@/db/repositories/field'
import { cn } from '@/lib/cn'

const STATUS_ICON: Record<string, LucideIcon> = {
  to_see: Eye,
  done: CircleCheck,
  follow_up: Phone,
  not_interested: ThumbsDown,
}

const STATUS_TONE: Record<string, string> = {
  to_see: 'bg-slate-100 text-slate-800',
  done: 'bg-emerald-100 text-emerald-900',
  follow_up: 'bg-amber-100 text-amber-900',
  not_interested: 'bg-red-100 text-red-900',
}

/** Statut = icône + texte (jamais la couleur seule). */
export function StatusPill({ status }: { status: MeetingStatus }) {
  const { t } = useTranslation('field')
  const Icon = STATUS_ICON[status] ?? Eye
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold',
        STATUS_TONE[status] ?? STATUS_TONE.to_see,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {t(`status.${status}`)}
    </span>
  )
}

/** Statut en UN tap : quatre gros boutons, le statut courant est marqué. */
export function StatusButtons({
  value,
  onChange,
}: {
  value: MeetingStatus
  onChange: (s: MeetingStatus) => void
}) {
  const { t } = useTranslation('field')
  return (
    <div role="group" aria-label={t('status.label')} className="grid grid-cols-2 gap-2">
      {MEETING_STATUSES.map((s) => {
        const Icon = STATUS_ICON[s]!
        const on = value === s
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(s)}
            className={cn(
              'flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-base font-bold',
              on
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-900 active:bg-slate-100',
            )}
          >
            <Icon aria-hidden className="size-6 shrink-0" />
            {t(`status.${s}`)}
          </button>
        )
      })}
    </div>
  )
}

/** Niveau d'intérêt de 1 à 5 ; toucher le niveau courant l'efface. */
export function InterestPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (n: number | null) => void
}) {
  const { t } = useTranslation('field')
  return (
    <div role="radiogroup" aria-label={t('fiche.interest')} className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('fiche.interestValue', { n })}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            'min-h-16 rounded-2xl border-2 text-2xl font-bold',
            value === n
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-300 bg-white text-slate-900 active:bg-slate-100',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
