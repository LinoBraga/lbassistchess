import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  Dumbbell,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Target,
  Info,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { LoadingState, EmptyState } from '@/components/ui/States';
import { Chessboard } from '@/components/Chessboard';
import { toast } from '@/components/ui/Toast';
import { useTrainingPlan } from '@/hooks/useTrainingPlan';
import { checkMove, uciToSan } from '@/lib/exercises';
import { formatEval } from '@/lib/analysis';

interface Exercise {
  id: string;
  game_id: string;
  source_ply: number;
  fen: string;
  side_to_move: 'w' | 'b';
  best_move: string;
  acceptable_moves: string[];
  pv: string | null;
  category: string;
  difficulty: string;
  instruction: string;
  explanation: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  tatica: 'Táticas',
  calculo: 'Cálculo',
  abertura: 'Abertura',
  estrategia: 'Estratégia',
  finais: 'Finais',
  revisao: 'Revisão',
};

export function TreinarPage() {
  const { profile } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<null | 'correct' | 'wrong'>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [movePlayed, setMovePlayed] = useState<string | null>(null);
  const [attemptMap, setAttemptMap] = useState<Record<string, boolean>>({});

  const loadExercises = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { data } = await supabase
      .from('exercises')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    setExercises((data ?? []) as unknown as Exercise[]);

    // Carregar tentativas anteriores
    const { data: attempts } = await supabase
      .from('exercise_attempts')
      .select('exercise_id, is_correct')
      .eq('user_id', profile.id);

    const map: Record<string, boolean> = {};
    for (const a of (attempts ?? []) as { exercise_id: string; is_correct: boolean }[]) {
      map[a.exercise_id] = a.is_correct;
    }
    setAttemptMap(map);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  const currentExercise = exercises[currentIndex];

  const handleMove = useCallback(
    async (from: string, to: string, promotion?: string) => {
      if (!currentExercise || feedback) return;

      const moveUci = promotion ? `${from}${to}${promotion}` : `${from}${to}`;

      // Verificar se o lance é legal
      try {
        const testChess = new Chess(currentExercise.fen);
        testChess.move({ from, to, promotion });
      } catch {
        // Lance ilegal — ignorar
        return;
      }

      setMovePlayed(moveUci);
      const isCorrect = checkMove(
        {
          bestMove: currentExercise.best_move,
          acceptableMoves: currentExercise.acceptable_moves,
        } as never,
        moveUci,
      );

      setFeedback(isCorrect ? 'correct' : 'wrong');
      setShowExplanation(true);

      // Salvar tentativa
      await supabase.from('exercise_attempts').insert({
        user_id: profile!.id,
        exercise_id: currentExercise.id,
        move_played: moveUci,
        is_correct: isCorrect,
      });

      setAttemptMap((prev) => ({ ...prev, [currentExercise.id]: isCorrect }));

      if (isCorrect) {
        toast('success', 'Lance correto!');
      } else {
        toast('error', 'Lance incorreto. Veja a explicação.');
      }
    },
    [currentExercise, feedback, profile],
  );

  const nextExercise = () => {
    setFeedback(null);
    setShowExplanation(false);
    setMovePlayed(null);
    setCurrentIndex((i) => Math.min(i + 1, exercises.length - 1));
  };

  if (loading) return <LoadingState label="Carregando exercícios…" />;

  if (exercises.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Treinador personalizado</h1>
          <p className="text-sm text-content-secondary mt-1">
            Exercícios gerados a partir das suas partidas analisadas
          </p>
        </div>
        <EmptyState
          icon={<Dumbbell className="h-8 w-8" />}
          title="Nenhum exercício disponível"
          description="Para gerar exercícios personalizados, importe e analise partidas com o Stockfish. Os exercícios são criados a partir de posições reais onde você cometeu erros."
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
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Treinador personalizado</h1>
        <p className="text-sm text-content-secondary mt-1">
          Exercício {currentIndex + 1} de {exercises.length} · {exercises.filter((e) => attemptMap[e.id]).length} resolvido(s)
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-ink-border rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all rounded-full"
          style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}
        />
      </div>

      {currentExercise && (
        <ExerciseView
          exercise={currentExercise}
          feedback={feedback}
          showExplanation={showExplanation}
          movePlayed={movePlayed}
          onMove={handleMove}
          onNext={nextExercise}
          isLast={currentIndex >= exercises.length - 1}
          wasCorrect={attemptMap[currentExercise.id]}
        />
      )}
    </div>
  );
}

