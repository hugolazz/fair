import { CloudOff, RefreshCw } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { prefetchStatus } from '@/db/repositories/prefetch'
import { staleStatus } from '@/lib/cache/cache'
import { cn } from '@/lib/cn'
import { useSync } from './use-sync'

const dateTime = new Intl.DateTimeFormat('fr', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

type Tone = 'info' | 'warn' | 'error' | 'ok'
type Line = { text: string; tone: Tone }

/**
 * État de l'appli face au réseau, toujours dit en clair : envois en attente (« Hors ligne : 2 modifications… »), envoi en cours (la fin est silencieuse : `data-pending="0"` la signale aux tests), refus du
 * serveur à traiter, données lues dans la copie locale (« Données enregistrées le … »), Le téléchargement du hors ligne est silencieux (`data-offline-ready` signale sa fin aux tests).
 * Rien ne s'affiche quand tout va bien.
 */
export function SyncBanner() {
  const { t } = useTranslation('sync')
  const { snapshot, retryFailed, discardFailed } = useSync()
  const staleSince = useSyncExternalStore(staleStatus.subscribe, staleStatus.getSnapshot)
  const prefetch = useSyncExternalStore(prefetchStatus.subscribe, prefetchStatus.getSnapshot)

  const lines: Line[] = []
  if (snapshot.failed > 0)
    lines.push({ text: t('failed', { count: snapshot.failed }), tone: 'error' })
  else if (snapshot.pending > 0 && snapshot.status === 'offline')
    lines.push({ text: t('offline', { count: snapshot.pending }), tone: 'warn' })
  else if (snapshot.pending > 0)
    lines.push({ text: t('syncing', { count: snapshot.pending }), tone: 'info' })
  if (staleSince !== null)
    lines.push({ text: t('stale', { date: dateTime.format(new Date(staleSince)) }), tone: 'warn' })

  return (
    <div
      role="status"
      aria-live="polite"
      data-pending={snapshot.pending}
      data-offline-ready={prefetch.status === 'done' ? 'true' : undefined}
      className="mx-auto flex w-full max-w-[1040px] flex-col gap-2 px-4 empty:hidden md:px-10"
    >
      {lines.map(({ text, tone }) => (
        <p
          key={text}
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm font-medium',
            tone === 'error' && 'bg-red-50 text-red-900',
            tone === 'warn' && 'bg-amber-100 text-amber-950',
            tone === 'ok' && 'bg-emerald-50 text-emerald-900',
            tone === 'info' && 'bg-slate-100 text-slate-800',
          )}
        >
          {tone === 'warn' ? <CloudOff aria-hidden className="size-4 shrink-0" /> : null}
          {tone === 'info' ? <RefreshCw aria-hidden className="size-4 shrink-0" /> : null}
          <span className="flex-1">{text}</span>
          {tone === 'error' ? (
            <span className="flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-9" onClick={retryFailed}>
                {t('retry')}
              </Button>
              <Button
                variant="ghost"
                className="min-h-9"
                onClick={() => {
                  if (window.confirm(t('discardConfirm'))) discardFailed()
                }}
              >
                {t('discard')}
              </Button>
            </span>
          ) : null}
        </p>
      ))}
    </div>
  )
}
