import { toError } from '@/lib/to-error'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { devAutoSignIn, getSession, onAuthChange, type Session } from '@/db/repositories/auth'
import { fetchMyDisplayName } from '@/db/repositories/profile'
import { acceptPendingInvitations, fetchMembership, type Membership } from '@/db/repositories/teams'

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsTeam'; session: Session; displayName: string }
  | { status: 'ready'; session: Session; membership: Membership; displayName: string }
  | { status: 'error'; session: Session; error: Error }

type SessionContextValue = SessionState & { refreshMembership: () => Promise<void> }

const SessionContext = createContext<SessionContextValue | null>(null)

type Loaded = {
  userId: string
  membership: Membership | null
  displayName: string
  error?: Error
}

async function loadFor(uid: string): Promise<Loaded> {
  try {
    // Un utilisateur invité rejoint son équipe avant qu'on lui propose d'en créer une.
    await acceptPendingInvitations()
    const [membership, displayName] = await Promise.all([
      fetchMembership(uid),
      fetchMyDisplayName(uid),
    ])
    return { userId: uid, membership, displayName }
  } catch (e) {
    return { userId: uid, membership: null, displayName: '', error: toError(e) }
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Résultat du chargement, rattaché à l'utilisateur concerné : jamais réutilisé pour un autre compte.
  const [loaded, setLoaded] = useState<Loaded>()
  const userId = session?.user.id

  useEffect(() => {
    void (async () => {
      let current = await getSession()
      if (!current) {
        await devAutoSignIn() // no-op hors développement ou sans identifiants de dev
        current = await getSession()
      }
      setSession(current)
    })().catch(() => setSession(null))
    return onAuthChange(setSession)
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void loadFor(userId).then((result) => {
      if (!cancelled) setLoaded(result)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const refreshMembership = useCallback(async () => {
    if (userId) setLoaded(await loadFor(userId))
  }, [userId])

  const value = useMemo<SessionContextValue>(() => {
    if (session === undefined) return { status: 'loading', refreshMembership }
    if (session === null) return { status: 'signedOut', refreshMembership }
    if (loaded?.userId !== session.user.id) return { status: 'loading', refreshMembership }
    if (loaded.error) return { status: 'error', session, error: loaded.error, refreshMembership }
    const { displayName } = loaded
    if (loaded.membership === null)
      return { status: 'needsTeam', session, displayName, refreshMembership }
    return {
      status: 'ready',
      session,
      membership: loaded.membership,
      displayName,
      refreshMembership,
    }
  }, [session, loaded, refreshMembership])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession doit être utilisé dans <SessionProvider>')
  return ctx
}

/** Pour les pages protégées : garantit session + équipe. */
export function useReadySession() {
  const s = useSession()
  if (s.status !== 'ready') throw new Error('Session non prête')
  return s
}
