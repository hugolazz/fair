import { useLiveQuery } from 'dexie-react-hooks'
import { Smartphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { db } from '@/db/local/db'
import { usePinned } from '@/sync/offline-events'

/** Salons téléchargés sur l'appareil : accessibles sans réseau (lus depuis la base locale). */
export function DownloadedEvents() {
  const { t } = useTranslation('offline')
  const pins = usePinned()
  const ids = pins ? [...pins.keys()] : []
  const events = useLiveQuery(
    async () => (await db.events.bulkGet(ids)).filter((e) => !!e && !e.deleted_at),
    [ids.join(',')],
    [],
  )
  if (!events || events.length === 0) return null
  return (
    <section
      aria-labelledby="downloaded-title"
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <h2 id="downloaded-title" className="flex items-center gap-2 font-semibold">
        <Smartphone aria-hidden className="size-5" />
        {t('eventsOffline.downloaded')}
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        {navigator.onLine
          ? t('eventsOffline.downloadedHelp')
          : `${t('eventsOffline.unavailable')} ${t('eventsOffline.downloadedHelp')}`}
      </p>
      <ul className="flex flex-col gap-2">
        {events.map((e) =>
          e ? (
            <li key={e.id}>
              <Link
                to={`/events/${e.id}/field`}
                className="hover:border-brand-600 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
              >
                <span className="min-w-0 truncate font-medium">{e.name}</span>
                <span className="text-brand-700 shrink-0 text-sm font-semibold">
                  {t('eventsOffline.terrain')}
                </span>
              </Link>
            </li>
          ) : null,
        )}
      </ul>
    </section>
  )
}
