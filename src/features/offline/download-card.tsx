import { useLiveQuery } from 'dexie-react-hooks'
import { Download, HardDrive, RefreshCw, Smartphone, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format-bytes'
import { useNow } from '@/lib/use-now'
import { downloadEvent, estimateEvent } from '@/sync/manager'
import { localEventSize, removeEventFromDevice, usePinned } from '@/sync/offline-events'

type Props = { eventId: string; className?: string }

/**
 * « Télécharger pour le terrain » : choix explicite, avec la taille annoncée avant et l'espace réellement
 * utilisé après. Un salon téléchargé reste lisible et modifiable sans réseau et se synchronise au retour.
 */
export function DownloadCard({ eventId, className }: Props) {
  const { t } = useTranslation('offline')
  const { t: tc } = useTranslation()
  const pins = usePinned()
  const pin = pins?.get(eventId)
  const online = useOnline()
  const [estimate, setEstimate] = useState<
    { bytes: number; targets: number } | 'loading' | 'failed'
  >('loading')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [blocked, setBlocked] = useState<number>()
  const used = useLiveQuery(() => (pin ? localEventSize(eventId) : 0), [eventId, pin?.pinnedAt])

  useEffect(() => {
    if (pin || !online) return
    let cancelled = false
    estimateEvent(eventId).then(
      (e) => !cancelled && setEstimate(e),
      () => !cancelled && setEstimate('failed'),
    )
    return () => {
      cancelled = true
    }
  }, [eventId, pin, online])

  async function download() {
    setError(false)
    setProgress({ done: 0, total: 1 })
    try {
      await downloadEvent(eventId, (_t, done, total) => setProgress({ done, total }))
    } catch {
      setError(true)
    } finally {
      setProgress(null)
    }
  }

  async function remove() {
    const res = await removeEventFromDevice(eventId)
    setConfirming(false)
    setBlocked(res.ok ? undefined : res.pending)
  }

  const now = useNow()
  const syncedMinutes = pin?.syncedAt
    ? Math.max(0, Math.round((now - Date.parse(pin.syncedAt)) / 60_000))
    : null
  const synced =
    syncedMinutes === null
      ? '—'
      : syncedMinutes === 0
        ? t('dialog.now')
        : t('dialog.ago', { minutes: syncedMinutes })
  const sizeText =
    estimate !== 'loading' && estimate !== 'failed' ? formatBytes(estimate.bytes) : null

  return (
    <section
      aria-labelledby={`dl-${eventId}`}
      className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 ${className ?? ''}`}
    >
      <h2 id={`dl-${eventId}`} className="flex items-center gap-2 font-semibold">
        <Smartphone aria-hidden className="size-5" />
        {t('download.title')}
      </h2>

      {pin ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <HardDrive aria-hidden className="size-4" />
            {t('download.downloaded')} · {t('download.size', { size: formatBytes(used ?? 0) })}
          </p>
          <p className="text-sm text-slate-600">{t('download.synced', { when: synced })}</p>
          {progress ? <Progress done={progress.done} total={progress.total} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/events/${eventId}/field`}>{t('download.open')}</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void download()}
              disabled={!online || !!progress}
            >
              <RefreshCw aria-hidden className="size-4" />
              {t('download.update')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden className="size-4" />
              {t('download.remove')}
            </Button>
          </div>
          {confirming ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"
            >
              <p>{t('download.removeConfirm')}</p>
              <div className="flex gap-2">
                <Button variant="danger" className="min-h-9" onClick={() => void remove()}>
                  {t('download.remove')}
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-9"
                  onClick={() => setConfirming(false)}
                >
                  {tc('actions.cancel')}
                </Button>
              </div>
            </div>
          ) : null}
          {blocked ? (
            <p role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
              {t('download.removeBlocked', { count: blocked })}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">{t('download.notDownloaded')}</p>
          {online ? (
            <p className="text-sm text-slate-600">
              {estimate === 'loading'
                ? t('download.estimating')
                : estimate === 'failed'
                  ? t('download.estimateFailed')
                  : t('download.estimate', { size: sizeText, count: estimate.targets })}
            </p>
          ) : (
            <p role="status" className="text-sm text-amber-900">
              {t('download.offlineNeeded')}
            </p>
          )}
          {progress ? <Progress done={progress.done} total={progress.total} /> : null}
          <div>
            <Button
              onClick={() => void download()}
              disabled={!online || !!progress}
              className="min-h-12"
            >
              <Download aria-hidden className="size-5" />
              {sizeText ? t('download.buttonWithSize', { size: sizeText }) : t('download.button')}
            </Button>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {t('download.error')}
        </p>
      ) : null}
    </section>
  )
}

function Progress({ done, total }: { done: number; total: number }) {
  const { t } = useTranslation('offline')
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1">
      <progress
        className="h-2 w-full"
        value={done}
        max={total}
        aria-label={t('download.downloading', { done, total })}
      />
      <p className="text-sm text-slate-600">{t('download.downloading', { done, total })}</p>
    </div>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
