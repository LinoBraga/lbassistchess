import { Chess } from 'chess.js';
import type { PositionAnalysis } from '@/lib/analysis';

export interface GameForRepertoire {
  id: string;
  pgn: string;
  white_player: string | null;
  black_player: string | null;
  result: string | null;
  played_at: string | null;
  time_control: string | null;
  user_color: 'white' | 'black' | null;
  opening_name: string | null;
  opening_eco: string | null;
}

export interface OpeningStat {
  key: string;
  name: string;
  eco: string | null;
  moveSequence: string[];
  totalGames: number;
  asWhite: number;
  asBlack: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

export interface CriticalPosition {
  gameId: string;
  ply: number;
  fen: string;
  move: string | null;
  bestMove: string | null;
  evalCp: number | null;
  evalMate: number | null;
  classification: string | null;
  depth: number;
  openingName: string | null;
  whitePlayer: string | null;
  blackPlayer: string | null;
  result: string | null;
}

export interface VariantNode {
  ply: number;
  fen: string;
  move: string | null;
  evalCp: number | null;
  evalMate: number | null;
  bestMove: string | null;
  depth: number;
  hasEngineData: boolean;
  games: { id: string; white: string | null; black: string | null; result: string | null }[];
}

export interface VariantTree {
  root: VariantNode;
  children: Map<string, { move: string; node: VariantNode }[]>;
}

export interface RepertoireData {
  openings: OpeningStat[];
  criticalPositions: CriticalPosition[];
  variantTrees: { asWhite: VariantTree; asBlack: VariantTree };
  totalGames: number;
  gamesWithOpenings: number;
  gamesWithAnalysis: number;
}

const OPENING_PLY_DEPTH = 10;
const CRITICAL_PLY_LIMIT = 20;

function getHeader(pgn: string, key: string): string | null {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match ? match[1] : null;
}

function extractOpeningInfo(game: GameForRepertoire): {
  name: string | null;
  eco: string | null;
  moves: string[];
  fen: string;
} {
  let name = game.opening_name;
  let eco = game.opening_eco;

  if (!name || !eco) {
    const headerName = getHeader(game.pgn, 'Opening');
    const headerEco = getHeader(game.pgn, 'ECO');
    if (!name && headerName && headerName !== '?') name = headerName;
    if (!eco && headerEco && headerEco !== '?') eco = headerEco;
  }

  let moves: string[] = [];
  let fen = '';
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    moves = chess.history();
    fen = chess.fen();
  } catch {
    return { name, eco, moves: [], fen: 'start' };
  }

  return { name, eco, moves, fen };
}

function buildOpeningKey(moves: string[], depth: number): string {
  return moves.slice(0, depth).join(' ');
}

function classifyResult(
  result: string | null,
  userColor: 'white' | 'black' | null,
): 'win' | 'draw' | 'loss' | null {
  if (!result) return null;
  if (result === '1/2-1/2') return 'draw';
  if (!userColor) return null;
  if (result === '1-0') return userColor === 'white' ? 'win' : 'loss';
  if (result === '0-1') return userColor === 'black' ? 'win' : 'loss';
  return null;
}

export function computeOpeningFrequency(
  games: GameForRepertoire[],
  filters: { period: 'all' | '30d' | '90d'; timeControl: 'all' | 'blitz' | 'rapid' | 'classical' },
): OpeningStat[] {
  const now = Date.now();
  const periodMs = filters.period === '30d' ? 30 * 86400000 : filters.period === '90d' ? 90 * 86400000 : 0;

  const filtered = games.filter((g) => {
    if (filters.period !== 'all' && g.played_at) {
      const ts = new Date(g.played_at).getTime();
      if (now - ts > periodMs) return false;
    }
    if (filters.timeControl !== 'all' && g.time_control) {
      const tc = g.time_control.toLowerCase();
      if (filters.timeControl === 'blitz' && !tc.includes('blitz') && !tc.includes('180') && !tc.includes('300')) return false;
      if (filters.timeControl === 'rapid' && !tc.includes('rapid') && !tc.includes('600') && !tc.includes('900') && !tc.includes('1800')) return false;
      if (filters.timeControl === 'classical' && !tc.includes('classical') && !tc.includes('2700') && !tc.includes('3600')) return false;
    }
    return true;
  });

  const groups = new Map<string, GameForRepertoire[]>();

  for (const game of filtered) {
    const info = extractOpeningInfo(game);
    const key =
      info.name && info.name !== '?'
        ? info.name
        : buildOpeningKey(info.moves, OPENING_PLY_DEPTH) || 'unknown';

    const existing = groups.get(key) ?? [];
    existing.push(game);
    groups.set(key, existing);
  }

  const stats: OpeningStat[] = [];

  for (const [key, group] of groups.entries()) {
    const first = group[0];
    const info = extractOpeningInfo(first);

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let asWhite = 0;
    let asBlack = 0;

    for (const g of group) {
      const gInfo = extractOpeningInfo(g);
      if (g.user_color === 'white') asWhite++;
      if (g.user_color === 'black') asBlack++;
      const outcome = classifyResult(g.result, g.user_color);
      if (outcome === 'win') wins++;
      else if (outcome === 'draw') draws++;
      else if (outcome === 'loss') losses++;
    }

    const decided = wins + draws + losses;
    const name = info.name && info.name !== '?' ? info.name : key === 'unknown' ? 'Abertura não identificada' : `Lances: ${key}`;

    stats.push({
      key,
      name,
      eco: info.eco && info.eco !== '?' ? info.eco : null,
      moveSequence: info.moves.slice(0, OPENING_PLY_DEPTH),
      totalGames: group.length,
      asWhite,
      asBlack,
      wins,
      draws,
      losses,
      winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    });
  }

  stats.sort((a, b) => b.totalGames - a.totalGames);
  return stats;
}

