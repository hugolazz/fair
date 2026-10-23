import { useTranslation } from 'react-i18next'
import { ErrorState } from '@/components/page-states'
import { fetchHistory } from '@/db/repositories/targets'
import type { HistoryEntry } from '@/db/schemas/prepare'
import { newsTitleOf } from '@shared/exports/labels.ts'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { formatDay } from './lib/format'

const BADGE =
  'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 whitespace-nowrap'

/**
 * Un ancien salon fair : son nom et sa date, puis pour chaque rencontre le contact vu, l'intérêt sur 5, les cases
 * « à recontacter » et « Actualité » (celle-ci seulement si l'équipe a activé l'option) et les notes.
 */
function Entry({
  entry,
  defaultOpen,
  showNews,
  newsTitle,
}: {
  entry: HistoryEntry
  defaultOpen: boolean
  showNews: boolean
  newsTitle: string
}) {
  const { t } = useTranslation('prepare')
  return (
    <details open={defaultOpen} className="rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-medium">{entry.eventName}</span>
        {entry.startsOn ? (
          <span className="text-sm text-slate-600">{formatDay(entry.startsOn)}</span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-3 py-3 text-sm">
        {entry.meetings.map((m) => (
          <div key={m.id} className="flex flex-col gap-1.5">
            {m.contactName ? (
              <p>
                <span className="text-slate-600">{t('history.contactMet')} : </span>
                {m.contactName}
              </p>
            ) : null}
            {m.interest ? (
              <p>
                <span className="text-slate-600">{t('history.interest')} : </span>
                {t('history.interestOf', { n: m.interest })}
              </p>
            ) : null}
            {m.recontact || (showNews && m.news) ? (
              <p className="flex flex-wrap gap-1.5">
                {m.recontact ? <span className={BADGE}>{t('history.recontact')}</span> : null}
                {showNews && m.news ? <span className={BADGE}>{newsTitle}</span> : null}
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
 * Historique de l'entreprise : d'abord le texte renseigné (« déjà contacté M. X le 19 janvier pour… »), puis, repliés,
 * les autres salons fair où elle a eu une rencontre ou une note (hors salons supprimés).
 */
export function HistorySection({ companyId, eventId, history }: Props) {
  const { t } = useTranslation('prepare')
  const { membership } = useReadySession()
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
              <Entry
                key={e.id}
                entry={e}
                defaultOpen={i === 0}
                showNews={membership.newsEnabled}
                newsTitle={newsTitleOf(membership.newsLabel)}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
