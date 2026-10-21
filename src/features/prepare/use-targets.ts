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
  updateMeetingReport as updateMeetingReportRemote,
  updateTargets,
  type MeetingInput,
  type MeetingReportPatch,
} from '@/db/repositories/targets'
import { listMembers } from '@/db/repositories/teams'
import { showColorFor } from '@/db/schemas/prepare'
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
          // Modifier le créneau ne change ni le statut, ni l'intérêt, ni la prochaine étape déjà saisis.
          const prev = snapshot.targets
            .find((t) => t.id === input.targetId)
            ?.meetings.find((m) => m.id === id)
          const meeting = {
            id,
            plannedAt: input.plannedAt,
            durationMin: input.durationMin,
            reminderMin: input.reminderMin,
            ownerId: input.ownerId,
            status: prev?.status ?? 'to_see',
            interest: prev?.interest ?? null,
            nextStep: prev?.nextStep ?? '',
            recontact: prev?.recontact ?? false,
            news: prev?.news ?? false,
            autoCreated: input.auto === true,
            contactId: prev?.contactId ?? null,
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

      /** Compte-rendu : statut, intérêt et prochaine étape d'une rencontre (appliqués tout de suite, annulés en cas d'échec). */
      updateMeetingReport: (targetId: string, meetingId: string, patch: MeetingReportPatch) =>
        run(
          (d) => ({
            ...d,
            targets: d.targets.map((t) =>
              t.id === targetId
                ? {
                    ...t,
                    meetings: t.meetings.map((m) =>
                      m.id === meetingId
                        ? {
                            ...m,
                            ...(patch.status !== undefined ? { status: patch.status } : {}),
                            ...(patch.interest !== undefined ? { interest: patch.interest } : {}),
                            ...(patch.nextStep !== undefined ? { nextStep: patch.nextStep } : {}),
                            ...(patch.recontact !== undefined
                              ? { recontact: patch.recontact }
                              : {}),
                            ...(patch.news !== undefined ? { news: patch.news } : {}),
                            ...(patch.contactId !== undefined
                              ? { contactId: patch.contactId }
                              : {}),
                          }
                        : m,
                    ),
                  }
                : t,
            ),
          }),
          () => updateMeetingReportRemote(meetingId, patch),
        ),

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

  // Typologies (Client, Prospect…) d'un côté, pastilles de salons de l'autre : mêmes liens, deux usages.
  const tags = useMemo(() => (data?.tags ?? []).filter((t) => t.kind === 'type'), [data?.tags])
  const shows = useMemo(() => (data?.tags ?? []).filter((t) => t.kind === 'show'), [data?.tags])

  return {
    targets: data?.targets,
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
