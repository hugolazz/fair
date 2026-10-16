import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  closeLabel: string
  children: ReactNode
}

/** Panneau latéral (desktop) / plein écran (mobile) : fiche détaillée sans quitter la liste. */
export function Sheet({ open, onOpenChange, title, closeLabel, children }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-50 shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:w-[34rem] md:max-w-full md:rounded-l-3xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
            <DialogPrimitive.Title className="min-w-0 text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em] break-words">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors duration-200 hover:bg-slate-100"
              aria-label={closeLabel}
            >
              <X aria-hidden className="size-5" />
            </DialogPrimitive.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
