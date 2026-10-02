import { toError } from '@/lib/to-error'
import { useCallback, useEffect, useState } from 'react'

type Result<T> = { request: object; data?: T; error?: Error }

function sameDeps(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
}

/**
 * Charge une donnée asynchrone ; `reload()` relance la requête.
 * Les données précédentes restent disponibles pendant un rechargement.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [tick, setTick] = useState(0)
  // Chaque changement de deps ou reload crée une nouvelle « requête » (identité d'objet) :
  // elle sert à reconnaître le résultat à jour (ajustement d'état pendant le rendu, cf. docs React).
  const [req, setReq] = useState({ deps, tick, id: {} })
  if (req.tick !== tick || !sameDeps(req.deps, deps)) setReq({ deps, tick, id: {} })
  const request = req.id
  const [result, setResult] = useState<Result<T>>()

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setResult({ request, data })
      },
      (e: unknown) => {
        if (!cancelled) setResult({ request, error: toError(e) })
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const settled = result?.request === request
  return {
    data: result?.data,
    error: settled ? result.error : undefined,
    loading: !settled,
    reload,
  }
}
