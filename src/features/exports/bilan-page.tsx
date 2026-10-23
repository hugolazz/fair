import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { computeBilan } from '@shared/exports/bilan.ts'
import { formatDate } from '@shared/exports/format.ts'
import { ErrorState, Loading } from '@/components/page-states'
import { PriorityBadge } from '@/features/prepare/atoms'
import { useEvent } from '@/features/events/event-context'
import { useExportData } from './use-export-data'

function Card({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 ${className ?? ''}`}
    >
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Kpi({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-slate-700">{label}</p>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  )
}

/** Bilan du salon : entreprises rencontrées, manquées et imprévues, répartitions, top opportunités, actions en attente. */
export default function BilanPage() {
  const { t } = useTranslation('exports')
  const { t: tp } = useTranslation('prepare')
  const { event } = useEvent()
  const { data, error, loading, reload } = useExportData(event.id)
  const bilan = useMemo(() => (data ? computeBilan(data) : null), [data])

  if (loading && !data) return <Loading />
  if (error || !data || !bilan) return <ErrorState message={t('errors.load')} onRetry={reload} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{t('bilan.title')}</h2>
        <p className="text-sm text-slate-700">
          {t('bilan.generatedAt', { date: formatDate(data.generatedAt, data.event.timezone) })}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi value={`${bilan.targetsMet} / ${bilan.targets}`} label={t('bilan.kpiMet')} />
        <Kpi
          value={String(bilan.missed)}
          label={t('bilan.kpiMissed')}
          hint={t('bilan.kpiMissedHint')}
        />
        <Kpi
          value={String(bilan.unplanned)}
          label={t('bilan.kpiUnplanned')}
          hint={t('bilan.kpiUnplannedHint')}
        />
      </div>

      <Card title={t('bilan.byPriority')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-700">
                <th scope="col" className="py-1 pr-3">
                  {tp('priority.label')}
                </th>
                <th scope="col" className="py-1 pr-3 text-right">
                  {t('bilan.companies')}
                </th>
                <th scope="col" className="py-1 pr-3 text-right">
                  {t('bilan.met')}
                </th>
                <th scope="col" className="py-1 text-right">
                  {t('bilan.missed')}
                </th>
              </tr>
            </thead>
            <tbody>
              {bilan.byPriority.map((p) => (
                <tr key={p.priority} className="border-t border-slate-100">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    <span className="inline-flex items-center gap-2">
                      <PriorityBadge priority={p.priority === 'none' ? null : p.priority} />
                      {tp(`priority.${p.priority}`)}
                    </span>
                  </th>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.targets}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.met}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.missed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('bilan.bySalesperson')}>
        {bilan.bySalesperson.length === 0 ? (
          <p className="text-sm text-slate-700">{t('bilan.noSalesperson')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-700">
                  <th scope="col" className="py-1 pr-3">
                    {t('bilan.salesperson')}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    {t('bilan.assigned')}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    {t('bilan.met')}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right">
                    {t('bilan.missed')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('bilan.avgInterest')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bilan.bySalesperson.map((s) => (
                  <tr key={s.userId} className="border-t border-slate-100">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                      {s.name}
                    </th>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.targets}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.met}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.missed}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.avgInterest === null ? '—' : s.avgInterest.toFixed(1).replace('.', ',')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('bilan.top')}>
          {bilan.topOpportunities.length === 0 ? (
            <p className="text-sm text-slate-700">{t('bilan.noTop')}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {bilan.topOpportunities.map((o) => (
                <li
                  key={o.meetingId}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 p-2"
                >
                  <PriorityBadge priority={o.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {o.company}
                      {o.stand ? ` · ${tp('sheet.stand', { stand: o.stand })}` : ''}
                    </p>
                    <p className="text-sm text-slate-700">
                      {o.owner}
                      {o.nextStep ? ` · ${o.nextStep}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-bold">
                    {t('bilan.interestOf', { n: o.interest })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title={t('bilan.pending', { count: bilan.pendingActions.length })}>
          {bilan.pendingActions.length === 0 ? (
            <p className="text-sm text-slate-700">{t('bilan.noPending')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {bilan.pendingActions.map((a) => (
                <li
                  key={`${a.kind}-${a.id}`}
                  className="rounded-lg border border-slate-200 p-2 text-sm"
                >
                  <p className="font-medium">{a.company}</p>
                  <p className="text-slate-700">
                    {a.owner}
                    {a.dueOn ? ` · ${t('bilan.due', { date: formatDate(a.dueOn) })}` : ''}
                    {a.action ? ` · ${a.action}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
