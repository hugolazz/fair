import { CloudOff, RefreshCw, TriangleAlert, CircleCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { forceSync } from '@/sync/manager'
import { usePendingCount, useSyncStatus } from '@/sync/status'
import { cn } from '@/lib/cn'

/** État de la synchronisation : toujours visible, un tap force un nouvel essai. */
export function SyncBadge({ eventId }: { eventId: string }) {
  const { t } = useTranslation('field')
  const status = useSyncStatus()
  const { pending, failed } = usePendingCount()

  let label: string
  let Icon = CircleCheck
  let tone = 'text-emerald-900 bg-emerald-100'
  if (status.phase === 'offline') {
    label = pending ? t('sync.offlinePending', { count: pending }) : t('sync.offline')
    Icon = CloudOff
    tone = 'text-amber-900 bg-amber-100'
  } else if (status.phase === 'error') {
    label = pending ? t('sync.errorPending', { count: pending }) : t('sync.error')
    Icon = TriangleAlert
    tone = 'text-red-900 bg-red-100'
  } else if (status.phase === 'syncing') {
    label = t('sync.syncing')
    Icon = RefreshCw
    tone = 'text-slate-800 bg-slate-100'
  } else if (pending > 0) {
    label = t('sync.pending', { count: pending })
    Icon = RefreshCw
    tone = 'text-amber-900 bg-amber-100'
  } else {
    label = t('sync.ok')
  }

  return (
    <button
      type="button"
      onClick={() => void forceSync(eventId)}
      aria-label={`${t('sync.label')} : ${label}${failed ? ` · ${t('sync.failed', { count: failed })}` : ''}. ${t('sync.retry')}`}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium',
        tone,
      )}
    >
      <Icon aria-hidden className={cn('size-4', status.phase === 'syncing' && 'animate-spin')} />
      <span role="status">{label}</span>
    </button>
  )
}
