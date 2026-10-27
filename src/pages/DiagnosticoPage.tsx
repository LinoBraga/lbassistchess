import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  Target,
  TrendingDown,
  Lightbulb,
  Info,
  ChevronRight,
} from 'lucide-react';
import { useDiagnosis } from '@/hooks/useDiagnosis';
import { Button } from '@/components/ui/Button';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';
import { Chessboard } from '@/components/Chessboard';
import { formatEval, classificationLabel } from '@/lib/analysis';
import { TREND_LABELS, type CategoryDiagnosis } from '@/lib/diagnosis';

export function DiagnosticoPage() {
  const { diagnosis, loading, computing, error, computeDiagnosis } = useDiagnosis();

  if (loading) return <LoadingState label="Carregando diagnóstico…" />;
  if (error && !diagnosis) return <ErrorState message={error} onRetry={computeDiagnosis} />;

  const hasData = diagnosis && diagnosis.gamesAnalyzed > 0;
  const hasCategories = diagnosis && diagnosis.categories.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Diagnóstico de fraquezas</h1>
          <p className="text-sm text-content-secondary mt-1">
            {hasData
              ? `${diagnosis!.gamesAnalyzed} partida(s) analisada(s) · ${diagnosis!.categories.length} categoria(s) identificada(s)`
              : 'Analise suas partidas para identificar padrões de erro'}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={computeDiagnosis}
          loading={computing}
          icon={<RefreshCw className="h-4 w-4" />}
        >
          {hasData ? 'Recalcular diagnóstico' : 'Gerar diagnóstico'}
        </Button>
      </div>

      {/* Stats overview */}
      {hasData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Partidas analisadas" value={diagnosis!.gamesAnalyzed} icon={Target} color="text-brand-300" />
          <StatCard label="Erros graves" value={diagnosis!.totalBlunders} icon={AlertTriangle} color="text-danger-400" />
          <StatCard label="Erros" value={diagnosis!.totalMistakes} icon={TrendingDown} color="text-orange-400" />
          <StatCard label="Imprecisões" value={diagnosis!.totalInaccuracies} icon={Info} color="text-warning-300" />
        </div>
      )}

      {/* Insufficient data */}
      {(!hasData || (!hasCategories && !computing)) && (
        <EmptyState
          icon={<Brain className="h-8 w-8" />}
          title={hasData ? 'Nenhuma categoria de fraqueza identificada' : 'Sem dados para diagnóstico'}
          description={
            hasData
              ? 'Você não cometeu erros suficientes para identificar padrões. Continue jogando e analisando partidas.'
              : 'Para gerar um diagnóstico personalizado, importe e analise partidas com o Stockfish. O diagnóstico usa dados reais das suas análises — não inventa fraquezas.'
          }
          action={
            <Link to="/app/analises">
              <Button variant="primary" icon={<ChevronRight className="h-4 w-4" />}>
                Ir para análises
              </Button>
            </Link>
          }
        />
      )}

      {/* Category cards */}
      {hasCategories && (
        <div className="space-y-3">
          {diagnosis!.categories.map((cat, i) => (
            <CategoryCard key={`${cat.category}-${i}`} category={cat} />
          ))}
        </div>
      )}

      {/* Honest disclaimer */}
      {hasCategories && (
        <div className="card p-5 flex items-start gap-3">
          <Info className="h-5 w-5 text-content-muted shrink-0 mt-0.5" />
          <p className="text-xs text-content-secondary leading-relaxed">
            O diagnóstico é baseado em quedas de avaliação reais do Stockfish nas suas partidas.
            Uma queda de avaliação indica que um erro foi cometido, mas não prova a causa exata.
            As categorias são atribuições baseadas na fase da partida e na magnitude do erro,
            não em análise cognitiva. Use como guia, não como verdade absoluta.
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryDiagnosis }) {
  const trendInfo = TREND_LABELS[category.trend] ?? TREND_LABELS.insuficiente;
  const confidenceColors: Record<string, string> = {
    alta: 'text-success-400 bg-success-500/10',
    media: 'text-warning-300 bg-warning-500/10',
    baixa: 'text-content-muted bg-ink-raised',
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-content-primary">{category.categoryLabel}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`chip text-xs ${confidenceColors[category.confidence]}`}>
              {category.confidenceLabel}
            </span>
            <span className="text-xs text-content-muted">
              Tendência: <span className={trendInfo.color}>{trendInfo.label}</span>
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-content-primary">{category.occurrences}</p>
          <p className="text-xs text-content-muted">ocorrências</p>
        </div>
      </div>

      {/* Recommendation */}
      <div className="rounded-xl bg-ink-raised border border-ink-border p-3 flex items-start gap-2">
        <Lightbulb className="h-4 w-4 text-warning-300 shrink-0 mt-0.5" />
        <p className="text-xs text-content-secondary leading-relaxed">{category.recommendation}</p>
      </div>

      {/* Example positions */}
      {category.examplePositions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-content-secondary mb-2">Exemplos das suas partidas:</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {category.examplePositions.map((ex, i) => {
              const cls = classificationLabel(ex.classification as never);
              return (
                <Link key={i} to={`/app/analises/${ex.gameId}`} className="block group">
                  <div className="rounded-xl overflow-hidden border border-ink-border group-hover:border-brand-500/40 transition-colors">
                    <Chessboard fen={ex.fen} size={160} />
                    <div className="p-2 bg-ink-raised">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-content-primary">
                          {formatEval(ex.evalCp, ex.evalMate)}
                        </span>
                        <span className={`text-[10px] font-semibold ${cls.color}`}>{cls.label}</span>
                      </div>
                      <p className="text-[10px] text-content-muted mt-1">Lance {Math.ceil(ex.ply / 2)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Target;
  color: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
