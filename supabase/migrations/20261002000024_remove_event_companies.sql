-- Retirer des participants d'un salon (admins). On retire la participation, jamais l'entreprise : elle garde sa fiche, ses
-- contacts et son historique dans les autres salons. Suppression logique, comme partout :
--   - la participation (stand, priorité, assignations) ;
--   - les rencontres de ce salon et leurs notes (elles n'ont de sens que pour cette participation).
-- Une entreprise retirée peut être ajoutée de nouveau (import, saisie manuelle) : l'unicité « salon + entreprise » ne
-- vaut plus que pour les participations actives.

alter table event_companies drop constraint event_companies_event_id_company_id_key;
create unique index event_companies_event_company_uq on event_companies (event_id, company_id) where deleted_at is null;

-- « security definer » : les rencontres et notes des autres commerciaux ne sont pas modifiables par un admin via la RLS,
-- et c'est la participation tout entière qui s'en va ; l'admin est vérifié ligne à ligne. Renvoie le nombre retiré.
create function remove_event_companies(p_ids uuid[]) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with gone as (
    update event_companies ec set deleted_at = now()
    where ec.id = any(p_ids) and ec.deleted_at is null and is_team_admin(ec.team_id)
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

revoke execute on function remove_event_companies(uuid[]) from public, anon;
grant execute on function remove_event_companies(uuid[]) to authenticated;
