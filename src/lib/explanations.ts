import { Chess } from 'chess.js';
import type { PositionAnalysis, MoveClassification } from '@/lib/analysis';

/**
 * Camada educativa do LB Assist Chess — explicações determinísticas baseadas
 * nos dados reais do Stockfish e da posição. Nenhuma IA é usada para gerar
 * texto; todas as afirmações são sustentadas pelos dados verificáveis.
 *
 * Princípio: só afirmamos o que os dados sustentam. Se não há variante, não
 * inventamos; se não há melhor lance legal, sinalizamos a limitação.
 */

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface MoveExplanation {
  ply: number;
  move: string | null;
  classification: MoveClassification | null;
  phase: GamePhase;
  /** SAN do lance jogado (convertido do UCI/SAN do PGN). */
  moveSan: string;
  /** SAN do melhor lance sugerido pelo Stockfish, ou null se indisponível. */
  bestMoveSan: string | null;
  /** Variante principal em SAN, ou null se indisponível. */
  pvSan: string[] | null;
  /** Perda de avaliação na perspectiva do jogador (centipeões), ou null. */
  lossCp: number | null;
  /** Avaliação antes do lance, formato legível (ex: "+1.5", "-M3"). */
  evalBefore: string;
  /** Avaliação depois do lance, formato legível. */
  evalAfter: string;
  /** Texto: o que aconteceu na posição. */
  whatHappened: string;
  /** Texto: por que a alternativa é melhor (baseado na variante). */
  whyBetter: string;
  /** Texto: como pensar nessa posição (ameaças, checks, capturas, etc). */
  howToThink: string;
  /** Texto: o que estudar (tema relacionado ao erro). */
  whatToStudy: string;
  /** Indica se a explicação é completa (tem melhor lance + variante) ou resumida. */
  isDetailed: boolean;
}

/**
 * Determina a fase do jogo a partir do FEN real.
 * Usa contagem de peças e estrutura de peões, não apenas o número do lance.
 *
 * - Abertura: até ~16 peças não-peão no tabuleiro (fase de desenvolvimento)
 * - Final: ≤ 8 peças não-peão (excluindo reis) ou rainhas saíram
 * - Meio-jogo: tudo o mais
 */
export function detectGamePhase(fen: string): GamePhase {
  try {
    const chess = new Chess(fen);
    const board = chess.board();
    let nonPawnPieces = 0;
    let totalPieces = 0;
    let queens = 0;

    for (const row of board) {
      for (const sq of row) {
        if (!sq) continue;
        totalPieces++;
        if (sq.type !== 'p') {
          nonPawnPieces++;
          if (sq.type === 'q') queens++;
        }
      }
    }

    // Abertura: muitos peões e peças ainda no tabuleiro (desenvolvimento)
    // Critério: mais de 12 peças não-peão e pelo menos 28 peças totais
    if (nonPawnPieces > 12 && totalPieces >= 28) {
      return 'opening';
    }

    // Final: poucas peças não-peão (≤ 6, excluindo reis) ou sem rainhas
    const nonKingNonPawn = nonPawnPieces - 2; // subtrai os 2 reis
    if (nonKingNonPawn <= 4 || queens === 0) {
      return 'endgame';
    }

    return 'middlegame';
  } catch {
    // Fallback simples pelo número do lance se o FEN for inválido
    return 'middlegame';
  }
}

/**
 * Detecta ameaças táticas verificáveis na posição: xeques diretos,
 * capturas disponíveis e peças indefeças (atacadas e não defendidas).
 * Retorna uma lista de strings descritivas em português.
 */
