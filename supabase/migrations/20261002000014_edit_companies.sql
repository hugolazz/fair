-- « Modifier la fiche » : tout membre de l'équipe peut corriger les informations d'une entreprise (nom, site, secteur,
-- ville, pays) et surtout compléter son historique. Les fiches sont partagées par toute l'équipe ; seule la suppression
-- reste réservée aux admins (inchangé).
drop policy companies_update on companies;
create policy companies_update on companies for update
  using (is_team_member(team_id)) with check (is_team_member(team_id));
