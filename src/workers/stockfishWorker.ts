/// <reference lib="webworker" />

/**
 * Stockfish Web Worker.
 * Carrega o engine Stockfish 19 (lite, single-threaded) compilado em WASM
 * e expõe uma interface UCI simplificada para o thread principal.
 *
 * Licença: GPLv3 (ver public/stockfish-license.txt)
 */

let engine: Worker | null = null;
let ready = false;
const pendingCommands: string[] = [];

interface AnalysisRequest {
  type: 'init' | 'analyze' | 'stop' | 'quit';
  fen?: string;
  depth?: number;
  movetime?: number;
  multiPv?: number;
}

interface AnalysisResult {
  type: 'ready' | 'info' | 'bestmove' | 'error';
  depth?: number;
  scoreCp?: number;
  scoreMate?: number;
  pv?: string;
  bestMove?: string;
  multiPv?: number;
  wdl?: { win: number; draw: number; loss: number };
}

function initEngine() {
  // O arquivo stockfish.js em /public carrega stockfish.wasm do mesmo diretório
  engine = new Worker('/stockfish.js');

  engine.addEventListener('message', (e: MessageEvent<string>) => {
    const line = e.data;
    if (typeof line !== 'string') return;

    if (line === 'uciok') {
      engine?.postMessage('isready');
      return;
    }

    if (line === 'readyok') {
      ready = true;
      flushCommands();
      postMessage({ type: 'ready' } satisfies AnalysisResult);
      return;
    }

    if (line.startsWith('info')) {
      const result = parseInfoLine(line);
      if (result) postMessage(result satisfies AnalysisResult);
      return;
    }

    if (line.startsWith('bestmove')) {
      const match = line.match(/bestmove (\S+)/);
      if (match) {
        postMessage({ type: 'bestmove', bestMove: match[1] } satisfies AnalysisResult);
      }
      return;
    }
  });

  engine.addEventListener('error', (e: ErrorEvent) => {
    postMessage({ type: 'error' } satisfies AnalysisResult);
  });

  engine.postMessage('uci');
}

function parseInfoLine(line: string): AnalysisResult | null {
  // Formato: info depth D score cp X pv move1 move2...
  // Ou:     info depth D score mate M pv move1 move2...
  // Ou:     info multipv N depth D score cp X pv ...
  const depthMatch = line.match(/depth (\d+)/);
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  const pvMatch = line.match(/pv (.+)/);
  const multiPvMatch = line.match(/multipv (\d+)/);
  const wdlMatch = line.match(/wdl (\d+) (\d+) (\d+)/);

  if (!depthMatch && !cpMatch && !mateMatch) return null;

  const result: AnalysisResult = { type: 'info' };
  if (depthMatch) result.depth = parseInt(depthMatch[1], 10);
  if (cpMatch) result.scoreCp = parseInt(cpMatch[1], 10);
  if (mateMatch) result.scoreMate = parseInt(mateMatch[1], 10);
  if (pvMatch) result.pv = pvMatch[1];
  if (multiPvMatch) result.multiPv = parseInt(multiPvMatch[1], 10);
  if (wdlMatch) {
    result.wdl = {
      win: parseInt(wdlMatch[1], 10),
      draw: parseInt(wdlMatch[2], 10),
      loss: parseInt(wdlMatch[3], 10),
    };
  }
  return result;
}

function sendCommand(cmd: string) {
  if (!engine) return;
  if (ready) {
    engine.postMessage(cmd);
  } else {
    pendingCommands.push(cmd);
  }
}

function flushCommands() {
  while (pendingCommands.length > 0) {
    engine?.postMessage(pendingCommands.shift());
  }
}

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      if (!engine) initEngine();
      break;

    case 'analyze': {
      if (!msg.fen) break;
      sendCommand('ucinewgame');
      sendCommand(`position fen ${msg.fen}`);

      const parts = ['go'];
      if (msg.depth) parts.push(`depth ${msg.depth}`);
      if (msg.movetime) parts.push(`movetime ${msg.movetime}`);
      if (!msg.depth && !msg.movetime) parts.push('depth 15');

      if (msg.multiPv && msg.multiPv > 1) {
        sendCommand(`setoption name MultiPV value ${msg.multiPv}`);
      }
      sendCommand(parts.join(' '));
      break;
    }

    case 'stop':
      sendCommand('stop');
      break;

    case 'quit':
      sendCommand('quit');
      engine?.terminate();
      engine = null;
      ready = false;
      break;
  }
};

export {};
