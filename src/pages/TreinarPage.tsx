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

  // Reset when exercise changes
  useEffect(() => {
    setBoardFen(exercise.fen);
    setSelectedSquare(null);
    setHighlightMove(null);
  }, [exercise.id, exercise.fen]);

  const sideLabel = exercise.side_to_move === 'w' ? 'Brancas' : 'Pretas';
  const difficultyLabel = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }[exercise.difficulty] ?? exercise.difficulty;
  const categoryLabel = CATEGORY_LABELS[exercise.category] ?? exercise.category;

  const handleSquareClick = useCallback(
    (square: string) => {
      if (feedback) return; // Don't allow moves after feedback

      if (!selectedSquare) {
        // Select piece
        try {
          const chess = new Chess(boardFen);
          const piece = chess.get(square as never);
          if (piece && piece.color === exercise.side_to_move) {
            setSelectedSquare(square);
          }
        } catch {
          // ignore
        }
      } else {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          return;
        }
        // Try to move
        onMove(selectedSquare, square);
        setSelectedSquare(null);
      }
    },
    [selectedSquare, feedback, boardFen, exercise.side_to_move, onMove],
  );

  // Show the move result on the board
  useEffect(() => {
    if (feedback && movePlayed && exercise.best_move) {
      try {
        const chess = new Chess(exercise.fen);
        const move = chess.move({
          from: movePlayed.slice(0, 2),
          to: movePlayed.slice(2, 4),
          promotion: movePlayed.length > 4 ? movePlayed[4] : undefined,
        });
        if (move) {
          setBoardFen(chess.fen());
          setHighlightMove(`${move.from}${move.to}`);
        }
      } catch {
        // If illegal somehow, show best move instead
        try {
          const chess = new Chess(exercise.fen);
          chess.move(exercise.best_move);
          setBoardFen(chess.fen());
        } catch {
          // ignore
        }
      }
    }
  }, [feedback, movePlayed, exercise.fen, exercise.best_move]);

  const bestMoveSan = useMemo(() => {
    if (!exercise.best_move) return null;
    return uciToSan(exercise.fen, exercise.best_move);
  }, [exercise.fen, exercise.best_move]);

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      {/* Board */}
      <div className="space-y-3">
        <div className="flex justify-center">
          <InteractiveBoard
            fen={boardFen}
            onSquareClick={handleSquareClick}
            selectedSquare={selectedSquare}
            highlightFrom={highlightMove?.slice(0, 2) ?? null}
            highlightTo={highlightMove?.slice(2, 4) ?? null}
            size={500}
          />
        </div>

        {/* Instruction */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-brand-300" />
            <p className="text-sm font-semibold text-content-primary">{exercise.instruction}</p>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-content-secondary flex-wrap">
            <span className="chip text-xs">{sideLabel} jogam</span>
            <span className="chip text-xs">{categoryLabel}</span>
            <span className="chip text-xs">{difficultyLabel}</span>
            {wasCorrect !== undefined && (
              <span className={`chip text-xs ${wasCorrect ? 'text-success-400' : 'text-warning-300'}`}>
                {wasCorrect ? 'Resolvido antes' : 'Tentado antes'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        {/* Feedback */}
        {feedback === 'correct' && (
          <div className="card p-5 border-success-500/30">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-success-400" />
              <p className="text-base font-bold text-success-400">Correto!</p>
            </div>
            <p className="text-sm text-content-secondary">Você encontrou o melhor lance.</p>
          </div>
        )}

        {feedback === 'wrong' && (
          <div className="card p-5 border-danger-500/30">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-5 w-5 text-danger-400" />
              <p className="text-base font-bold text-danger-400">Incorreto</p>
            </div>
            <p className="text-sm text-content-secondary">
              O melhor lance era <span className="font-mono font-semibold text-content-primary">{bestMoveSan ?? exercise.best_move}</span>.
              Veja a explicação abaixo.
            </p>
          </div>
        )}

        {/* Explanation */}
        {showExplanation && exercise.explanation && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-warning-300" />
              Explicação
            </h3>
            <p className="text-xs text-content-secondary leading-relaxed">{exercise.explanation}</p>

            {exercise.pv && (
              <div className="mt-3 rounded-xl bg-ink-raised border border-ink-border p-3">
                <p className="text-xs text-content-muted mb-1">Variação principal:</p>
                <p className="text-xs font-mono text-content-secondary">{exercise.pv}</p>
              </div>
            )}

            {exercise.acceptable_moves.length === 0 && (
              <p className="text-xs text-content-muted mt-3 italic">
                Apenas o melhor lance é aceito como correto. Sem MultiPV na análise, não é possível validar alternativas equivalentes.
              </p>
            )}
          </div>
        )}

        {/* Game reference */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-content-secondary mb-2">Partida de origem</h3>
          <Link to={`/app/analises/${exercise.game_id}`} className="flex items-center justify-between hover:text-brand-300 transition-colors">
            <span className="text-sm text-content-primary">Ver partida completa</span>
            <ArrowRight className="h-4 w-4 text-content-muted" />
          </Link>
          <p className="text-xs text-content-muted mt-1">Lance {Math.ceil(exercise.source_ply / 2)}</p>
        </div>

        {/* Next button */}
        {feedback && !isLast && (
          <Button variant="primary" onClick={onNext} className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
            Próximo exercício
          </Button>
        )}
        {feedback && isLast && (
          <div className="card p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-success-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-content-primary">Você completou todos os exercícios!</p>
            <Link to="/app/evolucao" className="block mt-3">
              <Button variant="secondary" className="w-full">Ver evolução</Button>
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
}: {
  fen: string;
  onSquareClick: (square: string) => void;
  selectedSquare: string | null;
  highlightFrom: string | null;
  highlightTo: string | null;
  size?: number;
}) {
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const squares = useMemo(() => {
    const chess = new Chess(fen);
    return chess.board();
  }, [fen]);

  return (
    <div
      className="relative w-full select-none rounded-xl overflow-hidden border border-ink-border"
      style={{ maxWidth: size, aspectRatio: '1 / 1' }}
    >
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {squares.map((row, rowIdx) =>
          row.map((piece, colIdx) => {
            const isLight = (rowIdx + colIdx) % 2 === 0;
            const file = FILES[colIdx];
            const rank = RANKS[rowIdx];
            const square = `${file}${rank}`;
            const isSelected = selectedSquare === square;
            const isHighlightFrom = highlightFrom === square;
            const isHighlightTo = highlightTo === square;

            const pieceUnicode: Record<string, string> = {
              wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
              bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
            };
            const pieceKey = piece ? `${piece.color}${piece.type.toUpperCase()}` : null;

            return (
              <div
                key={square}
                onClick={() => onSquareClick(square)}
                className={`flex items-center justify-center cursor-pointer transition-colors ${
                  isLight ? 'bg-[#e8e4d5]' : 'bg-[#658653]'
                } ${isSelected ? 'ring-2 ring-brand-400 ring-inset' : ''} ${
                  isHighlightFrom ? 'bg-brand-500/30' : ''
                } ${isHighlightTo ? 'bg-success-500/30' : ''}`}
                style={{ fontSize: size / 8 * 0.62 }}
              >
                {pieceKey && piece && (
                  <span
                    className={`relative z-10 select-none leading-none ${
                      piece.color === 'w' ? 'text-white' : 'text-[#171717]'
                    }`}
                    style={{
                      fontFamily: '"DejaVu Sans", "Segoe UI Symbol", serif',
                      fontSize: '1em',
                      WebkitTextStroke:
                        piece.color === 'w' ? '1px #343434' : '0.7px #f5f5f5',
                      paintOrder: 'stroke fill',
                      filter:
                        piece.color === 'w'
                          ? 'drop-shadow(0 2px 2px rgba(0,0,0,0.65))'
                          : 'drop-shadow(0 2px 2px rgba(0,0,0,0.55))',
                    }}
                  >
                    {pieceUnicode[pieceKey]}
                  </span>
                )}
                {colIdx === 0 && (
                  <span className="absolute left-1 top-0.5 text-[9px] font-medium text-content-muted/60">{rank}</span>
                )}
                {rowIdx === 7 && (
                  <span className="absolute right-1 bottom-0 text-[9px] font-medium text-content-muted/60">{file}</span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
