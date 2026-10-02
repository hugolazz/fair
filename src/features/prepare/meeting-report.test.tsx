// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/lib/i18n'
import type { Target, TargetMeeting } from '@/db/schemas/prepare'

const fetchMeetingNotes = vi.hoisted(() => vi.fn())
const addMeetingNote = vi.hoisted(() => vi.fn())
vi.mock('@/db/repositories/targets', () => ({ fetchMeetingNotes, addMeetingNote }))
vi.mock('@/features/auth-team/session', () => ({
  useReadySession: () => ({
    session: { user: { id: 'u1' } },
    membership: { teamId: 't1', teamName: 'Équipe', role: 'owner' },
  }),
}))

import { MeetingReport } from './meeting-report'
import type { TargetsApi } from './use-targets'

const meeting: TargetMeeting = {
  id: 'm1',
  plannedAt: '2027-05-12T08:30:00Z',
  durationMin: 15,
  reminderMin: null,
  ownerId: 'u1',
  status: 'to_see',
  interest: null,
  nextStep: '',
}
const target = { id: 'ec1', name: 'Carrefour' } as Target

const updateMeetingReport = vi.fn()
const api = { actions: { updateMeetingReport } } as unknown as TargetsApi

beforeEach(() => {
  updateMeetingReport.mockReset().mockResolvedValue(true)
  fetchMeetingNotes
    .mockReset()
    .mockResolvedValue([
      { id: 'n1', body: 'Décideur présent', authorId: 'u2', capturedAt: '2027-05-12T09:00:00Z' },
    ])
  addMeetingNote.mockReset()
})
afterEach(cleanup)

const open = async (m = meeting) => {
  const user = userEvent.setup()
  render(
    <MeetingReport
      target={target}
      meeting={m}
      api={api}
      nameOf={(id) => (id === 'u2' ? 'Marie' : 'Moi')}
    />,
  )
  await user.click(screen.getByText(/Compte-rendu/))
  return user
}

describe('compte-rendu d’une rencontre', () => {
  it('résume le statut et l’intérêt dans l’en-tête', () => {
    render(
      <MeetingReport
        target={target}
        meeting={{ ...meeting, status: 'follow_up', interest: 4 }}
        api={api}
        nameOf={() => ''}
      />,
    )
    expect(screen.getByText(/Compte-rendu · À relancer · intérêt 4\/5/)).toBeInTheDocument()
  })

  it('change le statut en un choix, enregistré tout de suite', async () => {
    const user = await open()
    await user.selectOptions(screen.getByLabelText('Statut'), 'done')
    expect(updateMeetingReport).toHaveBeenCalledWith('ec1', 'm1', { status: 'done' })
  })

  it('enregistre l’intérêt de 1 à 5, et permet de l’effacer', async () => {
    const user = await open({ ...meeting, interest: 3 })
    await user.selectOptions(screen.getByLabelText('Intérêt'), '5')
    expect(updateMeetingReport).toHaveBeenLastCalledWith('ec1', 'm1', { interest: 5 })
    await user.selectOptions(screen.getByLabelText('Intérêt'), '')
    expect(updateMeetingReport).toHaveBeenLastCalledWith('ec1', 'm1', { interest: null })
  })

  it('enregistre la prochaine étape en quittant le champ, une seule fois', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Prochaine étape'), 'Envoyer le devis')
    expect(updateMeetingReport).not.toHaveBeenCalled() // pas d'écriture à chaque frappe
    await user.tab()
    expect(updateMeetingReport).toHaveBeenCalledTimes(1)
    expect(updateMeetingReport).toHaveBeenCalledWith('ec1', 'm1', { nextStep: 'Envoyer le devis' })
  })

  it('affiche les notes existantes avec leur auteur', async () => {
    await open()
    expect(await screen.findByText('Décideur présent')).toBeInTheDocument()
    expect(screen.getByText(/Marie/)).toBeInTheDocument()
  })

  it('ajoute une note : écrite pour la bonne rencontre et le bon auteur, liste rechargée, champ vidé', async () => {
    addMeetingNote.mockResolvedValue({
      id: 'n2',
      body: 'Veut une démo',
      authorId: 'u1',
      capturedAt: '2027-05-12T10:00:00Z',
    })
    const user = await open()
    const add = screen.getByRole('button', { name: 'Ajouter la note' })
    expect(add).toBeDisabled() // rien à enregistrer
    await user.type(screen.getByLabelText('Nouvelle note'), 'Veut une démo')
    await user.click(add)
    expect(addMeetingNote).toHaveBeenCalledWith('t1', 'm1', 'u1', 'Veut une démo')
    await waitFor(() => expect(screen.getByLabelText('Nouvelle note')).toHaveValue(''))
    expect(fetchMeetingNotes).toHaveBeenCalledTimes(2) // rechargée après l'ajout
  })

  it('signale l’échec d’enregistrement d’une note sans perdre le texte', async () => {
    addMeetingNote.mockRejectedValue(new Error('réseau'))
    const user = await open()
    await user.type(screen.getByLabelText('Nouvelle note'), 'Important')
    await user.click(screen.getByRole('button', { name: 'Ajouter la note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible d'enregistrer la note/)
    expect(screen.getByLabelText('Nouvelle note')).toHaveValue('Important')
  })
})
