import { CircleCheck, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { resolveConflict, useOpenConflicts } from '@/db/repositories/conflicts'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/use-now'
import { forceSync } from '@/sync/manager'
import { pickView, type ViewKey } from './pick-view'
import { usePendingCount, useSyncStatus } from '@/sync/status'

const VIEWS: Record<ViewKey, { tone: string; Icon: typeof CircleCheck }> = {
  ok: { tone: 'text-slate-600', Icon: CircleCheck },
  offline: { tone: 'text-amber-900 bg-amber-100', Icon: CloudOff },
  syncing: { tone: 'text-slate-600', Icon: RefreshCw },
  pending: { tone: 'text-amber-900', Icon: RefreshCw },
  error: { tone: 'text-red-900 bg-red-100', Icon: TriangleAlert },
  conflicts: { tone: 'text-amber-950 bg-amber-100', Icon: TriangleAlert },
}

/** Indicateur discret (icône + mot) : un tap ouvre le détail, l'envoi manuel et la résolution des conflits. */
export function SyncIndicator({ className }: { className?: string }) {
  const { t } = useTranslation('offline')
  const status = useSyncStatus()
  const { pending, failed } = usePendingCount()
  const conflicts = useOpenConflicts()
  const [open, setOpen] = useState(false)
  const key = pickView({ phase: status.phase, pending, conflicts: conflicts.length })
  const { tone, Icon } = VIEWS[key]
  const label =
    key === 'offline' && pending > 0
      ? t('indicator.offlinePending', { count: pending })
      : key === 'pending'
        ? t('indicator.pending', { count: pending })
        : key === 'conflicts'
          ? t('indicator.conflicts', { count: conflicts.length })
          : t(`indicator.${key}`)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${t('indicator.label')} : ${label}. ${t('indicator.open')}`}
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
          tone,
          className,
        )}
      >
        <Icon aria-hidden className={cn('size-3.5', key === 'syncing' && 'animate-spin')} />
        <span role="status">{label}</span>
      </button>
      {open ? (
        <SyncDialog onClose={() => setOpen(false)} pending={pending} failed={failed} />
      ) : null}
    </>
  )
}

function SyncDialog({
  onClose,
  pending,
  failed,
}: {
  onClose: () => void
  pending: number
  failed: number
}) {
  const { t } = useTranslation('offline')
  const status = useSyncStatus()
  const conflicts = useOpenConflicts()
  const now = useNow()
  const minutes = status.lastSyncAt
    ? Math.max(0, Math.round((now - status.lastSyncAt) / 60_000))
    : null
  const last =
    minutes === null
      ? t('dialog.never')
      : minutes === 0
        ? t('dialog.now')
        : t('dialog.ago', { minutes })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('dialog.title')}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-600">{t('dialog.state')}</dt>
          <dd className="font-medium">
            {t(`indicator.${pickView({ phase: status.phase, pending, conflicts: 0 })}`)}
          </dd>
          <dt className="text-slate-600">{t('dialog.pending')}</dt>
          <dd className="font-medium tabular-nums">{pending}</dd>
          {failed > 0 ? (
            <>
              <dt className="text-slate-600">{t('dialog.failed')}</dt>
              <dd className="font-medium text-red-700 tabular-nums">{failed}</dd>
            </>
          ) : null}
          <dt className="text-slate-600">{t('dialog.lastSync')}</dt>
          <dd className="font-medium">{last}</dd>
        </dl>
        {status.phase === 'offline' ? (
          <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
            {t('dialog.offlineHelp')}
          </p>
        ) : null}
        {status.phase === 'error' ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{t('dialog.errorHelp')}</p>
        ) : null}
        {failed > 0 ? <p className="text-sm text-slate-700">{t('dialog.failedHelp')}</p> : null}
        <div>
          <Button
            onClick={() => void forceSync()}
            disabled={status.phase === 'syncing' || status.phase === 'offline'}
          >
            <RefreshCw
              aria-hidden
              className={cn('size-4', status.phase === 'syncing' && 'animate-spin')}
            />
            {t('dialog.syncNow')}
          </Button>
        </div>

        <section
          aria-labelledby="conflicts-title"
          className="flex flex-col gap-3 border-t border-slate-200 pt-4"
        >
          <h3 id="conflicts-title" className="font-semibold">
            {t('conflicts.title')}
          </h3>
          {conflicts.length === 0 ? (
            <p className="text-sm text-slate-600">{t('conflicts.none')}</p>
          ) : (
            <p className="text-sm text-slate-700">{t('conflicts.help')}</p>
          )}
          {conflicts.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
            >
              <div>
                <p className="font-semibold">{t('conflicts.mine')}</p>
                <p className="whitespace-pre-wrap">{c.mine}</p>
              </div>
              <div>
                <p className="font-semibold">{t('conflicts.theirs')}</p>
                <p className="whitespace-pre-wrap">{c.theirs}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-9" onClick={() => void resolveConflict(c.id, 'both')}>
                  {t('conflicts.both')}
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-9"
                  onClick={() => void resolveConflict(c.id, 'mine')}
                >
                  {t('conflicts.keepMine')}
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-9"
                  onClick={() => void resolveConflict(c.id, 'theirs')}
                >
                  {t('conflicts.keepTheirs')}
                </Button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </Dialog>
  )
}
