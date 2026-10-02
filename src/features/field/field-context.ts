import { useOutletContext } from 'react-router-dom'
import type { FieldCtx } from '@/db/repositories/field'

export type FieldOutletContext = { ctx: FieldCtx }

/** Équipe, salon et utilisateur du mode terrain (fournis par FieldLayout). */
export const useFieldCtx = () => useOutletContext<FieldOutletContext>().ctx
