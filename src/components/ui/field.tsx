import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const control =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 aria-[invalid=true]:border-red-700'

type FieldShellProps = {
  label: string
  error?: string | undefined
  children: (ids: { id: string; describedBy?: string }) => ReactNode
}

function FieldShell({ label, error, children }: FieldShellProps) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      {children({ id, ...(error ? { describedBy: errorId } : {}) })}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-700">
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
          className={cn(control, className)}
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
          className={cn(control, 'py-2', className)}
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
          className={cn(control, className)}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldShell>
  )
})
