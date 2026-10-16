import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Pilules de 44 px : primaire (brand), secondaire (crème), encre (action de page), discrète, danger.
const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-[background-color,color,transform] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white hover:bg-brand-700',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-[#e8e5dc]',
        ink: 'bg-slate-900 text-white hover:bg-brand-600',
        ghost: 'text-slate-700 hover:bg-slate-100',
        quiet: 'text-slate-600 hover:text-danger',
        danger: 'bg-danger text-white hover:bg-[#9a2f25]',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, asChild, type = 'button', ...props }: Props) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  )
}
