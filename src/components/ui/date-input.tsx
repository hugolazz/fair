import * as Popover from '@radix-ui/react-popover'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, addMonths, monthWeeks, parseIso, todayIso } from '@/lib/calendar'
import { cn } from '@/lib/cn'
import { labelTextOf, setNativeValue } from '@/lib/native-control'
import { useMediaQuery } from '@/lib/use-media-query'
import { PopoverPanel } from './popover-panel'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

// Les formateurs Intl coûtent cher à construire : un jeu par langue, partagé par tous les champs date.
const formatsByLocale = new Map<
  string,
  {
    dayName: Intl.DateTimeFormat
    long: Intl.DateTimeFormat
    monthTitle: Intl.DateTimeFormat
    weekdays: string[]
  }
>()
function calendarFormats(locale: string) {
  let f = formatsByLocale.get(locale)
  if (!f) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    f = {
      dayName: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }),
      long: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }),
      monthTitle: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      weekdays: Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2024, 0, 1 + i))), // 1er janv. 2024 = lundi
    }
    formatsByLocale.set(locale, f)
  }
  return f
}

const NAV =
  'inline-flex size-10 items-center justify-center rounded-full text-slate-700 transition-colors duration-200 hover:bg-slate-100'

/**
 * Champ date aux couleurs de l'appli : un calendrier (lundi en premier) à la place de celui du navigateur.
 * Un vrai `<input type="date">` caché porte la valeur (format aaaa-mm-jj) : react-hook-form et les tests s'y branchent
 * comme avant. Sur écran tactile, on garde le sélecteur natif du système.
 */
