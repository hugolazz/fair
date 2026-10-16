import { useTranslation } from 'react-i18next'
import type { EventStatus } from '@/db/schemas/event'
import { cn } from '@/lib/cn'

const STYLES: Record<EventStatus, { text: string; dot: string }> = {
  draft: { text: 'text-slate-600', dot: 'bg-[#cfcbbf]' },
  preparing: { text: 'text-gold-700', dot: 'bg-gold-500' },
  live: { text: 'text-brand-600', dot: 'bg-brand-600 animate-pulse-dot' },
  done: { text: 'text-slate-600', dot: 'bg-[#a9c9c3]' },
  archived: { text: 'text-slate-600', dot: 'bg-[#cfcbbf]' },
}

/** Statut = point + texte (jamais la couleur seule). « En cours » : le point pulse. */
export function StatusBadge({ status, className }: { status: EventStatus; className?: string }) {
  const { t } = useTranslation('events')
  const s = STYLES[status]
  return (
    <span className={cn('inline-flex items-center gap-2 text-[13px]', s.text, className)}>
      <span aria-hidden className={cn('size-[7px] rounded-full', s.dot)} />
      {t(`status.${status}`)}
    </span>
  )
}
