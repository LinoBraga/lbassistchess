/*
# Fase 5 — Revogar grants excessivos de counted_analyses

A tabela counted_analyses foi criada na migração 0009 com grants para
service_role, mas o estado atual mostra que anon e authenticated também
têm CRUD. Esta migração revoga esses grants — a tabela é interna e só
deve ser acessada pela função increment_usage (SECURITY DEFINER) e por
edge functions via service_role.
*/

REVOKE ALL ON counted_analyses FROM anon, authenticated;
GRANT SELECT, INSERT ON counted_analyses TO service_role;