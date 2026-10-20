-- Un salon supprimé ne doit plus peser sur les imports suivants : ses entreprises ne sont plus proposées à la fusion.
-- Quand un salon est supprimé (suppression logique), les entreprises qui n'étaient que dans des salons supprimés sont
-- elles aussi supprimées (suppression logique, avec leurs contacts). Une entreprise encore présente dans un autre
-- salon n'est jamais touchée. Libère aussi le site web de ces entreprises (index unique « actifs seulement »).

create function retire_orphan_companies(p_team uuid) returns void
language sql security definer set search_path = public as $$
  with gone as (
    update companies c set deleted_at = now()
    where c.team_id = p_team and c.deleted_at is null
      -- elle a figuré dans un salon supprimé…
      and exists (
        select 1 from event_companies ec join events e on e.id = ec.event_id
        where ec.company_id = c.id and e.deleted_at is not null
      )
      -- … et n'est plus dans aucun salon actif.
      and not exists (
        select 1 from event_companies ec join events e on e.id = ec.event_id
        where ec.company_id = c.id and ec.deleted_at is null and e.deleted_at is null
      )
    returning c.id
  )
  update contacts set deleted_at = now()
  where deleted_at is null and company_id in (select id from gone);
$$;
revoke execute on function retire_orphan_companies(uuid) from public, anon, authenticated;

create function events_retire_orphan_companies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform retire_orphan_companies(new.team_id);
  return null;
end $$;

create trigger events_after_delete_retire_companies
  after update of deleted_at on events
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function events_retire_orphan_companies();

-- Salons déjà supprimés avant cette migration : même nettoyage, une fois.
select retire_orphan_companies(id) from teams;
