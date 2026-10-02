-- Plan interactif du salon : plans (image) et pins posés dessus.
-- Les coordonnées sont NORMALISÉES (0..1, origine en haut à gauche) : elles ne dépendent pas de la
-- résolution de l'image, on peut donc la remplacer sans déplacer les pins.

-- Clé de comparaison d'un numéro de stand : majuscules, sans espaces ni ponctuation, sans zéros de tête
-- (« a-05 », « A5 » et « A 05 » donnent « A5 »). Même règle que `standKey()` côté client (testée en parité).
create function stand_key(label text) returns text
language sql immutable parallel safe as $$
  select nullif(
    regexp_replace(regexp_replace(upper(label), '[^A-Z0-9]', '', 'g'), '(^|[^0-9])0+([0-9])', '\1\2', 'g'),
    ''
  )
$$;

-- Clé de jointure côté participation : c'est elle que l'OCR utilisera pour relier un numéro détecté à une entreprise.
alter table event_companies
  add column stand_key text generated always as (stand_key(stand_label)) stored;
create index event_companies_stand_key_idx on event_companies (event_id, stand_key) where stand_key is not null;

-- Le plan est un `floorplans` (une ligne par image) dont le fichier est une pièce jointe (`attachments`, kind
-- 'floorplan'). La ligne peut arriver AVANT le fichier (l'envoi des fichiers est différé : une note ne doit jamais
-- attendre une image) : la référence n'est donc plus une clé étrangère.
alter table floorplans drop constraint if exists floorplans_attachment_id_fkey;
create index floorplans_event_idx on floorplans (event_id) where deleted_at is null;

-- Remplacé par plan_pins (plusieurs pins par entreprise possibles, pins sans entreprise).
alter table event_companies
  drop column floorplan_id,
  drop column pin_x,
  drop column pin_y;

create table plan_pins (
  id uuid primary key,
  team_id uuid not null references teams on delete cascade,
  event_id uuid not null references events,
  floorplan_id uuid not null references floorplans,
  -- Entreprise du salon reliée au pin ; vide = pin « numéro de stand seul » (ou détection OCR pas encore reliée).
  event_company_id uuid references event_companies,
  stand_label text,
  stand_key text generated always as (stand_key(stand_label)) stored,
  x numeric not null check (x between 0 and 1),
  y numeric not null check (y between 0 and 1),
  -- Origine du pin. Réservé OCR (non implémenté) : un pin 'ocr' est posé en 'suggested' avec le texte lu
  -- (`raw_text`), sa confiance (0..1) et son rectangle normalisé (`bbox` = {x, y, w, h}) ; la validation
  -- humaine le passe en 'confirmed'. Les pins manuels sont toujours 'confirmed'.
  source text not null default 'manual' check (source in ('manual', 'ocr')),
  review_status text not null default 'confirmed' check (review_status in ('confirmed', 'suggested')),
  confidence numeric check (confidence between 0 and 1),
  bbox jsonb,
  raw_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_seq bigint not null default nextval('server_seq_global'),
  updated_by uuid,
  check (event_company_id is not null or stand_label is not null)
);
create index plan_pins_floorplan_idx on plan_pins (floorplan_id) where deleted_at is null;
create index plan_pins_company_idx on plan_pins (event_company_id) where deleted_at is null;
create index plan_pins_stand_key_idx on plan_pins (event_id, stand_key) where deleted_at is null and stand_key is not null;
create index plan_pins_pull_idx on plan_pins (team_id, server_seq);
create trigger plan_pins_touch
  before insert or update on plan_pins
  for each row execute function touch_row();

-- RLS : mêmes règles que les autres tables métier. Le plan et l'entreprise visés doivent appartenir à la même
-- équipe que le pin (le sous-select est lui-même soumis à la RLS : on ne peut pas viser les données d'une autre équipe).
alter table plan_pins enable row level security;
create policy plan_pins_select on plan_pins for select using (is_team_member(team_id));
create policy plan_pins_insert on plan_pins for insert with check (
  is_team_member(team_id)
  and exists (select 1 from floorplans f where f.id = floorplan_id and f.team_id = plan_pins.team_id)
  and (event_company_id is null
       or exists (select 1 from event_companies c where c.id = event_company_id and c.team_id = plan_pins.team_id))
);
create policy plan_pins_update on plan_pins for update
  using (is_team_member(team_id))
  with check (
    is_team_member(team_id)
    and exists (select 1 from floorplans f where f.id = floorplan_id and f.team_id = plan_pins.team_id)
    and (event_company_id is null
         or exists (select 1 from event_companies c where c.id = event_company_id and c.team_id = plan_pins.team_id))
  );
create policy plan_pins_delete on plan_pins for delete using (is_team_admin(team_id));
