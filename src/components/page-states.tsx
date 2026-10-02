import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function Loading() {
  const { t } = useTranslation()
  return (
    <p role="status" className="p-6 text-slate-600">
      {t('states.loading')}
    </p>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | undefined
  onRetry?: (() => void) | undefined
}) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
    >
      <p>{message ?? t('states.error')}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="text-slate-500" aria-hidden>
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-slate-600">{body}</p>
      {action}
    </div>
  )
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {actions}
    </div>
  )
}
