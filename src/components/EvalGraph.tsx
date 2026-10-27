import { useMemo } from 'react';
import type { PositionAnalysis } from '@/lib/analysis';

interface EvalGraphProps {
  positions: PositionAnalysis[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  totalPlies: number;
}

const GRAPH_HEIGHT = 120;
const MAX_CP = 1000;

/**
 * Convenção: avaliações da perspectiva das brancas (evalCp > 0 = brancas vantajosas).
 * - y=0 (topo) = brancas vencendo (mate positivo ou +MAX_CP)
 * - y=GRAPH_HEIGHT (base) = pretas vencendo
 * - y=meio = equilíbrio
 */
function evalToY(evalCp: number | null, evalMate: number | null): number {
  if (evalMate !== null) return evalMate > 0 ? 0 : GRAPH_HEIGHT;
  const cp = evalCp ?? 0;
  const clamped = Math.max(-MAX_CP, Math.min(MAX_CP, cp));
  return GRAPH_HEIGHT / 2 - (clamped / MAX_CP) * (GRAPH_HEIGHT / 2);
}

export function EvalGraph({ positions, currentPly, onSelectPly, totalPlies }: EvalGraphProps) {
  const points = useMemo(() => {
    const pts: {
      ply: number;
      x: number;
      y: number;
      evalCp: number | null;
      evalMate: number | null;
      classification: PositionAnalysis['classification'];
    }[] = [];
    const step = totalPlies > 0 ? 100 / totalPlies : 0;

    for (const pos of positions) {
      const analyzed = (pos.evalCp !== null || pos.evalMate !== null) && pos.depth > 0;
      if (!analyzed) continue;
      pts.push({
        ply: pos.ply,
        x: pos.ply * step,
        y: evalToY(pos.evalCp, pos.evalMate),
        evalCp: pos.evalCp,
        evalMate: pos.evalMate,
        classification: pos.classification,
      });
    }
    return pts;
  }, [positions, totalPlies]);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const start = points[0];
    const end = points[points.length - 1];
    const mid = GRAPH_HEIGHT / 2;
    const line = points.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    return `M ${start.x.toFixed(2)} ${mid} ${line} L ${end.x.toFixed(2)} ${mid} Z`;
  }, [points]);

  const errorPoints = useMemo(
    () =>
      points.filter(
        (p) =>
          p.classification === 'blunder' ||
          p.classification === 'mistake' ||
          p.classification === 'inaccuracy',
      ),
    [points],
  );

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-content-secondary">Gráfico de avaliação</h3>
        <div className="flex items-center gap-3 text-[10px] text-content-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-success-500" />
            Brancas
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-danger-500" />
            Pretas
          </span>
        </div>
      </div>
      {points.length === 0 ? (
        <p className="text-xs text-content-muted text-center py-8">
          Sem avaliações disponíveis. Inicie uma análise para ver o gráfico.
        </p>
      ) : (
        <svg
          viewBox={`0 0 100 ${GRAPH_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${GRAPH_HEIGHT}px` }}
        >
          <defs>
            <linearGradient id="evalArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity="0.18" />
              <stop offset="50%" stopColor="rgb(100 100 110)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          {/* Zero line — equilíbrio */}
          <line
            x1="0"
            y1={GRAPH_HEIGHT / 2}
            x2="100"
            y2={GRAPH_HEIGHT / 2}
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.5 1.5"
            className="text-content-muted"
          />

          {areaD && <path d={areaD} fill="url(#evalArea)" />}

          {/* Continuous line — neutral color */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="rgb(148 163 184)"
              strokeWidth="0.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Discrete error markers */}
          {errorPoints.map((p) => (
            <circle
              key={`err-${p.ply}`}
              cx={p.x}
              cy={p.y}
              r={1.0}
              fill="none"
              stroke={
                p.classification === 'blunder'
                  ? 'rgb(239 68 68)'
                  : p.classification === 'mistake'
                    ? 'rgb(249 115 22)'
                    : 'rgb(234 179 8)'
              }
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Clickable points */}
          {points.map((p) => {
            const isCurrent = p.ply === currentPly;
            return (
              <circle
                key={p.ply}
                cx={p.x}
                cy={p.y}
                r={isCurrent ? 1.6 : 0.5}
                fill={isCurrent ? 'rgb(34 211 238)' : 'rgb(148 163 184)'}
                stroke={isCurrent ? 'rgb(255 255 255)' : 'none'}
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer"
                onClick={() => onSelectPly(p.ply)}
              >
                <title>{`Ply ${p.ply}: ${formatEvalLocal(p.evalCp, p.evalMate)}`}</title>
              </circle>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function formatEvalLocal(evalCp: number | null, evalMate: number | null): string {
  if (evalMate !== null) return `${evalMate > 0 ? '+' : '-'}M${Math.abs(evalMate)}`;
  if (evalCp === null) return '—';
  const pawns = evalCp / 100;
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}
