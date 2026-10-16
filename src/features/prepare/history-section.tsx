import { useTranslation } from 'react-i18next'
import { ErrorState } from '@/components/page-states'
import { fetchHistory } from '@/db/repositories/targets'
import type { HistoryEntry } from '@/db/schemas/prepare'
import { useAsync } from '@/lib/use-async'
import { PriorityBadge } from './atoms'
import { formatDay } from './lib/format'

function Entry({ entry, defaultOpen }: { entry: HistoryEntry; defaultOpen: boolean }) {
  const { t } = useTranslation('prepare')
  const when = entry.startsOn ? formatDay(entry.startsOn) : ''
  return (
    <details open={defaultOpen} className="rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
        <PriorityBadge priority={entry.priority} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{entry.eventName}</span>
          <span className="block truncate text-sm text-slate-600">
            {[when, entry.city, entry.stand && t('sheet.stand', { stand: entry.stand })]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-3 py-3 text-sm">
        {entry.meetings.map((m) => (
          <div key={m.id} className="flex flex-col gap-1">
            <p className="font-medium">
              {m.plannedAt
                ? t('history.meetingOn', { date: formatDay(m.plannedAt) })
                : t('history.status.' + m.status, { defaultValue: m.status })}
              {m.temperature
                ? ` · ${t(`history.temperature.${m.temperature}`, { defaultValue: m.temperature })}`
                : ''}
            </p>
            {m.outcome ? (
              <p>
                <span className="text-slate-600">{t('history.outcome')} : </span>
                {m.outcome}
              </p>
            ) : null}
            {m.nextStep ? (
              <p>
                <span className="text-slate-600">{t('history.nextStep')} : </span>
                {m.nextStep}
              </p>
            ) : null}
            {m.notes.map((n) => (
              <p key={n.id} className="rounded bg-slate-50 p-2 whitespace-pre-wrap">
                {n.body}
              </p>
            ))}
          </div>
        ))}
        {entry.notes.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium text-slate-600">{t('history.notes')}</p>
            {entry.notes.map((n) => (
              <p key={n.id} className="rounded bg-slate-50 p-2 whitespace-pre-wrap">
                {n.body}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  )
}

type Props = {
  companyId: string
  eventId: string
  /** Historique saisi (colonne « Commentaire » de l'import ou saisie manuelle) : ce qu'on sait déjà de l'entreprise. */
  history: string
}

/**
 * Historique de l'entreprise : d'abord le texte renseigné (« déjà contacté M. X le 19 janvier pour… »), puis, repliées,
 * les rencontres et notes enregistrées dans fair lors d'autres salons (hors salons supprimés).
 */
export function HistorySection({ companyId, eventId, history }: Props) {
  const { t } = useTranslation('prepare')
  const { data, error, loading, reload } = useAsync(
    () => fetchHistory(companyId, eventId),
    [companyId, eventId],
  )
  const past = data ?? []
  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-3">
      <h3 id="history-title" className="text-base font-semibold">
        {t('history.title')}
      </h3>
      {history ? (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-base whitespace-pre-wrap">
          {history}
        </p>
      ) : !loading && past.length === 0 ? (
        <p className="text-sm text-slate-600">{t('history.noneWritten')}</p>
      ) : null}
      {error ? <ErrorState message={t('history.loadError')} onRetry={reload} /> : null}
      {past.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-semibold">
            {t('history.otherEvents', { count: past.length })}
          </summary>
          <div className="flex flex-col gap-2 border-t border-slate-100 p-2">
            {past.map((e, i) => (
              <Entry key={e.id} entry={e} defaultOpen={i === 0} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
