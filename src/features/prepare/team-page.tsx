import { AlertTriangle, Users } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { useReadySession } from '@/features/auth-team/session'
import { useEvent } from '@/features/events/event-context'
import { buildTeamRows, filterTeamRows, type TeamFilter } from './lib/team-view'
import { TargetSheet } from './target-sheet'
import { useTargets } from './use-targets'

const FILTERS: TeamFilter[] = ['all', 'met', 'notMet', 'toFollowUp', 'duplicateRisk']

/** Vue équipe : pour chaque entreprise, qui l'a rencontrée et qui doit encore la voir (évite les relances en double). */
export default function TeamPage() {
  const { t } = useTranslation('prepare')
  const { event } = useEvent()
  const { session, membership } = useReadySession()
  const meId = session.user.id
  const api = useTargets(event.id, membership.teamId)
  const [filter, setFilter] = useState<TeamFilter>('all')
  const [person, setPerson] = useState('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string>()

  const all = useMemo(() => buildTeamRows(api.targets ?? []), [api.targets])
  const rows = useMemo(
    () => filterTeamRows(all, filter, search, person || null),
    [all, filter, search, person],
  )
  const name = (u: string) => (u === meId ? t('assign.me') : api.memberName(u))
  const names = (us: string[]) => (us.length ? us.map(name).join(', ') : t('team.nobody'))

  if (api.loading) return <Loading />
  if (api.error) return <ErrorState message={t('errors.load')} onRetry={api.reload} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{t('team.title')}</h2>
        <p className="text-sm text-slate-700">{t('team.subtitle')}</p>
      </div>

      {all.length === 0 ? (
        <EmptyState icon={<Users className="size-10" />} title={t('team.emptyAll')} body="" />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
              {t('team.search')}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base md:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('team.person')}
              <Select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-base md:text-sm"
              >
                <option value="">{t('team.everyone')}</option>
                {api.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {name(m.userId)}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div role="group" aria-label={t('team.title')} className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? 'inline-flex min-h-11 items-center rounded-full border border-slate-900 bg-slate-900 px-4 text-sm font-medium text-white md:min-h-9'
                    : 'inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium md:min-h-9'
                }
              >
                {t(`team.filter.${f}`)}
              </button>
            ))}
          </div>

          <p role="status" className="text-sm text-slate-700">
            {t('team.count', { count: rows.length })}
          </p>

          {rows.length === 0 ? (
            <p className="text-slate-700">{t('team.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      {t('team.col.company')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('team.col.metBy')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('team.col.pending')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('team.col.interest')}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {t('team.col.nextStep')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.target.id} className="border-t border-slate-100 align-top">
                      <th scope="row" className="px-3 py-2 font-medium">
                        <button
                          type="button"
                          onClick={() => setOpenId(r.target.id)}
                          className="min-h-11 min-w-11 text-left hover:underline md:min-h-9"
                        >
                          {r.target.name}
                        </button>
                        {r.duplicateRisk ? (
                          <span
                            title={t('team.duplicate')}
                            className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-900"
                          >
                            <AlertTriangle aria-hidden className="size-3.5" />
                            {t('team.duplicateShort')}
                          </span>
                        ) : null}
                      </th>
                      <td className="px-3 py-2">{names(r.metBy)}</td>
                      <td className="px-3 py-2">{r.pending.length ? names(r.pending) : '–'}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.bestInterest ? t('report.interestValue', { n: r.bestInterest }) : '–'}
                      </td>
                      <td className="px-3 py-2">
                        {r.followUps.length ? (
                          <ul>
                            {r.followUps.map((f, i) => (
                              <li key={i}>
                                {f.nextStep}{' '}
                                <span className="text-slate-600">({name(f.ownerId)})</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <TargetSheet
        target={api.targets?.find((x) => x.id === openId)}
        api={api}
        meId={meId}
        eventName={event.name}
        eventDate={event.starts_on ?? ''}
        onClose={() => setOpenId(undefined)}
      />
    </div>
  )
}
