-- Création de compte en libre-service : nom d'usage, recherche d'une équipe par son nom, adhésion directe.
--
-- Choix produit (usage interne) : une personne connectée peut rejoindre n'importe quelle équipe dont elle connaît le nom,
-- sans validation. Elle y entre comme commercial (`member`) et voit alors les données de l'équipe. Pour fermer cette porte,
-- il suffit de retirer le droit d'exécution de join_team() (ou d'y ajouter une validation par un admin).

-- Nom d'usage choisi à l'inscription (options.data.display_name) ; à défaut, la partie locale de l'e-mail.
create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 100), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recherche d'équipes par nom (au moins 2 caractères, 8 résultats) : seulement le nom et le nombre de membres.
create function search_teams(p_query text)
returns table (id uuid, name text, member_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pattern text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_query is null or length(trim(p_query)) < 2 then
    return;
  end if;
  v_pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select t.id, t.name, (select count(*)::integer from team_members m where m.team_id = t.id)
    from teams t
    where t.deleted_at is null and t.name ilike v_pattern
    order by t.name
    limit 8;
end;
$$;

-- Rejoindre une équipe existante, comme commercial. Sans effet si l'on en fait déjà partie.
create function join_team(p_team uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from teams where id = p_team and deleted_at is null) then
    raise exception 'team not found' using errcode = 'P0002';
  end if;
  insert into team_members (team_id, user_id, role)
  values (p_team, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;
end;
$$;

revoke execute on function search_teams(text), join_team(uuid) from public, anon;
grant execute on function search_teams(text), join_team(uuid) to authenticated;
