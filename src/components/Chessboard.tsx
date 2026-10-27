import { useMemo } from 'react';
import { Chess } from 'chess.js';

interface ChessboardProps {
  fen: string;
  size?: number;
}

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function Chessboard({ fen, size = 480 }: ChessboardProps) {
  const board = useMemo(() => parseFen(fen), [fen]);
  const sqSize = size / 8;

  return (
    <div
      className="relative w-full select-none rounded-xl overflow-hidden border border-ink-border"
      style={{ maxWidth: size, aspectRatio: '1 / 1' }}
    >
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {board.map((row, rowIdx) =>
          row.map((piece, colIdx) => {
            const isLight = (rowIdx + colIdx) % 2 === 0;
            const file = FILES[colIdx];
            const rank = RANKS[rowIdx];
            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                className={`flex items-center justify-center ${isLight ? 'bg-[#3a4358]' : 'bg-[#1C2434]'}`}
                style={{ fontSize: sqSize * 0.62 }}
              >
                {piece && (
                  <span
                    className={`leading-none ${piece[0] === 'w' ? 'text-content-primary' : 'text-[#0B0F19]'}`}
                    style={{ textShadow: piece[0] === 'w' ? '0 1px 2px rgba(0,0,0,0.5)' : '0 1px 2px rgba(255,255,255,0.15)' }}
                  >
                    {PIECE_UNICODE[piece]}
                  </span>
                )}
                {colIdx === 0 && (
                  <span className="absolute left-1 top-0.5 text-[9px] font-medium text-content-muted/60">
                    {rank}
                  </span>
                )}
                {rowIdx === 7 && (
                  <span className="absolute right-1 bottom-0 text-[9px] font-medium text-content-muted/60">
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
