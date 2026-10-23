import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Un bloc de réglages : titre + contenu. `danger` encadre en rouge les actions irréversibles. */
export function Section({
  title,
  danger = false,
  children,
}: {
  title: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-2xl border bg-white p-4 md:p-5',
        danger ? 'border-red-200' : 'border-slate-200',
      )}
    >
      <h2 className={cn('text-lg font-semibold', danger && 'text-red-900')}>{title}</h2>
      {children}
    </section>
  )
}
