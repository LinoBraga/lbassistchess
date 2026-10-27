import { useMemo, useState } from 'react';
import {
  Target,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  Crosshair,
  BookOpen,
  Trophy,
  Shield,
  Info,
} from 'lucide-react';
import { Chess } from 'chess.js';
import {
  formatEval,
  classificationLabel,
  type PositionAnalysis,
  type FullAnalysis,
  type MoveClassification,
} from '@/lib/analysis';
import {
  generateExplanations,
  type MoveExplanation,
  type GamePhase,
} from '@/lib/explanations';
import { Button } from '@/components/ui/Button';

/**
 * Convenção de avaliações (documentada em src/lib/analysis.ts):
 * - evalCp/evalMate são sempre da perspectiva das BRANCAS:
 *   evalCp > 0  → brancas vantajosas
 *   evalMate > 0 → brancas dão mate; < 0 → pretas dão mate
 * - A perda que classifica um lance é calculada na perspectiva do JOGADOR
 *   que o realizou (classifyMove inverte o sinal quando pretas jogam).
 * - Precisão segue a fórmula pública oficial do Lichess (AccuracyPercent):
 *   acurácia por lance = 103.1668*exp(-0.04354*winDiff) - 3.1669 (+1 bônus),
 *   e acurácia da partida combina média ponderada por volatilidade e
 *   média harmônica por cor.  Referência: lichess.org/page/accuracy
 */

export interface GameReportProps {
  analysis: FullAnalysis;
  game: {
    white_player: string | null;
    black_player: string | null;
    result: string | null;
    user_color: 'white' | 'black' | null;
    opening_name: string | null;
    opening_eco: string | null;
    time_control: string | null;
    played_at: string | null;
  };
  positions: { fen: string; move: string | null; ply: number }[];
  onJumpToPly: (ply: number) => void;
  onCreateExercise?: (ply: number) => void;
}

export interface ErrorEntry {
  ply: number;
  move: string;
  classification: MoveClassification;
  bestMove: string | null;
  evalCp: number | null;
  evalMate: number | null;
  pv: string | null;
  prevFen: string;
  prevEvalCp: number | null;
  prevEvalMate: number | null;
  side: 'white' | 'black';
  /** Perda de avaliação na perspectiva do jogador que jogou (centipeões). */
  lossCp: number | null;
}

