-- Rôles : admin d'équipe (owner / admin) et commercial (member).
--
-- Admin d'équipe : structure et configuration — salons, import et ajout de participants, assignations de tous,
--   tags, plans, membres de l'équipe, logo.
-- Commercial : lit toutes les données de l'équipe, modifie la préparation des entreprises qui lui sont assignées
--   (priorité, objectif, commentaire, stand), s'assigne lui-même, tient SES rencontres et SES notes, et tague
--   les entreprises. Il ne peut ni créer / modifier / supprimer un salon, ni importer, ni gérer l'équipe.
--
-- Ces règles sont portées par la base (RLS) : masquer un bouton dans l'interface ne suffit jamais.

-- Entreprise du salon assignée à l'utilisateur courant (security definer : évite la récursion de RLS).
create function is_assigned_to_me(p_event_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from event_company_assignees
    where event_company_id = p_event_company and user_id = auth.uid() and deleted_at is null
  )
$$;
revoke execute on function is_assigned_to_me(uuid) from public, anon;
grant execute on function is_assigned_to_me(uuid) to authenticated;

-- Salons, entreprises, import : réservés aux admins ---------------------------------------------------------
drop policy events_insert on events;
drop policy events_update on events;
create policy events_insert on events for insert with check (is_team_admin(team_id));
create policy events_update on events for update
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));

drop policy companies_insert on companies;
drop policy companies_update on companies;
create policy companies_insert on companies for insert with check (is_team_admin(team_id));
create policy companies_update on companies for update
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));

drop policy event_contacts_insert on event_contacts;
drop policy event_contacts_update on event_contacts;
create policy event_contacts_insert on event_contacts for insert with check (is_team_admin(team_id));
create policy event_contacts_update on event_contacts for update
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));

drop policy import_batches_insert on import_batches;
drop policy import_batches_update on import_batches;
create policy import_batches_insert on import_batches for insert with check (is_team_admin(team_id));
create policy import_batches_update on import_batches for update
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));

drop policy tags_insert on tags;
drop policy tags_update on tags;
create policy tags_insert on tags for insert with check (is_team_admin(team_id));
create policy tags_update on tags for update
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));

-- Participants du salon : ajout par les admins ; préparation par les admins et par le commercial assigné ------------
drop policy event_companies_insert on event_companies;
drop policy event_companies_update on event_companies;
create policy event_companies_insert on event_companies for insert with check (is_team_admin(team_id));
create policy event_companies_update on event_companies for update
  using (is_team_admin(team_id) or (is_team_member(team_id) and is_assigned_to_me(id)))
  with check (is_team_admin(team_id) or (is_team_member(team_id) and is_assigned_to_me(id)));

-- Assignations : un commercial ne gère que les siennes ---------------------------------------------------------
drop policy event_company_assignees_insert on event_company_assignees;
drop policy event_company_assignees_update on event_company_assignees;
create policy event_company_assignees_insert on event_company_assignees for insert
  with check (
    is_member_of(team_id, user_id)
    and (is_team_admin(team_id) or (is_team_member(team_id) and user_id = auth.uid()))
  );
create policy event_company_assignees_update on event_company_assignees for update
  using (is_team_admin(team_id) or (is_team_member(team_id) and user_id = auth.uid()))
  with check (
    is_member_of(team_id, user_id)
    and (is_team_admin(team_id) or (is_team_member(team_id) and user_id = auth.uid()))
  );

-- Rencontres : chacun tient les siennes ; un admin peut planifier pour n'importe qui ---------------------------
drop policy meetings_insert on meetings;
drop policy meetings_update on meetings;
create policy meetings_insert on meetings for insert
  with check (is_team_admin(team_id) or (is_team_member(team_id) and owner_id = auth.uid()));
create policy meetings_update on meetings for update
  using (is_team_admin(team_id) or (is_team_member(team_id) and owner_id = auth.uid()))
  with check (is_team_admin(team_id) or (is_team_member(team_id) and owner_id = auth.uid()));

-- Plan du salon : lecture pour tous, écriture réservée aux admins -----------------------------------------------
drop policy floorplans_insert on floorplans;
drop policy floorplans_update on floorplans;
create policy floorplans_insert on floorplans for insert with check (is_team_admin(team_id));
create policy floorplans_update on floorplans for update
  using (is_team_admin(team_id)) with check (is_team_admin(team_id));

drop policy plan_pins_insert on plan_pins;
drop policy plan_pins_update on plan_pins;
create policy plan_pins_insert on plan_pins for insert with check (
  is_team_admin(team_id)
  and exists (select 1 from floorplans f where f.id = floorplan_id and f.team_id = plan_pins.team_id)
  and (event_company_id is null
       or exists (select 1 from event_companies c where c.id = event_company_id and c.team_id = plan_pins.team_id))
);
create policy plan_pins_update on plan_pins for update
  using (is_team_admin(team_id))
  with check (
    is_team_admin(team_id)
    and exists (select 1 from floorplans f where f.id = floorplan_id and f.team_id = plan_pins.team_id)
    and (event_company_id is null
         or exists (select 1 from event_companies c where c.id = event_company_id and c.team_id = plan_pins.team_id))
  );

-- Une équipe garde toujours au moins un propriétaire -------------------------------------------------------------
create function protect_last_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from teams where id = old.team_id) -- suppression de l'équipe entière : autorisée
     and not exists (
       select 1 from team_members
       where team_id = old.team_id and role = 'owner' and user_id <> old.user_id
     )
  then
    raise exception 'a team needs at least one owner' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger team_members_protect_last_owner
  before update or delete on team_members
  for each row execute function protect_last_owner();
