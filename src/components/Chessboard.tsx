import { useMemo } from 'react';
import { Chess } from 'chess.js';

interface ChessboardProps {
  fen: string;
  size?: number;
  /** UCI do último lance jogado (ex: "e2e4"), para destacar casas de origem/destino. */
  lastMove?: string | null;
  /** UCI do melhor lance sugerido pela análise, para desenhar uma seta. */
  bestMove?: string | null;
}

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const LIGHT_SQ = '#f0f0d8';
const DARK_SQ = '#86a666';
const LAST_MOVE_LIGHT = '#f6f669';
const LAST_MOVE_DARK = '#baca2b';

export function Chessboard({ fen, size = 480, lastMove = null, bestMove = null }: ChessboardProps) {
  const board = useMemo(() => parseFen(fen), [fen]);

  const lastMoveSquares = useMemo(() => {
    if (!lastMove || lastMove.length < 4) return null;
    return { from: lastMove.slice(0, 2), to: lastMove.slice(2, 4) };
  }, [lastMove]);

  const arrow = useMemo(() => {
    if (!bestMove || bestMove.length < 4) return null;
    return { from: bestMove.slice(0, 2), to: bestMove.slice(2, 4) };
  }, [bestMove]);

  return (
    <div
      className="relative w-full select-none overflow-hidden rounded-sm border border-[#56604b] shadow-xl"
      style={{ maxWidth: size, aspectRatio: '1 / 1' }}
    >
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {board.map((row, rowIdx) =>
          row.map((piece, colIdx) => {
            const isLight = (rowIdx + colIdx) % 2 === 0;
            const file = FILES[colIdx];
            const rank = RANKS[rowIdx];
            const squareName = `${file}${rank}`;

            let bg = isLight ? LIGHT_SQ : DARK_SQ;
            if (lastMoveSquares) {
              if (squareName === lastMoveSquares.from || squareName === lastMoveSquares.to) {
                bg = isLight ? LAST_MOVE_LIGHT : LAST_MOVE_DARK;
              }
            }

            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                className="flex items-center justify-center relative"
                style={{ backgroundColor: bg, fontSize: `clamp(28px, ${(size / 8) * 0.62}px, 60px)` }}
              >
                {piece && (
                  <img
                    src={`/pieces/cburnett/${piece}.svg`}
                    alt=""
                    draggable={false}
                    className="relative z-10 h-[96%] w-[96%] select-none object-contain"
                    style={{
                      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
                    }}
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                )}
                {colIdx === 0 && (
                  <span
                    className="absolute left-0.5 top-0 text-[9px] sm:text-[10px] font-semibold pointer-events-none"
                    style={{ color: isLight ? '#7fa550' : '#ebecd0' }}
                  >
                    {rank}
                  </span>
                )}
                {rowIdx === 7 && (
                  <span
                    className="absolute right-0.5 bottom-0 text-[9px] sm:text-[10px] font-semibold pointer-events-none"
                    style={{ color: isLight ? '#7fa550' : '#ebecd0' }}
                  >
                    {file}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>

      {arrow && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
          viewBox="0 0 8 8"
          preserveAspectRatio="none"
        >
          <BestMoveArrow from={arrow.from} to={arrow.to} />
        </svg>
      )}
    </div>
  );
}

function BestMoveArrow({ from, to }: { from: string; to: string }) {
  const fromCol = from.charCodeAt(0) - 97;
  const fromRow = 8 - parseInt(from[1], 10);
  const toCol = to.charCodeAt(0) - 97;
  const toRow = 8 - parseInt(to[1], 10);

  if (fromCol === toCol && fromRow === toRow) return null;

  const x1 = fromCol + 0.5;
  const y1 = fromRow + 0.5;
  const x2 = toCol + 0.5;
  const y2 = toRow + 0.5;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;

  const ux = dx / len;
  const uy = dy / len;
  const headLen = 0.32;
  const headWidth = 0.16;

  const shaftEndX = x2 - ux * headLen;
  const shaftEndY = y2 - uy * headLen;

  const perpX = -uy;
  const perpY = ux;

  const p1x = shaftEndX + perpX * headWidth;
  const p1y = shaftEndY + perpY * headWidth;
  const p2x = shaftEndX - perpX * headWidth;
  const p2y = shaftEndY - perpY * headWidth;

  const linePath = `M ${x1} ${y1} L ${shaftEndX} ${shaftEndY}`;
  const headPath = `M ${x2} ${y2} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`;

  return (
    <>
      <path d={linePath} stroke="rgba(34,211,238,0.85)" strokeWidth="0.14" strokeLinecap="round" />
      <path d={headPath} fill="rgba(34,211,238,0.85)" />
    </>
  );
}

function parseFen(fen: string): (string | null)[][] {
  const chess = new Chess(fen);
  const board = chess.board();
  return board.map((row) =>
    row.map((sq) => {
      if (!sq) return null;
      return `${sq.color}${sq.type.toUpperCase()}`;
    }),
  );
}
