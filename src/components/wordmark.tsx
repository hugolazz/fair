import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/** Wordmark du produit : « fair », toujours en minuscules (text-transform interdit). */
export function Wordmark({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={cn('text-brand-700 text-2xl font-bold tracking-tight normal-case', className)}>
      {t('appName')}
    </span>
  )
}
