import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p>{t('states.notFound')}</p>
      <Link to="/" className="text-brand-700 font-medium underline">
        {t('actions.back')}
      </Link>
    </main>
  )
}
