import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Calendar,
  Info,
  Trash2,
  Play,
  Square,
  RefreshCw,
  Cpu,
  AlertTriangle,
  XCircle,
  Target,
  Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Chessboard } from '@/components/Chessboard';
import { GameReport } from '@/components/GameReport';
import { EvalGraph } from '@/components/EvalGraph';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { useGameAnalysis } from '@/hooks/useGameAnalysis';
import { formatGameDate, formatResult, extractGameMoves } from '@/lib/pgn';
import {
  formatEval,
  evalBarColor,
  classificationLabel,
  type PositionAnalysis,
} from '@/lib/analysis';

interface GameDetail {
  id: string;
  source: string;
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

export function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPly, setCurrentPly] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [depth, setDepth] = useState(15);

  const { state: analysisState, startAnalysis, cancelAnalysis, resumeAnalysis } =
    useGameAnalysis(gameId);

  const positions = useMemo(() => {
    if (!game?.pgn) return [];
    try {
      return extractGameMoves(game.pgn).positions;
    } catch {
      return [];
    }
  }, [game?.pgn]);

  const movePairs = useMemo(() => {
    if (!game?.pgn) return [];
    try {
      const { moves } = extractGameMoves(game.pgn);
      const pairs: { num: number; white: string; black: string | null }[] = [];
      for (let i = 0; i < moves.length; i += 2) {
        pairs.push({
          num: i / 2 + 1,
          white: moves[i],
          black: moves[i + 1] ?? null,
        });
      }
      return pairs;
    } catch {
      return [];
    }
  }, [game?.pgn]);

  useEffect(() => {
    if (!gameId || !profile?.id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) {
        setError(error.message);
      } else if (!data) {
        setError('Partida não encontrada.');
      } else {
        setGame(data as GameDetail);
      }
      setLoading(false);
    })();
  }, [gameId, profile?.id]);

  const goToPly = useCallback(
    (ply: number) => {
      setCurrentPly(Math.max(0, Math.min(ply, positions.length - 1)));
    },
    [positions.length],
  );

  const handleDelete = async () => {
    if (!gameId) return;
    setDeleting(true);
    const { error } = await supabase.from('games').delete().eq('id', gameId);
    setDeleting(false);
    if (error) {
      toast('error', 'Não foi possível remover a partida.');
      return;
    }
    toast('success', 'Partida removida.');
    navigate('/app/analises');
  };

  const handleStartAnalysis = () => {
    if (!game?.pgn) return;
    startAnalysis(game.pgn, { depth, movetime: 1000, multiPv: 1 });
  };

  const handleResumeAnalysis = () => {
    if (!game?.pgn) return;
    resumeAnalysis(game.pgn, { depth, movetime: 1000, multiPv: 1 });
  };

  if (loading) return <LoadingState label="Carregando partida…" />;
  if (error) return <ErrorState message={error} onRetry={() => navigate('/app/analises')} />;
  if (!game) return <ErrorState message="Partida não encontrada." />;

  const result = formatResult(game.result, game.user_color);
  const sourceLabel = { pgn: 'PGN', chesscom: 'Chess.com', lichess: 'Lichess' }[game.source];
  const currentFen = positions[currentPly]?.fen ?? positions[0]?.fen;
  const totalMoves = positions.length - 1;

  // Dados de análise para a posição atual
  const currentAnalysis: PositionAnalysis | null =
    analysisState.analysis?.positions?.find((p) => p.ply === currentPly) ?? null;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/app/analises" className="inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary">
        <ArrowLeft className="h-4 w-4" />
        Voltar para partidas
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-content-primary">
            {game.white_player || 'Brancas'} <span className="text-content-muted font-normal">vs</span> {game.black_player || 'Pretas'}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-content-secondary flex-wrap">
            <span className={result.color}>{result.label}</span>
            <span className="text-content-muted">·</span>
            <span>{sourceLabel}</span>
            {game.opening_name && (
              <>
                <span className="text-content-muted">·</span>
                <span className="truncate max-w-[200px]">{game.opening_name}</span>
              </>
            )}
            {game.opening_eco && <span className="chip text-xs">{game.opening_eco}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
            Remover
          </Button>
        </div>
      </div>

      {/* Board + analysis side panel */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        {/* Board side */}
        <div className="space-y-3">
          <div className="flex justify-center">
            <Chessboard fen={currentFen} size={500} />
          </div>

          {/* Eval bar + last move */}
          {currentAnalysis && (
            <div className="card p-3 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-8 rounded-full overflow-hidden bg-ink-border flex-shrink-0">
                  <div
                    className={`w-full transition-all ${evalBarColor(currentAnalysis.evalCp, currentAnalysis.evalMate)}`}
                    style={{
                      height: `${evalBarPercent(currentAnalysis.evalCp, currentAnalysis.evalMate)}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono font-semibold text-content-primary">
                  {formatEval(currentAnalysis.evalCp, currentAnalysis.evalMate)}
                </span>
              </div>
              <div className="flex-1" />
              {currentAnalysis.classification && (
                <ClassificationBadge cls={currentAnalysis.classification} />
              )}
              {currentAnalysis.bestMove && (
                <div className="text-xs text-content-secondary flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Melhor: <span className="font-mono font-semibold text-content-primary">{currentAnalysis.bestMove}</span>
                </div>
              )}
              <span className="text-xs text-content-muted">
                d{currentAnalysis.depth}
              </span>
            </div>
          )}

          {/* Navigation */}
          <div className="card p-3 flex items-center justify-center gap-2">
            <NavBtn onClick={() => goToPly(0)} disabled={currentPly === 0} label="Início">
              <ChevronsLeft className="h-4 w-4" />
            </NavBtn>
            <NavBtn onClick={() => goToPly(currentPly - 1)} disabled={currentPly === 0} label="Lance anterior">
              <ChevronLeft className="h-4 w-4" />
            </NavBtn>
            <div className="px-4 py-1.5 text-sm font-medium text-content-primary min-w-[80px] text-center">
              {currentPly === 0 ? 'Início' : `Lance ${Math.ceil(currentPly / 2)}${currentPly % 2 ? '...' : '.'}`}
            </div>
            <NavBtn onClick={() => goToPly(currentPly + 1)} disabled={currentPly >= totalMoves} label="Próximo lance">
              <ChevronRight className="h-4 w-4" />
            </NavBtn>
            <NavBtn onClick={() => goToPly(totalMoves)} disabled={currentPly >= totalMoves} label="Fim">
              <ChevronsRight className="h-4 w-4" />
            </NavBtn>
          </div>
        </div>

        {/* Analysis panel */}
        <div className="space-y-4">
          <AnalysisPanel
            analysisState={analysisState}
            onStart={handleStartAnalysis}
            onCancel={cancelAnalysis}
            onResume={handleResumeAnalysis}
            onSettings={() => setShowSettings(true)}
            depth={depth}
            hasGame={!!game}
          />

          {/* Move list with analysis */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-content-primary mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-brand-300" />
              Lances da partida
            </h2>
            {movePairs.length === 0 ? (
              <p className="text-sm text-content-secondary py-4 text-center">
                Nenhum lance encontrado no PGN.
              </p>
            ) : (
              <div className="max-h-[440px] overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {movePairs.map((pair) => {
                      const whitePly = (pair.num - 1) * 2 + 1;
                      const blackPly = whitePly + 1;
                      const whiteAnalysis = analysisState.analysis?.positions?.find((p) => p.ply === whitePly);
                      const blackAnalysis = analysisState.analysis?.positions?.find((p) => p.ply === blackPly);
                      return (
                        <tr key={pair.num} className="border-b border-ink-border last:border-0">
                          <td className="py-2 px-2 text-content-muted text-xs w-8">{pair.num}.</td>
                          <td className="py-2 px-1">
                            <MoveButton
                              move={pair.white}
                              active={currentPly === whitePly}
                              onClick={() => goToPly(whitePly)}
                              classification={whiteAnalysis?.classification}
                            />
                          </td>
                          <td className="py-2 px-1">
                            {pair.black && (
                              <MoveButton
                                move={pair.black}
                                active={currentPly === blackPly}
                                onClick={() => goToPly(blackPly)}
                                classification={blackAnalysis?.classification}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Analysis summary (relatório integrado) */}
      {analysisState.status === 'concluida' && analysisState.analysis && game && (
        <>
          <EvalGraph
            positions={analysisState.analysis.positions}
            currentPly={currentPly}
            onSelectPly={goToPly}
            totalPlies={positions.length - 1}
          />
          <GameReport
            analysis={analysisState.analysis}
            game={game}
            positions={positions}
            onJumpToPly={goToPly}
            onCreateExercise={(ply) => toast('info', `Criar exercício a partir do lance ${Math.ceil(ply / 2)}${ply % 2 ? '...' : '.'} — em breve.`)}
          />
        </>
      )}

      {/* Metadata */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetaCard icon={Calendar} label="Data" value={formatGameDate(game.played_at)} />
        <MetaCard icon={Clock} label="Controle de tempo" value={game.time_control || 'Não informado'} />
        <MetaCard icon={Info} label="Resultado" value={result.label} valueColor={result.color} />
        <MetaCard icon={Info} label="Cor jogada" value={game.user_color === 'white' ? 'Brancas' : game.user_color === 'black' ? 'Pretas' : 'Não identificada'} />
      </div>

      {/* Stockfish license notice */}
      <div className="card p-4 flex items-start gap-3">
        <Cpu className="h-5 w-5 text-content-muted shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-content-secondary leading-relaxed">
            Análise executada localmente no seu navegador pelo <strong className="text-content-primary">Stockfish 19</strong> (WASM).
            O Stockfish é software livre sob a licença <a href="/stockfish-license.txt" target="_blank" rel="noopener" className="text-brand-300 hover:text-brand-200">GPL v3</a>.
            O código-fonte está disponível em <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener" className="text-brand-300 hover:text-brand-200">github.com/nmrugg/stockfish.js</a> e <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener" className="text-brand-300 hover:text-brand-200">github.com/official-stockfish/Stockfish</a>.
          </p>
        </div>
      </div>

      {/* Settings modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Configurações de análise" maxWidth="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="label">Profundidade de busca</label>
            <p className="text-xs text-content-secondary mb-2">
              Maior profundidade = análise mais precisa, porém mais lenta. O padrão é 15.
            </p>
            <input
              type="range"
              min={5}
              max={20}
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-content-muted mt-1">
              <span>5 (rápido)</span>
              <span className="font-semibold text-content-primary">{depth}</span>
              <span>20 (profundo)</span>
            </div>
          </div>
          <Button variant="primary" onClick={() => { setShowSettings(false); }} className="w-full">
            Salvar
          </Button>
        </div>
      </Modal>

      {/* Delete modal */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Remover partida" maxWidth="max-w-md">
        <p className="text-sm text-content-secondary">
          Tem certeza que deseja remover esta partida? A análise associada também será removida. Esta ação não pode ser desfeita.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>Remover</Button>
        </div>
      </Modal>
    </div>
  );
}

function AnalysisPanel({
  analysisState,
  onStart,
  onCancel,
  onResume,
  onSettings,
  depth,
  hasGame,
}: {
  analysisState: ReturnType<typeof useGameAnalysis>['state'];
  onStart: () => void;
  onCancel: () => void;
  onResume: () => void;
  onSettings: () => void;
  depth: number;
  hasGame: boolean;
}) {
  const { status, analysis, progress, error } = analysisState;

  const isRunning = status === 'em_andamento' || status === 'aguardando';
  const isDone = status === 'concluida';
  const isCancelled = status === 'cancelada';
  const isFailed = status === 'falhou';

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-content-primary flex items-center gap-2">
          <Cpu className="h-4 w-4 text-brand-300" />
          Análise Stockfish
        </h2>
        <button
          onClick={onSettings}
          className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-ink-raised transition-colors"
          aria-label="Configurações"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        {progress && (
          <span className="text-xs text-content-secondary">
            {progress.current}/{progress.total} posições
          </span>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && progress && (
        <div className="w-full h-1.5 bg-ink-border rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all rounded-full"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Error */}
      {isFailed && error && (
        <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 p-3">
          <p className="text-xs text-danger-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {!isRunning && !isDone && (
          <Button variant="primary" onClick={onStart} disabled={!hasGame} icon={<Play className="h-4 w-4" />} className="flex-1">
            Analisar partida
          </Button>
        )}
        {isRunning && (
          <Button variant="danger" onClick={onCancel} icon={<Square className="h-4 w-4" />} className="flex-1">
            Cancelar
          </Button>
        )}
        {isCancelled && (
          <Button variant="primary" onClick={onResume} disabled={!hasGame} icon={<RefreshCw className="h-4 w-4" />} className="flex-1">
            Retomar análise
          </Button>
        )}
        {isFailed && (
          <Button variant="primary" onClick={onResume} disabled={!hasGame} icon={<RefreshCw className="h-4 w-4" />} className="flex-1">
            Tentar novamente
          </Button>
        )}
        {isDone && (
          <Button variant="secondary" onClick={onResume} icon={<RefreshCw className="h-4 w-4" />} className="flex-1">
            Reanalisar
          </Button>
        )}
      </div>

      {/* Notice about CPU usage */}
      {!isRunning && !isDone && (
        <p className="text-xs text-content-muted leading-relaxed">
          A análise roda no seu navegador e usa CPU. Profundidade {depth}. Você pode cancelar a qualquer momento.
        </p>
      )}

      {/* Current position analysis */}
      {analysis && analysis.positions.length > 0 && !isRunning && (
        <div className="rounded-xl bg-ink-raised border border-ink-border p-3 space-y-2">
          <p className="text-xs font-semibold text-content-primary">Última posição avaliada</p>
          {(() => {
            const last = analysis.positions[analysis.positions.length - 1];
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-content-secondary">Avaliação</span>
                  <span className="font-mono font-semibold text-content-primary">
                    {formatEval(last.evalCp, last.evalMate)}
                  </span>
                </div>
                {last.bestMove && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-content-secondary">Melhor lance</span>
                    <span className="font-mono font-semibold text-content-primary">{last.bestMove}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-content-secondary">Profundidade</span>
                  <span className="font-semibold text-content-primary">{last.depth}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; dot: string }> = {
    idle: { label: 'Aguardando', color: 'text-content-secondary', dot: 'bg-content-muted' },
    loading_existing: { label: 'Verificando…', color: 'text-content-secondary', dot: 'bg-cyan-400' },
    aguardando: { label: 'Iniciando…', color: 'text-cyan-400', dot: 'bg-cyan-400 animate-pulse' },
    em_andamento: { label: 'Analisando…', color: 'text-cyan-400', dot: 'bg-cyan-400 animate-pulse' },
    concluida: { label: 'Concluída', color: 'text-success-400', dot: 'bg-success-400' },
    cancelada: { label: 'Cancelada', color: 'text-warning-300', dot: 'bg-warning-300' },
    falhou: { label: 'Falhou', color: 'text-danger-400', dot: 'bg-danger-400' },
  };
  const c = config[status] ?? config.idle;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      <span className={`text-xs font-medium ${c.color}`}>{c.label}</span>
    </div>
  );
}

function ClassificationBadge({ cls }: { cls: NonNullable<PositionAnalysis['classification']> }) {
  const { label, color, bg } = classificationLabel(cls);
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color} ${bg}`}>
      {label}
    </span>
  );
}

function evalBarPercent(evalCp: number | null, evalMate: number | null): number {
  if (evalMate !== null) {
    return evalMate > 0 ? 100 : 0;
  }
  if (evalCp === null) return 50;
  const clamped = Math.max(-1000, Math.min(1000, evalCp));
  return 50 + (clamped / 1000) * 50;
}

function NavBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-2.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-ink-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function MoveButton({
  move,
  active,
  onClick,
  classification,
}: {
  move: string;
  active: boolean;
  onClick: () => void;
  classification?: PositionAnalysis['classification'];
}) {
  const cls = classification ? classificationLabel(classification) : null;
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
        active
          ? 'bg-brand-500/20 text-brand-200'
          : 'text-content-primary hover:bg-ink-raised'
      } ${cls ? cls.bg : ''}`}
    >
      {move}
      {cls && cls.label && (
        <span className={`text-[10px] font-semibold ${cls.color}`}>
          {cls.label.charAt(0)}
        </span>
      )}
    </button>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-content-muted mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${valueColor || 'text-content-primary'}`}>{value}</p>
    </div>
  );
}