export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  { className, ...props },
  forwardedRef,
) {
  const coarse = useMediaQuery('(pointer: coarse)')
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'fr'
  const inputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(todayIso)
  const [moveFocus, setMoveFocus] = useState(false)

  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps -- sans dépendances voulu : le DOM peut changer sans que les props changent
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    setValue((prev) => (prev === el.value ? prev : el.value))
    const text = labelTextOf(el, [el, triggerRef.current])
    setName((prev) => (prev === text ? prev : text))
  })
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const sync = () => setValue(el.value)
    el.addEventListener('change', sync)
    el.addEventListener('input', sync)
    return () => {
      el.removeEventListener('change', sync)
      el.removeEventListener('input', sync)
    }
  }, [])

  const selected = parseIso(value) ? value : ''
  const min = typeof props.min === 'string' ? props.min : undefined
  const max = typeof props.max === 'string' ? props.max : undefined
  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max)

  useEffect(() => {
    if (open && moveFocus)
      gridRef.current?.querySelector<HTMLElement>(`[data-iso="${focused}"]`)?.focus()
  }, [open, moveFocus, focused])

  const { dayName, long, monthTitle, weekdays } = calendarFormats(locale)

  function commit(iso: string) {
    setOpen(false)
    if (inputRef.current) setNativeValue(inputRef.current, iso)

    triggerRef.current?.focus()
  }

  function onGridKeyDown(e: KeyboardEvent) {
    const moves: Record<string, string> = {
      ArrowLeft: addDays(focused, -1),
      ArrowRight: addDays(focused, 1),
      ArrowUp: addDays(focused, -7),
      ArrowDown: addDays(focused, 7),
      PageUp: addMonths(focused, -1),
      PageDown: addMonths(focused, 1),
    }
    const next = moves[e.key]
    if (next) {
      e.preventDefault()
      setMoveFocus(true)
      setFocused(next)
    }
  }

  if (coarse) return <input ref={setRefs} type="date" className={className} {...props} />

  const view = parseIso(focused) ?? new Date()
  const weeks = open ? monthWeeks(view.getFullYear(), view.getMonth()) : [] // la grille ne sert qu'ouverte
  const today = todayIso()
  const shown = parseIso(selected)

  return (
    <>
      <input
        ref={setRefs}
        {...props}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onFocus={(e) => {
          props.onFocus?.(e)
          triggerRef.current?.focus() // un libellé cliqué envoie le focus au bouton visible
        }}
      />
      <Popover.Root
        open={open}
        onOpenChange={(on) => {
          if (on) {
            setFocused(selected || todayIso())
            setMoveFocus(true)
          }
          setOpen(on)
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-invalid={props['aria-invalid']}
            aria-describedby={props['aria-describedby']}
            disabled={props.disabled}
            className={cn(
              'inline-flex cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60',
              className,
            )}
          >
            <span className="sr-only">
              {[name, t('calendar.choose')].filter(Boolean).join(' : ')}
            </span>
            <span className={cn('min-w-0 flex-1 truncate', !shown && 'text-slate-500')}>
              {shown ? long.format(shown) : t('calendar.placeholder')}
            </span>
            <CalendarDays aria-hidden className="size-4 shrink-0 text-slate-500" />
          </button>
        </Popover.Trigger>
        <PopoverPanel
          aria-label={name || t('calendar.choose')}
          onOpenAutoFocus={(e) => {
            // Le focus va sur le jour sélectionné (ou aujourd'hui) pour naviguer aux flèches.
            e.preventDefault()
            gridRef.current?.querySelector<HTMLElement>(`[data-iso="${focused}"]`)?.focus()
          }}
          className="w-[19rem] rounded-3xl p-3"
        >
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              className={NAV}
              aria-label={t('calendar.previous')}
              onClick={() => {
                setMoveFocus(false)
                setFocused(addMonths(focused, -1))
              }}
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <p aria-live="polite" className="text-[15px] font-medium capitalize">
              {monthTitle.format(view)}
            </p>
            <button
              type="button"
              className={NAV}
              aria-label={t('calendar.next')}
              onClick={() => {
                setMoveFocus(false)
                setFocused(addMonths(focused, 1))
              }}
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
          <div
            ref={gridRef}
            role="grid"
            aria-label={monthTitle.format(view)}
            onKeyDown={onGridKeyDown}
          >
            <div role="row" className="grid grid-cols-7 pb-1 text-center text-xs text-slate-600">
              {weekdays.map((w) => (
                <span key={w} role="columnheader" className="py-1 capitalize">
                  {w}
                </span>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7">
                {week.map((iso, di) => {
                  if (!iso) return <span key={di} role="gridcell" />
                  const isSelected = iso === selected
                  const disabled = outOfRange(iso)
                  return (
                    <span key={iso} role="gridcell" className="flex justify-center">
                      <button
                        type="button"
                        data-iso={iso}
                        tabIndex={iso === focused ? 0 : -1}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        aria-current={iso === today ? 'date' : undefined}
                        aria-label={dayName.format(parseIso(iso)!)}
                        onClick={() => commit(iso)}
                        className={cn(
                          'inline-flex size-10 items-center justify-center rounded-full text-sm transition-colors duration-200 disabled:opacity-40',
                          isSelected
                            ? 'bg-slate-900 font-medium text-white'
                            : 'text-slate-900 hover:bg-slate-100',
                          iso === today && !isSelected && 'ring-brand-600 ring-1',
                        )}
                      >
                        {Number(iso.slice(8))}
                      </button>
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
            <button
              type="button"
              disabled={outOfRange(today)}
              onClick={() => commit(today)}
              className="text-brand-700 min-h-10 rounded-full px-3 text-sm font-medium hover:bg-slate-100 disabled:opacity-40"
            >
              {t('calendar.today')}
            </button>
            {selected && !props.required ? (
              <button
                type="button"
                onClick={() => commit('')}
                className="min-h-10 rounded-full px-3 text-sm text-slate-700 hover:bg-slate-100"
              >
                {t('calendar.clear')}
              </button>
            ) : null}
          </div>
        </PopoverPanel>
      </Popover.Root>
    </>
  )
})
