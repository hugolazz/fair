import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'
import { labelTextOf, setNativeValue } from '@/lib/native-control'
import { useMediaQuery } from '@/lib/use-media-query'
import { PopoverPanel } from './popover-panel'

type Opt = { value: string; label: string; disabled: boolean }
type Snapshot = { value: string; options: Opt[] }

const EMPTY: Snapshot = { value: '', options: [] }

function read(select: HTMLSelectElement | null): Snapshot {
  if (!select) return EMPTY
  return {
    value: select.value,
    options: Array.from(select.options).map((o) => ({
      value: o.value,
      label: o.text,
      disabled: o.disabled,
    })),
  }
}

const same = (a: Snapshot, b: Snapshot) =>
  a.value === b.value &&
  a.options.length === b.options.length &&
  a.options.every((o, i) => {
    const p = b.options[i]!
    return o.value === p.value && o.label === p.label && o.disabled === p.disabled
  })

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Contenu du bouton à la place de l'option choisie (par exemple un « + »), sans flèche. */
  display?: ReactNode
}

/**
 * Liste déroulante aux couleurs de l'appli. Même usage qu'un `<select>` (enfants `<option>`, `value`, `onChange`,
 * react-hook-form) : un vrai `<select>` caché porte la valeur, le bouton et la liste en sont l'affichage.
 * Sur écran tactile, on garde le sélecteur natif du système.
 */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { children, className, display, ...props },
  forwardedRef,
) {
  const coarse = useMediaQuery('(pointer: coarse)')
  const uid = useId()
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', timer: 0 })
  const [snap, setSnap] = useState<Snapshot>(EMPTY)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const setRefs = useCallback(
    (el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )

  // Relit le <select> à chaque rendu : valeur et options viennent toujours de lui.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sans dépendances voulu : le DOM peut changer sans que les props changent
  useLayoutEffect(() => {
    const el = selectRef.current
    if (!el) return
    const next = read(el)
    setSnap((prev) => (same(prev, next) ? prev : next))
    const text = props['aria-label'] ?? labelTextOf(el, [el, triggerRef.current])
    setName((prev) => (prev === text ? prev : text))
  })
  useEffect(() => {
    const el = selectRef.current
    if (!el) return
    const sync = () =>
      setSnap((prev) => {
        const next = read(el)
        return same(prev, next) ? prev : next
      })
    el.addEventListener('change', sync)
    return () => el.removeEventListener('change', sync)
  }, [])

  const enabled = snap.options.flatMap((o, i) => (o.disabled ? [] : [i]))
  const selectedIndex = snap.options.findIndex((o) => o.value === snap.value)
  const current = snap.options[selectedIndex]

  useEffect(() => {
    if (!open) return
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, uid])

  function openList(on: boolean) {
    if (on) setActive(selectedIndex >= 0 && !current?.disabled ? selectedIndex : (enabled[0] ?? 0))
    setOpen(on)
  }

  function pick(value: string) {
    setOpen(false)
    if (selectRef.current) setNativeValue(selectRef.current, value)
    triggerRef.current?.focus()
  }

  function step(delta: number) {
    const at = enabled.indexOf(active)
    const next = enabled[Math.min(Math.max(at + delta, 0), enabled.length - 1)]
    if (next !== undefined) setActive(next)
  }

  function onListKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') step(1)
    else if (e.key === 'ArrowUp') step(-1)
    else if (e.key === 'Home') setActive(enabled[0] ?? 0)
    else if (e.key === 'End') setActive(enabled.at(-1) ?? 0)
    else if (e.key === 'Enter' || e.key === ' ') {
      const o = snap.options[active]
      if (o && !o.disabled) pick(o.value)
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Saisie au clavier : saute à la première option qui commence par les lettres tapées.
      window.clearTimeout(typed.current.timer)
      typed.current.text += e.key.toLowerCase()
      typed.current.timer = window.setTimeout(() => (typed.current.text = ''), 600)
      const hit = enabled.find((i) =>
        snap.options[i]!.label.toLowerCase().startsWith(typed.current.text),
      )
      if (hit !== undefined) setActive(hit)
      return
    } else return
    e.preventDefault()
  }

  if (coarse) {
    if (display === undefined) {
      return (
        <select ref={setRefs} className={className} {...props}>
          {children}
        </select>
      )
    }
    return (
      <span className={cn('relative', className)}>
        {display}
        <select ref={setRefs} {...props} className="absolute -inset-1.5 cursor-pointer opacity-0">
          {children}
        </select>
      </span>
    )
  }

  return (
    <>
      <select
        ref={setRefs}
        {...props}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onFocus={(e) => {
          props.onFocus?.(e)
          triggerRef.current?.focus() // un libellé cliqué envoie le focus au bouton visible
        }}
      >
        {children}
      </select>
      <Popover.Root open={open} onOpenChange={openList}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? `${uid}-list` : undefined}
            aria-invalid={props['aria-invalid']}
            aria-describedby={props['aria-describedby']}
            disabled={props.disabled}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                openList(true)
              }
            }}
            className={cn(
              'inline-flex cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60',
              className,
            )}
          >
            {name ? <span className="sr-only">{name}</span> : null}
            {display !== undefined ? (
              display
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{current?.label ?? ''}</span>
                <ChevronDown aria-hidden className="size-4 shrink-0 text-slate-500" />
              </>
            )}
          </button>
        </Popover.Trigger>
        <PopoverPanel
          className="min-w-[max(var(--radix-popover-trigger-width),10rem)]"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            listRef.current?.focus()
          }}
        >
          <div
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={name || undefined}
            aria-activedescendant={`${uid}-opt-${active}`}
            onKeyDown={onListKeyDown}
            className="flex flex-col outline-none"
          >
            {snap.options.map((o, i) => {
              const selected = i === selectedIndex
              return (
                <div
                  key={`${o.value}-${i}`}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  onPointerMove={() => !o.disabled && setActive(i)}
                  onClick={() => !o.disabled && pick(o.value)}
                  className={cn(
                    'flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-sm text-slate-900',
                    i === active && 'bg-slate-100',
                    selected && 'font-medium',
                    o.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {selected ? (
                    <Check aria-hidden className="text-brand-600 size-4 shrink-0" />
                  ) : null}
                </div>
              )
            })}
          </div>
        </PopoverPanel>
      </Popover.Root>
    </>
  )
})