export interface AnalysisForRepertoire {
  game_id: string;
  positions: PositionAnalysis[];
}

export function computeCriticalPositions(
  games: GameForRepertoire[],
  analyses: AnalysisForRepertoire[],
): CriticalPosition[] {
  const gameMap = new Map(games.map((g) => [g.id, g]));
  const analysisMap = new Map(analyses.map((a) => [a.game_id, a]));
  const positions: CriticalPosition[] = [];

  for (const game of games) {
    const analysis = analysisMap.get(game.id);
    if (!analysis) continue;

    const info = extractOpeningInfo(game);

    for (const pos of analysis.positions) {
      if (pos.ply === 0 || pos.ply > CRITICAL_PLY_LIMIT) continue;
      if (!pos.classification) continue;
      if (pos.classification === 'best' || pos.classification === 'excellent' || pos.classification === 'good') continue;

      positions.push({
        gameId: game.id,
        ply: pos.ply,
        fen: pos.fen,
        move: pos.move,
        bestMove: pos.bestMove,
        evalCp: pos.evalCp,
        evalMate: pos.evalMate,
        classification: pos.classification,
        depth: pos.depth,
        openingName: info.name && info.name !== '?' ? info.name : null,
        whitePlayer: game.white_player,
        blackPlayer: game.black_player,
        result: game.result,
      });
    }
  }

  positions.sort((a, b) => {
    const severity: Record<string, number> = { blunder: 0, mistake: 1, inaccuracy: 2 };
    return (severity[a.classification ?? ''] ?? 3) - (severity[b.classification ?? ''] ?? 3);
  });

  return positions;
}

export function computeVariantTrees(
  games: GameForRepertoire[],
  analyses: AnalysisForRepertoire[],
): { asWhite: VariantTree; asBlack: VariantTree } {
  const whiteGames = games.filter((g) => g.user_color === 'white');
  const blackGames = games.filter((g) => g.user_color === 'black');

  return {
    asWhite: buildVariantTree(whiteGames, analyses),
    asBlack: buildVariantTree(blackGames, analyses),
  };
}

function buildVariantTree(
  games: GameForRepertoire[],
  analyses: AnalysisForRepertoire[],
): VariantTree {
  const analysisMap = new Map(analyses.map((a) => [a.game_id, a]));
  const root: VariantNode = {
    ply: 0,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    move: null,
    evalCp: null,
    evalMate: null,
    bestMove: null,
    depth: 0,
    hasEngineData: false,
    games: games.map((g) => ({ id: g.id, white: g.white_player, black: g.black_player, result: g.result })),
  };

  const children = new Map<string, { move: string; node: VariantNode }[]>();

  const nodesByKey = new Map<string, VariantNode>();
  nodesByKey.set(`0:${root.fen}`, root);

  for (const game of games) {
    const info = extractOpeningInfo(game);
    if (info.moves.length === 0) continue;

    const analysis = analysisMap.get(game.id);
    const positions = analysis?.positions ?? [];

    let chess: Chess;
    try {
      chess = new Chess();
    } catch {
      continue;
    }

    const maxPly = Math.min(info.moves.length, OPENING_PLY_DEPTH);
    let prevKey = `0:${root.fen}`;

    for (let i = 0; i < maxPly; i++) {
      const move = info.moves[i];
      try {
        chess.move(move);
      } catch {
        break;
      }

      const fen = chess.fen();
      const ply = i + 1;
      const key = `${ply}:${fen}`;

      let node = nodesByKey.get(key);
      if (!node) {
        const analysisPos = positions.find((p) => p.ply === ply);
        node = {
          ply,
          fen,
          move,
          evalCp: analysisPos?.evalCp ?? null,
          evalMate: analysisPos?.evalMate ?? null,
          bestMove: analysisPos?.bestMove ?? null,
          depth: analysisPos?.depth ?? 0,
          hasEngineData: !!analysisPos,
          games: [{ id: game.id, white: game.white_player, black: game.black_player, result: game.result }],
        };
        nodesByKey.set(key, node);

        const childList = children.get(prevKey) ?? [];
        childList.push({ move, node });
        children.set(prevKey, childList);
      } else {
        node.games.push({ id: game.id, white: game.white_player, black: game.black_player, result: game.result });
      }

      prevKey = key;
    }
  }

  return { root, children };
}
