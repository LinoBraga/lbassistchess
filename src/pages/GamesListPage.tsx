import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  ChevronRight,
  Clock,
  Calendar,
  Upload,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ImportModal } from '@/components/ImportModal';
import { LoadingState, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { formatGameDate, formatResult } from '@/lib/pgn';

export interface GameRow {
  id: string;
  source: string;
  white_player: string | null;
  black_player: string | null;
  result: string | null;
  played_at: string | null;
  time_control: string | null;
  user_color: 'white' | 'black' | null;
  opening_name: string | null;
  analysis_status: string;
  imported_at: string;
}

const PAGE_SIZE = 20;

export function GamesListPage() {
  const { profile } = useAuth();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GameRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [colorFilter, setColorFilter] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [count, setCount] = useState(0);

  const loadGames = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('games')
      .select('*', { count: 'exact' })
      .eq('user_id', profile.id)
      .order('imported_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (sourceFilter) query = query.eq('source', sourceFilter);
    if (colorFilter) query = query.eq('user_color', colorFilter);
    if (resultFilter) query = query.eq('result', resultFilter);
    if (search.trim()) {
      query = query.or(
        `white_player.ilike.%${search}%,black_player.ilike.%${search}%,opening_name.ilike.%${search}%`,
      );
    }

    const { data, error, count: cnt } = await query;

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setGames((data ?? []) as GameRow[]);
    setCount(cnt ?? 0);
    setLoading(false);
  }, [profile?.id, sourceFilter, colorFilter, resultFilter, search]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const handleImported = () => {
    setImportOpen(false);
    loadGames();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('games').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) {
      toast('error', 'Não foi possível remover a partida.');
      return;
    }
    toast('success', 'Partida removida.');
    setConfirmDelete(null);
    loadGames();
  };

  const hasFilters = sourceFilter || colorFilter || resultFilter || search;

  const clearFilters = () => {
    setSourceFilter('');
    setColorFilter('');
    setResultFilter('');
    setSearch('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Centro de análises</h1>
          <p className="text-sm text-content-secondary mt-1">
            {count > 0 ? `${count} partida(s) importada(s)` : 'Importe suas partidas para começar'}
          </p>
        </div>
        <Button variant="primary" onClick={() => setImportOpen(true)} icon={<Plus className="h-4 w-4" />}>
          Importar partidas
        </Button>
      </div>

      {/* Search & filters */}
      {count > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                type="text"
                className="input pl-10"
                placeholder="Buscar por jogador ou abertura…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              icon={<Filter className="h-4 w-4" />}
            >
              Filtros
            </Button>
          </div>

          {showFilters && (
            <div className="card p-4 space-y-3 animate-fade-in">
              <div className="grid sm:grid-cols-3 gap-3">
                <FilterSelect
                  label="Origem"
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  options={[
                    { value: '', label: 'Todas' },
                    { value: 'pgn', label: 'PGN' },
                    { value: 'chesscom', label: 'Chess.com' },
                    { value: 'lichess', label: 'Lichess' },
                  ]}
                />
                <FilterSelect
                  label="Cor"
                  value={colorFilter}
                  onChange={setColorFilter}
                  options={[
                    { value: '', label: 'Todas' },
                    { value: 'white', label: 'Brancas' },
                    { value: 'black', label: 'Pretas' },
                  ]}
                />
                <FilterSelect
                  label="Resultado"
                  value={resultFilter}
                  onChange={setResultFilter}
                  options={[
                    { value: '', label: 'Todos' },
                    { value: '1-0', label: 'Brancas venceram' },
                    { value: '0-1', label: 'Pretas venceram' },
                    { value: '1/2-1/2', label: 'Empate' },
                  ]}
                />
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-medium text-brand-300 hover:text-brand-200 flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* States */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadGames} />
      ) : games.length === 0 ? (
        <EmptyState
          icon={<Upload className="h-8 w-8" />}
          title={hasFilters ? 'Nenhuma partida encontrada' : 'Nenhuma partida importada ainda'}
          description={
            hasFilters
              ? 'Tente ajustar ou limpar os filtros para ver mais partidas.'
              : 'Importe um arquivo PGN para começar a analisar suas partidas e gerar seu diagnóstico.'
          }
          action={
            !hasFilters && (
              <Button variant="primary" onClick={() => setImportOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Importar partidas
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {games.map((game) => (
            <GameCard key={game.id} game={game} onDelete={() => setConfirmDelete(game)} />
          ))}
        </div>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={handleImported} />

      {/* Delete confirmation */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remover partida"
        maxWidth="max-w-md"
      >
        <p className="text-sm text-content-secondary">
          Tem certeza que deseja remover esta partida? Esta ação não pode ser
          desfeita.
        </p>
        {confirmDelete && (
          <p className="mt-3 text-xs text-content-muted">
            {confirmDelete.white_player || '?'} vs {confirmDelete.black_player || '?'} ·{' '}
            {formatGameDate(confirmDelete.played_at)}
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Remover
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function GameCard({ game, onDelete }: { game: GameRow; onDelete: () => void }) {
  const result = formatResult(game.result, game.user_color);
  const sourceLabel = { pgn: 'PGN', chesscom: 'Chess.com', lichess: 'Lichess' }[game.source] ?? game.source;
  const statusLabel = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
    parcial: 'Parcial',
    falhou: 'Falhou',
  }[game.analysis_status] ?? game.analysis_status;
  const statusColor = {
    pendente: 'text-content-secondary',
    em_andamento: 'text-cyan-400',
    concluida: 'text-success-400',
    parcial: 'text-warning-300',
    falhou: 'text-danger-400',
  }[game.analysis_status] ?? 'text-content-secondary';

  return (
    <div className="card p-4 hover:border-brand-500/40 transition-colors group">
      <div className="flex items-center gap-3">
        <Link to={`/app/analises/${game.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-content-primary truncate">
                  {game.white_player || 'Brancas'} <span className="text-content-muted">vs</span> {game.black_player || 'Pretas'}
                </span>
                {game.user_color && (
                  <span className="chip text-xs">
                    {game.user_color === 'white' ? 'Brancas' : 'Pretas'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-content-secondary flex-wrap">
                <span className={result.color}>{result.label}</span>
                {game.opening_name && (
                  <>
                    <span className="text-content-muted">·</span>
                    <span className="truncate max-w-[160px]">{game.opening_name}</span>
                  </>
                )}
                {game.time_control && (
                  <>
                    <span className="text-content-muted">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {game.time_control}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex flex-col items-end gap-1">
            <span className="chip text-xs">{sourceLabel}</span>
            <span className={`text-xs ${statusColor}`}>{statusLabel}</span>
          </div>
          <span className="hidden md:flex items-center gap-1 text-xs text-content-muted">
            <Calendar className="h-3 w-3" />
            {formatGameDate(game.played_at)}
          </span>
          <Link to={`/app/analises/${game.id}`}>
            <span className="p-2 rounded-lg text-content-muted group-hover:text-brand-300 hover:bg-ink-raised transition-colors">
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-content-muted hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
            aria-label="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