function cleanExerciseExplanation(
  explanation: string | null | undefined,
): string {
  if (!explanation) return '';

  return explanation
    .replace(/^#{1,6}\s*Explicação\s*/gim, '')
    .split(/Variação principal\s*:/i)[0]
    .replace(/^\s*\d+\s+score\s+(?:cp|mate)\b.*$/gim, '')
    .replace(/^\s*\*?Apenas o melhor lance.*$/gim, '')
    .replace(/^\s*[-*]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractUciPv(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];

  // Se receber uma linha de análise UCI completa,
  // aproveita apenas os movimentos que aparecem depois de "pv".
  const pvMatch = raw.match(/\bpv\s+([\s\S]*)/i);

  const candidate = pvMatch
    ? pvMatch[1].split(/\b(?:bestmove|ponder|info)\b/i)[0]
    : raw;

  return (
    candidate.match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/gi) ?? []
  );
}

function formatPrincipalVariation(
  fen: string,
  raw: string | null | undefined,
): string | null {
  const moves = extractUciPv(raw);

  if (!moves.length) return null;

  const chess = new Chess(fen);
  const formatted: string[] = [];

  for (let index = 0; index < moves.length; index++) {
    const uci = moves[index];
    const turn = chess.turn();
    const fullmove = Number(chess.fen().split(' ')[5]) || 1;

    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4].toLowerCase() } : {}),
      });

      if (!move) break;

      if (turn === 'w') {
        formatted.push(`${fullmove}. ${move.san}`);
      } else if (index === 0) {
        formatted.push(`${fullmove}... ${move.san}`);
      } else {
        formatted.push(move.san);
      }
    } catch {
      // Não apresenta movimentos inválidos ou que não pertençam
      // à posição inicial desta variante.
      break;
    }
  }

  return formatted.length ? formatted.join(' ') : null;
}


