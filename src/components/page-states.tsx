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
      className="flex flex-col items-start gap-3 rounded-3xl bg-[#fbe9e6] p-6 text-[#7a2a21]"
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
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-white px-6 py-14 text-center ring-1 ring-slate-200">
      <div className="text-slate-400" aria-hidden>
        {icon}
      </div>
      <h2 className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">{title}</h2>
      <p className="max-w-sm text-slate-600">{body}</p>
      {action}
    </div>
  )
}

/** En-tête de page : titre 48 px, actions alignées en bas à droite. */
export function PageHeader({
  title,
  actions,
  eyebrow,
}: {
  title: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-2 text-sm text-slate-600">{eyebrow}</p> : null}
        <h1 className="text-4xl leading-[1.05] font-medium tracking-[-0.03em] md:text-5xl">
          {title}
        </h1>
      </div>
      {actions}
    </div>
  )
}
