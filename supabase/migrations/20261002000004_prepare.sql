-- Préparation du salon : priorités A/B/C, objectifs, commentaire, assignations multiples,
-- créneaux de rendez-vous avec rappel, tags partagés.

create type priority_level as enum ('A', 'B', 'C');
create type meeting_goal as enum ('demo', 'intro_decision_maker', 'watch', 'other');

-- event_companies : priorité et objectif typés, commentaire de préparation.
-- `assigned_to` (un seul commercial) est remplacé par la table event_company_assignees (plusieurs possibles,
-- ce qui permet d'alerter quand deux commerciaux ciblent la même entreprise).
alter table event_companies drop constraint if exists event_companies_priority_check;
drop index if exists event_companies_assign_idx;
alter table event_companies
  alter column priority type priority_level using (
    case priority when 1 then 'A'::priority_level when 2 then 'B'::priority_level when 3 then 'C'::priority_level end
  ),
  alter column objective type meeting_goal using null,
  drop column assigned_to,
  add column prep_comment text;
create index event_companies_priority_idx on event_companies (event_id, priority);

-- Créneau de rendez-vous : durée et rappel (minutes avant le début).
alter table meetings
  add column planned_duration_min int not null default 15 check (planned_duration_min between 5 and 480),
  add column reminder_minutes int check (reminder_minutes between 0 and 10080);

-- Assignations : un commercial peut cibler une entreprise ; plusieurs commerciaux possibles.
create table event_company_assignees (
  event_company_id uuid not null references event_companies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  event_id uuid not null references events on delete cascade,
  team_id uuid not null references teams on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_seq bigint not null default nextval('server_seq_global'),
  updated_by uuid,
  primary key (event_company_id, user_id)
);
create index event_company_assignees_user_idx
  on event_company_assignees (event_id, user_id) where deleted_at is null;
create index event_company_assignees_pull_idx on event_company_assignees (team_id, server_seq);
create trigger event_company_assignees_touch
  before insert or update on event_company_assignees
  for each row execute function touch_row();

-- Un libellé de tag par équipe et par portée, sans tenir compte de la casse.
create unique index tags_team_scope_label_uq on tags (team_id, scope, lower(label)) where deleted_at is null;

-- RLS ---------------------------------------------------------------------------------------------
create function is_member_of(t uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = u)
$$;
revoke execute on function is_member_of(uuid, uuid) from public, anon;
grant execute on function is_member_of(uuid, uuid) to authenticated;

alter table event_company_assignees enable row level security;
create policy event_company_assignees_select on event_company_assignees for select
  using (is_team_member(team_id));
-- On ne peut assigner qu'un membre de l'équipe.
create policy event_company_assignees_insert on event_company_assignees for insert
  with check (is_team_member(team_id) and is_member_of(team_id, user_id));
create policy event_company_assignees_update on event_company_assignees for update
  using (is_team_member(team_id))
  with check (is_team_member(team_id) and is_member_of(team_id, user_id));
create policy event_company_assignees_delete on event_company_assignees for delete
  using (is_team_admin(team_id));

-- Retirer un tag d'une entreprise est une action courante : tout membre peut le faire.
drop policy taggings_delete on taggings;
create policy taggings_delete on taggings for delete using (is_team_member(team_id));
