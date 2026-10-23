import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

/**
 * Logo : « fair » en serif italique, suivi d'un point doré décoratif. Le texte « fair » reste seul dans le DOM
 * (le point est `aria-hidden`) ; il est toujours en minuscules.
 */
export function Wordmark({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    // Logo de marque : couleur d'accentuation exacte (un logo est exempté des règles de contraste, WCAG 1.4.3).
    <span
      data-brand-logo
      className={cn(
        'text-brand-600 font-serif text-[2rem] leading-none font-normal tracking-[-0.02em] normal-case italic',
        className,
      )}
    >
      {t('appName')}
      <span aria-hidden className="text-gold-500">
        .
      </span>
    </span>
  )
}
