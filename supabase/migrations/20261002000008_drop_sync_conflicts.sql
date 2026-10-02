-- Le mode hors-ligne a été retiré : les fonctions de résolution de conflits de synchronisation ne servent plus.
-- (On conserve les colonnes et statuts ajoutés par 20261002000005_field.sql : inoffensifs, et les supprimer perdrait des données.)
drop function if exists patch_meeting(uuid, jsonb, jsonb);
drop function if exists patch_note(uuid, text, bigint);
