-- fair — schéma de référence (brouillon de cadrage, SUPPLANTÉ : la source de vérité est supabase/migrations/)
-- Colonnes de sync communes [S] : created_at, updated_at, deleted_at, server_seq, updated_by

create extension if not exists pg_trgm;
create sequence if not exists server_seq_global;

create type team_role        as enum ('owner','admin','member');
create type event_status     as enum ('draft','preparing','live','done','archived');
create type event_member_role as enum ('lead','member');
create type company_source   as enum ('import','manual','scan');
create type meeting_status   as enum ('to_see','in_progress','done','missed','skipped');
create type temperature      as enum ('hot','warm','cold');
create type note_source      as enum ('typed','dictated','voice_transcript','ocr');
create type attachment_kind  as enum ('badge_photo','photo','audio','floorplan','document');
create type upload_status    as enum ('pending','uploaded','failed');
create type tag_scope        as enum ('company','contact','meeting','note');
create type followup_channel as enum ('email','call','linkedin');
create type followup_status  as enum ('todo','done','cancelled');

-- Identité & équipes
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text, avatar_url text, locale text not null default 'fr'
);
create table teams (
  id uuid primary key, name text not null, plan text, retention_months int not null default 36,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create table team_members (
  team_id uuid references teams on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role team_role not null default 'member',
  primary key (team_id, user_id)
);

-- Référentiel (indépendant des salons, scopé équipe)
create table companies (
  id uuid primary key, team_id uuid not null references teams,
  name text not null, name_normalized text not null, domain text, website text, linkedin_url text,
  industry text, size_range text, country text, city text, description text,
  source company_source not null default 'manual', merged_into uuid references companies,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create unique index companies_team_domain_uq on companies (team_id, domain) where domain is not null and deleted_at is null;
create index companies_name_trgm on companies using gin (name_normalized gin_trgm_ops);

create table contacts (
  id uuid primary key, team_id uuid not null references teams,
  company_id uuid references companies,
  first_name text, last_name text, job_title text, email text, phone text, linkedin_url text, language text,
  opt_out_at timestamptz, consent_basis text, anonymized_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);

-- Salons
create table events (
  id uuid primary key, team_id uuid not null references teams,
  name text not null, slug text, starts_on date, ends_on date, venue text, city text, country text,
  website text, timezone text not null default 'Europe/Paris',
  status event_status not null default 'draft', goals jsonb not null default '{}', offline_pinned boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create table event_members (
  event_id uuid references events on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role event_member_role not null default 'member',
  primary key (event_id, user_id)
);
create table attachments (
  id uuid primary key, team_id uuid not null references teams,
  owner_table text not null, owner_id uuid not null, kind attachment_kind not null,
  storage_path text, mime text, size_bytes bigint, status upload_status not null default 'pending', checksum text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create table floorplans (
  id uuid primary key, team_id uuid not null references teams, event_id uuid not null references events,
  name text not null, level text, attachment_id uuid references attachments,
  width_px int, height_px int, tiles_manifest jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create table import_batches (
  id uuid primary key, team_id uuid not null references teams, event_id uuid references events,
  filename text, row_count int, mapping jsonb, report jsonb, created_by uuid, created_at timestamptz not null default now()
);
create table event_companies (
  id uuid primary key, team_id uuid not null references teams,
  event_id uuid not null references events, company_id uuid not null references companies,
  stand_label text, hall text, floorplan_id uuid references floorplans,
  pin_x numeric check (pin_x between 0 and 1), pin_y numeric check (pin_y between 0 and 1),
  priority smallint check (priority between 1 and 5), priority_score numeric, priority_reason text,
  assigned_to uuid references auth.users, objective text, import_batch_id uuid references import_batches,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid,
  unique (event_id, company_id)
);
create index event_companies_assign_idx on event_companies (event_id, assigned_to, priority);
create table event_contacts (
  event_id uuid references events on delete cascade, contact_id uuid references contacts on delete cascade,
  company_id uuid references companies, expected boolean not null default true, team_id uuid not null references teams,
  primary key (event_id, contact_id)
);

-- Rencontres & notes
create table meetings (
  id uuid primary key, team_id uuid not null references teams,
  event_id uuid not null references events, event_company_id uuid not null references event_companies,
  contact_id uuid references contacts, owner_id uuid not null references auth.users,
  status meeting_status not null default 'to_see', is_unplanned boolean not null default false,
  planned_at timestamptz, started_at timestamptz, ended_at timestamptz,
  temperature temperature, outcome text, next_step text, field_updated_at jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create index meetings_owner_status_idx on meetings (event_id, owner_id, status);
create table notes (  -- append-only
  id uuid primary key, team_id uuid not null references teams,
  meeting_id uuid references meetings, event_company_id uuid references event_companies, contact_id uuid references contacts,
  author_id uuid not null references auth.users, body text not null,
  source note_source not null default 'typed', captured_at timestamptz not null, duration_ms int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid,
  check (meeting_id is not null or event_company_id is not null or contact_id is not null)
);

-- Organisation
create table tags (
  id uuid primary key, team_id uuid not null references teams, label text not null, color text, scope tag_scope not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create table taggings (
  tag_id uuid references tags on delete cascade, taggable_table text, taggable_id uuid, team_id uuid not null references teams,
  primary key (tag_id, taggable_table, taggable_id)
);

-- Après
create table email_templates (
  id uuid primary key, team_id uuid not null references teams, name text not null, subject text, body text, locale text default 'fr',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);
create table follow_ups (
  id uuid primary key, team_id uuid not null references teams,
  meeting_id uuid references meetings, contact_id uuid references contacts, assignee_id uuid references auth.users,
  due_on date, channel followup_channel not null default 'email', status followup_status not null default 'todo',
  template_id uuid references email_templates, sent_at timestamptz, body text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, server_seq bigint not null default nextval('server_seq_global'), updated_by uuid
);

-- Technique / conformité
create table revisions (
  id uuid primary key default gen_random_uuid(), team_id uuid not null, table_name text not null, row_id uuid not null,
  before jsonb, changed_by uuid, changed_at timestamptz not null default now()
);
create table sync_ops_applied (op_id uuid primary key, team_id uuid not null, applied_at timestamptz not null default now());
create table audit_log (
  id uuid primary key default gen_random_uuid(), team_id uuid not null, actor_id uuid,
  action text not null, entity text, entity_id uuid, at timestamptz not null default now()
);

-- Index de pull
-- create index <table>_pull_idx on <table> (team_id, server_seq);  -- pour chaque table [S]

-- RLS (à décliner pour chaque table portant team_id)
create function is_team_member(t uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from team_members where team_id = t and user_id = auth.uid()) $$;

-- Exemple :
-- alter table companies enable row level security;
-- create policy companies_select on companies for select using (is_team_member(team_id));
-- create policy companies_write  on companies for all    using (is_team_member(team_id)) with check (is_team_member(team_id));
-- notes : update/delete limités à author_id = auth.uid().
-- Storage : bucket privé, chemin team_id/..., policies sur le préfixe.

-- TODO (migrations) : trigger bump server_seq/updated_at, RPC sync_push, sync_pull, merge_companies,
-- vues company_history et event_dashboard.
