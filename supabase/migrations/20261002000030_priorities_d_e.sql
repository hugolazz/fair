-- Deux niveaux de priorité de plus : A, B, C, D, E (et toujours « sans priorité » = null).
-- Les valeurs s'ajoutent à la fin de l'enum : l'ordre de tri reste A < B < C < D < E, et les priorités existantes ne
-- changent pas. Aucune policy ni fonction ne liste les valeurs : rien d'autre à modifier côté base.
alter type priority_level add value if not exists 'D';
alter type priority_level add value if not exists 'E';
