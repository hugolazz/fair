import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

// Champs « sans cadre » : libellé atténué au-dessus, simple soulignement qui passe au brand au focus.
const underline =
  'min-h-12 w-full border-0 border-b border-slate-300 bg-transparent px-0 text-base text-slate-900 placeholder:text-slate-500 transition-colors duration-200 focus:border-brand-600 focus-visible:shadow-[0_1px_0_0_var(--color-brand-600)] focus-visible:outline-none aria-[invalid=true]:border-danger'
const boxed =
  'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 transition-colors duration-200 focus:border-brand-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-600 aria-[invalid=true]:border-danger'

type FieldShellProps = {
  label: string
  error?: string | undefined
  children: (ids: { id: string; describedBy?: string }) => ReactNode
}

function FieldShell({ label, error, children }: FieldShellProps) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] text-slate-500">
        {label}
      </label>
      {children({ id, ...(error ? { describedBy: errorId } : {}) })}
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
}

export const InputField = forwardRef<HTMLInputElement, InputProps>(function InputField(
  { label, error, className, ...props },
  ref,
) {
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy }) => (
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(underline, className)}
          {...props}
        />
      )}
    </FieldShell>
  )
})

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string | undefined
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextareaField(
  { label, error, className, ...props },
  ref,
) {
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy }) => (
        <textarea
          ref={ref}
          id={id}
          rows={4}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(boxed, className)}
          {...props}
        />
      )}
    </FieldShell>
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string | undefined
}

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, error, className, children, ...props },
  ref,
) {
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy }) => (
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(underline, className)}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldShell>
  )
})
