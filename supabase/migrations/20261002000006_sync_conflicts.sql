-- Résolution de conflits côté serveur pour la synchronisation hors-ligne.
--  - patch_meeting : dernier écrit gagne PAR CHAMP, selon l'heure de modification de chaque champ
--    (field_updated_at). Une modification faite hors-ligne il y a deux heures ne l'emporte pas sur une
--    modification plus récente faite en ligne depuis un autre appareil.
--  - patch_note : compare-and-swap sur server_seq. Si la note a changé entre-temps, rien n'est écrasé :
--    le client reçoit le texte du serveur et conserve les deux versions.
-- Les deux fonctions s'exécutent avec les droits de l'appelant (RLS appliquée).

create function patch_meeting(p_id uuid, p_patch jsonb, p_edited jsonb) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed text[] := array[
    'status', 'interest', 'need', 'budget', 'timing', 'decision_maker', 'next_step', 'temperature',
    'outcome', 'planned_at', 'planned_duration_min', 'reminder_minutes', 'contact_id', 'deleted_at'
  ];
  m meetings%rowtype;
  k text;
  edited timestamptz;
  known timestamptz;
  fu jsonb;
  applied jsonb := '{}';
begin
  select * into m from meetings where id = p_id for update;
  if not found then
    return null; -- inconnue ou non visible (RLS)
  end if;
  fu := coalesce(m.field_updated_at, '{}');
  foreach k in array allowed loop
    if p_patch ? k then
      -- Heure d'édition fournie par l'appareil, jamais dans le futur (horloge déréglée).
      edited := least(coalesce((p_edited ->> k)::timestamptz, now()), now());
      known := (fu ->> k)::timestamptz;
      if known is null or edited >= known then
        applied := applied || jsonb_build_object(k, p_patch -> k);
        fu := fu || jsonb_build_object(k, edited);
      end if;
    end if;
  end loop;

  if applied <> '{}' then
    update meetings set
      status = case when applied ? 'status' then (applied ->> 'status')::meeting_status else status end,
      interest = case when applied ? 'interest' then (applied ->> 'interest')::smallint else interest end,
      need = case when applied ? 'need' then applied ->> 'need' else need end,
      budget = case when applied ? 'budget' then applied ->> 'budget' else budget end,
      timing = case when applied ? 'timing' then applied ->> 'timing' else timing end,
      decision_maker = case when applied ? 'decision_maker' then applied ->> 'decision_maker' else decision_maker end,
      next_step = case when applied ? 'next_step' then applied ->> 'next_step' else next_step end,
      temperature = case when applied ? 'temperature' then (applied ->> 'temperature')::temperature else temperature end,
      outcome = case when applied ? 'outcome' then applied ->> 'outcome' else outcome end,
      planned_at = case when applied ? 'planned_at' then (applied ->> 'planned_at')::timestamptz else planned_at end,
      planned_duration_min = case when applied ? 'planned_duration_min' then (applied ->> 'planned_duration_min')::int else planned_duration_min end,
      reminder_minutes = case when applied ? 'reminder_minutes' then (applied ->> 'reminder_minutes')::int else reminder_minutes end,
      contact_id = case when applied ? 'contact_id' then (applied ->> 'contact_id')::uuid else contact_id end,
      deleted_at = case when applied ? 'deleted_at' then (applied ->> 'deleted_at')::timestamptz else deleted_at end,
      field_updated_at = fu
    where id = p_id;
  end if;
  return (select server_seq from meetings where id = p_id);
end;
$$;

create function patch_note(p_id uuid, p_body text, p_base_seq bigint)
returns table (outcome text, server_seq bigint, body text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  n notes%rowtype;
  seq bigint;
begin
  select * into n from notes where id = p_id for update;
  if not found then
    return query select 'missing'::text, null::bigint, null::text;
    return;
  end if;
  if n.body = p_body then
    -- Rien à changer (ou modification identique faite ailleurs) : pas de conflit.
    return query select 'ok'::text, n.server_seq, n.body;
    return;
  end if;
  if n.server_seq = p_base_seq then
    update notes set body = p_body where id = p_id returning notes.server_seq into seq;
    return query select 'ok'::text, seq, p_body;
    return;
  end if;
  -- La note a changé depuis la dernière version connue de l'appareil : on ne l'écrase pas.
  return query select 'conflict'::text, n.server_seq, n.body;
end;
$$;

revoke execute on function patch_meeting(uuid, jsonb, jsonb), patch_note(uuid, text, bigint) from public, anon;
grant execute on function patch_meeting(uuid, jsonb, jsonb), patch_note(uuid, text, bigint) to authenticated;
