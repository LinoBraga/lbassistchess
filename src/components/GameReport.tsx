import { useMemo } from 'react';
import {
  TrendingUp,
  Target,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  BarChart3,
  Crosshair,
  BookOpen,
} from 'lucide-react';
import { Chess } from 'chess.js';
import {
  formatEval,
  classificationLabel,
  type PositionAnalysis,
  type FullAnalysis,
  type MoveClassification,
} from '@/lib/analysis';
import { Button } from '@/components/ui/Button';

interface GameReportProps {
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

interface ErrorEntry {
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
    for (const p of analysis.positions) {
      if (p.depth > max) max = p.depth;
    }
    return max;
  }, [analysis.positions]);

  const criticalMoments = useMemo(() => findCriticalMoments(analysis.positions), [analysis.positions]);

  return (
    <div className="space-y-4">
      {/* === A. Resumo === */}
      <div className="card-raised p-5">
        <h2 className="text-base font-bold text-content-primary flex items-center gap-2 mb-3">
          <TrendingUp className="h-4.5 w-4.5 text-brand-300" />
          Resumo da partida
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ReportStat label="Lances analisados" value={summary.totalMoves} />
          <ReportStat label="Profundidade máx." value={maxDepth > 0 ? `d${maxDepth}` : '—'} />
          <ReportStat
            label="Sua precisão"
            value={userAccuracy !== null ? `${userAccuracy}%` : '—'}
            color="text-brand-300"
          />
          <ReportStat
            label="Total de erros"
            value={summary.inaccuracies + summary.mistakes + summary.blunders}
            color="text-warning-300"
          />
        </div>
        <p className="text-xs text-content-secondary mt-3 leading-relaxed">
          {buildTextSummary(game, summary, errors, userColor)}
        </p>
      </div>

      {/* === D. Estatísticas e precisão === */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-brand-300" />
          Classificação dos lances
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <ClassificationStat label="Melhores" value={summary.best} cls="best" />
          <ClassificationStat label="Excelentes" value={summary.excellent} cls="excellent" />
          <ClassificationStat label="Bons" value={summary.good} cls="good" />
          <ClassificationStat label="Imprecisões" value={summary.inaccuracies} cls="inaccuracy" />
          <ClassificationStat label="Erros" value={summary.mistakes} cls="mistake" />
          <ClassificationStat label="Erros graves" value={summary.blunders} cls="blunder" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <AccuracyBar
            label={game.white_player || 'Brancas'}
            accuracy={summary.accuracyWhite}
            color="bg-success-500"
          />
          <AccuracyBar
            label={game.black_player || 'Pretas'}
            accuracy={summary.accuracyBlack}
            color="bg-cyan-500"
          />
        </div>
        <p className="text-xs text-content-muted mt-3">
          Precisão estimada pelo LB Assist Chess (não é a métrica oficial do Chess.com ou Lichess).
        </p>
      </div>

      {/* === E. Explicação dos erros === */}
      {errors.length > 0 ? (
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
      ) : (
        summary.totalMoves > 0 && (
          <div className="card p-5 text-center">
            <Target className="h-8 w-8 text-success-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-content-primary">Nenhum erro significativo detectado</p>
            <p className="text-xs text-content-secondary mt-1">
              A análise não identificou imprecisões, erros ou erros graves nesta partida.
            </p>
          </div>
        )
      )}

      {/* === F. Diagnóstico e recomendações === */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2 mb-4">
          <Lightbulb className="h-4 w-4 text-brand-300" />
          Diagnóstico e recomendações
        </h3>

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
            <p className="text-xs font-semibold text-content-secondary mb-2">Seus erros mais relevantes</p>
            <div className="space-y-1.5">
              {userErrors.slice(0, 5).map((e, i) => (
                <button
                  key={i}
                  onClick={() => onJumpToPly(e.ply)}
                  className="w-full flex items-center gap-2 rounded-lg bg-ink border border-ink-border px-3 py-2 hover:border-brand-500/30 transition-colors text-left"
                >
                  <span className="text-xs text-content-muted">{Math.ceil(e.ply / 2)}{e.ply % 2 ? '...' : '.'}</span>
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

        <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 p-3">
          <div className="flex items-start gap-2">
            <BookOpen className="h-4 w-4 text-brand-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-content-primary mb-1">Recomendações de estudo</p>
              <ul className="space-y-1">
                {buildRecommendations(userErrors, game, summary).map((rec, i) => (
                  <li key={i} className="text-xs text-content-secondary leading-relaxed flex items-start gap-1.5">
                    <span className="text-brand-300 shrink-0">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="text-xs text-content-muted mt-3">
          Diagnóstico baseado nesta partida. Padrões recorrentes requerem análise de múltiplas partidas.
        </p>
      </div>
    </div>
  );
}

// === Helpers ===

function buildErrorList(
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
      side: pos.ply % 2 === 1 ? 'white' : 'black',
    });
  }

  errors.sort((a, b) => {
    const sev = { blunder: 3, mistake: 2, inaccuracy: 1 };
    return (sev[b.classification] ?? 0) - (sev[a.classification] ?? 0);
  });

  return errors;
}

function findCriticalMoments(positions: PositionAnalysis[]): { ply: number; description: string; evalCp: number | null; evalMate: number | null }[] {
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

function buildTextSummary(
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

function buildRecommendations(
  userErrors: ErrorEntry[],
  game: GameReportProps['game'],
  summary: FullAnalysis['summary'],
): string[] {
  const recs: string[] = [];

  const blunders = userErrors.filter((e) => e.classification === 'blunder');
  const mistakes = userErrors.filter((e) => e.classification === 'mistake');
  const inaccuracies = userErrors.filter((e) => e.classification === 'inaccuracy');

  if (blunders.length > 0) {
    recs.push(`Você cometeu ${blunders.length} erro(s) grave(s). Revise estas posições e pratique táticas para evitar perdas materiais.`);
  }
  if (mistakes.length > 0) {
    recs.push(`${mistakes.length} erro(s) de cálculo identificados. Tente visualizar 2-3 lances à frente antes de decidir.`);
  }
  if (inaccuracies.length > 0) {
    recs.push(`${inaccuracies.length} imprecisão(ões). Considere revisar princípios posicionais e planos de melhoria de peças.`);
  }

  const openingErrors = userErrors.filter((e) => e.ply <= 10);
  if (openingErrors.length > 0) {
    recs.push('Erros na abertura detectados. Estude princípios de desenvolvimento e controle do centro.');
  }

  const endgameErrors = userErrors.filter((e) => e.ply >= 40);
  if (endgameErrors.length > 0) {
    recs.push('Erros em finais de partida. Pratique técnica de finais básicos.');
  }

  if (recs.length === 0) {
    recs.push('Nenhum erro significativo identificado. Continue praticando para manter a consistência.');
  }

  return recs;
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

function ReportStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color || 'text-content-primary'}`}>{value}</p>
      <p className="text-xs text-content-secondary mt-0.5">{label}</p>
    </div>
  );
}

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

function AccuracyBar({ label, accuracy, color }: { label: string; accuracy: number | null; color: string }) {
  const pct = accuracy ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-content-secondary">{label}</span>
        <span className="font-semibold text-content-primary">
          {accuracy !== null ? `${accuracy}%` : 'Dados insuficientes'}
        </span>
      </div>
      <div className="h-2 bg-ink-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
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
  const bestSan = error.prevFen ? uciToSanSafe(error.prevFen, error.bestMove) : '—';
  const prevEvalStr = formatEval(error.prevEvalCp, error.prevEvalMate);
  const afterEvalStr = formatEval(error.evalCp, error.evalMate);
  const sideLabel = error.side === 'white' ? 'Brancas' : 'Pretas';

  let explanation = '';
  if (error.classification === 'blunder') {
    explanation = `Este lance causou uma perda significativa de avaliação (${prevEvalStr} → ${afterEvalStr}).`;
  } else if (error.classification === 'mistake') {
    explanation = `Este lance resultou em uma perda notável de avaliação (${prevEvalStr} → ${afterEvalStr}).`;
  } else {
    explanation = `Este lance causou uma pequena perda de avaliação (${prevEvalStr} → ${afterEvalStr}).`;
  }

  if (error.pv) {
    const pvMoves = error.pv.split(' ').slice(0, 6).join(' ');
    explanation += ` Variante principal do Stockfish: ${pvMoves}.`;
  }

  return (
    <div className={`rounded-xl border p-3 ${cls.bg} border-opacity-30`} style={{ borderColor: 'currentColor' }}>
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
          <button
            onClick={onJump}
            className="text-xs text-brand-300 hover:text-brand-200 font-medium"
          >
            Ver posição
          </button>
          {onCreateExercise && (
            <button
              onClick={onCreateExercise}
              className="text-xs text-content-muted hover:text-brand-300 font-medium"
            >
              Exercício
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
        <div>
          <span className="text-content-muted">Melhor lance: </span>
          <span className="font-mono font-semibold text-content-primary">{bestSan}</span>
        </div>
        <div>
          <span className="text-content-muted">Aval. antes: </span>
          <span className="font-mono text-content-primary">{prevEvalStr}</span>
        </div>
        <div>
          <span className="text-content-muted">Aval. depois: </span>
          <span className="font-mono text-content-primary">{afterEvalStr}</span>
        </div>
      </div>
      <p className="text-xs text-content-secondary mt-2 leading-relaxed">{explanation}</p>
    </div>
  );
}
