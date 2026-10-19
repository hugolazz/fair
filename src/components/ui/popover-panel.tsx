import * as Popover from '@radix-ui/react-popover'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * Panneau flottant commun (listes déroulantes, filtres, tags, calendrier) : même ombre, même rayon, même z-index
 * au-dessus des fenêtres modales (z-70). Les classes passées en plus l'emportent (largeur, rayon, marge).
 */
export function PopoverPanel({ className, ...props }: ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          'animate-rise z-[80] max-h-[min(24rem,var(--radix-popover-content-available-height))] overflow-auto rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(19,26,24,0.22)] ring-1 ring-slate-200',
          className,
        )}
        {...props}
      />
    </Popover.Portal>
  )
}
