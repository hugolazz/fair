-- Abréviation d'un salon (pastilles du tableau et des cartes), modifiable par les admins : `tags.short_label`.
-- Vide = abréviation automatique (initiales du nom). Les politiques RLS des tags s'appliquent telles quelles.
alter table tags add column short_label text check (short_label is null or char_length(short_label) between 1 and 8);
