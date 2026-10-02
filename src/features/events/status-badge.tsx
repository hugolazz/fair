import { Archive, CheckCircle2, CircleDot, FileEdit, Radio, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EventStatus } from '@/db/schemas/event'
import { cn } from '@/lib/cn'

const STYLES: Record<EventStatus, { icon: LucideIcon; className: string }> = {
  draft: { icon: FileEdit, className: 'bg-slate-100 text-slate-800' },
  preparing: { icon: CircleDot, className: 'bg-amber-100 text-amber-900' },
  live: { icon: Radio, className: 'bg-brand-100 text-brand-900' },
  done: { icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-900' },
  archived: { icon: Archive, className: 'bg-slate-100 text-slate-700' },
}

/** Statut = icône + texte (jamais la couleur seule). */
export function StatusBadge({ status }: { status: EventStatus }) {
  const { t } = useTranslation('events')
  const { icon: Icon, className } = STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`status.${status}`)}
    </span>
  )
}
