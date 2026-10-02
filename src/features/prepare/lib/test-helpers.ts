import { buildSearchKey, type Target } from '@/db/schemas/prepare'

/** Fabrique une cible pour les tests. */
export function target(id: string, name: string, o: Partial<Target> = {}): Target {
  const base: Target = {
    id,
    eventId: 'e1',
    companyId: `c-${id}`,
    name,
    domain: '',
    website: '',
    industry: '',
    country: '',
    city: '',
    stand: '',
    priority: null,
    goal: null,
    prepComment: '',
    assigneeIds: [],
    tagIds: [],
    contactCount: 0,
    meetings: [],
    searchKey: '',
  }
  const t = { ...base, ...o }
  return {
    ...t,
    searchKey:
      o.searchKey ?? buildSearchKey([t.name, t.stand, t.industry, t.city, t.country, t.domain]),
  }
}
