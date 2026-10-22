-- Suppression de son compte (Réglages). Ce qui disparaît : le compte de connexion, le profil (nom, e-mail), l'appartenance
-- aux équipes, les assignations. Ce qui reste, anonymisé : les rencontres et les notes saisies (comptes-rendus de l'équipe),
-- dont l'auteur devient « ancien membre » (colonne vide). Les équipes dont la personne est propriétaire suivent la règle de
-- « Quitter l'équipe » : la propriété passe au plus ancien admin (à défaut, au plus ancien membre) ; seule, l'équipe est fermée.

alter table meetings alter column owner_id drop not null;
alter table meetings drop constraint meetings_owner_id_fkey;
alter table meetings add constraint meetings_owner_id_fkey foreign key (owner_id) references auth.users on delete set null;

alter table notes alter column author_id drop not null;
alter table notes drop constraint notes_author_id_fkey;
alter table notes add constraint notes_author_id_fkey foreign key (author_id) references auth.users on delete set null;

-- « security definer » : supprimer une ligne de auth.users n'est pas permis à un utilisateur ; la fonction n'agit que sur
-- l'appelant (auth.uid()).
create function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  for v_team in select team_id from team_members where user_id = v_uid loop
    perform leave_team(v_team);
  end loop;
  delete from auth.users where id = v_uid; -- profil, identités, sessions, assignations : en cascade
end;
$$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
