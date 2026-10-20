-- Quitter une équipe.
--
--   - Commercial ou admin : il part, c'est tout.
--   - Propriétaire avec des collègues : le plus ancien admin (à défaut, le plus ancien membre) devient propriétaire,
--     puis il part. Une équipe garde toujours au moins un propriétaire.
--   - Propriétaire seul : l'équipe est fermée (masquée : introuvable à la recherche, plus affichée) ; ses données restent
--     en base.

-- Une équipe fermée n'a plus besoin de propriétaire : le garde-fou ne vaut que pour une équipe encore ouverte.
create or replace function protect_last_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from teams where id = old.team_id and deleted_at is null) -- équipe supprimée ou fermée : autorisé
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

create function leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role team_role;
  v_heir uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select role into v_role from team_members where team_id = p_team and user_id = v_uid;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;

  if v_role = 'owner'
     and not exists (
       select 1 from team_members where team_id = p_team and role = 'owner' and user_id <> v_uid
     )
  then
    select user_id into v_heir
    from team_members
    where team_id = p_team and user_id <> v_uid
    order by (role = 'admin') desc, created_at
    limit 1;
    if v_heir is null then
      update teams set deleted_at = now() where id = p_team; -- seul dans l'équipe : on la ferme
    else
      update team_members set role = 'owner' where team_id = p_team and user_id = v_heir;
    end if;
  end if;

  delete from team_members where team_id = p_team and user_id = v_uid;
end;
$$;

revoke execute on function leave_team(uuid) from public, anon;
grant execute on function leave_team(uuid) to authenticated;
