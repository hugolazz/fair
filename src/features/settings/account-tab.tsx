import { LogOut, UserX } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InputField } from '@/components/ui/field'
import {
  changePassword,
  deleteMyAccount,
  signOut,
  WRONG_CURRENT_PASSWORD,
} from '@/db/repositories/auth'
import { updateMyDisplayName } from '@/db/repositories/profile'
import { useReadySession } from '@/features/auth-team/session'
import { useSync } from '@/features/sync/use-sync'
import { Section } from './section'

const MIN_PASSWORD = 8

/** Réglages personnels : connexion, profil, mot de passe, suppression du compte. */
export function AccountTab() {
  const { t } = useTranslation('settings')
  const { t: tAuth } = useTranslation('auth')
  const { session, displayName, refreshMembership } = useReadySession()

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

  return (
    <div className="flex flex-col gap-5">
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

      <Section title={t('delete.title')} danger>
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
