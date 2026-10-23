-- Intitulé de la case optionnelle des notes de rencontre (jusqu'ici « Actualité ? »), personnalisable par les admins
-- (policy teams_update existante). Vide = « Actualité ? ». Il sert d'intitulé à la case, au badge de l'historique et, sans
-- le « ? » final, à la colonne des exports.
alter table teams add column news_label text
  check (news_label is null or char_length(btrim(news_label)) between 1 and 40);
