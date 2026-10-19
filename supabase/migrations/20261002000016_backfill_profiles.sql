-- Rattrapage : un profil pour chaque compte qui n'en a pas (compte créé avant le trigger ou à la main).
-- Sans ligne dans `profiles`, le nom d'usage ne peut pas être enregistré.
insert into profiles (id, display_name)
select u.id, split_part(u.email, '@', 1)
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);
