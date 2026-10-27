import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  AlertTriangle,
  GitBranch,
  RefreshCw,
  Info,
  ChevronRight,
  ChevronDown,
  Target,
  Trophy,
  Minus,
  XCircle,
  Filter,
  Cpu,
  Swords,
} from 'lucide-react';
import { useRepertoire, type PeriodFilter, type TimeControlFilter } from '@/hooks/useRepertoire';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { Chessboard } from '@/components/Chessboard';
import { formatEval, classificationLabel } from '@/lib/analysis';
import type { VariantTree, VariantNode } from '@/lib/openings';

type Tab = 'frequencia' | 'criticas' | 'variantes';

export function RepertorioPage() {
  const repertoire = useRepertoire();
  const [tab, setTab] = useState<Tab>('frequencia');

  if (repertoire.loading) return <LoadingState label="Carregando repertório de aberturas…" />;
  if (repertoire.error) return <ErrorState message={repertoire.error} onRetry={repertoire.reload} />;

  if (repertoire.totalGames === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader />
        <EmptyState
          icon={<Swords className="h-8 w-8" />}
          title="Sem partidas para analisar"
          description="Importe suas partidas para visualizar a frequência de aberturas, posições críticas e variantes. O repertório usa dados reais dos seus PGNs e análises do Stockfish."
          action={
            <Link to="/app/analises">
              <Button variant="primary" icon={<ChevronRight className="h-4 w-4" />}>
                Ir para análises
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader />

      {/* Stats overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Partidas importadas" value={repertoire.totalGames} icon={BarChart3} color="text-brand-300" />
        <StatCard label="Com abertura identificada" value={repertoire.gamesWithOpenings} icon={GitBranch} color="text-cyan-400" />
        <StatCard label="Com análise Stockfish" value={repertoire.gamesWithAnalysis} icon={Cpu} color="text-success-400" />
        <StatCard label="Posições críticas" value={repertoire.criticalPositions.length} icon={AlertTriangle} color="text-orange-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-ink-card border border-ink-border p-1">
        <TabButton active={tab === 'frequencia'} onClick={() => setTab('frequencia')} icon={<BarChart3 className="h-4 w-4" />}>
          Frequência de uso
        </TabButton>
        <TabButton active={tab === 'criticas'} onClick={() => setTab('criticas')} icon={<AlertTriangle className="h-4 w-4" />}>
          Posições críticas
        </TabButton>
        <TabButton active={tab === 'variantes'} onClick={() => setTab('variantes')} icon={<GitBranch className="h-4 w-4" />}>
          Variantes
        </TabButton>
      </div>

      {tab === 'frequencia' && <FrequencyTab repertoire={repertoire} />}
      {tab === 'criticas' && <CriticalPositionsTab repertoire={repertoire} />}
      {tab === 'variantes' && <VariantsTab repertoire={repertoire} />}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Repertório de aberturas</h1>
        <p className="text-sm text-content-secondary mt-1">
          Frequência de uso, posições críticas e variantes baseadas nas suas partidas
        </p>
      </div>
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
  icon: typeof BarChart3;
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

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-500/20 text-brand-200 border border-brand-500/30'
          : 'text-content-secondary hover:text-content-primary hover:bg-ink-raised border border-transparent'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

// === FREQUÊNCIA TAB ===

function FrequencyTab({ repertoire }: { repertoire: ReturnType<typeof useRepertoire> }) {
  const { openings, period, setPeriod, timeControl, setTimeControl, gamesWithOpenings, totalGames } = repertoire;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-content-secondary">
          <Filter className="h-4 w-4 text-content-muted" />
          <span>Filtros:</span>
        </div>

        <div className="flex gap-1 rounded-lg bg-ink p-1">
          {(['all', '30d', '90d'] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p ? 'bg-brand-500/20 text-brand-200' : 'text-content-muted hover:text-content-primary'
              }`}
            >
              {p === 'all' ? 'Todo período' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-ink p-1">
          {(['all', 'blitz', 'rapid', 'classical'] as TimeControlFilter[]).map((tc) => (
            <button
              key={tc}
              onClick={() => setTimeControl(tc)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                timeControl === tc ? 'bg-brand-500/20 text-brand-200' : 'text-content-muted hover:text-content-primary'
              }`}
            >
              {tc === 'all' ? 'Todos ritmos' : tc === 'blitz' ? 'Blitz' : tc === 'rapid' ? 'Rápido' : 'Clássico'}
            </button>
          ))}
        </div>
      </div>

      {/* Data coverage notice */}
      {gamesWithOpenings < totalGames && (
        <div className="card p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />
          <p className="text-xs text-content-secondary leading-relaxed">
            {gamesWithOpenings} de {totalGames} partida(s) possuem nome de abertura nos metadados do PGN.
            As demais são agrupadas pela sequência de lances iniciais. Partidas sem cabeçalho de abertura
            podem aparecer como "Abertura não identificada".
          </p>
        </div>
      )}

      {openings.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="Nenhuma abertura encontrada"
          description="Nenhuma partida corresponde aos filtros selecionados. Tente ampliar o período ou o controle de tempo."
        />
      ) : (
        <div className="space-y-3">
          {openings.map((opening) => (
            <OpeningCard key={opening.key} opening={opening} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpeningCard({ opening }: { opening: ReturnType<typeof useRepertoire>['openings'][number] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between gap-3 hover:bg-ink-raised/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-content-primary truncate">{opening.name}</h3>
            {opening.eco && <span className="chip text-[10px]">{opening.eco}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-content-secondary">
            <span>{opening.totalGames} partida(s)</span>
            <span className="text-content-muted">·</span>
            <span className="text-content-primary">{opening.asWhite}B</span>
            <span className="text-content-primary">{opening.asBlack}P</span>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <ResultBar wins={opening.wins} draws={opening.draws} losses={opening.losses} />
          <div className="text-right">
            <p className="text-sm font-bold text-content-primary">{opening.winRate}%</p>
            <p className="text-[10px] text-content-muted">aprov.</p>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-content-muted" /> : <ChevronRight className="h-4 w-4 text-content-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-ink-border p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <ResultCount label="Vitórias" value={opening.wins} icon={Trophy} color="text-success-400" />
            <ResultCount label="Empates" value={opening.draws} icon={Minus} color="text-warning-300" />
            <ResultCount label="Derrotas" value={opening.losses} icon={XCircle} color="text-danger-400" />
          </div>
          {opening.moveSequence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-content-secondary mb-1.5">Sequência de lances:</p>
              <div className="flex flex-wrap gap-1.5">
                {opening.moveSequence.map((move, i) => (
                  <span key={i} className="px-2 py-1 rounded-md bg-ink-raised border border-ink-border text-xs font-mono text-content-primary">
                    {Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '…'} {move}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] text-content-muted">
            Resultado calculado apenas para partidas com resultado e cor identificada.
          </p>
        </div>
      )}
    </div>
  );
}

function ResultBar({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  const total = wins + draws + losses;
  if (total === 0) {
    return <div className="w-20 h-1.5 rounded-full bg-ink-border" />;
  }
  return (
    <div className="w-20 h-1.5 rounded-full overflow-hidden flex bg-ink-border">
      <div className="bg-success-500" style={{ width: `${(wins / total) * 100}%` }} />
      <div className="bg-warning-400" style={{ width: `${(draws / total) * 100}%` }} />
      <div className="bg-danger-500" style={{ width: `${(losses / total) * 100}%` }} />
    </div>
  );
}

function ResultCount({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Trophy;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-ink-raised border border-ink-border p-2">
      <Icon className={`h-3.5 w-3.5 ${color} mx-auto mb-1`} />
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-content-muted">{label}</p>
    </div>
  );
}

// === POSIÇÕES CRÍTICAS TAB ===

function CriticalPositionsTab({ repertoire }: { repertoire: ReturnType<typeof useRepertoire> }) {
  const { criticalPositions, gamesWithAnalysis, totalGames } = repertoire;

  if (gamesWithAnalysis === 0) {
    return (
      <EmptyState
        icon={<Cpu className="h-8 w-8" />}
        title="Nenhuma análise do Stockfish encontrada"
        description="Para identificar posições críticas, você precisa analisar partidas com o Stockfish. As posições críticas são extraídas das avaliações reais salvas nas suas análises — não são inventadas."
        action={
          <Link to="/app/analises">
            <Button variant="primary" icon={<ChevronRight className="h-4 w-4" />}>
              Analisar partidas
            </Button>
          </Link>
        }
      />
    );
  }

  if (criticalPositions.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title="Nenhuma posição crítica na abertura"
        description="Nenhum erro (imprecisão, erro ou erro grave) foi detectado nos primeiros 10 lances das suas partidas analisadas. Isso é um bom sinal — suas aberturas estão sólidas."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />
        <p className="text-xs text-content-secondary leading-relaxed">
          Posições críticas são aquelas onde o Stockfish detectou uma queda significativa de avaliação nos
          primeiros 10 lances. São diferentes de erros confirmados no meio-jogo — uma queda na abertura
          pode indicar uma imprecisão teórica, mas não atribui causas psicológicas ao jogador.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {criticalPositions.slice(0, 12).map((pos, i) => {
          const cls = classificationLabel(pos.classification as never);
          return (
            <Link key={`${pos.gameId}-${pos.ply}-${i}`} to={`/app/analises/${pos.gameId}`} className="block group">
              <div className="rounded-xl overflow-hidden border border-ink-border group-hover:border-brand-500/40 transition-colors">
                <Chessboard fen={pos.fen} size={200} />
                <div className="p-3 bg-ink-raised space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-content-primary">
                      {formatEval(pos.evalCp, pos.evalMate)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls.color} ${cls.bg}`}>
                      {cls.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-content-secondary">
                    <span>Lance {Math.ceil(pos.ply / 2)}{pos.ply % 2 ? '...' : '.'}</span>
                    {pos.move && <span className="font-mono text-content-primary">{pos.move}</span>}
                    {pos.bestMove && (
                      <span className="flex items-center gap-1 text-content-muted">
                        <Target className="h-3 w-3" />
                        <span className="font-mono">{pos.bestMove}</span>
                      </span>
                    )}
                  </div>
                  {pos.openingName && (
                    <p className="text-[10px] text-content-muted truncate">{pos.openingName}</p>
                  )}
                  <p className="text-[10px] text-content-muted">
                    {pos.whitePlayer || 'Brancas'} vs {pos.blackPlayer || 'Pretas'}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {criticalPositions.length > 12 && (
        <p className="text-center text-xs text-content-muted">
          Exibindo 12 de {criticalPositions.length} posições. Acesse as partidas para ver todas.
        </p>
      )}
    </div>
  );
}

// === VARIANTES TAB ===

function VariantsTab({ repertoire }: { repertoire: ReturnType<typeof useRepertoire> }) {
  const { variantTrees, totalGames, gamesWithAnalysis } = repertoire;
  const [color, setColor] = useState<'white' | 'black'>('white');

  const tree = color === 'white' ? variantTrees.asWhite : variantTrees.asBlack;

  if (totalGames === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="h-8 w-8" />}
        title="Sem partidas para explorar"
        description="Importe partidas para explorar as variantes de abertura em um tabuleiro interativo."
      />
    );
  }

  const gamesForColor = tree.root.games.length;

  if (gamesForColor === 0) {
    return (
      <div className="space-y-4">
        <ColorSelector color={color} setColor={setColor} whiteCount={variantTrees.asWhite.root.games.length} blackCount={variantTrees.asBlack.root.games.length} />
        <EmptyState
          icon={<GitBranch className="h-8 w-8" />}
          title={`Nenhuma partida com as ${color === 'white' ? 'brancas' : 'pretas'}`}
          description="Você não possui partidas jogando com esta cor. Troque a cor acima para ver o outro lado."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ColorSelector color={color} setColor={setColor} whiteCount={variantTrees.asWhite.root.games.length} blackCount={variantTrees.asBlack.root.games.length} />

      <div className="card p-3 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />
        <p className="text-xs text-content-secondary leading-relaxed">
          Explore a árvore de variantes clicando nos lances. As avaliações exibidas são reais do Stockfish,
          extraídas das suas análises salvas. Posições sem avaliação não foram analisadas pelo motor —
          nenhuma avaliação é inventada.
        </p>
      </div>

      <VariantExplorer tree={tree} gamesWithAnalysis={gamesWithAnalysis} />
    </div>
  );
}

function ColorSelector({
  color,
  setColor,
  whiteCount,
  blackCount,
}: {
  color: 'white' | 'black';
  setColor: (c: 'white' | 'black') => void;
  whiteCount: number;
  blackCount: number;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-card border border-ink-border p-1 w-fit">
      <button
        onClick={() => setColor('white')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          color === 'white' ? 'bg-brand-500/20 text-brand-200' : 'text-content-muted hover:text-content-primary'
        }`}
      >
        Brancas ({whiteCount})
      </button>
      <button
        onClick={() => setColor('black')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          color === 'black' ? 'bg-brand-500/20 text-brand-200' : 'text-content-muted hover:text-content-primary'
        }`}
      >
        Pretas ({blackCount})
      </button>
    </div>
  );
}

function VariantExplorer({ tree, gamesWithAnalysis }: { tree: VariantTree; gamesWithAnalysis: number }) {
  const [path, setPath] = useState<VariantNode[]>([tree.root]);

  const currentNode = path[path.length - 1];
  const children = useMemo(() => {
    const key = `${currentNode.ply}:${currentNode.fen}`;
    return tree.children.get(key) ?? [];
  }, [tree.children, currentNode]);

  const navigateTo = (node: VariantNode) => setPath([...path, node]);
  const navigateBack = (index: number) => setPath(path.slice(0, index + 1));

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      {/* Board */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <Chessboard fen={currentNode.fen} size={440} />
        </div>

        {/* Current node info */}
        <div className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-content-secondary">
              {currentNode.ply === 0 ? 'Posição inicial' : `Lance ${Math.ceil(currentNode.ply / 2)}${currentNode.ply % 2 ? '...' : '.'}`}
            </span>
            {currentNode.hasEngineData ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono font-semibold text-content-primary">
                  {formatEval(currentNode.evalCp, currentNode.evalMate)}
                </span>
                {currentNode.bestMove && (
                  <span className="flex items-center gap-1 text-content-secondary">
                    <Target className="h-3 w-3" />
                    <span className="font-mono">{currentNode.bestMove}</span>
                  </span>
                )}
                <span className="text-content-muted">d{currentNode.depth}</span>
              </div>
            ) : (
              <span className="text-xs text-content-muted">Sem avaliação do motor</span>
            )}
          </div>
          <div className="text-xs text-content-secondary">
            {currentNode.games.length} partida(s) chegaram a esta posição
          </div>
        </div>
      </div>

      {/* Move tree */}
      <div className="space-y-3">
        {/* Breadcrumb path */}
        <div className="card p-3">
          <p className="text-xs font-semibold text-content-secondary mb-2">Caminho:</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            {path.map((node, i) => (
              <button
                key={i}
                onClick={() => navigateBack(i)}
                className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${
                  i === path.length - 1
                    ? 'bg-brand-500/20 text-brand-200 border border-brand-500/30'
                    : 'bg-ink-raised text-content-secondary hover:text-content-primary border border-ink-border'
                }`}
              >
                {node.move ?? 'Início'}
              </button>
            ))}
          </div>
        </div>

        {/* Available moves */}
        <div className="card p-3">
          <p className="text-xs font-semibold text-content-secondary mb-2">Lances disponíveis:</p>
          {children.length === 0 ? (
            <p className="text-xs text-content-muted py-2">
              {currentNode.ply >= 10
                ? 'Limite de profundidade da abertura atingido.'
                : 'Nenhum lance adicional nesta posição.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {children.map(({ move, node }) => (
                <button
                  key={`${move}-${node.fen}`}
                  onClick={() => navigateTo(node)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-ink-raised border border-ink-border hover:border-brand-500/40 hover:bg-ink-card transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-semibold text-content-primary">
                      {Math.ceil(node.ply / 2)}{node.ply % 2 ? '...' : '.'} {move}
                    </span>
                    {node.hasEngineData && (
                      <span className="text-[10px] font-mono text-content-muted">
                        {formatEval(node.evalCp, node.evalMate)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-content-muted">{node.games.length}x</span>
                    <ChevronRight className="h-3.5 w-3.5 text-content-muted" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Games reaching this position */}
        {currentNode.games.length > 0 && (
          <div className="card p-3">
            <p className="text-xs font-semibold text-content-secondary mb-2">
              Partidas nesta posição ({currentNode.games.length}):
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {currentNode.games.slice(0, 10).map((g) => (
                <Link
                  key={g.id}
                  to={`/app/analises/${g.id}`}
                  className="block px-2 py-1.5 rounded-md text-xs hover:bg-ink-raised transition-colors"
                >
                  <span className="text-content-primary">{g.white || 'Brancas'}</span>
                  <span className="text-content-muted mx-1">vs</span>
                  <span className="text-content-primary">{g.black || 'Pretas'}</span>
                  {g.result && <span className="text-content-muted ml-2">{g.result}</span>}
                </Link>
              ))}
              {currentNode.games.length > 10 && (
                <p className="text-[10px] text-content-muted text-center pt-1">
                  +{currentNode.games.length - 10} partida(s)
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