export function detectThreats(fen: string): string[] {
  const threats: string[] = [];
  try {
    const chess = new Chess(fen);
    const turn = chess.turn();

    // Xeque direto?
    if (chess.isCheck()) {
      const side = turn === 'w' ? 'Brancas' : 'Pretas';
      threats.push(`${side} estão em xeque na posição resultante.`);
    }

    // Capturas disponíveis para o lado que joga
    const captures = chess.moves({ verbose: true }).filter((m) => m.captured);
    if (captures.length > 0) {
      const side = turn === 'w' ? 'Brancas' : 'Pretas';
      const pieces = captures
        .map((m) => m.captured)
        .filter((p, i, arr) => arr.indexOf(p) === i)
        .map((p) => pieceNamePt(p));
      threats.push(`${side} têm capturas disponíveis: ${pieces.join(', ')}.`);
    }

    // Peças atacadas e não defendidas (horizonte de 1 lance)
    const board = chess.board();
    const attacked = new Set<string>();
    const defended = new Set<string>();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (!sq || sq.type === 'k') continue;
        const square = squareName(r, c);
        const enemyColor = sq.color === 'w' ? 'b' : 'w';

        // Esta peça está atacada por alguma peça inimiga?
        const tempChess = new Chess(fen);
        const enemyMoves = tempChess.moves({ verbose: true, color: enemyColor });
        const isAttacked = enemyMoves.some(
          (m) => m.to === square && (m.flags.includes('c') || m.flags.includes('e')),
        );

        if (isAttacked) {
          attacked.add(`${sq.color}${sq.type}:${square}`);
          // Verificar defensores: pode alguma peça aliada recapturar?
          const defenderChess = new Chess(fen);
          // Simular: se a peça for capturada, há recaptura?
          const allyMoves = defenderChess.moves({ verbose: true, color: sq.color });
          const canRecapture = allyMoves.some(
            (m) => m.to === square && (m.flags.includes('c') || m.flags.includes('e')),
          );
          if (!canRecapture) {
            defended.delete(`${sq.color}${sq.type}:${square}`);
            attacked.add(`${sq.color}${sq.type}:${square}:undefended`);
          }
        }
      }
    }

    const undefendedList = [...attacked].filter((s) => s.endsWith(':undefended'));
    if (undefendedList.length > 0) {
      const descs = undefendedList.map((s) => {
        const [colorType] = s.split(':');
        const piece = pieceNamePt(colorType[1]);
        const side = colorType[0] === 'w' ? 'Brancas' : 'Pretas';
        return `${side} têm ${piece} indefeso(a) sob ataque`;
      });
      threats.push(...descs.slice(0, 2));
    }
  } catch {
    // Ignora erros de parsing
  }
  return threats;
}

/**
 * Gera explicações para todos os lances analisados.
 * Lances sem classificação recebem explicação resumida; lances com erro
 * recebem explicação detalhada.
 */
export function generateExplanations(
  analysisPositions: PositionAnalysis[],
  boardPositions: { fen: string; ply: number; move: string | null }[],
): MoveExplanation[] {
  const explanations: MoveExplanation[] = [];

  for (const pos of analysisPositions) {
    if (!pos.classification) continue;

    const prevPly = pos.ply - 1;
    const prevPos = analysisPositions.find((p) => p.ply === prevPly);
    const prevBoard = boardPositions.find((p) => p.ply === prevPly);
    const currentBoard = boardPositions.find((p) => p.ply === pos.ply);

    const prevFen = prevBoard?.fen ?? '';
    const currentFen = currentBoard?.fen ?? pos.fen;
    const side: 'w' | 'b' = pos.ply % 2 === 1 ? 'w' : 'b';
    const sideLabel = side === 'w' ? 'Brancas' : 'Pretas';

    // Determinar fase pela posição anterior ao lance
    const phase = prevFen ? detectGamePhase(prevFen) : 'middlegame';

    // Converter lances para SAN
    const moveSan = pos.move ?? '?';
    const bestMoveSan = prevFen ? uciToSan(prevFen, pos.bestMove) : null;

    // Variante principal em SAN
    const pvSan = prevFen && pos.pv ? pvToSan(prevFen, pos.pv, 8) : null;

    // Perda de avaliação na perspectiva do jogador
    const lossCp = computeLossCp(
      { cp: prevPos?.evalCp ?? null, mate: prevPos?.evalMate ?? null },
      { cp: pos.evalCp, mate: pos.evalMate },
      side,
    );

    const evalBefore = formatEval(prevPos?.evalCp ?? null, prevPos?.evalMate ?? null);
    const evalAfter = formatEval(pos.evalCp, pos.evalMate);

    // Apenas lances com erro/imprecisão recebem explicação detalhada
    const isError =
      pos.classification === 'inaccuracy' ||
      pos.classification === 'mistake' ||
      pos.classification === 'blunder';

    const isDetailed = isError && !!prevFen;

    const whatHappened = buildWhatHappened(pos, prevPos, side, phase, lossCp, evalBefore, evalAfter);
    const whyBetter = isDetailed ? buildWhyBetter(bestMoveSan, pvSan, lossCp, pos.classification) : '';
    const howToThink = isDetailed ? buildHowToThink(currentFen, phase) : '';
    const whatToStudy = isDetailed ? buildWhatToStudy(pos.classification, phase, pos.ply) : '';

    explanations.push({
      ply: pos.ply,
      move: pos.move,
      classification: pos.classification,
      phase,
      moveSan,
      bestMoveSan,
      pvSan,
      lossCp,
      evalBefore,
      evalAfter,
      whatHappened,
      whyBetter,
      howToThink,
      whatToStudy,
      isDetailed,
    });
  }

  return explanations;
}