function ExerciseView({
  exercise,
  feedback,
  showExplanation,
  movePlayed,
  onMove,
  onNext,
  isLast,
  wasCorrect,
}: {
  exercise: Exercise;
  feedback: null | 'correct' | 'wrong';
  showExplanation: boolean;
  movePlayed: string | null;
  onMove: (from: string, to: string, promotion?: string) => void;
  onNext: () => void;
  isLast: boolean;
  wasCorrect?: boolean;
}) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [boardFen, setBoardFen] = useState(exercise.fen);
  const [highlightMove, setHighlightMove] = useState<string | null>(null);

  useEffect(() => {
    setBoardFen(exercise.fen);
    setSelectedSquare(null);
    setHighlightMove(null);
  }, [exercise.id, exercise.fen]);

  const sideLabel =
    exercise.side_to_move === 'w' ? 'Brancas' : 'Pretas';

  const difficultyLabel = {
    facil: 'Fácil',
    medio: 'Médio',
    dificil: 'Difícil',
  }[exercise.difficulty] ?? exercise.difficulty;

  const categoryLabel =
    CATEGORY_LABELS[exercise.category] ?? exercise.category;

  const handleSquareClick = useCallback(
    (square: string) => {
      if (feedback) return;

      if (!selectedSquare) {
        try {
          const chess = new Chess(boardFen);
          const piece = chess.get(square as never);

          if (piece && piece.color === exercise.side_to_move) {
            setSelectedSquare(square);
          }
        } catch {
          // Ignora casas inválidas.
        }
      } else {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          return;
        }

        onMove(selectedSquare, square);
        setSelectedSquare(null);
      }
    },
    [
      selectedSquare,
      feedback,
      boardFen,
      exercise.side_to_move,
      onMove,
    ],
  );

  useEffect(() => {
    if (feedback && movePlayed && exercise.best_move) {
      try {
        const chess = new Chess(exercise.fen);

        const move = chess.move({
          from: movePlayed.slice(0, 2),
          to: movePlayed.slice(2, 4),
          promotion:
            movePlayed.length > 4 ? movePlayed[4] : undefined,
        });

        if (move) {
          setBoardFen(chess.fen());
          setHighlightMove(`${move.from}${move.to}`);
        } else {
          setBoardFen(exercise.fen);
        }
      } catch {
        setBoardFen(exercise.fen);
      }
    }
  }, [feedback, movePlayed, exercise.fen, exercise.best_move]);

  const bestMoveSan = useMemo(() => {
    if (!exercise.best_move) return null;

    return uciToSan(exercise.fen, exercise.best_move);
  }, [exercise.fen, exercise.best_move]);

  const playedMoveSan = useMemo(() => {
    if (!movePlayed) return null;

    try {
      return uciToSan(exercise.fen, movePlayed);
    } catch {
      return movePlayed;
    }
  }, [exercise.fen, movePlayed]);

  const cleanExplanation = useMemo(
    () => cleanExerciseExplanation(exercise.explanation),
    [exercise.explanation],
  );

  const principalVariation = useMemo(
    () =>
      formatPrincipalVariation(
        exercise.fen,
        exercise.pv || exercise.explanation,
      ),
    [exercise.fen, exercise.pv, exercise.explanation],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Tabuleiro */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <InteractiveBoard
            fen={boardFen}
            onSquareClick={handleSquareClick}
            selectedSquare={selectedSquare}
            highlightFrom={highlightMove?.slice(0, 2) ?? null}
            highlightTo={highlightMove?.slice(2, 4) ?? null}
            orientation={exercise.side_to_move === 'b' ? 'black' : 'white'}
            size={500}
          />
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-300" />
            <p className="text-sm font-semibold text-content-primary">
              {exercise.instruction}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-content-secondary">
            <span className="chip text-xs">{sideLabel} jogam</span>
            <span className="chip text-xs">{categoryLabel}</span>
            <span className="chip text-xs">{difficultyLabel}</span>

            {wasCorrect !== undefined && (
              <span
                className={`chip text-xs ${
                  wasCorrect
                    ? 'text-success-400'
                    : 'text-warning-300'
                }`}
              >
                {wasCorrect ? 'Resolvido antes' : 'Tentado antes'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Painel lateral */}
      <div className="space-y-4">
        {feedback === 'correct' && (
          <div className="card border-success-500/30 p-5">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success-400" />
              <p className="text-base font-bold text-success-400">
                Correto!
              </p>
            </div>

            <p className="text-sm text-content-secondary">
              Você encontrou o melhor lance.
            </p>
          </div>
        )}

        {feedback === 'wrong' && (
          <div className="card border-danger-500/30 p-5">
            <div className="mb-2 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-danger-400" />
              <p className="text-base font-bold text-danger-400">
                Lance incorreto
              </p>
            </div>

            <p className="text-sm text-content-secondary">
              Esse não foi o melhor lance da posição. Confira a
              sugestão do motor e a variante abaixo.
            </p>
          </div>
        )}

        {/* Análise amigável */}
        {showExplanation &&
          (exercise.explanation || exercise.pv) && (
            <div className="card space-y-4 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-content-primary">
                <Lightbulb className="h-4 w-4 text-warning-300" />
                Análise do lance
              </h3>

              {/* Comparação dos lances */}
              {(playedMoveSan || bestMoveSan) && (
                <div className="grid grid-cols-2 gap-2">
                  {playedMoveSan && (
                    <div className="rounded-xl border border-ink-border bg-ink-raised p-3">
                      <p className="mb-1 text-xs text-content-muted">
                        Lance jogado
                      </p>
                      <p className="font-mono text-lg font-bold text-content-primary">
                        {playedMoveSan}
                      </p>
                    </div>
                  )}

                  {bestMoveSan && (
                    <div className="rounded-xl border border-success-500/30 bg-success-500/5 p-3">
                      <p className="mb-1 text-xs text-content-muted">
                        Melhor lance
                      </p>
                      <p className="font-mono text-lg font-bold text-success-400">
                        {bestMoveSan}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {cleanExplanation && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-content-secondary">
                  {cleanExplanation}
                </p>
              )}

              {/* Variante principal convertida para notação algébrica */}
              {principalVariation && (
                <div className="rounded-xl border border-ink-border bg-ink-raised p-3">
                  <p className="mb-2 text-xs font-semibold text-content-muted">
                    Variante principal
                  </p>

                  <p className="break-words font-mono text-sm leading-7 text-content-primary">
                    {principalVariation}
                  </p>
                </div>
              )}

              {exercise.acceptable_moves.length === 0 && (
                <p className="border-t border-ink-border pt-3 text-xs leading-relaxed text-content-muted">
                  O exercício aceita apenas o melhor lance identificado
                  pelo motor. Como não há análise MultiPV disponível,
                  outras alternativas equivalentes podem não ter sido
                  verificadas.
                </p>
              )}
            </div>
          )}

        {/* Partida de origem */}
        <div className="card p-4">
          <h3 className="mb-2 text-xs font-semibold text-content-secondary">
            Partida de origem
          </h3>

          <Link
            to={`/app/analises/${exercise.game_id}`}
            className="flex items-center justify-between transition-colors hover:text-brand-300"
          >
            <span className="text-sm text-content-primary">
              Ver partida completa
            </span>
            <ArrowRight className="h-4 w-4 text-content-muted" />
          </Link>

          <p className="mt-1 text-xs text-content-muted">
            Lance {Math.ceil(exercise.source_ply / 2)}
          </p>
        </div>

        {/* Próximo exercício */}
        {feedback && !isLast && (
          <Button
            variant="primary"
            onClick={onNext}
            className="w-full"
            icon={<ArrowRight className="h-4 w-4" />}
          >
            Próximo exercício
          </Button>
        )}

        {feedback && isLast && (
          <div className="card p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-success-400" />

            <p className="text-sm font-semibold text-content-primary">
              Você completou todos os exercícios!
            </p>

            <Link to="/app/evolucao" className="mt-3 block">
              <Button variant="secondary" className="w-full">
                Ver evolução
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}


// Interactive board wrapper with click handling and highlights




function InteractiveBoard({
  fen,
  onSquareClick,
  selectedSquare,
  highlightFrom,
  highlightTo,
  size = 480,
  orientation = 'white',
}: {
  fen: string;
  onSquareClick: (square: string) => void;
  selectedSquare: string | null;
  highlightFrom: string | null;
  highlightTo: string | null;
  orientation?: 'white' | 'black';
  size?: number;
}) {
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const chess = useMemo(() => new Chess(fen), [fen]);
  const squares = useMemo(() => chess.board(), [chess]);
  const flipped = orientation === 'black';

  const displaySquares = useMemo(() => {
    if (!flipped) return squares;

    return [...squares]
      .reverse()
      .map((row) => [...row].reverse());
  }, [squares, flipped]);
  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];

    try {
      return new Chess(fen).moves({
        square: selectedSquare as any,
        verbose: true,
      });
    } catch {
      return [];
    }
  }, [fen, selectedSquare]);

  const legalTargets = new Set(legalMoves.map((move) => move.to));

  const checkedKing = useMemo(() => {
    const position = new Chess(fen);

    if (!position.isCheck()) return null;

    const board = position.board();
    const turn = position.turn();

    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        const piece = board[row][col];

        if (piece?.type === 'k' && piece.color === turn) {
          return `${FILES[col]}${RANKS[row]}`;
        }
      }
    }

    return null;
  }, [fen]);

  const handleDragStart = (
    event: React.DragEvent<HTMLImageElement>,
    square: string,
    color: 'w' | 'b',
  ) => {
    if (color !== chess.turn()) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.setData('text/plain', square);
    event.dataTransfer.effectAllowed = 'move';

    onSquareClick(square);
  };

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetSquare: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const sourceSquare = event.dataTransfer.getData('text/plain');

    if (!sourceSquare || sourceSquare === targetSquare) return;

    onSquareClick(targetSquare);
  };

  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-sm border border-[#56604b] shadow-xl"
      style={{
        maxWidth: size,
        aspectRatio: '1 / 1',
      }}
      role="group"
      aria-label="Tabuleiro de xadrez"
    >
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {displaySquares.map((row, rowIdx) =>
          row.map((piece, colIdx) => {
            const file = FILES[flipped ? 7 - colIdx : colIdx];
            const rank = RANKS[flipped ? 7 - rowIdx : rowIdx];
            const square = `${file}${rank}`;

            const isLight = (rowIdx + colIdx) % 2 === 0;
            const isSelected = selectedSquare === square;
            const isHighlightFrom = highlightFrom === square;
            const isHighlightTo = highlightTo === square;
            const isLegalTarget = legalTargets.has(square);
            const isCaptureTarget = isLegalTarget && Boolean(piece);
            const isKingChecked = checkedKing === square;

            const pieceKey = piece
              ? `${piece.color}${piece.type.toUpperCase()}`
              : null;

            let backgroundColor = isLight ? '#f0f0d8' : '#86a666';

            if (isHighlightFrom || isHighlightTo) {
              backgroundColor = isLight ? '#f6f669' : '#baca2b';
            }

            if (isKingChecked) {
              backgroundColor = '#e66b6b';
            }

            if (isSelected) {
              backgroundColor = '#dce35f';
            }

            const coordinateColor = isLight ? '#86a666' : '#f0f0d8';

            return (
              <div
                key={square}
                onClick={() => onSquareClick(square)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => handleDrop(event, square)}
                className="relative flex min-w-0 items-center justify-center cursor-pointer"
                style={{ backgroundColor }}
                role="button"
                aria-label={`${square}${piece ? `, peça ${piece.color === 'w' ? 'branca' : 'preta'}` : ', casa vazia'}`}
              >
                {isLegalTarget && (
                  <span
                    className={`pointer-events-none absolute z-[5] ${
                      isCaptureTarget
                        ? 'inset-[3%] rounded-full border-[4px] border-black/30'
                        : 'h-[24%] w-[24%] rounded-full bg-black/25'
                    }`}
                  />
                )}

                {pieceKey && piece && (
                  <img
                    src={`/pieces/cburnett/${pieceKey}.svg`}
                    alt=""
                    draggable={piece.color === chess.turn()}
                    onDragStart={(event) =>
                      handleDragStart(event, square, piece.color)
                    }
                    className="relative z-10 h-[96%] w-[96%] select-none object-contain"
                    style={{
                      cursor:
                        piece.color === chess.turn() ? 'grab' : 'default',
                      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
                    }}
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                )}

                {colIdx === 0 && (
                  <span
                    className="pointer-events-none absolute left-1 top-0.5 z-20 text-[10px] font-bold"
                    style={{ color: coordinateColor }}
                  >
                    {rank}
                  </span>
                )}

                {rowIdx === 7 && (
                  <span
                    className="pointer-events-none absolute bottom-0 right-1 z-20 text-[10px] font-bold"
                    style={{ color: coordinateColor }}
                  >
                    {file}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
