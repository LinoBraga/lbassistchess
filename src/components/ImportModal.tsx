import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Download,
  Globe,
  CalendarClock,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAppConfig } from '@/hooks/useAppConfig';
import {
  parsePgnFile,
  validateFile,
  computePgnHash,
  detectUserColor,
  type ParseResult,
} from '@/lib/pgn';
import { useAuth } from '@/context/AuthContext';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  rejected: number;
  errors: string[];
}

type Tab = 'file' | 'username';
type Platform = 'lichess' | 'chesscom';
type Period = '30d' | '90d' | 'all';

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [tab, setTab] = useState<Tab>('file');

  const handleClose = () => {
    setTab('file');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Importar partidas" maxWidth="max-w-xl">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-ink p-1 mb-5">
        <TabButton active={tab === 'file'} onClick={() => setTab('file')} icon={<Upload className="h-4 w-4" />}>
          Arquivo PGN
        </TabButton>
        <TabButton active={tab === 'username'} onClick={() => setTab('username')} icon={<Globe className="h-4 w-4" />}>
          Por username
        </TabButton>
      </div>

      {tab === 'file' ? (
        <FileImportTab onClose={handleClose} onImported={onImported} />
      ) : (
        <UsernameImportTab onClose={handleClose} onImported={onImported} />
      )}
    </Modal>
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
      className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-500/20 text-brand-200 border border-brand-500/30'
          : 'text-content-secondary hover:text-content-primary hover:bg-ink-raised border border-transparent'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// =========================================================
// FILE IMPORT TAB (existing logic, unchanged)
// =========================================================

function FileImportTab({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { profile } = useAuth();
  const { systemLimits } = useAppConfig();
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const maxBytes = (systemLimits?.max_pgn_file_mb ?? 5) * 1024 * 1024;

  const reset = () => {
    setParseResult(null);
    setSummary(null);
    setFileName(null);
    setDragging(false);
  };

  const handleFile = useCallback(
    async (file: File) => {
      reset();
      const sizeError = validateFile(file, maxBytes);
      if (sizeError) {
        toast('error', sizeError);
        return;
      }

      setFileName(file.name);
      setParsing(true);

      const text = await file.text();
      const result = parsePgnFile(text);
      setParseResult(result);
      setParsing(false);

      if (result.valid === 0) {
        toast('error', 'Nenhuma partida válida encontrada no arquivo.');
      } else {
        toast('success', `${result.valid} partida(s) válida(s) encontrada(s).`);
      }
    },
    [maxBytes],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!parseResult || !profile?.id) return;
    setImporting(true);

    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const game of parseResult.games) {
      const pgnHash = await computePgnHash(game);
      const userColor = detectUserColor(game, profile.display_name || profile.email);

      const { error } = await supabase.from('games').insert({
        user_id: profile.id,
        source: 'pgn',
        pgn: game.pgn,
        pgn_hash: pgnHash,
        external_id: game.externalId,
        white_player: game.whitePlayer,
        black_player: game.blackPlayer,
        result: game.result,
        played_at: game.playedAt,
        time_control: game.timeControl,
        user_color: userColor,
        opening_eco: game.openingEco,
        opening_name: game.openingName,
      });

      if (error) {
        if (error.code === '23505') {
          duplicates++;
        } else {
          errors.push(`${game.whitePlayer || '?'} vs ${game.blackPlayer || '?'}: ${error.message}`);
        }
      } else {
        imported++;
      }
    }

    setImporting(false);
    setSummary({
      total: parseResult.valid,
      imported,
      duplicates,
      rejected: errors.length,
      errors,
    });

    if (imported > 0) {
      toast('success', `${imported} partida(s) importada(s) com sucesso.`);
      onImported();
    } else if (duplicates > 0) {
      toast('info', 'Todas as partidas já haviam sido importadas.');
    } else {
      toast('error', 'Não foi possível importar as partidas.');
    }
  };

  return (
    <div className="space-y-5">
      {!parseResult && !summary && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl px-6 py-12 text-center transition-colors ${
            dragging
              ? 'border-brand-500 bg-brand-500/5'
              : 'border-ink-border hover:border-brand-500/40'
          }`}
        >
          {parsing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-brand-300 animate-spin" />
              <p className="text-sm text-content-secondary">Processando arquivo…</p>
            </div>
          ) : (
            <>
              <div className="h-14 w-14 rounded-2xl bg-brand-500/10 mx-auto flex items-center justify-center mb-4">
                <Upload className="h-7 w-7 text-brand-300" />
              </div>
              <p className="text-sm font-semibold text-content-primary">
                Arraste um arquivo .pgn aqui
              </p>
              <p className="text-xs text-content-secondary mt-1">
                ou clique para selecionar do seu computador
              </p>
              <label className="mt-4 inline-block">
                <input
                  type="file"
                  accept=".pgn,application/x-chess-pgn"
                  onChange={handleInput}
                  className="hidden"
                />
                <span className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Selecionar arquivo
                </span>
              </label>
              <p className="text-xs text-content-muted mt-4">
                Limite de {(maxBytes / (1024 * 1024)).toFixed(1)} MB · Suporta múltiplas partidas por arquivo
              </p>
            </>
          )}
        </div>
      )}

      {parseResult && !summary && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <FileText className="h-4 w-4" />
            <span className="font-medium text-content-primary">{fileName}</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Válidas" value={parseResult.valid} color="text-success-400" />
            <StatBox label="Rejeitadas" value={parseResult.rejected} color="text-danger-400" />
            <StatBox label="Total" value={parseResult.total} color="text-content-primary" />
          </div>

          {parseResult.errors.length > 0 && (
            <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 p-3 space-y-1 max-h-32 overflow-y-auto">
              {parseResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-danger-400 flex items-start gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  {err}
                </p>
              ))}
            </div>
          )}

          {parseResult.valid > 0 && (
            <div className="rounded-xl bg-ink-raised border border-ink-border p-4">
              <p className="text-xs text-content-secondary">
                {parseResult.valid} partida(s) serão importadas. Duplicatas serão
                ignoradas automaticamente.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="ghost" onClick={reset} icon={<Upload className="h-4 w-4" />}>
              Outro arquivo
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={importing}
              disabled={parseResult.valid === 0}
              className="flex-1"
            >
              Importar {parseResult.valid} partida(s)
            </Button>
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatBox icon={<CheckCircle2 className="h-4 w-4" />} label="Importadas" value={summary.imported} color="text-success-400" />
            <StatBox icon={<AlertCircle className="h-4 w-4" />} label="Duplicatas" value={summary.duplicates} color="text-warning-300" />
            <StatBox icon={<XCircle className="h-4 w-4" />} label="Falhas" value={summary.rejected} color="text-danger-400" />
          </div>

          {summary.errors.length > 0 && (
            <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 p-3 space-y-1 max-h-32 overflow-y-auto">
              {summary.errors.map((err, i) => (
                <p key={i} className="text-xs text-danger-400">{err}</p>
              ))}
            </div>
          )}

          <Button variant="primary" onClick={onClose} className="w-full">
            Concluir
          </Button>
        </div>
      )}
    </div>
  );
}

// =========================================================
// USERNAME IMPORT TAB (new)
// =========================================================

function UsernameImportTab({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { profile } = useAuth();
  const [platform, setPlatform] = useState<Platform>('lichess');
  const [username, setUsername] = useState('');
  const [period, setPeriod] = useState<Period>('30d');
  const [fetching, setFetching] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number } | null>(null);
  const cancelRef = useRef(false);

  const reset = () => {
    setSummary(null);
    setFetchError(null);
    setProgress(null);
  };

  const handleFetch = async () => {
    if (!username.trim() || !profile?.id) return;
    reset();
    cancelRef.current = false;
    setFetching(true);
    setFetchError(null);
    setProgress({ phase: 'Buscando partidas…', current: 0, total: 0 });

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setFetchError('Sessão expirada. Faça login novamente.');
        setFetching(false);
        return;
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-games?platform=${platform}&username=${encodeURIComponent(username.trim())}&period=${period}`;

      const response = await fetch(functionUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json() as {
        games?: Array<{ pgn: string; source: string }>;
        total?: number;
        error?: string;
        partial?: boolean;
      };

      if (!response.ok) {
        setFetchError(data.error ?? `Erro ${response.status}`);
        setFetching(false);
        return;
      }

      const fetchedGames = data.games ?? [];
      if (fetchedGames.length === 0) {
        setFetchError('Nenhuma partida encontrada no período selecionado.');
        setFetching(false);
        return;
      }

      setProgress({ phase: 'Processando PGNs…', current: 0, total: fetchedGames.length });
      setFetching(false);

      // Combine all PGN strings into one and parse
      const combinedPgn = fetchedGames.map((g) => g.pgn).join('\n\n');
      const parseResult = parsePgnFile(combinedPgn);
      const source = platform === 'lichess' ? 'lichess' : 'chesscom';

      let imported = 0;
      let duplicates = 0;
      const errors: string[] = [];

      for (let i = 0; i < parseResult.games.length; i++) {
        if (cancelRef.current) break;
        const game = parseResult.games[i];

        setProgress({ phase: 'Importando…', current: i + 1, total: parseResult.games.length });

        const pgnHash = await computePgnHash(game);
        const userColor = detectUserColor(game, username.trim());

        const { error } = await supabase.from('games').insert({
          user_id: profile.id,
          source: source,
          pgn: game.pgn,
          pgn_hash: pgnHash,
          external_id: game.externalId,
          white_player: game.whitePlayer,
          black_player: game.blackPlayer,
          result: game.result,
          played_at: game.playedAt,
          time_control: game.timeControl,
          user_color: userColor,
          opening_eco: game.openingEco,
          opening_name: game.openingName,
        });

        if (error) {
          if (error.code === '23505') {
            duplicates++;
          } else {
            errors.push(`${game.whitePlayer || '?'} vs ${game.blackPlayer || '?'}: ${error.message}`);
          }
        } else {
          imported++;
        }
      }

      setProgress(null);
      setSummary({
        total: parseResult.valid,
        imported,
        duplicates,
        rejected: errors.length,
        errors,
      });

      if (imported > 0) {
        toast('success', `${imported} partida(s) importada(s) de ${platform === 'lichess' ? 'Lichess' : 'Chess.com'}.`);
        onImported();
      } else if (duplicates > 0) {
        toast('info', 'Todas as partidas já haviam sido importadas.');
      } else if (errors.length > 0) {
        toast('error', 'Não foi possível importar as partidas.');
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Erro inesperado');
      setFetching(false);
      setProgress(null);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setFetching(false);
    setProgress(null);
    toast('info', 'Importação cancelada.');
  };

  return (
    <div className="space-y-5">
      {!summary && !progress && (
        <>
          {/* Platform selector */}
          <div>
            <label className="label">Plataforma</label>
            <div className="grid grid-cols-2 gap-2">
              <PlatformButton active={platform === 'lichess'} onClick={() => setPlatform('lichess')} label="Lichess" />
              <PlatformButton active={platform === 'chesscom'} onClick={() => setPlatform('chesscom')} label="Chess.com" />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="label" htmlFor="username-input">Username público</label>
            <input
              id="username-input"
              className="input"
              placeholder={platform === 'lichess' ? 'ex: drnykterstein' : 'ex: magnuscarlsen'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-content-muted mt-1.5">
              {platform === 'lichess'
                ? 'Use seu nome de usuário público da Lichess. Não pedimos senha.'
                : 'Use seu nome de usuário público da Chess.com. Não pedimos senha.'}
            </p>
          </div>

          {/* Period */}
          <div>
            <label className="label">Período</label>
            <div className="grid grid-cols-3 gap-2">
              <PeriodButton active={period === '30d'} onClick={() => setPeriod('30d')} label="30 dias" />
              <PeriodButton active={period === '90d'} onClick={() => setPeriod('90d')} label="90 dias" />
              <PeriodButton active={period === 'all'} onClick={() => setPeriod('all')} label="Tudo" />
            </div>
          </div>

          {/* Fetch error */}
          {fetchError && (
            <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-danger-400 shrink-0 mt-0.5" />
              <p className="text-xs text-danger-400">{fetchError}</p>
            </div>
          )}

          {/* Action */}
          <Button
            variant="primary"
            onClick={handleFetch}
            loading={fetching}
            disabled={!username.trim()}
            className="w-full"
            icon={<Download className="h-4 w-4" />}
          >
            {fetching ? 'Buscando…' : 'Buscar e importar'}
          </Button>

          {/* Chess.com disclaimer */}
          {platform === 'chesscom' && (
            <div className="rounded-xl bg-ink-raised border border-ink-border p-3 flex items-start gap-2">
              <CalendarClock className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />
              <p className="text-xs text-content-secondary leading-relaxed">
                A Chess.com PubAPI é usada de acordo com seus termos. Para uso
                comercial, verifique as condições aplicáveis antes de habilitar
                esta integração em produção.
              </p>
            </div>
          )}
        </>
      )}

      {/* Progress */}
      {progress && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 text-brand-300 animate-spin" />
            <p className="text-sm text-content-secondary">{progress.phase}</p>
            {progress.total > 0 && (
              <p className="text-xs text-content-muted">
                {progress.current} / {progress.total}
              </p>
            )}
            {progress.total > 0 && (
              <div className="w-full h-1.5 bg-ink-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all rounded-full"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
          <Button variant="ghost" onClick={handleCancel} className="w-full">
            Cancelar
          </Button>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatBox icon={<CheckCircle2 className="h-4 w-4" />} label="Importadas" value={summary.imported} color="text-success-400" />
            <StatBox icon={<AlertCircle className="h-4 w-4" />} label="Duplicatas" value={summary.duplicates} color="text-warning-300" />
            <StatBox icon={<XCircle className="h-4 w-4" />} label="Falhas" value={summary.rejected} color="text-danger-400" />
          </div>

          {summary.errors.length > 0 && (
            <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 p-3 space-y-1 max-h-32 overflow-y-auto">
              {summary.errors.map((err, i) => (
                <p key={i} className="text-xs text-danger-400">{err}</p>
              ))}
            </div>
          )}

          <Button variant="primary" onClick={onClose} className="w-full">
            Concluir
          </Button>
        </div>
      )}
    </div>
  );
}

function PlatformButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
        active
          ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
          : 'bg-ink border-ink-border text-content-secondary hover:border-brand-500/30'
      }`}
    >
      {label}
    </button>
  );
}

function PeriodButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
        active
          ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
          : 'bg-ink border-ink-border text-content-secondary hover:border-brand-500/30'
      }`}
    >
      {label}
    </button>
  );
}

function StatBox({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-2xl font-bold ${color} flex items-center justify-center gap-1`}>
        {icon}
        {value}
      </div>
      <p className="text-xs text-content-secondary mt-1">{label}</p>
    </div>
  );
}
