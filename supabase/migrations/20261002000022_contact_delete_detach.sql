-- Supprimer un contact le retire des rencontres où il figurait (rencontre « avec lui »). Si une de ces rencontres a été
-- créée par le bloc-notes et qu'il ne reste plus rien dedans (ni note, ni intérêt, ni case cochée, ni prochaine étape),
-- elle disparaît aussi : on retrouve l'état d'avant l'ajout du contact.
create function contacts_detach_from_meetings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
  from meetings where contact_id = new.id and deleted_at is null;

  update meetings set contact_id = null where id = any(ids);

  update meetings m set deleted_at = now()
  where m.id = any(ids) and m.auto_created
    and m.interest is null and not m.recontact and not m.news
    and coalesce(trim(m.next_step), '') = ''
    and not exists (select 1 from notes n where n.meeting_id = m.id and n.deleted_at is null);
  return null;
end $$;

create trigger contacts_after_delete_detach
  after update of deleted_at on contacts
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function contacts_detach_from_meetings();
