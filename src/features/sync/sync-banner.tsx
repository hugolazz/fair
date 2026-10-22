import { CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useSync } from './use-sync'

/** Combien de temps « Tout est synchronisé » reste affiché. */
const SYNCED_MS = 3_000

/**
 * État des envois, toujours dit en clair : « Hors ligne : 2 modifications en attente », « Envoi… », « Tout est
 * synchronisé », ou un refus du serveur à traiter. Rien ne s'affiche quand tout va bien.
 */
export function SyncBanner() {
  const { t } = useTranslation('sync')
  const { snapshot, retryFailed, discardFailed } = useSync()
  const [justSynced, setJustSynced] = useState(false)

  // « Tout est synchronisé » seulement quand la file vient de se vider après un envoi réel.
  const { lastSyncedAt, pending } = snapshot
  useEffect(() => {
    if (lastSyncedAt === null || pending > 0) return
    const show = window.setTimeout(() => setJustSynced(true), 0)
    const hide = window.setTimeout(() => setJustSynced(false), SYNCED_MS)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [lastSyncedAt, pending])

  let text: string | null = null
  let tone: 'info' | 'warn' | 'error' | 'ok' = 'info'
  if (snapshot.failed > 0) {
    text = t('failed', { count: snapshot.failed })
    tone = 'error'
  } else if (snapshot.pending > 0 && snapshot.status === 'offline') {
    text = t('offline', { count: snapshot.pending })
    tone = 'warn'
  } else if (snapshot.pending > 0) {
    text = t('syncing', { count: snapshot.pending })
  } else if (justSynced) {
    text = t('synced')
    tone = 'ok'
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-[1040px] px-4 empty:hidden md:px-10"
    >
      {text ? (
        <p
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
      ) : null}
    </div>
  )
}
