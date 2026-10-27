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

function evalToY(evalCp: number | null, evalMate: number | null): number {
  if (evalMate !== null) return evalMate > 0 ? 0 : GRAPH_HEIGHT;
  const cp = evalCp ?? 0;
  const clamped = Math.max(-MAX_CP, Math.min(MAX_CP, cp));
  return GRAPH_HEIGHT / 2 - (clamped / MAX_CP) * (GRAPH_HEIGHT / 2);
}

export function EvalGraph({ positions, currentPly, onSelectPly, totalPlies }: EvalGraphProps) {
  const points = useMemo(() => {
    const pts: { ply: number; x: number; y: number; evalCp: number | null; evalMate: number | null }[] = [];
    const step = totalPlies > 0 ? 100 / totalPlies : 0;

    for (const pos of positions) {
      pts.push({
        ply: pos.ply,
        x: pos.ply * step,
        y: evalToY(pos.evalCp, pos.evalMate),
        evalCp: pos.evalCp,
        evalMate: pos.evalMate,
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
    const top = `M 0 ${GRAPH_HEIGHT / 2} `;
    const line = points
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    return `${top} ${line} L ${(points[points.length - 1]?.x ?? 0).toFixed(2)} ${GRAPH_HEIGHT / 2} Z`;
  }, [points]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-content-secondary">Gráfico de avaliação</h3>
        <div className="flex items-center gap-2 text-[10px] text-content-muted">
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
      <svg
        viewBox={`0 0 100 ${GRAPH_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${GRAPH_HEIGHT}px` }}
      >
        <defs>
          <linearGradient id="evalArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity="0.15" />
            <stop offset="50%" stopColor="rgb(100 100 110)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <line
          x1="0" y1={GRAPH_HEIGHT / 2} x2="100" y2={GRAPH_HEIGHT / 2}
          stroke="currentColor" strokeWidth="0.3" className="text-ink-border"
        />
        {areaD && <path d={areaD} fill="url(#evalArea)" />}
        {pathD && (
          <path d={pathD} fill="none" stroke="rgb(168 85 247)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        )}
        {points.map((p) => {
          const isCurrent = p.ply === currentPly;
          const isError = positions.find((pos) => pos.ply === p.ply)?.classification;
          const dotColor = isError === 'blunder' ? 'rgb(239 68 68)'
            : isError === 'mistake' ? 'rgb(249 115 22)'
            : isError === 'inaccuracy' ? 'rgb(234 179 8)'
            : 'rgb(168 85 247)';
          return (
            <circle
              key={p.ply}
              cx={p.x}
              cy={p.y}
              r={isCurrent ? 1.2 : 0.6}
              fill={isCurrent ? 'rgb(34 211 238)' : dotColor}
              stroke={isCurrent ? 'rgb(255 255 255)' : 'none'}
              strokeWidth="0.3"
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onClick={() => onSelectPly(p.ply)}
            />
          );
        })}
      </svg>
    </div>
  );
}
