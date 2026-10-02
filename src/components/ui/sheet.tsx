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
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-50 shadow-xl md:inset-y-0 md:right-0 md:left-auto md:w-[34rem] md:max-w-full"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <DialogPrimitive.Title className="min-w-0 text-lg font-semibold break-words">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label={closeLabel}
            >
              <X aria-hidden className="size-5" />
            </DialogPrimitive.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
