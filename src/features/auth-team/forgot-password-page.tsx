import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { requestPasswordReset } from '@/db/repositories/auth'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/field'
import { Wordmark } from '@/components/wordmark'

const emailSchema = z.email()

/** Demande d'un lien de réinitialisation. La réponse est la même que l'adresse existe ou non. */
export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = emailSchema.safeParse(email.trim().toLowerCase())
    if (!parsed.success) {
      setError(t('login.invalidEmail'))
      return
    }
    setError(undefined)
    setSending(true)
    try {
      await requestPasswordReset(parsed.data)
      setSent(true)
    } catch {
      // Limite d'envoi atteinte, réseau… : message neutre, sans détail technique.
      setError(t('forgot.error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="animate-rise mx-auto flex min-h-dvh w-full max-w-[380px] flex-col justify-center gap-10 px-6 py-10">
      <Wordmark className="text-[4rem]" />

      {sent ? (
        <div role="status" className="flex flex-col gap-4">
          <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
            {t('forgot.sentTitle')}
          </h1>
          <p className="text-[15px] leading-normal text-slate-600">{t('forgot.sentBody')}</p>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/login">{t('forgot.backToLogin')}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div>
            <h1 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
              {t('forgot.title')}
            </h1>
            <p className="mt-2 text-[15px] leading-normal text-slate-600">{t('forgot.subtitle')}</p>
          </div>
          <InputField
            label={t('login.email')}
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            required
            autoFocus
          />
          <Button type="submit" disabled={sending} className="mt-3 min-h-[50px] w-full text-[15px]">
            {sending ? t('forgot.sending') : t('forgot.submit')}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/login">{t('forgot.backToLogin')}</Link>
          </Button>
        </form>
      )}
    </main>
  )
}
