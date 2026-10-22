import { toError } from '@/lib/to-error'
import { cacheKeys } from '@/db/cache-keys'
import { prefetchEventData } from '@/db/repositories/prefetch'
import { markFresh, markStale, readCached, writeCached } from '@/lib/cache/cache'
import { isRetryableError } from '@/lib/network-error'
import { useReadySession } from '@/features/auth-team/session'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignTargets,
  createTag as createTagRemote,
  deleteTag as deleteTagRemote,
  ensureDefaultTags,
  listTargets,
  removeTargets,
  setCompanyTag,
  unassignTargets,
  updateShowAbbrev as updateShowAbbrevRemote,
  updateTag as updateTagRemote,
  updateTargets,
  type MeetingInput,
  type MeetingReportPatch,
} from '@/db/repositories/targets'
import { listMembers } from '@/db/repositories/teams'
import { newId } from '@/lib/ids'
import { showColorFor } from '@/db/schemas/prepare'
import { useSync } from '@/features/sync/use-sync'
import { applyMeetingPatch, meetingFromInput, overlayMeetingOps } from './lib/overlay'
import type { Goal, Priority, Tag, Target, TeamMember } from '@/db/schemas/prepare'

type Data = { targets: Target[]; tags: Tag[]; members: TeamMember[] }

const byId = (ids: string[]) => new Set(ids)

/**
 * État de la préparation d'un salon : cibles, tags, équipe. Les modifications sont appliquées tout de
 * suite à l'écran puis envoyées ; en cas d'échec elles sont annulées et `actionError` est renseigné.
 * Exception : les rencontres (création, compte-rendu, suppression) passent par la file d'attente hors ligne : gardées sur
 * l'appareil, envoyées dès que le réseau le permet, jamais annulées à l'écran (l'état des envois est dans la bannière).
 */