/**
 * Valida que o bestMove UCI é legal na posição anterior ao lance.
 */
export function isBestMoveLegal(prevFen: string | null, bestMove: string | null): boolean {
  if (!prevFen || !bestMove) return false;
  try {
    const chess = new Chess(prevFen);
    const move = chess.move({
      from: bestMove.slice(0, 2),
      to: bestMove.slice(2, 4),
      promotion: bestMove.length > 4 ? bestMove[4] : undefined,
    });
    return move !== null;
  } catch {
    return false;
  }
}

/**
 * Valida que a correspondência entre ply, FEN e lance é consistente.
 * Retorna true se a posição no boardPositions corresponde ao ply esperado.
 */
export function validatePlyFenAssociation(
  analysisPositions: PositionAnalysis[],
  boardPositions: { fen: string; ply: number; move: string | null }[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const pos of analysisPositions) {
    if (!pos.classification) continue;
    const board = boardPositions.find((p) => p.ply === pos.ply);
    if (!board) {
      errors.push(`Ply ${pos.ply}: sem posição correspondente no tabuleiro.`);
      continue;
    }
    // Verificar que o FEN da análise bate com o FEN do tabuleiro
    if (pos.fen && board.fen && pos.fen !== board.fen) {
      errors.push(`Ply ${pos.ply}: FEN da análise difere do FEN do tabuleiro.`);
    }
    // Verificar que o lance jogado é legal na posição anterior
    const prevBoard = boardPositions.find((p) => p.ply === pos.ply - 1);
    if (prevBoard && pos.move) {
      try {
        const chess = new Chess(prevBoard.fen);
        const move = chess.move(pos.move);
        if (!move) {
          errors.push(`Ply ${pos.ply}: lance "${pos.move}" é ilegal na posição anterior.`);
        }
      } catch {
        errors.push(`Ply ${pos.ply}: lance "${pos.move}" causou erro no chess.js.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// === Helpers de texto ===

function buildWhatHappened(
  pos: PositionAnalysis,
  prevPos: PositionAnalysis | undefined,
  side: 'w' | 'b',
  phase: GamePhase,
  lossCp: number | null,
  evalBefore: string,
  evalAfter: string,
): string {
  const sideLabel = side === 'w' ? 'Brancas' : 'Pretas';
  const cls = pos.classification ? classificationLabelPt(pos.classification) : '';

  if (pos.classification === 'best' || pos.classification === 'excellent' || pos.classification === 'good') {
    return `${sideLabel} jogaram ${pos.move ?? '?'}, mantendo a posição. Avaliação: ${evalBefore} → ${evalAfter}. ${phaseLabel(phase)}.`;
  }

  const lossStr = lossCp !== null ? `${(lossCp / 100).toFixed(2)} peões` : 'indisponivel';
  const whatHappenedParts = [
    `${sideLabel} jogaram ${pos.move ?? '?'}`,
    `classificado como ${cls}`,
    `A avaliacao passou de ${evalBefore} para ${evalAfter}`,
    `perda estimada: ${lossStr}`,
    phaseLabel(phase),
  ];
  return whatHappenedParts.join('. ') + '.';
}

function buildWhyBetter(
  bestMoveSan: string | null,
  pvSan: string[] | null,
  lossCp: number | null,
  classification: MoveClassification | null,
): string {
  if (!bestMoveSan) {
    return 'A análise não identificou uma alternativa claramente melhor para esta posição.';
  }

  const parts: string[] = [];
  parts.push(`A alternativa recomendada é ${bestMoveSan}`);

  if (pvSan && pvSan.length > 0) {
    parts.push(`. A variante principal prevê: ${pvSan.slice(0, 4).join(' ')}`);
  }

  if (lossCp !== null && lossCp > 0) {
    parts.push(`. Esta escolha evitaria a perda de aproximadamente ${(lossCp / 100).toFixed(2)} peões`);
  }

  return parts.join('') + '.';
}

function buildHowToThink(currentFen: string, phase: GamePhase): string {
  const threats = detectThreats(currentFen);
  const parts: string[] = [];

  if (phase === 'opening') {
    parts.push('Na abertura, priorize desenvolvimento de peças menores, controle do centro e segurança do rei (roque).');
  } else if (phase === 'middlegame') {
    parts.push('No meio-jogo, avalie ameaças táticas, coordenação de peças e planos posicionais.');
  } else {
    parts.push('No final, considere a atividade do rei, peões passados e técnica de conversão.');
  }

  if (threats.length > 0) {
    parts.push(threats.slice(0, 2).join(' '));
  } else {
    parts.push('Sem ameaças imediatas detectadas na posição resultante.');
  }

  return parts.join(' ');
}

function buildWhatToStudy(classification: MoveClassification, phase: GamePhase, ply: number): string {
  const phaseName =
    phase === 'opening' ? 'abertura' : phase === 'middlegame' ? 'meio-jogo' : 'final';

  if (classification === 'blunder') {
    return `Revise táticas e cálculo de lances em ${phaseName}. Erros graves geralmente envolvem capturas não vistas ou ameaças não verificadas.`;
  }
  if (classification === 'mistake') {
    return `Pratique cálculo de 2-3 lances de profundidade em posições de ${phaseName}. Verifique se há capturas ou ameaças do oponente antes de decidir.`;
  }
  if (classification === 'inaccuracy') {
    return `Estude planos posicionais para ${phaseName}. Imprecisões geralmente resultam de escolhas subótimas que não são erros táticos diretos.`;
  }
  return '';
}

// === Helpers utilitários ===

function formatEval(evalCp: number | null, evalMate: number | null): string {
  if (evalMate !== null) return `${evalMate > 0 ? '+' : '-'}M${Math.abs(evalMate)}`;
  if (evalCp === null) return '—';
  const pawns = evalCp / 100;
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

function computeLossCp(
  before: { cp: number | null; mate: number | null },
  after: { cp: number | null; mate: number | null },
  side: 'w' | 'b',
): number | null {
  const beforeCp = evalToCp(before);
  const afterCp = evalToCp(after);
  if (beforeCp === null || afterCp === null) return null;
  const beforePlayer = side === 'w' ? beforeCp : -beforeCp;
  const afterPlayer = side === 'w' ? afterCp : -afterCp;
  return Math.max(0, beforePlayer - afterPlayer);
}

function evalToCp(e: { cp: number | null; mate: number | null }): number | null {
  if (e.mate !== null) return e.mate > 0 ? 10000 : -10000;
  return e.cp ?? null;
}

function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

function pvToSan(fen: string, pv: string, maxMoves: number): string[] | null {
  try {
    const chess = new Chess(fen);
    const uciMoves = pv.split(/\s+/).filter(Boolean).slice(0, maxMoves);
    const san: string[] = [];
    const fenParts = fen.split(' ');
    const fullMove = parseInt(fenParts[5] ?? '1', 10) || 1;
    let moveNum = fullMove;
    let whiteToMove = fenParts[1] === 'w';
    for (const uci of uciMoves) {
      const m = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
      if (!m) break;
      if (whiteToMove) {
        san.push(`${moveNum}. ${m.san}`);
      } else if (san.length === 0) {
        san.push(`${moveNum}... ${m.san}`);
      } else {
        san.push(m.san);
      }
      if (!whiteToMove) moveNum++;
      whiteToMove = !whiteToMove;
    }
    return san.length > 0 ? san : null;
  } catch {
    return null;
  }
}

function pieceNamePt(type: string): string {
  const names: Record<string, string> = {
    p: 'peão',
    n: 'cavalo',
    b: 'bispo',
    r: 'torre',
    q: 'dama',
    k: 'rei',
  };
  return names[type] ?? type;
}

function squareName(row: number, col: number): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  return `${files[col]}${ranks[row]}`;
}

function classificationLabelPt(cls: MoveClassification): string {
  const labels: Record<MoveClassification, string> = {
    best: 'melhor lance',
    excellent: 'excelente',
    good: 'bom lance',
    inaccuracy: 'imprecisão',
    mistake: 'erro',
    blunder: 'erro grave',
  };
  return labels[cls];
}

function phaseLabel(phase: GamePhase): string {
  if (phase === 'opening') return 'Fase: abertura';
  if (phase === 'middlegame') return 'Fase: meio-jogo';
  return 'Fase: final';
}
