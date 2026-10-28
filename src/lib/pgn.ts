import { Chess } from 'chess.js';

export interface ParsedGame {
  pgn: string;
  whitePlayer: string | null;
  blackPlayer: string | null;
  result: string | null;
  playedAt: string | null;
  timeControl: string | null;
  openingEco: string | null;
  openingName: string | null;
  moves: string[];
  externalId: string | null;
}

export interface ParseResult {
  games: ParsedGame[];
  total: number;
  valid: number;
  rejected: number;
  errors: string[];
}

/**
 * Divide um arquivo PGN (que pode conter múltiplas partidas) em strings PGN
 * individuais. PGNs são delimitados por linhas que começam com [Event ...].
 */
function splitPgnFile(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const games: string[] = [];
  let current = '';
  const lines = trimmed.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith('[Event ') && current.trim()) {
      games.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) games.push(current.trim());

  return games;
}

/**
 * Extrai o valor de um cabeçalho PGN por chave.
 */
function getHeader(pgn: string, key: string): string | null {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match ? match[1] : null;
}

/**
 * Converte a data do formato PGN (YYYY.MM.DD) para ISO.
 */
function parsePgnDate(dateStr: string | null, timeStr?: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const time = timeStr?.trim() || '12:00:00';
  return `${y}-${m}-${d}T${time}`;
}

/**
 * Gera um hash SHA-256 determinístico a partir de dados estáveis da partida.
 * Usado para deduplicação de PGNs sem external_id.
 */
export async function computePgnHash(game: {
  whitePlayer: string | null;
  blackPlayer: string | null;
  result: string | null;
  playedAt: string | null;
}): Promise<string> {
  const composite = `${game.whitePlayer || '?'}|${game.blackPlayer || '?'}|${game.result || '?'}|${game.playedAt || '?'}`;
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(composite));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface GameMovePosition {
  fen: string;
  move: string | null;
  ply: number;
}

/**
 * Reconstrói a sequência de lances e posições de uma partida a partir do PGN.
 * Retorna os lances em SAN na ordem jogada e uma posição por ply (0 = inicial).
 * Reproduz o mesmo fluxo usado pelo analisador (src/lib/analysis.ts): carrega o
 * PGN, captura o histórico e o repõe a partir da posição inicial.
 */
export function extractGameMoves(pgn: string): { moves: string[]; positions: GameMovePosition[] } {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history();
  chess.reset();
  const positions: GameMovePosition[] = [{ fen: chess.fen(), move: null, ply: 0 }];
  for (let i = 0; i < moves.length; i++) {
    chess.move(moves[i]);
    positions.push({ fen: chess.fen(), move: moves[i], ply: i + 1 });
  }
  return { moves, positions };
}

/**
 * Faz o parse de um arquivo PGN completo, extraindo metadados e lances.
 * Rejeita PGNs inválidos e retorna um relatório com a contagem.
 */
export function parsePgnFile(content: string): ParseResult {
  const chunks = splitPgnFile(content);
  const games: ParsedGame[] = [];
  const errors: string[] = [];

  chunks.forEach((pgn, i) => {
    try {
      const { moves: history } = extractGameMoves(pgn);

      if (history.length === 0) {
        errors.push(`Partida ${i + 1}: PGN inválido — não foi possível carregar.`);
        return;
      }

      const whitePlayer = getHeader(pgn, 'White');
      const blackPlayer = getHeader(pgn, 'Black');
      const result = getHeader(pgn, 'Result');
      const dateStr = getHeader(pgn, 'Date');
      const roundTime = getHeader(pgn, 'RoundTime') || getHeader(pgn, 'StartTime');
      const timeControl = getHeader(pgn, 'TimeControl');
      const openingEco = getHeader(pgn, 'ECO');
      // Tentar [Opening] primeiro, depois [ECOUrl] (Chess.com), depois tabela ECO
      const openingName = getHeader(pgn, 'Opening');
      const ecoUrl = getHeader(pgn, 'ECOUrl');
      const link = getHeader(pgn, 'Link') || getHeader(pgn, 'Site');
      const externalId = link ? link : null;

      const playedAt = parsePgnDate(dateStr, roundTime);

      // Determinar o nome da abertura: [Opening] > [ECOUrl] > tabela ECO > null
      let resolvedOpeningName: string | null = null;
      if (openingName && openingName !== '?') {
        resolvedOpeningName = openingName;
      } else if (ecoUrl) {
        const urlMatch = ecoUrl.match(/\/openings\/(.+)$/);
        if (urlMatch) {
          resolvedOpeningName = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
      // Se ainda não temos nome, a tabela ECO em openings.ts será usada
      // pelo extractOpeningInfo quando a página de repertório processar o PGN.

      games.push({
        pgn,
        whitePlayer: whitePlayer && whitePlayer !== '?' ? whitePlayer : null,
        blackPlayer: blackPlayer && blackPlayer !== '?' ? blackPlayer : null,
        result: result && result !== '*' ? result : null,
        playedAt,
        timeControl: timeControl && timeControl !== '?' ? timeControl : null,
        openingEco: openingEco && openingEco !== '?' ? openingEco : null,
        openingName: resolvedOpeningName,
        moves: history,
        externalId,
      });
    } catch {
      errors.push(`Partida ${i + 1}: erro ao processar o PGN.`);
    }
  });

  return {
    games,
    total: chunks.length,
    valid: games.length,
    rejected: errors.length,
    errors,
  };
}

/**
 * Valida o tamanho do arquivo antes de processar.
 */
export function validateFile(file: File, maxBytes: number): string | null {
  if (file.size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
    return `Arquivo muito grande. O limite é ${maxMb} MB.`;
  }
  if (!file.name.toLowerCase().endsWith('.pgn') && file.type !== 'application/x-chess-pgn') {
    return 'Selecione um arquivo .pgn válido.';
  }
  return null;
}

/**
 * Formata uma data ISO para exibição em português.
 */
export function formatGameDate(iso: string | null): string {
  if (!iso) return 'Data desconhecida';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Data desconhecida';
  }
}

/**
 * Formata o resultado da partida para exibição.
 */
export function formatResult(result: string | null, userColor: 'white' | 'black' | null): { label: string; color: string } {
  if (!result) return { label: 'Em andamento', color: 'text-content-secondary' };
  if (result === '1-0') {
    if (userColor === 'white') return { label: 'Vitória', color: 'text-success-400' };
    if (userColor === 'black') return { label: 'Derrota', color: 'text-danger-400' };
    return { label: 'Brancas venceram', color: 'text-content-secondary' };
  }
  if (result === '0-1') {
    if (userColor === 'black') return { label: 'Vitória', color: 'text-success-400' };
    if (userColor === 'white') return { label: 'Derrota', color: 'text-danger-400' };
    return { label: 'Pretas venceram', color: 'text-content-secondary' };
  }
  if (result === '1/2-1/2') return { label: 'Empate', color: 'text-warning-300' };
  return { label: result, color: 'text-content-secondary' };
}

/**
 * Tenta identificar a cor jogada pelo usuário a partir do nome.
 */
export function detectUserColor(
  game: { whitePlayer: string | null; blackPlayer: string | null },
  username: string | null,
): 'white' | 'black' | null {
  if (!username) return null;
  const lower = username.toLowerCase();
  if (game.whitePlayer?.toLowerCase().includes(lower)) return 'white';
  if (game.blackPlayer?.toLowerCase().includes(lower)) return 'black';
  return null;
}
