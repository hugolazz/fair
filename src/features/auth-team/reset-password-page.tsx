import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { updatePassword } from '@/db/repositories/auth'
import { Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Wordmark } from '@/components/wordmark'
import { needsPassword, useSession } from './session'

const MIN_PASSWORD = 8

type Errors = Partial<Record<'password' | 'confirm' | 'form', string>>

/**
 * Choix d'un mot de passe. Le lien de l'e-mail ouvre une session (récupération ou invitation) : sans session (lien périmé
 * ou déjà utilisé), on propose d'en demander un autre. Une personne invitée, qui n'a pas encore de mot de passe, y est
 * accueillie par les gardes de routes avant tout autre écran.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = {}
    if (password.length < MIN_PASSWORD)
      next.password = t('signup.passwordTooShort', { min: MIN_PASSWORD })
    else if (confirm !== password) next.confirm = t('reset.mismatch')
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    try {
      await updatePassword(password)
      setDone(true)
      setTimeout(() => navigate('/events', { replace: true }), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setErrors({
        form: /different from the old password|same password/i.test(message)
          ? t('reset.samePassword')
          : tc('states.error'),
      })
      setSaving(false)
    }
  }

  if (session.status === 'loading') return <Loading />
  const welcome = session.status !== 'signedOut' && needsPassword(session.session)

  return (
    <main className="animate-rise mx-auto flex min-h-dvh w-full max-w-[380px] flex-col justify-center gap-10 px-6 py-10">
      <Wordmark className="text-[4rem]" />

      {session.status === 'signedOut' ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
            {t('reset.invalidTitle')}
          </h1>
          <p className="text-[15px] leading-normal text-slate-600">{t('reset.invalidBody')}</p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">{t('reset.requestNew')}</Link>
          </Button>
        </div>
      ) : done ? (
        <p role="status" className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
          {t('reset.done')}
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
              {t(welcome ? 'welcome.title' : 'reset.title')}
            </h1>
            <p className="mt-2 text-[15px] leading-normal text-slate-600">
              {t(welcome ? 'welcome.subtitle' : 'reset.subtitle')}
            </p>
          </div>
          <InputField
            label={t('reset.newPassword')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
            autoFocus
          />
          <InputField
            label={t('reset.confirm')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm ?? errors.form}
            required
          />
          <Button type="submit" disabled={saving} className="mt-3 min-h-[50px] w-full text-[15px]">
            {saving ? t('reset.saving') : t(welcome ? 'welcome.submit' : 'reset.submit')}
          </Button>
        </form>
      )}
    </main>
  )
}
