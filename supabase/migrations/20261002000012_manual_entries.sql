-- Saisie manuelle sur le salon : un commercial peut ajouter une entreprise rencontrée qui n'était pas dans le fichier,
-- et ses contacts. Il ne peut pas pour autant modifier ni fusionner une entreprise existante (les mises à jour restent
-- réservées aux admins, ou au commercial assigné pour la préparation d'une cible).
drop policy companies_insert on companies;
create policy companies_insert on companies for insert with check (is_team_member(team_id));

drop policy event_companies_insert on event_companies;
create policy event_companies_insert on event_companies for insert with check (is_team_member(team_id));

drop policy event_contacts_insert on event_contacts;
create policy event_contacts_insert on event_contacts for insert with check (is_team_member(team_id));

-- « À recontacter après le salon » (oui / non), saisi dans les notes de la rencontre et repris dans les exports.
alter table meetings add column recontact boolean not null default false;
