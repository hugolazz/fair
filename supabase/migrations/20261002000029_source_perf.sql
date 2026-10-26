-- Trois améliorations sans changement de comportement visible :
--
-- 1. `event_companies.source` : d'où vient la participation (`import` d'un fichier, `manual` saisie à la main, `duplicate`
--    copie d'un salon). Le bilan s'en sert pour compter les « rencontres imprévues » (entreprises ajoutées à la main pendant le
--    salon) sans deviner à partir de `import_batch_id`. Les participations existantes sans lot d'import sont rangées en `manual`
--    (c'est ce que le bilan supposait jusque-là, et la date du salon écarte les saisies de préparation) ; une insertion qui ne
--    dit rien est `import` : un chemin inconnu n'est jamais compté comme une saisie manuelle.
-- 2. `has_perm` : un seul accès indexé (appartenance + équipe) au lieu de trois sous-requêtes, car la fonction est appelée par
--    ligne dans les policies d'écriture (import de milliers de participants).
-- 3. `key_contacts(salon)` : le contact clé (premier contact saisi) de chaque entreprise d'un salon, en une requête, au lieu de
--    lire tous les contacts de l'équipe pour n'en garder qu'un par entreprise.

alter table event_companies
  add column source text not null default 'import' check (source in ('import', 'manual', 'duplicate'));
update event_companies set source = 'manual' where import_batch_id is null;

create or replace function duplicate_event(
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
    insert into event_companies (id, team_id, event_id, company_id, priority, objective, prep_comment, source)
    select gen_random_uuid(), team_id, v_new, company_id, priority, objective, prep_comment, 'duplicate'
    from event_companies
    where event_id = p_event and deleted_at is null;
  end if;

  return v_new;
end;
$$;

create or replace function has_perm(p_team uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select tm.role in ('owner', 'admin') or coalesce((t.member_permissions ->> p_key)::boolean, false)
      from team_members tm
      join teams t on t.id = tm.team_id
      where tm.team_id = p_team and tm.user_id = auth.uid()
    ),
    false
  )
$$;

-- « security invoker » : la RLS s'applique, un membre ne voit que les contacts de son équipe.
create function key_contacts(p_event uuid)
returns table (
  id uuid, company_id uuid, first_name text, last_name text, job_title text, email text, phone text, linkedin_url text
)
language sql stable security invoker set search_path = public as $$
  select distinct on (c.company_id)
    c.id, c.company_id, c.first_name, c.last_name, c.job_title, c.email, c.phone, c.linkedin_url
  from contacts c
  where c.deleted_at is null
    and c.company_id in (
      select ec.company_id from event_companies ec where ec.event_id = p_event and ec.deleted_at is null
    )
  order by c.company_id, c.id -- UUIDv7 : l'ordre de saisie, le premier contact est le contact clé
$$;
revoke execute on function key_contacts(uuid) from public, anon;
grant execute on function key_contacts(uuid) to authenticated;
