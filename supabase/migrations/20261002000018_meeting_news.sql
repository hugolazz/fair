-- Case « Actualité ? » dans les notes d'une rencontre, activable par équipe.
-- Aucune nouvelle table : `teams.news_enabled` (réglage, modifiable par les admins via la policy teams_update existante)
-- et `meetings.news` (la réponse, couverte par les policies de `meetings` existantes). Décochée par défaut.
alter table teams add column news_enabled boolean not null default false;
alter table meetings add column news boolean not null default false;
