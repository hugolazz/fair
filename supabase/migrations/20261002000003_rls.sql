-- Row Level Security : un utilisateur ne voit que les données de ses équipes.

-- Helpers (security definer : évitent la récursion de RLS sur team_members) ---------------
create function is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid())
$$;

create function is_team_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = t and user_id = auth.uid() and role in ('owner', 'admin')
  )
$$;

create function is_team_owner(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members where team_id = t and user_id = auth.uid() and role = 'owner'
  )
$$;

create function shares_team_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = u
  )
$$;

-- RPC : création d'équipe au premier login et acceptation des invitations -----------------
create function create_team(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'team name required' using errcode = '22023';
  end if;
  insert into teams (name) values (trim(p_name)) returning id into v_team;
  insert into team_members (team_id, user_id, role) values (v_team, v_uid, 'owner');
  return v_team;
end;
$$;

create function accept_pending_invitations() returns setof uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_uid is null or v_email is null then
    return;
  end if;
  return query
    with accepted as (
      update team_invitations set accepted_at = now()
      where email = v_email and accepted_at is null
      returning team_id, role
    ), joined as (
      insert into team_members (team_id, user_id, role)
      select team_id, v_uid, role from accepted
      on conflict (team_id, user_id) do nothing
      returning team_id
    )
    select team_id from accepted;
end;
$$;

-- Privilèges : aucun accès anonyme ---------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function
  is_team_member(uuid), is_team_admin(uuid), is_team_owner(uuid), shares_team_with(uuid),
  create_team(text), accept_pending_invitations()
  to authenticated;

-- Activation de RLS sur toutes les tables ---------------------------------------------------
alter table profiles          enable row level security;
alter table teams             enable row level security;
alter table team_members      enable row level security;
alter table team_invitations  enable row level security;
alter table companies         enable row level security;
alter table contacts          enable row level security;
alter table events            enable row level security;
alter table event_members     enable row level security;
alter table attachments       enable row level security;
alter table floorplans        enable row level security;
alter table import_batches    enable row level security;
alter table event_companies   enable row level security;
alter table event_contacts    enable row level security;
alter table meetings          enable row level security;
alter table notes             enable row level security;
alter table tags              enable row level security;
alter table taggings          enable row level security;
alter table email_templates   enable row level security;
alter table follow_ups        enable row level security;
alter table revisions         enable row level security;
alter table sync_ops_applied  enable row level security;
alter table audit_log         enable row level security;

-- profiles : le sien et ceux des coéquipiers --------------------------------------------------
create policy profiles_select on profiles for select
  using (id = auth.uid() or shares_team_with(id));
create policy profiles_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- teams ------------------------------------------------------------------------------------------
create policy teams_select on teams for select using (is_team_member(id));
create policy teams_update on teams for update
  using (is_team_admin(id)) with check (is_team_admin(id));
-- Pas d'insert/delete direct : création via create_team().

-- team_members --------------------------------------------------------------------------------------
create policy team_members_select on team_members for select using (is_team_member(team_id));
create policy team_members_update on team_members for update
  using (is_team_admin(team_id) and (role <> 'owner' or is_team_owner(team_id)))
  with check (is_team_admin(team_id) and (role <> 'owner' or is_team_owner(team_id)));
create policy team_members_delete on team_members for delete
  using (
    (is_team_admin(team_id) and (role <> 'owner' or is_team_owner(team_id)))
    or (user_id = auth.uid() and role <> 'owner')
  );
-- Pas d'insert direct : create_team() et accept_pending_invitations().

-- team_invitations ----------------------------------------------------------------------------------
create policy team_invitations_select on team_invitations for select using (is_team_admin(team_id));
create policy team_invitations_insert on team_invitations for insert
  with check (is_team_admin(team_id) and invited_by = auth.uid() and accepted_at is null);
create policy team_invitations_delete on team_invitations for delete using (is_team_admin(team_id));

-- Tables métier scopées par team_id --------------------------------------------------------------------
-- Lecture/écriture pour les membres ; suppression physique réservée aux admins
-- (l'application utilise le soft delete via deleted_at).
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'events', 'event_members', 'attachments', 'floorplans',
    'import_batches', 'event_companies', 'event_contacts', 'meetings', 'tags', 'taggings',
    'email_templates', 'follow_ups'
  ] loop
    execute format('create policy %I on %I for select using (is_team_member(team_id))', t || '_select', t);
    execute format('create policy %I on %I for insert with check (is_team_member(team_id))', t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (is_team_member(team_id)) with check (is_team_member(team_id))',
      t || '_update', t
    );
    execute format('create policy %I on %I for delete using (is_team_admin(team_id))', t || '_delete', t);
  end loop;
end;
$$;

-- notes : append-only, modifiables par leur seul auteur ---------------------------------------------------
create policy notes_select on notes for select using (is_team_member(team_id));
create policy notes_insert on notes for insert
  with check (is_team_member(team_id) and author_id = auth.uid());
create policy notes_update on notes for update
  using (is_team_member(team_id) and author_id = auth.uid())
  with check (is_team_member(team_id) and author_id = auth.uid());
create policy notes_delete on notes for delete
  using (is_team_member(team_id) and author_id = auth.uid());

-- Technique : lecture admin uniquement, écriture via fonctions security definer -----------------------------
create policy revisions_select on revisions for select using (is_team_admin(team_id));
create policy audit_log_select on audit_log for select using (is_team_admin(team_id));
-- sync_ops_applied : aucune policy = inaccessible aux clients.

-- Storage : les policies du bucket privé (chemin team_id/...) seront ajoutées avec les pièces jointes.
