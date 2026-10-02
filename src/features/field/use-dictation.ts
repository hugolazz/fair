import { useCallback, useEffect, useRef, useState } from 'react'

// Dictée vocale : Web Speech API quand le navigateur la propose et que le réseau le permet (Chrome/Android,
// Safari récent). Sinon, repli : le champ de note reste actif et le micro du clavier (iOS/Android) dicte,
// y compris sans réseau.

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export type DictationError = 'unsupported' | 'offline' | 'denied' | 'failed' | null

/** `onFinal` reçoit chaque phrase reconnue (à ajouter à la note) ; `interim` est le texte provisoire. */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<DictationError>(null)
  const recRef = useRef<Recognition | null>(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => {
    onFinalRef.current = onFinal
  })

  useEffect(() => () => recRef.current?.stop(), [])

  const stop = useCallback(() => recRef.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return setError('unsupported')
    if (!navigator.onLine) return setError('offline') // la reconnaissance vocale des navigateurs passe par le réseau
    const rec = new Ctor()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim())
        else partial += r[0].transcript
      }
      setInterim(partial)
    }
    rec.onerror = (e) => {
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'denied'
          : e.error === 'network'
            ? 'offline'
            : e.error === 'no-speech' || e.error === 'aborted'
              ? null
              : 'failed',
      )
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }
    recRef.current = rec
    setError(null)
    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
      setError('failed')
    }
  }, [])

  return {
    listening,
    interim,
    error,
    start,
    stop,
    supported: typeof window !== 'undefined' && !!getCtor(),
  }
}
