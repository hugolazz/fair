-- À coller dans Supabase → SQL Editor → New query → Run. Réunit les migrations 12, 13 et 14.
-- Rejouable sans erreur : ce qui est déjà appliqué est simplement ignoré.
-- Prérequis : les migrations 10 et 11 sont déjà appliquées (voir docs/deploiement.md pour le contrôle).

-- 12 : saisie manuelle + « à recontacter »
drop policy if exists companies_insert on companies;
create policy companies_insert on companies for insert with check (is_team_member(team_id));

drop policy if exists event_companies_insert on event_companies;
create policy event_companies_insert on event_companies for insert with check (is_team_member(team_id));

drop policy if exists event_contacts_insert on event_contacts;
create policy event_contacts_insert on event_contacts for insert with check (is_team_member(team_id));

alter table meetings add column if not exists recontact boolean not null default false;

-- 13 : historique de l'entreprise
alter table companies add column if not exists history text;

-- 14 : tout membre peut modifier une fiche d'entreprise
drop policy if exists companies_update on companies;
create policy companies_update on companies for update
  using (is_team_member(team_id)) with check (is_team_member(team_id));
