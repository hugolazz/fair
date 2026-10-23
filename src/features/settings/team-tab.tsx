import { DoorOpen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import {
  leaveTeam,
  listMembers,
  removeMember,
  renameTeam,
  setNewsEnabled,
  updateMemberRole,
} from '@/db/repositories/teams'
import { isAdminRole } from '@/features/auth-team/roles'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { AccentPicker } from './accent-picker'
import { Section } from './section'
import { TeamLogo } from './team-logo'

/** Réglages de l'équipe : nom et logo, options des notes, membres et rôles, départ de l'équipe. */
export function TeamTab() {
  const { t } = useTranslation('settings')
  const { session, membership, refreshMembership } = useReadySession()
  const isAdmin = isAdminRole(membership.role)
  const { teamId } = membership

  const members = useAsync(() => listMembers(teamId), [teamId])
  const [teamName, setTeamName] = useState(membership.teamName)
  const [renameMsg, setRenameMsg] = useState<string>()

  const [memberError, setMemberError] = useState(false)
  async function changeMember(run: () => Promise<void>) {
    setMemberError(false)
    try {
      await run()
    } catch {
      setMemberError(true)
    }
    members.reload()
  }

  const [leaveError, setLeaveError] = useState(false)
  async function onLeave() {
    if (!window.confirm(t('leave.confirm', { team: membership.teamName }))) return
    setLeaveError(false)
    try {
      await leaveTeam(teamId)
      // Sans équipe, l'appli renvoie sur le choix d'une équipe ; sinon sur l'équipe rejointe auparavant.
      await refreshMembership()
    } catch {
      setLeaveError(true)
    }
  }

  const [newsOn, setNewsOn] = useState(membership.newsEnabled)
  const [newsError, setNewsError] = useState(false)
  const [newsSaved, setNewsSaved] = useState(false)
  async function onToggleNews(enabled: boolean) {
    setNewsError(false)
    setNewsSaved(false)
    setNewsOn(enabled)
    try {
      await setNewsEnabled(teamId, enabled)
      await refreshMembership()
      setNewsSaved(true)
    } catch {
      setNewsOn(!enabled)
      setNewsError(true)
    }
  }

  async function onRename(e: FormEvent) {
    e.preventDefault()
    if (!teamName.trim()) return
    await renameTeam(teamId, teamName.trim())
    await refreshMembership()
    setRenameMsg(t('team.renamed'))
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title={t('team.title')}>
        {isAdmin ? (
          <form onSubmit={onRename} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <InputField
                label={t('team.name')}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">
              {t('team.rename')}
            </Button>
          </form>
        ) : (
          <p className="font-medium">{membership.teamName}</p>
        )}
        {renameMsg ? (
          <p role="status" className="text-sm text-emerald-800">
            {renameMsg}
          </p>
        ) : null}

        <TeamLogo teamId={teamId} canEdit={isAdmin} />
      </Section>

      {isAdmin ? (
        <Section title={t('team.fields')}>
          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="size-6"
                checked={newsOn}
                onChange={(e) => void onToggleNews(e.target.checked)}
              />
              <span>{t('team.newsToggle')}</span>
            </label>
            <p className="text-sm text-slate-700">{t('team.newsHelp')}</p>
            {newsSaved ? (
              <p role="status" className="text-sm text-emerald-800">
                {t('team.newsSaved')}
              </p>
            ) : null}
            {newsError ? (
              <p role="alert" className="text-sm text-red-700">
                {t('team.newsError')}
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {isAdmin ? (
        <Section title={t('appearance.title')}>
          <AccentPicker />
        </Section>
      ) : null}

      <Section title={t('team.members')}>
        {members.loading && !members.data ? <Loading /> : null}
        {members.error ? <ErrorState onRetry={members.reload} /> : null}
        <p className="text-sm text-slate-700">{t('team.rolesHelp')}</p>
        {memberError ? (
          <p role="alert" className="text-sm text-red-700">
            {t('team.memberError')}
          </p>
        ) : null}
        <ul className="divide-y divide-slate-100">
          {members.data?.map((m) => {
            // Le propriétaire ne se gère pas ici ; on ne se retire pas soi-même.
            const manageable = isAdmin && m.role !== 'owner' && m.userId !== session.user.id
            const name = m.displayName || '?'
            return (
              <li
                key={m.userId}
                className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-2"
              >
                <span>
                  {name}
                  {m.userId === session.user.id ? (
                    <span className="text-slate-600"> ({t('team.you')})</span>
                  ) : null}
                </span>
                {manageable ? (
                  <span className="flex items-center gap-2">
                    <Select
                      aria-label={t('team.changeRole', { name })}
                      value={m.role}
                      onChange={(e) =>
                        void changeMember(() =>
                          updateMemberRole(teamId, m.userId, e.target.value as 'admin' | 'member'),
                        )
                      }
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                    >
                      <option value="member">{t('team.roles.member')}</option>
                      <option value="admin">{t('team.roles.admin')}</option>
                    </Select>
                    <Button
                      variant="ghost"
                      aria-label={t('team.removeLabel', { name })}
                      onClick={() => {
                        if (window.confirm(t('team.removeConfirm', { name }))) {
                          void changeMember(() => removeMember(teamId, m.userId))
                        }
                      }}
                    >
                      {t('team.remove')}
                    </Button>
                  </span>
                ) : (
                  <span className="text-sm text-slate-700">{t(`team.roles.${m.role}`)}</span>
                )}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={t('leave.title')} danger>
        <p className="text-sm text-slate-700">{t('leave.help')}</p>
        <div>
          <Button variant="danger" onClick={() => void onLeave()}>
            <DoorOpen aria-hidden className="size-4" />
            {t('leave.button')}
          </Button>
        </div>
        {leaveError ? (
          <p role="alert" className="text-sm text-red-700">
            {t('leave.error')}
          </p>
        ) : null}
      </Section>
    </div>
  )
}
