-- Couleur d'accentuation de l'équipe (Réglages → Équipe → Apparence). Vide = le vert d'origine. Modifiable par les admins
-- via la policy teams_update existante ; lue par tous les membres (teams_select) qui voient l'appli aux couleurs de l'équipe.
alter table teams add column accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');
