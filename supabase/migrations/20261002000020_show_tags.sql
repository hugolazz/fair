-- Pastilles « salons » sur les entreprises : les salons où elles étaient ou seront (colonnes du fichier d'import).
-- On réutilise les tags (libellé, couleur, liens, filtres) avec un type : 'type' = typologie (Client, Prospect…),
-- 'show' = salon. Les politiques RLS des tags s'appliquent telles quelles.
alter table tags add column kind text not null default 'type' check (kind in ('type', 'show'));
