import { DoorOpen, LogOut, UserX } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState, Loading, PageHeader } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { deleteMyAccount, signOut } from '@/db/repositories/auth'
import { changePassword, WRONG_CURRENT_PASSWORD } from '@/db/repositories/auth'
import { updateMyDisplayName } from '@/db/repositories/profile'
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
import { useSync } from '@/features/sync/use-sync'
import { Dialog } from '@/components/ui/dialog'
import { useAsync } from '@/lib/use-async'
import { TeamLogo } from './team-logo'

const MIN_PASSWORD = 8

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation('settings')
  const { t: tAuth } = useTranslation('auth')
  const { session, membership, displayName, refreshMembership } = useReadySession()
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

  const [myName, setMyName] = useState(displayName)
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'error'; text: string }>()
  async function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!myName.trim()) {
      setProfileMsg({ kind: 'error', text: t('profile.required') })
      return
    }
    try {
      await updateMyDisplayName(session.user.id, myName)
      await refreshMembership()
      members.reload()
      setProfileMsg({ kind: 'ok', text: t('profile.saved') })
    } catch (err) {
      // Le message technique (sans donnée personnelle) aide à comprendre un refus de la base.
      const detail = err instanceof Error ? err.message : ''
      setProfileMsg({
        kind: 'error',
        text: detail ? `${t('profile.error')} (${detail})` : t('profile.error'),
      })
    }
  }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<{ kind: 'ok' | 'error'; text: string }>()
  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    if (!currentPassword) {
      setPasswordMsg({ kind: 'error', text: t('password.currentRequired') })
      return
    }
    if (newPassword.length < MIN_PASSWORD) {
      setPasswordMsg({ kind: 'error', text: t('password.tooShort', { min: MIN_PASSWORD }) })
      return
    }
    if (confirmPassword !== newPassword) {
      setPasswordMsg({ kind: 'error', text: t('password.mismatch') })
      return
    }
    try {
      await changePassword(session.user.email ?? '', currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg({ kind: 'ok', text: t('password.saved') })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setPasswordMsg({
        kind: 'error',
        text:
          message === WRONG_CURRENT_PASSWORD
            ? t('password.wrongCurrent')
            : /different from the old password|same password/i.test(message)
              ? t('password.same')
              : t('password.error'),
      })
    }
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

  const { snapshot } = useSync()
  const [deleting, setDeleting] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const accountEmail = session.user.email ?? ''
  async function onDeleteAccount(e: FormEvent) {
    e.preventDefault()
    setDeleteBusy(true)
    setDeleteError(false)
    try {
      await deleteMyAccount(session.user.id) // la session se ferme : l'appli renvoie sur la connexion
    } catch {
      setDeleteError(true)
      setDeleteBusy(false)
    }
  }

  // La case répond tout de suite ; elle revient en arrière si la base refuse.
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
      <PageHeader title={t('title')} />

      <Section title={t('account.title')}>
        <p className="text-slate-700">{t('account.signedInAs', { email: session.user.email })}</p>
        <div>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut aria-hidden className="size-4" />
            {tAuth('signOut')}
          </Button>
        </div>
      </Section>

      <Section title={t('profile.title')}>
        <p className="text-sm text-slate-700">{t('profile.hint')}</p>
        <form
          onSubmit={onSaveProfile}
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <InputField
              label={t('profile.name')}
              autoComplete="name"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              maxLength={100}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t('profile.save')}
          </Button>
        </form>
        {profileMsg ? (
          <p
            role={profileMsg.kind === 'error' ? 'alert' : 'status'}
            className={
              profileMsg.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-emerald-800'
            }
          >
            {profileMsg.text}
          </p>
        ) : null}
      </Section>

      <Section title={t('password.title')}>
        <form onSubmit={onChangePassword} noValidate className="flex flex-col gap-3">
          <InputField
            label={t('password.current')}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <InputField
            label={t('password.new')}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <InputField
            label={t('password.confirm')}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div>
            <Button type="submit" variant="secondary">
              {t('password.save')}
            </Button>
          </div>
          {passwordMsg ? (
            <p
              role={passwordMsg.kind === 'error' ? 'alert' : 'status'}
              className={
                passwordMsg.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-emerald-800'
              }
            >
              {passwordMsg.text}
            </p>
          ) : null}
        </form>
      </Section>

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

        {isAdmin ? (
          <div className="flex flex-col gap-2">
            <h3 className="mt-2 font-medium">{t('team.fields')}</h3>
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
        ) : null}

        <h3 className="mt-2 font-medium">{t('team.members')}</h3>
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

      <Section title={t('leave.title')}>
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

      <Section title={t('delete.title')}>
        <p className="text-sm text-slate-700">{t('delete.help')}</p>
        <div>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <UserX aria-hidden className="size-4" />
            {t('delete.button')}
          </Button>
        </div>
      </Section>

      <Dialog
        open={deleting}
        onOpenChange={(open) => {
          if (deleteBusy) return
          setDeleting(open)
          if (!open) {
            setDeleteEmail('')
            setDeleteError(false)
          }
        }}
        title={t('delete.dialogTitle')}
        description={t('delete.dialogBody')}
      >
        <form onSubmit={(e) => void onDeleteAccount(e)} className="flex flex-col gap-4">
          {snapshot.pending > 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              {t('delete.pending', { count: snapshot.pending })}
            </p>
          ) : null}
          <InputField
            label={t('delete.confirmLabel', { email: accountEmail })}
            type="email"
            autoComplete="off"
            value={deleteEmail}
            onChange={(e) => setDeleteEmail(e.target.value)}
          />
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700">
              {t('delete.error')}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={
                deleteBusy ||
                deleteEmail.trim().toLowerCase() !== accountEmail.toLowerCase() ||
                accountEmail === ''
              }
            >
              {t('delete.confirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={deleteBusy}
              onClick={() => setDeleting(false)}
            >
              {t('delete.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
