-- À chaque écriture (y compris soft delete) : horodatage et numéro de séquence serveur.
-- Le client n'utilise jamais son horloge pour la sync (cf. CLAUDE.md).

create function touch_row() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.server_seq := nextval('server_seq_global');
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'teams', 'companies', 'contacts', 'events', 'attachments', 'floorplans',
    'event_companies', 'meetings', 'notes', 'tags', 'email_templates', 'follow_ups'
  ] loop
    execute format(
      'create trigger %I before insert or update on %I for each row execute function touch_row()',
      t || '_touch', t
    );
  end loop;
end;
$$;

-- Un profil est créé automatiquement pour chaque nouvel utilisateur.
create function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
