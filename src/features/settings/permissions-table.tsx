import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { setMemberPermissions } from '@/db/repositories/teams'
import { useReadySession } from '@/features/auth-team/session'
import {
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  type PermissionKey,
  type Permissions,
} from '@/lib/permissions'

/**
 * Tableau des droits des commerciaux (propriétaire et admins) : une ligne par droit, une case par ligne pour les
 * commerciaux ; les admins ont toujours tout. Chaque case s'applique tout de suite et revient en arrière si la base refuse.
 */
export function PermissionsTable() {
  const { t } = useTranslation('settings')
  const { membership, refreshMembership } = useReadySession()
  const [perms, setPerms] = useState<Permissions>(membership.memberPermissions)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')
  const timer = useRef<number>(undefined)
  const latest = useRef(perms)
  const confirmed = useRef(membership.memberPermissions)

  async function flush() {
    window.clearTimeout(timer.current)
    timer.current = undefined
    const next = latest.current
    try {
      await setMemberPermissions(membership.teamId, next)
      confirmed.current = next
      await refreshMembership()
      setState('saved')
    } catch {
      latest.current = confirmed.current
      setPerms(confirmed.current)
      setState('error')
    }
  }

  // Les cases s'appliquent tout de suite à l'écran ; plusieurs clics de suite ne font qu'un enregistrement (courte pause).
  function change(next: Permissions) {
    latest.current = next
    setPerms(next)
    setState('idle')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 400)
  }
  // Quitter la page avec un clic non enregistré : on l'enregistre plutôt que de le perdre.
  useEffect(
    () => () => {
      if (timer.current !== undefined) void flush()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const toggle = (key: PermissionKey, on: boolean) => change({ ...perms, [key]: on })
  const isDefault = PERMISSION_KEYS.every((k) => perms[k] === DEFAULT_MEMBER_PERMISSIONS[k])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-700">{t('permissions.help')}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t('permissions.title')}</caption>
          <thead>
            <tr className="text-sm text-slate-600">
              <th scope="col" className="py-2 pr-3 font-medium">
                {t('permissions.right')}
              </th>
              <th scope="col" className="w-28 px-2 py-2 text-center font-medium">
                {t('permissions.members')}
              </th>
              <th scope="col" className="w-24 px-2 py-2 text-center font-medium">
                {t('permissions.admins')}
              </th>
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((group) => (
            <tbody key={group.id} className="border-t border-slate-200">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={3}
                  className="pt-4 pb-1 text-sm font-semibold text-slate-900"
                >
                  {t(`permissions.groups.${group.id}`)}
                </th>
              </tr>
              {group.keys.map((key) => (
                <tr key={key} className="border-t border-slate-100 align-top">
                  <th scope="row" className="py-2.5 pr-3 font-normal">
                    <span className="block text-base">{t(`permissions.items.${key}.label`)}</span>
                    <span className="block text-sm text-slate-600">
                      {t(`permissions.items.${key}.hint`)}
                    </span>
                  </th>
                  <td className="px-2 py-1 text-center">
                    <label className="inline-flex size-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-6"
                        aria-label={t('permissions.memberCell', {
                          right: t(`permissions.items.${key}.label`),
                        })}
                        checked={perms[key]}
                        onChange={(e) => void toggle(key, e.target.checked)}
                      />
                    </label>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Check
                      aria-label={t('permissions.adminCell', {
                        right: t(`permissions.items.${key}.label`),
                      })}
                      role="img"
                      className="mx-auto size-5 text-slate-600"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {state === 'saved' ? (
        <p role="status" className="text-sm text-emerald-800">
          {t('permissions.saved')}
        </p>
      ) : null}
      {state === 'error' ? (
        <p role="alert" className="text-sm text-red-700">
          {t('permissions.error')}
        </p>
      ) : null}
      <div>
        <Button
          variant="secondary"
          disabled={isDefault}
          onClick={() => change({ ...DEFAULT_MEMBER_PERMISSIONS })}
        >
          {t('permissions.reset')}
        </Button>
      </div>
    </div>
  )
}
