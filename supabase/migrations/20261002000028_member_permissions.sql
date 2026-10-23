-- Droits des commerciaux, réglables par les propriétaires et admins (Réglages → Équipe → « Droits des commerciaux »).
--
-- Un seul jeu de droits pour tous les commerciaux (rôle `member`) d'une équipe : `teams.member_permissions`, un objet
-- JSON { droit: booléen }. Les valeurs par défaut reprennent EXACTEMENT ce que le rôle commercial pouvait déjà faire :
-- rien ne change tant qu'un admin ne touche pas au tableau. Les admins (owner / admin) ont toujours tous les droits.
-- Les droits de lecture (voir tous les salons, entreprises, notes de l'équipe) restent acquis à tous les membres.
--
--   create_events            créer et dupliquer un salon
--   edit_events              modifier et supprimer un salon
--   import_participants      importer des participants depuis un fichier
--   add_companies            ajouter une entreprise à la main
--   edit_companies           modifier les fiches entreprise et leurs contacts
--   remove_participants      retirer des participants d'un salon
--   manage_tags              créer, modifier et supprimer tags et pastilles de salons
--   edit_plan                gérer le plan du salon (fichier, pins)
--   prepare_all_targets      préparer toutes les cibles (priorité, stand), pas seulement les siennes
--   assign_others            assigner des collègues
--   edit_colleagues_meetings modifier et planifier les rendez-vous des collègues
--
-- Les règles sont portées par la base (RLS) : masquer un bouton dans l'interface ne suffit jamais.

create function valid_member_permissions(j jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'object'
    and not exists (
      select 1 from jsonb_each(j) e
      where jsonb_typeof(e.value) <> 'boolean'
         or e.key <> all (array[
           'create_events', 'edit_events', 'import_participants', 'add_companies', 'edit_companies',
           'remove_participants', 'manage_tags', 'edit_plan', 'prepare_all_targets', 'assign_others',
           'edit_colleagues_meetings'
         ])
    )
$$;

alter table teams add column member_permissions jsonb not null default
  '{"create_events": false, "edit_events": false, "import_participants": false, "add_companies": true,
    "edit_companies": true, "remove_participants": false, "manage_tags": false, "edit_plan": false,
    "prepare_all_targets": false, "assign_others": false, "edit_colleagues_meetings": false}'::jsonb;
alter table teams add constraint teams_member_permissions_valid check (valid_member_permissions(member_permissions));

-- L'utilisateur courant a-t-il ce droit dans cette équipe ? Admin : toujours ; commercial : selon le tableau des droits ;
-- étranger à l'équipe : jamais. (security definer : comme is_team_member, évite la récursion de RLS.)
create function has_perm(p_team uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when is_team_admin(p_team) then true
    when not is_team_member(p_team) then false
    else coalesce((select (member_permissions ->> p_key)::boolean from teams where id = p_team), false)
  end
$$;
revoke execute on function has_perm(uuid, text) from public, anon;
grant execute on function has_perm(uuid, text) to authenticated;

-- Salons ------------------------------------------------------------------------------------------------------
drop policy events_insert on events;
drop policy events_update on events;
create policy events_insert on events for insert with check (has_perm(team_id, 'create_events'));
create policy events_update on events for update
  using (has_perm(team_id, 'edit_events')) with check (has_perm(team_id, 'edit_events'));

-- Import, ajout à la main, entreprises ---------------------------------------------------------------------------
-- (un import écrit aussi entreprises, participations, contacts et pastilles ; une duplication copie participations et
-- mapping d'import : ces écritures sont donc permises à qui importe ou crée des salons.)
drop policy import_batches_insert on import_batches;
drop policy import_batches_update on import_batches;
create policy import_batches_insert on import_batches for insert
  with check (has_perm(team_id, 'import_participants') or has_perm(team_id, 'create_events'));
create policy import_batches_update on import_batches for update
  using (has_perm(team_id, 'import_participants')) with check (has_perm(team_id, 'import_participants'));

drop policy companies_insert on companies;
create policy companies_insert on companies for insert
  with check (has_perm(team_id, 'add_companies') or has_perm(team_id, 'import_participants'));
drop policy companies_update on companies;
create policy companies_update on companies for update
  using (has_perm(team_id, 'edit_companies') or has_perm(team_id, 'import_participants'))
  with check (has_perm(team_id, 'edit_companies') or has_perm(team_id, 'import_participants'));

-- Un contact se crée librement (c'est le geste du bloc-notes) ; le modifier ou le supprimer suit « modifier les fiches ».
drop policy contacts_update on contacts;
create policy contacts_update on contacts for update
  using (has_perm(team_id, 'edit_companies') or has_perm(team_id, 'import_participants'))
  with check (has_perm(team_id, 'edit_companies') or has_perm(team_id, 'import_participants'));

drop policy event_contacts_insert on event_contacts;
create policy event_contacts_insert on event_contacts for insert
  with check (has_perm(team_id, 'add_companies') or has_perm(team_id, 'import_participants'));

drop policy event_companies_insert on event_companies;
create policy event_companies_insert on event_companies for insert
  with check (
    has_perm(team_id, 'add_companies') or has_perm(team_id, 'import_participants') or has_perm(team_id, 'create_events')
  );

-- Préparation des cibles : toutes (droit), ou seulement celles qui nous sont assignées ----------------------------------
drop policy event_companies_update on event_companies;
create policy event_companies_update on event_companies for update
  using (has_perm(team_id, 'prepare_all_targets') or (is_team_member(team_id) and is_assigned_to_me(id)))
  with check (has_perm(team_id, 'prepare_all_targets') or (is_team_member(team_id) and is_assigned_to_me(id)));

-- Assignations : tout le monde s'assigne ; assigner un collègue demande le droit ------------------------------------------
drop policy event_company_assignees_insert on event_company_assignees;
drop policy event_company_assignees_update on event_company_assignees;
create policy event_company_assignees_insert on event_company_assignees for insert
  with check (
    is_member_of(team_id, user_id)
    and (has_perm(team_id, 'assign_others') or (is_team_member(team_id) and user_id = auth.uid()))
  );
create policy event_company_assignees_update on event_company_assignees for update
  using (has_perm(team_id, 'assign_others') or (is_team_member(team_id) and user_id = auth.uid()))
  with check (
    is_member_of(team_id, user_id)
    and (has_perm(team_id, 'assign_others') or (is_team_member(team_id) and user_id = auth.uid()))
  );

-- Rencontres : chacun tient les siennes ; celles des collègues demandent le droit ---------------------------------------
drop policy meetings_insert on meetings;
drop policy meetings_update on meetings;
create policy meetings_insert on meetings for insert
  with check (has_perm(team_id, 'edit_colleagues_meetings') or (is_team_member(team_id) and owner_id = auth.uid()));
create policy meetings_update on meetings for update
  using (has_perm(team_id, 'edit_colleagues_meetings') or (is_team_member(team_id) and owner_id = auth.uid()))
  with check (has_perm(team_id, 'edit_colleagues_meetings') or (is_team_member(team_id) and owner_id = auth.uid()));

-- Tags et pastilles de salons -------------------------------------------------------------------------------------
-- (un import peut créer les pastilles de salon de ses colonnes de croix : il peut donc en insérer.)
drop policy tags_insert on tags;
drop policy tags_update on tags;
create policy tags_insert on tags for insert
  with check (has_perm(team_id, 'manage_tags') or has_perm(team_id, 'import_participants'));
create policy tags_update on tags for update
  using (has_perm(team_id, 'manage_tags')) with check (has_perm(team_id, 'manage_tags'));

-- Plan du salon -----------------------------------------------------------------------------------------------------
drop policy floorplans_insert on floorplans;
drop policy floorplans_update on floorplans;
create policy floorplans_insert on floorplans for insert with check (has_perm(team_id, 'edit_plan'));
create policy floorplans_update on floorplans for update
  using (has_perm(team_id, 'edit_plan')) with check (has_perm(team_id, 'edit_plan'));

drop policy plan_pins_insert on plan_pins;
drop policy plan_pins_update on plan_pins;
drop policy plan_pins_delete on plan_pins;
create policy plan_pins_insert on plan_pins for insert with check (
  has_perm(team_id, 'edit_plan')
  and exists (select 1 from floorplans f where f.id = floorplan_id and f.team_id = plan_pins.team_id)
  and (event_company_id is null
       or exists (select 1 from event_companies c where c.id = event_company_id and c.team_id = plan_pins.team_id))
);
create policy plan_pins_update on plan_pins for update
  using (has_perm(team_id, 'edit_plan'))
  with check (
    has_perm(team_id, 'edit_plan')
    and exists (select 1 from floorplans f where f.id = floorplan_id and f.team_id = plan_pins.team_id)
    and (event_company_id is null
         or exists (select 1 from event_companies c where c.id = event_company_id and c.team_id = plan_pins.team_id))
  );
create policy plan_pins_delete on plan_pins for delete using (has_perm(team_id, 'edit_plan'));

-- Retirer des participants d'un salon -----------------------------------------------------------------------------------
create or replace function remove_event_companies(p_ids uuid[]) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with gone as (
    update event_companies ec set deleted_at = now()
    where ec.id = any(p_ids) and ec.deleted_at is null and has_perm(ec.team_id, 'remove_participants')
    returning ec.id
  ), m as (
    update meetings set deleted_at = now()
    where deleted_at is null and event_company_id in (select id from gone)
    returning id
  ), nt as (
    update notes set deleted_at = now()
    where deleted_at is null
      and (event_company_id in (select id from gone) or meeting_id in (select id from m))
    returning id
  ), a as (
    update event_company_assignees set deleted_at = now()
    where deleted_at is null and event_company_id in (select id from gone)
    returning event_company_id
  )
  select count(*) into n from gone;
  return n;
end;
$$;
