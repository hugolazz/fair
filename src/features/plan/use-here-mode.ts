import { useState } from 'react'
import type { Point } from './lib/viewport'

// « Je suis ici » : posée à la main (pas de GPS en intérieur), propre à cet appareil (localStorage), par plan.

export type HerePosition = { x: number; y: number; at: string }

const key = (planId: string) => `fair.here.${planId}`

function read(planId: string | undefined): HerePosition | undefined {
  if (!planId) return undefined
  try {
    const v = JSON.parse(localStorage.getItem(key(planId)) ?? 'null') as HerePosition | null
    return v && typeof v.x === 'number' && typeof v.y === 'number' ? v : undefined
  } catch {
    return undefined
  }
}

function write(planId: string, value: HerePosition | undefined) {
  try {
    if (value) localStorage.setItem(key(planId), JSON.stringify(value))
    else localStorage.removeItem(key(planId))
  } catch {
    /* stockage indisponible : la position n'est simplement pas gardée */
  }
}

export type HereMode = {
  here: HerePosition | undefined
  placing: boolean
  has: boolean
  begin: () => void
  cancel: () => void
  clear: () => void
  /** `true` si l'appui a servi à poser la position (il ne doit alors rien faire d'autre). */
  handleTap: (p: Point) => boolean
}

export function useHereMode(planId: string | undefined): HereMode {
  // La position est relue quand on change de plan (état ajusté pendant le rendu).
  const [state, setState] = useState(() => ({ planId, here: read(planId) }))
  if (state.planId !== planId) setState({ planId, here: read(planId) })
  const [placing, setPlacing] = useState(false)
  const here = state.planId === planId ? state.here : read(planId)

  return {
    here,
    placing,
    has: !!here,
    begin: () => setPlacing(true),
    cancel: () => setPlacing(false),
    clear: () => {
      if (planId) write(planId, undefined)
      setState({ planId, here: undefined })
      setPlacing(false)
    },
    handleTap(p) {
      if (!placing || !planId) return false
      const next = {
        x: Math.min(1, Math.max(0, p.x)),
        y: Math.min(1, Math.max(0, p.y)),
        at: new Date().toISOString(),
      }
      write(planId, next)
      setState({ planId, here: next })
      setPlacing(false)
      return true
    },
  }
}
