import { cn } from '@/lib/cn'

type Option<T extends string> = { value: T; label: string }

/** Groupe de cases à cocher accessible (fieldset + legend). */
export function CheckGroup<T extends string>({
  legend,
  options,
  selected,
  onChange,
  className,
}: {
  legend: string
  options: Option<T>[]
  selected: readonly T[]
  onChange: (next: T[]) => void
  className?: string
}) {
  return (
    <fieldset className={cn('flex flex-col gap-1.5', className)}>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <label key={o.value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                }
                className="size-4 accent-teal-700"
              />
              {o.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
