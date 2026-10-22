// Libellés (français) du contenu des fichiers générés. Les textes de l'interface, eux, sont dans src/locales.
import type { MeetingStatus, Priority } from './types.ts'

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  to_see: 'À voir',
  in_progress: 'En cours',
  done: 'Vu',
  follow_up: 'À relancer',
  not_interested: 'Pas intéressé',
  missed: 'Manqué',
  skipped: 'Écarté',
}

/** Auteur d'une note ou d'une rencontre dont le compte a été supprimé (ou qui a quitté l'équipe). */
export const FORMER_MEMBER_LABEL = 'Ancien membre'

export const PRIORITY_LABEL: Record<Priority | 'none', string> = {
  A: 'Priorité A',
  B: 'Priorité B',
  C: 'Priorité C',
  none: 'Sans priorité',
}

export const GOAL_LABEL: Record<string, string> = {
  demo: 'Démo',
  intro_decision_maker: 'Intro décideur',
  watch: 'Veille',
  other: 'Autre',
}

export const SOURCE_LABEL: Record<string, string> = {
  typed: 'Saisie',
  dictated: 'Dictée',
  voice_transcript: 'Transcription vocale',
  ocr: 'OCR',
}

export const CHANNEL_LABEL: Record<string, string> = {
  email: 'E-mail',
  call: 'Appel',
  linkedin: 'LinkedIn',
}

export const statusLabel = (s: string) => STATUS_LABEL[s as MeetingStatus] ?? s
export const priorityLabel = (p: Priority | null) => PRIORITY_LABEL[p ?? 'none']

/** Note d'intérêt (1 à 5) ou moyenne : toujours suivie de « /5 » pour que l'échelle se comprenne sans légende. */
export const interestLabel = (n: number) =>
  `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')}/5`

/** Marque en pied de page des PDF : « fair » est toujours en minuscules. */
export const GENERATED_WITH = 'généré avec fair'