export function useTargets(eventId: string, teamId: string) {
  const [data, setData] = useState<Data>()
  const [error, setError] = useState<Error>()
  const [actionError, setActionError] = useState(false)
  const [tick, setTick] = useState(0)
  const dataRef = useRef<Data>(undefined)
  const sync = useSync()
  const { session } = useReadySession()
  const meId = session.user.id
  const syncRef = useRef(sync)
  useEffect(() => {
    syncRef.current = sync
  }, [sync])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Chargement : la copie locale s'affiche tout de suite (connexion lente ou coupée), le réseau la remplace dès qu'il répond.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const cached = await readCached<Data>(cacheKeys.eventData(eventId))
      if (cancelled) return
      if (cached && !dataRef.current) setData(cached.value)
      try {
        const [targets, tags, members] = await Promise.all([
          listTargets(eventId),
          ensureDefaultTags(teamId),
          listMembers(teamId),
        ])
        if (cancelled) return
        markFresh()
        setError(undefined)
        const fresh: Data = {
          targets,
          tags,
          members: members.map((m) => ({ userId: m.userId, name: m.displayName || '?' })),
        }
        setData(fresh)
        void writeCached(cacheKeys.eventData(eventId), fresh)
        // Contacts, notes et historique du salon, pour pouvoir ouvrir une fiche sans réseau.
        void prefetchEventData(eventId, targets, meId)
      } catch (e) {
        if (cancelled) return
        if ((cached || dataRef.current) && isRetryableError(e)) {
          markStale(cached?.savedAt ?? Date.now()) // on garde ce qu'on a, la bannière le dit
        } else {
          setError(toError(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eventId, teamId, tick, meId])

  // La copie locale suit les modifications faites à l'écran (après une courte pause) : rouvrir la liste hors ligne
  // montre ce qu'on y avait fait.
  useEffect(() => {
    if (!data) return
    const timer = window.setTimeout(
      () => void writeCached(cacheKeys.eventData(eventId), data),
      1_500,
    )
    return () => window.clearTimeout(timer)
  }, [data, eventId])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  // Une file qui vient de se vider : le serveur a pu recalculer des choses (une rencontre vide supprimée…), on relit
  // (ajustement d'état pendant le rendu, comme `useAsync`).
  const { lastSyncedAt, pending } = sync.snapshot
  const [seenSync, setSeenSync] = useState(lastSyncedAt)
  if (lastSyncedAt !== seenSync && pending === 0) {
    setSeenSync(lastSyncedAt)
    setTick((t) => t + 1)
  }

  /**
   * Applique `local` immédiatement, puis `remote`. `local` s'applique à l'état le plus récent (forme fonctionnelle) :
   * une copie prise avant un rendu écraserait les changements voisins (une rencontre créée juste avant disparaîtrait).
   * Si `remote` échoue, on recharge depuis le serveur plutôt que de restaurer une copie périmée.
   */
  const run = useCallback(async (local: (d: Data) => Data, remote: () => Promise<unknown>) => {
    if (!dataRef.current) return false
    setData((d) => d && local(d))
    setActionError(false)
    try {
      await remote()
      return true
    } catch {
      setActionError(true)
      setTick((t) => t + 1)
      return false
    }
  }, [])

  const patchTargets = useCallback(
    (ids: string[], patch: Partial<Target>) =>
      (d: Data): Data => {
        const set = byId(ids)
        return { ...d, targets: d.targets.map((t) => (set.has(t.id) ? { ...t, ...patch } : t)) }
      },
    [],
  )

  const actions = useMemo(
    () => ({
      setPriority: (ids: string[], priority: Priority | null) =>
        run(patchTargets(ids, { priority }), () => updateTargets(ids, { priority })),

      setGoal: (ids: string[], goal: Goal | null) =>
        run(patchTargets(ids, { goal }), () => updateTargets(ids, { objective: goal })),

      setPrepComment: (id: string, prepComment: string) =>
        run(patchTargets([id], { prepComment }), () =>
          updateTargets([id], { prep_comment: prepComment }),
        ),

      toggleTag: (ids: string[], tagId: string, on: boolean) => {
        const set = byId(ids)
        return run(
          (d) => ({
            ...d,
            targets: d.targets.map((t) => {
              if (!set.has(t.id)) return t
              const has = t.tagIds.includes(tagId)
              if (on === has) return t
              return {
                ...t,
                tagIds: on ? [...t.tagIds, tagId] : t.tagIds.filter((x) => x !== tagId),
              }
            }),
          }),
          () => {
            const companyIds = [
              ...new Set(
                (dataRef.current?.targets ?? [])
                  .filter((t) => set.has(t.id))
                  .map((t) => t.companyId),
              ),
            ]
            return setCompanyTag(teamId, companyIds, tagId, on)
          },
        )
      },

      /** Ajoute `userId` aux cibles ; avec `replace`, retire les autres commerciaux. */
      assign: (ids: string[], userId: string, replace = false) => {
        const set = byId(ids)
        const others = new Map<string, string[]>() // collègue → cibles à lui retirer
        if (replace) {
          for (const t of dataRef.current?.targets ?? []) {
            if (!set.has(t.id)) continue
            for (const u of t.assigneeIds)
              if (u !== userId) others.set(u, [...(others.get(u) ?? []), t.id])
          }
        }
        return run(
          (d) => ({
            ...d,
            targets: d.targets.map((t) =>
              set.has(t.id)
                ? {
                    ...t,
                    assigneeIds: replace
                      ? [userId]
                      : t.assigneeIds.includes(userId)
                        ? t.assigneeIds
                        : [...t.assigneeIds, userId],
                  }
                : t,
            ),
          }),
          async () => {
            await assignTargets(teamId, eventId, ids, userId)
            for (const [u, targetIds] of others) await unassignTargets(targetIds, u)
            // (le remplacement ne signale pas un retrait sans effet : l'assignation du nouveau commercial a réussi)
          },
        )
      },

      unassign: (ids: string[], userId: string) => {
        const set = byId(ids)
        const expected = (dataRef.current?.targets ?? []).filter(
          (t) => set.has(t.id) && t.assigneeIds.includes(userId),
        ).length
        return run(
          (d) => ({
            ...d,
            targets: d.targets.map((t) =>
              set.has(t.id) ? { ...t, assigneeIds: t.assigneeIds.filter((u) => u !== userId) } : t,
            ),
          }),
          async () => {
            // Rien de modifié alors qu'il y avait des assignations : on le signale et on annule l'affichage.
            if ((await unassignTargets(ids, userId)) === 0 && expected > 0) {
              throw new Error('unassign had no effect')
            }
          },
        )
      },

      /** Retire des participants du salon (admins) : disparaissent tout de suite, rechargés si le serveur refuse. */
      remove: (ids: string[]) => {
        const set = byId(ids)
        return run(
          (d) => ({ ...d, targets: d.targets.filter((t) => !set.has(t.id)) }),
          async () => {
            if ((await removeTargets(ids)) < ids.length) throw new Error('not allowed or not found')
          },
        )
      },

      createTag: async (label: string, color: string): Promise<Tag | null> => {
        try {
          const tag = await createTagRemote(teamId, label, color)
          setData((d) =>
            d
              ? {
                  ...d,
                  tags: [...d.tags, tag].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
                }
              : d,
          )
          return tag
        } catch {
          setActionError(true)
          return null
        }
      },

      /** Nouveau salon (pastille) : couleur automatique, calculée sur le libellé. */
      createShow: async (label: string): Promise<Tag | null> => {
        try {
          const tag = await createTagRemote(teamId, label, showColorFor(label), 'show')
          setData((d) =>
            d
              ? {
                  ...d,
                  tags: [...d.tags, tag].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
                }
              : d,
          )
          return tag
        } catch {
          setActionError(true)
          return null
        }
      },

      /** Abréviation d'un salon (admins), appliquée tout de suite et annulée en cas d'échec. */
      setShowAbbrev: (id: string, abbrev: string | null) =>
        run(
          (d) => ({ ...d, tags: d.tags.map((t) => (t.id === id ? { ...t, abbrev } : t)) }),
          () => updateShowAbbrevRemote(id, abbrev),
        ),

      updateTag: (id: string, label: string, color: string) =>
        run(
          (d) => ({ ...d, tags: d.tags.map((t) => (t.id === id ? { ...t, label, color } : t)) }),
          () => updateTagRemote(id, label, color),
        ),

      removeTag: (id: string) =>
        run(
          (d) => ({
            tags: d.tags.filter((t) => t.id !== id),
            members: d.members,
            targets: d.targets.map((t) =>
              t.tagIds.includes(id) ? { ...t, tagIds: t.tagIds.filter((x) => x !== id) } : t,
            ),
          }),
          () => deleteTagRemote(id),
        ),

      /** Crée ou replanifie une rencontre : appliqué tout de suite, puis envoyé par la file d'attente (hors ligne compris). */
      saveMeeting: async (input: Omit<MeetingInput, 'teamId' | 'eventId'>): Promise<boolean> => {
        const snapshot = dataRef.current
        if (!snapshot) return false
        const id = input.id ?? newId()
        const full = { ...input, id, teamId, eventId }
        const prev = snapshot.targets
          .find((t) => t.id === input.targetId)
          ?.meetings.find((m) => m.id === id)
        const meeting = meetingFromInput(full, prev)
        setData(
          (d) =>
            d && {
              ...d,
              targets: d.targets.map((t) =>
                t.id === input.targetId
                  ? {
                      ...t,
                      meetings: [...t.meetings.filter((m) => m.id !== id), meeting].sort((a, b) =>
                        a.plannedAt.localeCompare(b.plannedAt),
                      ),
                    }
                  : t,
              ),
            },
        )
        syncRef.current.enqueue({ type: 'meeting.upsert', input: full })
        return true
      },

      /** Compte-rendu d'une rencontre : appliqué tout de suite, puis envoyé par la file d'attente (hors ligne compris). */
      updateMeetingReport: async (
        targetId: string,
        meetingId: string,
        patch: MeetingReportPatch,
      ): Promise<boolean> => {
        if (!dataRef.current) return false
        setData(
          (d) =>
            d && {
              ...d,
              targets: d.targets.map((t) =>
                t.id === targetId
                  ? {
                      ...t,
                      meetings: t.meetings.map((m) =>
                        m.id === meetingId ? applyMeetingPatch(m, patch) : m,
                      ),
                    }
                  : t,
              ),
            },
        )
        syncRef.current.enqueue({ type: 'meeting.patch', id: meetingId, patch })
        return true
      },

      /** Supprime une rencontre ; si elle n'est jamais partie sur le serveur, il n'y a rien à envoyer. */
      deleteMeeting: async (targetId: string, meetingId: string): Promise<boolean> => {
        if (!dataRef.current) return false
        setData(
          (d) =>
            d && {
              ...d,
              targets: d.targets.map((t) =>
                t.id === targetId
                  ? { ...t, meetings: t.meetings.filter((m) => m.id !== meetingId) }
                  : t,
              ),
            },
        )
        if (!syncRef.current.cancelUnsentMeeting(meetingId)) {
          syncRef.current.enqueue({ type: 'meeting.delete', id: meetingId })
        }
        return true
      },
    }),
    [run, patchTargets, teamId, eventId],
  )

  const { t } = useTranslation('prepare')
  const formerMember = t('formerMember')
  const memberName = useMemo(() => {
    const map = new Map((data?.members ?? []).map((m) => [m.userId, m.name]))
    return (userId: string) => map.get(userId) ?? formerMember
  }, [data?.members, formerMember])

  // Les modifications de rencontres pas encore parties (file hors ligne, y compris relue après un rechargement de la
  // page) sont rejouées sur ce que le serveur a renvoyé : on ne voit jamais l'ancienne version.
  const pendingSnapshot = sync.snapshot
  const targets = useMemo(
    () =>
      data
        ? overlayMeetingOps(data.targets, pendingSnapshot.pending > 0 ? sync.pendingOps() : [])
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pendingSnapshot` change à chaque évolution de la file
    [data, pendingSnapshot],
  )

  // Typologies (Client, Prospect…) d'un côté, pastilles de salons de l'autre : mêmes liens, deux usages.
  const tags = useMemo(() => (data?.tags ?? []).filter((t) => t.kind === 'type'), [data?.tags])
  const shows = useMemo(() => (data?.tags ?? []).filter((t) => t.kind === 'show'), [data?.tags])

  return {
    targets,
    tags,
    shows,
    members: data?.members ?? [],
    memberName,
    loading: !data && !error,
    error,
    actionError,
    dismissActionError: () => setActionError(false),
    reload,
    actions,
  }
}

export type TargetsApi = ReturnType<typeof useTargets>
