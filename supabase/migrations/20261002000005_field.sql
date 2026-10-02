-- Mode terrain : statuts de rencontre, niveau d'intérêt, champs structurés, stockage des photos.

-- Statuts affichés : à voir, vu (done), à relancer, pas intéressé.
alter type meeting_status add value if not exists 'follow_up';
alter type meeting_status add value if not exists 'not_interested';

alter table meetings
  add column interest smallint check (interest between 1 and 5),
  add column need text,
  add column budget text,
  add column timing text,
  add column decision_maker text;

-- Pièces jointes : bucket privé, un dossier par équipe (« <team_id>/<fichier> »).
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_objects_rw on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and is_team_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'attachments' and is_team_member(((storage.foldername(name))[1])::uuid));
