-- Duplication d'un salon comme modèle : on repart de la configuration d'une édition pour préparer la suivante.
--
-- Copié :
--   - la configuration du salon (lieu, ville, pays, site, fuseau, objectifs) ; nouveau nom, dates au choix, statut « brouillon » ;
--   - le mapping d'import du dernier import (colonnes du fichier → champs de fair), pour réimporter sans refaire le mapping ;
--   - en option, la liste des participants (entreprises ciblées) avec leur priorité, leur objectif et leur commentaire de
--     préparation. Les tags sont rattachés aux entreprises et partagés par toute l'équipe : ils suivent donc d'eux-mêmes.
-- Jamais copié : stands (nouvelle édition, nouveau plan), assignations, rencontres, notes, plan, relances.
--
-- Fonction « security invoker » : la RLS s'applique à l'appelant, donc seul un admin d'équipe peut dupliquer.
create function duplicate_event(
  p_event uuid,
  p_name text,
  p_starts_on date default null,
  p_ends_on date default null,
  p_copy_participants boolean default false,
  p_copy_mapping boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_src events%rowtype;
  v_new uuid := gen_random_uuid();
begin
  select * into v_src from events where id = p_event and deleted_at is null;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'event name required' using errcode = '22023';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'invalid dates' using errcode = '22023';
  end if;

  insert into events (id, team_id, name, starts_on, ends_on, venue, city, country, website, timezone, status, goals)
  values (v_new, v_src.team_id, trim(p_name), p_starts_on, p_ends_on, v_src.venue, v_src.city, v_src.country,
          v_src.website, v_src.timezone, 'draft', v_src.goals);

  if p_copy_mapping then
    insert into import_batches (id, team_id, event_id, filename, row_count, mapping, created_by)
    select gen_random_uuid(), team_id, v_new, null, 0, mapping, auth.uid()
    from import_batches
    where event_id = p_event and mapping is not null
    order by created_at desc
    limit 1;
  end if;

  if p_copy_participants then
    insert into event_companies (id, team_id, event_id, company_id, priority, objective, prep_comment)
    select gen_random_uuid(), team_id, v_new, company_id, priority, objective, prep_comment
    from event_companies
    where event_id = p_event and deleted_at is null;
  end if;

  return v_new;
end;
$$;

revoke execute on function duplicate_event(uuid, text, date, date, boolean, boolean) from public, anon;
grant execute on function duplicate_event(uuid, text, date, date, boolean, boolean) to authenticated;
