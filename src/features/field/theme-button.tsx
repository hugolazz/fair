import { Moon, Sun, SunMoon, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { THEME_MODES, useThemeMode, type ThemeMode } from '@/lib/theme'

const ICONS: Record<ThemeMode, typeof Sun> = {
  auto: SunMoon,
  light: Sun,
  sun: Sparkles,
  dark: Moon,
}

/** Un tap passe au thème suivant : auto → clair → soleil (plein soleil) → sombre (salle sombre). */
export function ThemeButton() {
  const { t } = useTranslation('field')
  const [mode, setMode] = useThemeMode()
  const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]!
  const Icon = ICONS[mode]
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={t('theme.next', { mode: t(`theme.${mode}`) })}
      title={t(`theme.${mode}`)}
      className="inline-flex size-11 items-center justify-center rounded-full hover:bg-slate-100"
    >
      <Icon aria-hidden className="size-5" />
    </button>
  )
}
