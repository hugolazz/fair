// Clés de la copie locale (`src/lib/cache`) : les lectures et le téléchargement en arrière-plan doivent s'accorder dessus.
export const cacheKeys = {
  contacts: (companyId: string) => `contacts:${companyId}`,
  notes: (meetingId: string) => `notes:${meetingId}`,
  history: (companyId: string, eventId: string) => `history:${companyId}:${eventId}`,
  membership: (userId: string) => `membership:${userId}`,
  displayName: (userId: string) => `profile:${userId}:name`,
  keyContacts: (eventId: string) => `keyContacts:${eventId}`,
  events: () => 'events:list',
  event: (eventId: string) => `events:${eventId}`,
  /** Participants, tags et équipe d'un salon (ce que lit `useTargets`). */
  eventData: (eventId: string) => `event:${eventId}:data`,
}
