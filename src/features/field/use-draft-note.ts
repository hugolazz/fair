import { useCallback, useEffect, useRef, useState } from 'react'
import { createNote, editNote, type FieldCtx, type NoteSource } from '@/db/repositories/field'

const DEBOUNCE_MS = 350

export type SaveState = 'idle' | 'dirty' | 'saved'

/**
 * Note en cours de saisie, enregistrée en local à chaque modification (sans bouton) :
 * la 1re saisie crée la note, les suivantes la modifient. Enregistrement immédiat quand on quitte l'écran
 * ou que l'application passe en arrière-plan.
 */
export function useDraftNote(ctx: FieldCtx, targetId: string) {
  const [text, setTextState] = useState('')
  const [state, setState] = useState<SaveState>('idle')
  const textRef = useRef('')
  const savedRef = useRef('')
  const noteId = useRef<string | undefined>(undefined)
  const sourceRef = useRef<NoteSource>('typed')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  })

  /** Écritures en file : une création n'est jamais doublée par la modification suivante. */
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    chain.current = chain.current.then(async () => {
      const body = textRef.current
      if (body === savedRef.current) return
      if (!noteId.current) {
        if (body.trim() === '') return
        noteId.current = await createNote(ctxRef.current, targetId, body, sourceRef.current)
      } else {
        await editNote(noteId.current, body)
      }
      savedRef.current = body
      if (textRef.current === body) setState('saved')
    })
    return chain.current
  }, [targetId])

  const setText = useCallback(
    (value: string, source: NoteSource = 'typed') => {
      textRef.current = value
      if (source === 'dictated') sourceRef.current = 'dictated'
      setTextState(value)
      setState('dirty')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS)
    },
    [flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      void flush() // on quitte la fiche : rien ne doit rester en suspens
    }
  }, [flush])

  return { text, setText, state, flush }
}
