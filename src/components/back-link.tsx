import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Bouton de retour (pilule, flèche + texte) : il remplace l'ancienne barre de navigation du bas sur mobile. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-100 px-4 text-sm font-medium text-slate-900 transition-colors duration-200 hover:bg-[#e8e5dc]"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {children}
    </Link>
  )
}
