import type { SyncTableName } from './db'

/**
 * Comment chaque table est synchronisée :
 * - `event`  : lignes d'un salon (curseur `server_seq` par salon) ;
 * - `team`   : lignes de l'équipe (curseur `server_seq` global) ;
 * - `full`   : pas de `server_seq` (taggings, profils) : relues en entier.
 */
export type TableConfig = { pk: string[]; scope: 'event' | 'team' | 'full' }

export const TABLES: Record<SyncTableName, TableConfig> = {
  events: { pk: ['id'], scope: 'team' },
  companies: { pk: ['id'], scope: 'team' },
  contacts: { pk: ['id'], scope: 'team' },
  tags: { pk: ['id'], scope: 'team' },
  notes: { pk: ['id'], scope: 'team' },
  attachments: { pk: ['id'], scope: 'team' },
  event_companies: { pk: ['id'], scope: 'event' },
  meetings: { pk: ['id'], scope: 'event' },
  event_company_assignees: { pk: ['event_company_id', 'user_id'], scope: 'event' },
  taggings: { pk: ['tag_id', 'taggable_table', 'taggable_id'], scope: 'full' },
  profiles: { pk: ['id'], scope: 'full' },
}

/**
 * Ordre de lecture : les parents avant les enfants. L'envoi, lui, suit l'ordre de création des opérations
 * (une entreprise est toujours créée avant sa participation, etc.).
 */
export const PULL_ORDER: SyncTableName[] = [
  'profiles',
  'events',
  'companies',
  'contacts',
  'tags',
  'taggings',
  'event_companies',
  'event_company_assignees',
  'meetings',
  'notes',
  'attachments',
]
