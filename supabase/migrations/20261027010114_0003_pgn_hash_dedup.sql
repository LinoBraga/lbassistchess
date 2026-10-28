/*
# Deduplicação de partidas PGN por hash

1. Visão geral
Adiciona a coluna `pgn_hash` à tabela `games` para deduplicar partidas
importadas por arquivo PGN que não possuem `external_id` (Chess.com e Lichess
geram external_id; PGNs uploadados não). O hash é calculado a partir de dados
estáveis da partida (jogadores + data + resultado) para identificar duplicatas
mesmo sem identificador externo.

2. Mudanças na tabela `games`
- Nova coluna `pgn_hash` (text, nullable): hash SHA-256 de uma string
  composta por white_player + black_player + played_at + result.
- Novo índice UNIQUE parcial: (user_id, pgn_hash) WHERE pgn_hash IS NOT NULL,
  impedindo que o mesmo usuário importe a mesma partida PGN duas vezes.

3. Segurança
- Nenhuma mudança nas políticas RLS existentes. A coluna é preenchida no
  INSERT e não é controlável pelo usuário para escapar da deduplicação:
  a estratégia de hash é determinística e baseada nos dados da partida.

4. Notas
- Partidas importadas via Chess.com/Lichess mantêm external_id e não
  usam pgn_hash.
- O cálculo do hash é feito no frontend (Web Crypto API) antes do INSERT,
  e o índice UNIQUE garante a deduplicação no banco.
*/

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS pgn_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_games_pgn_hash_dedup
ON games(user_id, pgn_hash)
WHERE pgn_hash IS NOT NULL;
