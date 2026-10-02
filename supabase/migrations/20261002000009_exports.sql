-- Exports en masse : logo d'équipe (pour les PDF) et bucket privé des fichiers générés côté serveur.

-- Logo de l'équipe : fichier du bucket `attachments` (« <team_id>/logo.<ext> »), modifiable par les admins
-- (policy teams_update existante).
alter table teams add column logo_path text;

-- Fichiers d'export générés par l'Edge Function `generate-export` : bucket privé, un dossier par équipe,
-- téléchargés via un lien signé de courte durée. Les membres de l'équipe peuvent lire / écrire / purger leur dossier.
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

create policy exports_objects_rw on storage.objects
  for all to authenticated
  using (bucket_id = 'exports' and is_team_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'exports' and is_team_member(((storage.foldername(name))[1])::uuid));
