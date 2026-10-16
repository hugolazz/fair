-- Historique d'une entreprise : texte libre (« on a déjà contacté M. X le 19 janvier 2026 pour… »), renseigné dans la
-- colonne « Commentaire » du fichier d'import ou à la main. Au niveau de l'entreprise : il suit d'un salon à l'autre.
alter table companies add column history text;
