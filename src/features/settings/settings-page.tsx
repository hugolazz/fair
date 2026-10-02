import { LogOut } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ErrorState, Loading, PageHeader } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { InputField, SelectField } from '@/components/ui/field'
import { signOut } from '@/db/repositories/auth'
import {
  cancelInvitation,
  inviteMember,
  listInvitations,
  listMembers,
  renameTeam,
} from '@/db/repositories/teams'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { TeamLogo } from './team-logo'

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
  const { session, membership, refreshMembership } = useReadySession()
  const isAdmin = membership.role === 'owner' || membership.role === 'admin'
  const { teamId } = membership

  const members = useAsync(() => listMembers(teamId), [teamId])
  const invitations = useAsync(
    () => (isAdmin ? listInvitations(teamId) : Promise.resolve([])),
    [teamId, isAdmin],
  )

  const [teamName, setTeamName] = useState(membership.teamName)
  const [renameMsg, setRenameMsg] = useState<string>()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [inviteMsg, setInviteMsg] = useState<{ kind: 'ok' | 'error'; text: string }>()
  const [inviting, setInviting] = useState(false)

  async function onRename(e: FormEvent) {
    e.preventDefault()
    if (!teamName.trim()) return
    await renameTeam(teamId, teamName.trim())
    await refreshMembership()
    setRenameMsg(t('team.renamed'))
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    const email = z.email().safeParse(inviteEmail.trim().toLowerCase())
    if (!email.success) {
      setInviteMsg({ kind: 'error', text: tAuth('login.invalidEmail') })
      return
    }
    setInviting(true)
    setInviteMsg(undefined)
    try {
      await inviteMember(teamId, email.data, inviteRole)
      setInviteMsg({ kind: 'ok', text: t('invite.sent', { email: email.data }) })
      setInviteEmail('')
      invitations.reload()
    } catch {
      setInviteMsg({ kind: 'error', text: t('invite.error') })
    } finally {
      setInviting(false)
    }
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

        <h3 className="mt-2 font-medium">{t('team.members')}</h3>
        {members.loading && !members.data ? <Loading /> : null}
        {members.error ? <ErrorState onRetry={members.reload} /> : null}
        <ul className="divide-y divide-slate-100">
          {members.data?.map((m) => (
            <li key={m.userId} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span>
                {m.displayName}
                {m.userId === session.user.id ? (
                  <span className="text-slate-600"> ({t('team.you')})</span>
                ) : null}
              </span>
              <span className="text-sm text-slate-600">{t(`team.roles.${m.role}`)}</span>
            </li>
          ))}
        </ul>

        {isAdmin && invitations.data && invitations.data.length > 0 ? (
          <>
            <h3 className="mt-2 font-medium">{t('team.pending')}</h3>
            <ul className="divide-y divide-slate-100">
              {invitations.data.map((i) => (
                <li key={i.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{i.email}</span>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await cancelInvitation(i.id)
                      invitations.reload()
                    }}
                  >
                    {t('team.cancelInvite')}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>

      <Section title={t('invite.title')}>
        {isAdmin ? (
          <form onSubmit={onInvite} noValidate className="flex flex-col gap-3">
            <InputField
              label={t('invite.email')}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <SelectField
              label={t('invite.role')}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
            >
              <option value="member">{t('team.roles.member')}</option>
              <option value="admin">{t('team.roles.admin')}</option>
            </SelectField>
            <div>
              <Button type="submit" disabled={inviting}>
                {inviting ? t('invite.sending') : t('invite.submit')}
              </Button>
            </div>
            {inviteMsg ? (
              <p
                role={inviteMsg.kind === 'error' ? 'alert' : 'status'}
                className={
                  inviteMsg.kind === 'error' ? 'text-sm text-red-700' : 'text-sm text-emerald-800'
                }
              >
                {inviteMsg.text}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="text-slate-700">{t('invite.adminOnly')}</p>
        )}
      </Section>
    </div>
  )
}
