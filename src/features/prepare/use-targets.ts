import { toError } from '@/lib/to-error'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignTargets,
  createTag as createTagRemote,
  deleteMeeting as deleteMeetingRemote,
  deleteTag as deleteTagRemote,
  ensureDefaultTags,
  listTargets,
  saveMeeting as saveMeetingRemote,
  setCompanyTag,
  unassignTargets,
  updateTag as updateTagRemote,
  updateTargets,
  type MeetingInput,
} from '@/db/repositories/targets'
import { listMembers } from '@/db/repositories/teams'
import type { Goal, Priority, Tag, Target, TeamMember } from '@/db/schemas/prepare'

type Data = { targets: Target[]; tags: Tag[]; members: TeamMember[] }

const byId = (ids: string[]) => new Set(ids)

/**
 * État de la préparation d'un salon : cibles, tags, équipe. Les modifications sont appliquées tout de
 * suite à l'écran puis envoyées ; en cas d'échec elles sont annulées et `actionError` est renseigné.
 */
export function useTargets(eventId: string, teamId: string) {
  const [data, setData] = useState<Data>()
  const [error, setError] = useState<Error>()
  const [actionError, setActionError] = useState(false)
  const [tick, setTick] = useState(0)
  const dataRef = useRef<Data>(undefined)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    let cancelled = false
    Promise.all([listTargets(eventId), ensureDefaultTags(teamId), listMembers(teamId)]).then(
      ([targets, tags, members]) => {
        if (cancelled) return
        setError(undefined)
        setData({
          targets,
          tags,
          members: members.map((m) => ({ userId: m.userId, name: m.displayName || '?' })),
        })
      },
      (e: unknown) => {
        if (!cancelled) setError(toError(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [eventId, teamId, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  /** Applique `local` immédiatement, puis `remote` ; annule `local` si `remote` échoue. */
  const run = useCallback(async (local: (d: Data) => Data, remote: () => Promise<unknown>) => {
    const snapshot = dataRef.current
    if (!snapshot) return false
    setData(local(snapshot))
    setActionError(false)
    try {
      await remote()
      return true
    } catch {
      setData(snapshot)
      setActionError(true)
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
          },
        )
      },

      unassign: (ids: string[], userId: string) => {
        const set = byId(ids)
        return run(
          (d) => ({
            ...d,
            targets: d.targets.map((t) =>
              set.has(t.id) ? { ...t, assigneeIds: t.assigneeIds.filter((u) => u !== userId) } : t,
            ),
          }),
          () => unassignTargets(ids, userId),
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

      saveMeeting: async (input: Omit<MeetingInput, 'teamId' | 'eventId'>): Promise<boolean> => {
        const snapshot = dataRef.current
        if (!snapshot) return false
        try {
          const id = await saveMeetingRemote({ ...input, teamId, eventId })
          const meeting = {
            id,
            plannedAt: input.plannedAt,
            durationMin: input.durationMin,
            reminderMin: input.reminderMin,
            ownerId: input.ownerId,
            status: 'to_see',
          }
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
          return true
        } catch {
          return false
        }
      },

      deleteMeeting: (targetId: string, meetingId: string) =>
        run(
          (d) => ({
            ...d,
            targets: d.targets.map((t) =>
              t.id === targetId
                ? { ...t, meetings: t.meetings.filter((m) => m.id !== meetingId) }
                : t,
            ),
          }),
          () => deleteMeetingRemote(meetingId),
        ),
    }),
    [run, patchTargets, teamId, eventId],
  )

  const memberName = useMemo(() => {
    const map = new Map((data?.members ?? []).map((m) => [m.userId, m.name]))
    return (userId: string) => map.get(userId) ?? '?'
  }, [data?.members])

  return {
    targets: data?.targets,
    tags: data?.tags ?? [],
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