export function GameReport({ analysis, game, positions, onJumpToPly, onCreateExercise }: GameReportProps) {
  const summary = analysis.summary;
  const userColor = game.user_color;
  const userAccuracy = userColor === 'white' ? summary.accuracyWhite : userColor === 'black' ? summary.accuracyBlack : null;

  const errors = useMemo(() => buildErrorList(analysis.positions, positions), [analysis.positions, positions]);
  const userErrors = errors.filter((e) => e.side === userColor);
  const opponentColor = userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null;
  const opponentErrors = opponentColor ? errors.filter((e) => e.side === opponentColor) : [];

  const maxDepth = useMemo(() => {
    let max = 0;
    for (const p of analysis.positions) if (p.depth > max) max = p.depth;
    return max;
  }, [analysis.positions]);

  const criticalMoments = useMemo(() => findCriticalMoments(analysis.positions), [analysis.positions]);
  const explanations = useMemo(
    () => generateExplanations(analysis.positions, positions),
    [analysis.positions, positions],
  );
  const detailedExplanations = useMemo(
    () => explanations.filter((e) => e.isDetailed),
    [explanations],
  );
  const studyPriorities = useMemo(
    () => buildStudyPriorities(detailedExplanations),
    [detailedExplanations],
  );
  const hasAnalyzed = summary.totalMoves > 0;
  const whiteHasData = summary.accuracyWhite !== null;
  const blackHasData = summary.accuracyBlack !== null;

  return (
    <div className="space-y-4">
      {/* === Resumo da partida === */}
      <div className="card-raised p-5">
        {hasAnalyzed ? (
          <>
            {/* Header: jogadores, resultado, metadados */}
            <div className="flex flex-col gap-3 mb-4 pb-4 border-b border-ink-border">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-content-primary">
                    {game.white_player || 'Brancas'}
                  </span>
                  <span className="text-content-muted text-xs">vs</span>
                  <span className="font-semibold text-content-primary">
                    {game.black_player || 'Pretas'}
                  </span>
                  {game.result && (
                    <span className="text-xs text-content-secondary font-mono ml-1">
                      {game.result}
                    </span>
                  )}
                </div>
                {userColor && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300">
                    Você jogou de {userColor === 'white' ? 'brancas' : 'pretas'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-content-muted flex-wrap">
                {game.played_at && (
                  <span>{formatDate(game.played_at)}</span>
                )}
                {game.time_control && (
                  <>
                    <span>·</span>
                    <span>{game.time_control}</span>
                  </>
                )}
                {game.opening_name && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[180px]">{game.opening_name}</span>
                  </>
                )}
                {game.opening_eco && (
                  <span className="chip text-[10px]">{game.opening_eco}</span>
                )}
              </div>
            </div>

            {/* Precisão por jogador + stats de análise */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <AccuracyBar
                label={game.white_player || 'Brancas'}
                accuracy={summary.accuracyWhite}
                color="bg-success-500"
                icon={<Trophy className="h-3.5 w-3.5 text-success-400" />}
              />
              <AccuracyBar
                label={game.black_player || 'Pretas'}
                accuracy={summary.accuracyBlack}
                color="bg-cyan-500"
                icon={<Shield className="h-3.5 w-3.5 text-cyan-400" />}
              />
            </div>

            {/* Classificação dos lances */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              <ClassificationStat label="Melhores" value={summary.best} cls="best" />
              <ClassificationStat label="Excelentes" value={summary.excellent} cls="excellent" />
              <ClassificationStat label="Bons" value={summary.good} cls="good" />
              <ClassificationStat label="Imprecisões" value={summary.inaccuracies} cls="inaccuracy" />
              <ClassificationStat label="Erros" value={summary.mistakes} cls="mistake" />
              <ClassificationStat label="Erros graves" value={summary.blunders} cls="blunder" />
            </div>

            {/* Stats finais */}
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-ink-border text-xs text-content-muted">
              <span>{summary.totalMoves} lances analisados</span>
              <span>Profundidade máx. {maxDepth > 0 ? `d${maxDepth}` : '—'}</span>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 text-xs text-content-secondary">
            <Info className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />
            <p>
              Nenhum lance analisado nesta partida. Inicie uma análise para ver o resumo,
              classificações e precisão.
            </p>
          </div>
        )}
      </div>

      {/* === Erros e oportunidades === */}
      {hasAnalyzed && errors.length > 0 ? (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning-300" />
            Erros e oportunidades perdidas
          </h3>
          <div className="space-y-2">
            {errors.map((err, i) => (
              <ErrorCard
                key={i}
                error={err}
                onJump={() => onJumpToPly(err.ply)}
                onCreateExercise={onCreateExercise ? () => onCreateExercise(err.ply) : undefined}
              />
            ))}
          </div>
        </div>
      ) : hasAnalyzed ? (
        <div className="card p-5 text-center">
          <Target className="h-8 w-8 text-success-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-content-primary">Nenhum erro significativo detectado</p>
          <p className="text-xs text-content-secondary mt-1">
            A análise não identificou imprecisões, erros ou erros graves nesta partida.
          </p>
        </div>
      ) : null}

      {/* === Entenda sua partida === */}
      {hasAnalyzed && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2 mb-4">
            <BookOpen className="h-4 w-4 text-brand-300" />
            Entenda sua partida
          </h3>
          {explanations.length === 0 ? (
            <p className="text-sm text-content-secondary">Sem lances para explicar nesta partida.</p>
          ) : (
            <>
              {/* Lances com explicação detalhada */}
              {detailedExplanations.length > 0 && (
                <div className="space-y-3 mb-4">
                  {detailedExplanations.map((exp) => (
                    <ExplanationCard
                      key={exp.ply}
                      explanation={exp}
                      onJump={() => onJumpToPly(exp.ply)}
                    />
                  ))}
                </div>
              )}

              {/* Resumo de todos os lances classificados */}
              <div className="border-t border-ink-border pt-3">
                <p className="text-xs font-semibold text-content-secondary mb-2">
                  Todos os lances analisados
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {explanations.map((exp) => {
                    const cls = exp.classification ? classificationLabel(exp.classification) : null;
                    return (
                      <button
                        key={exp.ply}
                        onClick={() => onJumpToPly(exp.ply)}
                        className={`px-2 py-1 rounded-md text-xs font-mono transition-colors hover:bg-ink-raised ${
                          cls ? cls.bg : 'bg-ink-border'
                        }`}
                        title={exp.whatHappened}
                      >
                        <span className="text-content-muted">
                          {Math.ceil(exp.ply / 2)}{exp.ply % 2 ? '...' : '.'}
                        </span>{' '}
                        <span className="text-content-primary">{exp.moveSan}</span>
                        {cls && (
                          <span className={`ml-1 ${cls.color}`}>
                            {cls.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* === Diagnóstico e recomendações === */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2 mb-4">
          <Lightbulb className="h-4 w-4 text-brand-300" />
          Diagnóstico e recomendações
        </h3>

        {hasAnalyzed ? (
          <>
            {criticalMoments.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-content-secondary mb-2">Momentos críticos</p>
                <div className="space-y-1.5">
                  {criticalMoments.map((m, i) => (
                    <button
                      key={i}
                      onClick={() => onJumpToPly(m.ply)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg bg-ink-raised border border-ink-border px-3 py-2 hover:border-brand-500/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Crosshair className="h-3.5 w-3.5 text-brand-300 shrink-0" />
                        <span className="text-xs text-content-primary truncate">{m.description}</span>
                      </div>
                      <span className="text-xs font-mono text-content-muted shrink-0">
                        {formatEval(m.evalCp, m.evalMate)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {userErrors.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-content-secondary mb-2">
                  Seus erros mais relevantes
                </p>
                <div className="space-y-1.5">
                  {userErrors.slice(0, 5).map((e, i) => (
                    <button
                      key={i}
                      onClick={() => onJumpToPly(e.ply)}
                      className="w-full flex items-center gap-2 rounded-lg bg-ink border border-ink-border px-3 py-2 hover:border-brand-500/30 transition-colors text-left"
                    >
                      <span className="text-xs text-content-muted">
                        {Math.ceil(e.ply / 2)}{e.ply % 2 ? '...' : '.'}
                      </span>
                      <span className="text-xs font-mono text-content-primary">{e.move}</span>
                      <span className={`text-[10px] font-semibold ${classificationLabel(e.classification).color}`}>
                        {classificationLabel(e.classification).label}
                      </span>
                      <ChevronRight className="h-3 w-3 text-content-muted ml-auto" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {opponentErrors.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-content-secondary mb-2">
                  Erros do oponente
                </p>
                <div className="space-y-1.5">
                  {opponentErrors.slice(0, 3).map((e, i) => (
                    <button
                      key={i}
                      onClick={() => onJumpToPly(e.ply)}
                      className="w-full flex items-center gap-2 rounded-lg bg-ink border border-ink-border px-3 py-2 hover:border-brand-500/30 transition-colors text-left"
                    >
                      <span className="text-xs text-content-muted">
                        {Math.ceil(e.ply / 2)}{e.ply % 2 ? '...' : '.'}
                      </span>
                      <span className="text-xs font-mono text-content-primary">{e.move}</span>
                      <span className={`text-[10px] font-semibold ${classificationLabel(e.classification).color}`}>
                        {classificationLabel(e.classification).label}
                      </span>
                      <ChevronRight className="h-3 w-3 text-content-muted ml-auto" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {studyPriorities.length > 0 && (
              <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-3">
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 text-brand-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-content-primary mb-1">
                      O que estudar a partir desta partida
                    </p>
                    <ol className="space-y-1.5">
                      {studyPriorities.map((rec, i) => (
                        <li key={i} className="text-xs text-content-secondary leading-relaxed flex items-start gap-1.5">
                          <span className="font-semibold text-brand-300 shrink-0">{i + 1}.</span>
                          {rec}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-content-muted mt-3">
              Observações baseadas nesta partida. Padrões recorrentes só podem ser
              identificados com a análise de múltiplas partidas — estas recomendações
              refletem apenas o que foi observado aqui.
            </p>
          </>
        ) : (
          <p className="text-sm text-content-secondary">Dados insuficientes para diagnóstico.</p>
        )}
      </div>
    </div>
  );
}

// === Helpers (exportados para teste) ===

export function buildErrorList(
  analysisPositions: PositionAnalysis[],
  boardPositions: { fen: string; ply: number }[],
): ErrorEntry[] {
  const errors: ErrorEntry[] = [];

  for (const pos of analysisPositions) {
    if (!pos.classification) continue;
    if (pos.classification === 'best' || pos.classification === 'excellent' || pos.classification === 'good') continue;

    const prevPly = pos.ply - 1;
    const prevPos = analysisPositions.find((p) => p.ply === prevPly);
    const prevBoard = boardPositions.find((p) => p.ply === prevPly);
    const side: 'white' | 'black' = pos.ply % 2 === 1 ? 'white' : 'black';

    // Perda na perspectiva do jogador que jogou (centipeões).
    // Avaliações são da perspectiva das brancas; inverte para pretas.
    const lossCp = computeLossCp(
      { cp: prevPos?.evalCp ?? null, mate: prevPos?.evalMate ?? null },
      { cp: pos.evalCp, mate: pos.evalMate },
      side === 'white' ? 'w' : 'b',
    );

    errors.push({
      ply: pos.ply,
      move: pos.move ?? '?',
      classification: pos.classification,
      bestMove: pos.bestMove,
      evalCp: pos.evalCp,
      evalMate: pos.evalMate,
      pv: pos.pv,
      prevFen: prevBoard?.fen ?? '',
      prevEvalCp: prevPos?.evalCp ?? null,
      prevEvalMate: prevPos?.evalMate ?? null,
      side,
      lossCp,
    });
  }

  errors.sort((a, b) => {
    const sev: Record<MoveClassification, number> = {
      best: 0, excellent: 0, good: 0, inaccuracy: 1, mistake: 2, blunder: 3,
    };
    return sev[b.classification] - sev[a.classification];
  });

  return errors;
}

/** Perda de avaliação na perspectiva do jogador que jogou (centipeões). */
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

export function findCriticalMoments(
  positions: PositionAnalysis[],
): { ply: number; description: string; evalCp: number | null; evalMate: number | null }[] {
  const moments: { ply: number; description: string; evalCp: number | null; evalMate: number | null }[] = [];
  for (const pos of positions) {
    if (!pos.classification) continue;
    if (pos.classification === 'blunder' || pos.classification === 'mistake') {
      const moveNum = Math.ceil(pos.ply / 2);
      const dots = pos.ply % 2 ? '...' : '.';
      moments.push({
        ply: pos.ply,
        description: `Lance ${moveNum}${dots} ${pos.move ?? ''} — ${classificationLabel(pos.classification).label}`,
        evalCp: pos.evalCp,
        evalMate: pos.evalMate,
      });
    }
  }
  return moments.slice(0, 6);
}

export function buildTextSummary(
  game: GameReportProps['game'],
  summary: FullAnalysis['summary'],
  errors: ErrorEntry[],
  userColor: 'white' | 'black' | null,
): string {
  const parts: string[] = [];
  if (game.opening_name) {
    parts.push(`Abertura: ${game.opening_name}${game.opening_eco ? ` (${game.opening_eco})` : ''}.`);
  }
  const userErrCount = errors.filter((e) => e.side === userColor).length;
  if (userColor && userErrCount > 0) {
    parts.push(`Você cometeu ${userErrCount} lance(s) classificado(s) como imprecisão, erro ou erro grave.`);
  } else if (userColor) {
    parts.push('Você não cometeu erros significativos nesta partida.');
  }
  if (summary.blunders > 0) {
    parts.push(`A partida teve ${summary.blunders} erro(s) grave(s) no total.`);
  }
  return parts.join(' ');
}

export function buildRecommendations(
  userErrors: ErrorEntry[],
  _game: GameReportProps['game'],
  _summary: FullAnalysis['summary'],
): string[] {
  const recs: string[] = [];
  const blunders = userErrors.filter((e) => e.classification === 'blunder');
  const mistakes = userErrors.filter((e) => e.classification === 'mistake');
  const inaccuracies = userErrors.filter((e) => e.classification === 'inaccuracy');

  if (blunders.length > 0) {
    recs.push(`${blunders.length} erro(s) grave(s) identificado(s). Revise estas posições para evitar perdas material ou tática significativas.`);
  }
  if (mistakes.length > 0) {
    recs.push(`${mistakes.length} erro(s) de cálculo identificado(s). Verifique se estava calculando 2-3 lances à frente nessas posições.`);
  }
  if (inaccuracies.length > 0) {
    recs.push(`${inaccuracies.length} imprecisão(ões) identificada(s). Avalie se havia um plano posicional melhor nessas posições.`);
  }

  const openingErrors = userErrors.filter((e) => e.ply <= 10);
  if (openingErrors.length > 0) {
    recs.push(`${openingErrors.length} erro(s) na abertura (primeiros 5 lances). Revise princípios de desenvolvimento e controle do centro.`);
  }

  const endgameErrors = userErrors.filter((e) => e.ply >= 40);
  if (endgameErrors.length > 0) {
    recs.push(`${endgameErrors.length} erro(s) em finais de partida. Avalie técnica de finais básicos nestas posições.`);
  }

  // Sem fallback genérico: se não há erros para sustentar uma recomendação,
  // não inventamos uma. A UI já mostra "Nenhum erro significativo detectado".
  return recs;
}

/**
 * Gera até 3 prioridades de estudo baseadas nas explicações detalhadas.
 * Ordena por severidade (blunder > mistake > inaccuracy) e por frequência.
 */
export function buildStudyPriorities(explanations: MoveExplanation[]): string[] {
  if (explanations.length === 0) return [];

  const priorities: string[] = [];
  const blunders = explanations.filter((e) => e.classification === 'blunder');
  const mistakes = explanations.filter((e) => e.classification === 'mistake');
  const inaccuracies = explanations.filter((e) => e.classification === 'inaccuracy');

  // Prioridade 1: erros graves (sempre que houver)
  if (blunders.length > 0) {
    const phases = blunders.map((e) => phaseLabelPt(e.phase));
    const phaseStr = phases[0] ?? 'nesta partida';
    priorities.push(
      `Erros graves (${blunders.length}) detectados em ${phaseStr}. Revise estas posições e verifique se havia capturas ou ameaças táticas não consideradas.`,
    );
  }

  // Prioridade 2: erros (cálculo)
  if (mistakes.length > 0 && priorities.length < 3) {
    priorities.push(
      `Erros de cálculo (${mistakes.length}) identificados. Pratique calcular 2-3 lances de profundidade antes de decidir, verificando capturas e ameaças do oponente.`,
    );
  }

  // Prioridade 3: imprecisões (posicional)
  if (inaccuracies.length > 0 && priorities.length < 3) {
    priorities.push(
      `Imprecisões (${inaccuracies.length}) identificadas. Avalie se havia planos posicionais melhores nestas posições, especialmente desenvolvimento e coordenação de peças.`,
    );
  }

  return priorities.slice(0, 3);
}

function phaseLabelPt(phase: GamePhase): string {
  if (phase === 'opening') return 'abertura';
  if (phase === 'middlegame') return 'meio-jogo';
  return 'final';
}

function ExplanationCard({
  explanation,
  onJump,
}: {
  explanation: MoveExplanation;
  onJump: () => void;
}) {
  const cls = explanation.classification ? classificationLabel(explanation.classification) : null;
  const moveNum = Math.ceil(explanation.ply / 2);
  const dots = explanation.ply % 2 ? '...' : '.';
  const [showPv, setShowPv] = useState(false);

  return (
    <div className={`rounded-xl border p-4 ${cls?.bg ?? 'bg-ink-border'}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-content-muted">{moveNum}{dots}</span>
          <span className="text-sm font-mono font-semibold text-content-primary">{explanation.moveSan}</span>
          {cls && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls.color} ${cls.bg}`}>
              {cls.label}
            </span>
          )}
          <span className="text-[10px] text-content-muted">
            {phaseLabelPt(explanation.phase)}
          </span>
        </div>
        <button onClick={onJump} className="text-xs text-brand-300 hover:text-brand-200 font-medium shrink-0">
          Ver posição
        </button>
      </div>

      {/* O que aconteceu */}
      <p className="text-xs text-content-primary leading-relaxed mb-2">
        {explanation.whatHappened}
      </p>

      {/* Melhor alternativa */}
      {explanation.bestMoveSan && (
        <div className="text-xs text-content-secondary mb-1.5">
          <span className="text-content-muted">Melhor alternativa: </span>
          <span className="font-mono font-semibold text-content-primary">{explanation.bestMoveSan}</span>
        </div>
      )}

      {/* Por que é melhor */}
      {explanation.whyBetter && (
        <p className="text-xs text-content-secondary leading-relaxed mb-2">
          {explanation.whyBetter}
        </p>
      )}

      {/* Como pensar */}
      {explanation.howToThink && (
        <p className="text-xs text-content-secondary leading-relaxed mb-2">
          <span className="text-content-muted font-medium">Como pensar: </span>
          {explanation.howToThink}
        </p>
      )}

      {/* O que estudar */}
      {explanation.whatToStudy && (
        <p className="text-xs text-content-secondary leading-relaxed mb-2">
          <span className="text-content-muted font-medium">O que estudar: </span>
          {explanation.whatToStudy}
        </p>
      )}

      {/* Variante principal expansível */}
      {explanation.pvSan && explanation.pvSan.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowPv((v) => !v)}
            className="text-[11px] text-brand-300 hover:text-brand-200 font-medium flex items-center gap-1"
          >
            {showPv ? 'Ocultar variante' : 'Ver variante principal'}
            <ChevronRight className={`h-3 w-3 transition-transform ${showPv ? 'rotate-90' : ''}`} />
          </button>
          {showPv && (
            <p className="text-xs font-mono text-content-secondary mt-1.5 leading-relaxed bg-ink/40 rounded p-2">
              {explanation.pvSan.join(' ')}
            </p>
          )}
        </div>
      )}

      {/* Limitação sinalizada */}
      {!explanation.bestMoveSan && (
        <p className="text-[10px] text-content-muted italic mt-1">
          A análise não identificou uma alternativa melhor para esta posição.
        </p>
      )}
    </div>
  );
}

function uciToSanSafe(fen: string, uci: string | null): string {
  if (!uci) return '—';
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return move.san;
  } catch {
    try {
      const chess = new Chess(fen);
      const move = chess.move(uci);
      return move.san;
    } catch {
      return uci;
    }
  }
}

// === Sub-components ===

function ClassificationStat({ label, value, cls }: { label: string; value: number; cls: MoveClassification }) {
  const c = classificationLabel(cls);
  return (
    <div className="text-center">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${c.bg} mb-1`}>
        <span className={`text-lg font-bold ${c.color}`}>{value}</span>
      </div>
      <p className="text-[10px] text-content-secondary">{label}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function AccuracyBar({
  label,
  accuracy,
  color,
  icon,
}: {
  label: string;
  accuracy: number | null;
  color: string;
  icon?: React.ReactNode;
}) {
  const pct = accuracy ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-content-secondary">
          {icon}
          {label}
        </span>
        <span className="font-semibold text-content-primary">
          {accuracy !== null ? `${accuracy}%` : 'Dados insuficientes'}
        </span>
      </div>
      <div className="h-2 bg-ink-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ErrorCard({
  error,
  onJump,
  onCreateExercise,
}: {
  error: ErrorEntry;
  onJump: () => void;
  onCreateExercise?: () => void;
}) {
  const cls = classificationLabel(error.classification);
  const moveNum = Math.ceil(error.ply / 2);
  const dots = error.ply % 2 ? '...' : '.';
  const bestSan = error.prevFen ? uciToSanSafe(error.prevFen, error.bestMove) : null;
  const prevEvalStr = formatEval(error.prevEvalCp, error.prevEvalMate);
  const afterEvalStr = formatEval(error.evalCp, error.evalMate);
  const sideLabel = error.side === 'white' ? 'Brancas' : 'Pretas';
  const lossStr = error.lossCp !== null ? `${(error.lossCp / 100).toFixed(2)}` : null;
  const [showPv, setShowPv] = useState(false);

  const pvSan = useMemo(() => {
    if (!error.pv || !error.prevFen) return null;
    return pvToSan(error.prevFen, error.pv, 8);
  }, [error.pv, error.prevFen]);

  return (
    <div className={`rounded-xl border p-3 ${cls.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-content-muted">{moveNum}{dots}</span>
          <span className="text-sm font-mono font-semibold text-content-primary">{error.move}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls.color} ${cls.bg}`}>
            {cls.label}
          </span>
          <span className="text-xs text-content-muted">·</span>
          <span className="text-xs text-content-secondary">{sideLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onJump} className="text-xs text-brand-300 hover:text-brand-200 font-medium">
            Ver posição
          </button>
          {onCreateExercise && (
            <button onClick={onCreateExercise} className="text-xs text-content-muted hover:text-brand-300 font-medium">
              Exercício
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
        <div>
          <span className="text-content-muted">Melhor lance</span>
          <p className="font-mono font-semibold text-content-primary">
            {bestSan ?? <span className="text-content-muted font-sans">Indisponível</span>}
          </p>
        </div>
        <div>
          <span className="text-content-muted">Aval. antes</span>
          <p className="font-mono text-content-primary">{prevEvalStr}</p>
        </div>
        <div>
          <span className="text-content-muted">Aval. depois</span>
          <p className="font-mono text-content-primary">{afterEvalStr}</p>
        </div>
        <div>
          <span className="text-content-muted">Perda estimada</span>
          <p className="font-mono text-content-primary">
            {lossStr !== null ? `${lossStr} peões` : <span className="text-content-muted font-sans">Indisponível</span>}
          </p>
        </div>
      </div>
      {pvSan && pvSan.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowPv((v) => !v)}
            className="text-[11px] text-brand-300 hover:text-brand-200 font-medium flex items-center gap-1"
          >
            {showPv ? 'Ocultar variante' : 'Ver variante principal'}
            <ChevronRight className={`h-3 w-3 transition-transform ${showPv ? 'rotate-90' : ''}`} />
          </button>
          {showPv && (
            <p className="text-xs font-mono text-content-secondary mt-1.5 leading-relaxed bg-ink/40 rounded p-2">
              {pvSan.join(' ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Converte uma variante UCI em notação SAN legível, jogando a partir de `fen`. */
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
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
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
    return san;
  } catch {
    return null;
  }
}
