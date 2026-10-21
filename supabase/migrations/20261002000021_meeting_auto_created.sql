-- Rencontre créée toute seule par le bloc-notes (première note, intérêt, case cochée…) : elle disparaît quand tout est
-- retiré, alors qu'un rendez-vous planifié à la main ne disparaît jamais tout seul.
alter table meetings add column auto_created boolean not null default false;

-- Rencontres déjà créées par le bloc-notes avant cette migration : 15 minutes, sans rappel, dont l'heure est celle de leur
-- création (un rendez-vous planifié à la main n'a pas ces trois traits à la fois).
update meetings set auto_created = true
where deleted_at is null and planned_duration_min = 15 and reminder_minutes is null
  and abs(extract(epoch from (planned_at - created_at))) < 120;

-- Et on retire celles qui sont vides : sans note, intérêt, case cochée, contact ni prochaine étape.
update meetings m set deleted_at = now()
where m.deleted_at is null and m.auto_created
  and m.interest is null and not m.recontact and not m.news and m.contact_id is null
  and coalesce(trim(m.next_step), '') = ''
  and not exists (select 1 from notes n where n.meeting_id = m.id and n.deleted_at is null);
