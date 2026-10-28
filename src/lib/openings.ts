import { Chess } from 'chess.js';
import type { PositionAnalysis } from '@/lib/analysis';

export interface GameForRepertoire {
  id: string;
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

export interface OpeningStat {
  key: string;
  name: string;
  eco: string | null;
  moveSequence: string[];
  totalGames: number;
  asWhite: number;
  asBlack: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

export interface CriticalPosition {
  gameId: string;
  ply: number;
  fen: string;
  move: string | null;
  bestMove: string | null;
  evalCp: number | null;
  evalMate: number | null;
  classification: string | null;
  depth: number;
  openingName: string | null;
  whitePlayer: string | null;
  blackPlayer: string | null;
  result: string | null;
}

export interface VariantNode {
  ply: number;
  fen: string;
  move: string | null;
  evalCp: number | null;
  evalMate: number | null;
  bestMove: string | null;
  depth: number;
  hasEngineData: boolean;
  games: { id: string; white: string | null; black: string | null; result: string | null }[];
}

export interface VariantTree {
  root: VariantNode;
  children: Map<string, { move: string; node: VariantNode }[]>;
}

export interface RepertoireData {
  openings: OpeningStat[];
  criticalPositions: CriticalPosition[];
  variantTrees: { asWhite: VariantTree; asBlack: VariantTree };
  totalGames: number;
  gamesWithOpenings: number;
  gamesWithAnalysis: number;
}

const OPENING_PLY_DEPTH = 10;
const CRITICAL_PLY_LIMIT = 20;

function getHeader(pgn: string, key: string): string | null {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match ? match[1] : null;
}

/**
 * Mapeamento de códigos ECO para nomes de aberturas.
 * Baseado na classificação oficial da Enciclopédia de Aberturas de Xadrez.
 * Usado como fallback quando o PGN não tem cabeçalho [Opening] nem [ECOUrl].
 * Não inventa nomes — cada código corresponde à classificação ECO padrão.
 */
const ECO_NAMES: Record<string, string> = {
  // A — Aberturas de flanco
  A00: 'Abertura irregular', A01: 'Defesa Nimzowitsch-Larsen', A02: 'Abertura Bird',
  A03: 'Abertura Bird', A04: 'Abertura Retí', A05: 'Abertura Retí',
  A06: 'Abertura Retí', A07: 'Ataque Indiano do Rei', A08: 'Ataque Indiano do Rei',
  A09: 'Abertura Retí', A10: 'Defesa Indiana da Dama', A11: 'Defesa Indiana da Dama',
  A12: 'Defesa Indiana da Dama', A13: 'Defesa Indiana da Dama', A14: 'Defesa Indiana da Dama',
  A15: 'Defesa Indiana da Dama', A16: 'Defesa Indiana da Dama', A17: 'Defesa Indiana da Dama',
  A18: 'Defesa Indiana da Dama', A19: 'Defesa Indiana da Dama', A20: 'Defesa Inglesa',
  A21: 'Defesa Inglesa', A22: 'Defesa Inglesa', A23: 'Defesa Inglesa', A24: 'Defesa Inglesa',
  A25: 'Defesa Inglesa', A26: 'Defesa Inglesa', A27: 'Defesa Inglesa', A28: 'Defesa Inglesa',
  A29: 'Defesa Inglesa', A30: 'Defesa Inglesa', A31: 'Defesa Inglesa', A32: 'Defesa Inglesa',
  A33: 'Defesa Inglesa', A34: 'Defesa Inglesa', A35: 'Defesa Inglesa', A36: 'Defesa Inglesa',
  A37: 'Defesa Inglesa', A38: 'Defesa Inglesa', A39: 'Defesa Inglesa', A40: 'Defesa da Dama',
  A41: 'Defesa da Dama', A42: 'Defesa Moderna', A43: 'Defesa Antiga', A44: 'Defesa Antiga',
  A45: 'Abertura Indiana', A46: 'Abertura Indiana', A47: 'Defesa Indiana da Dama',
  A48: 'Defesa Indiana do Rei', A49: 'Defesa Indiana do Rei', A50: 'Abertura Indiana',
  A51: 'Gambito Budapeste', A52: 'Gambito Budapeste', A53: 'Defesa Indiana Antiga',
  A54: 'Defesa Indiana Antiga', A55: 'Defesa Indiana Antiga', A56: 'Defesa Benoni',
  A57: 'Gambito Benko', A58: 'Gambito Benko', A59: 'Gambito Benko', A60: 'Defesa Benoni',
  A61: 'Defesa Benoni', A62: 'Defesa Benoni', A63: 'Defesa Benoni', A64: 'Defesa Benoni',
  A65: 'Defesa Benoni', A66: 'Defesa Benoni', A67: 'Defesa Benoni', A68: 'Defesa Benoni',
  A69: 'Defesa Benoni', A70: 'Defesa Benoni', A71: 'Defesa Benoni', A72: 'Defesa Benoni',
  A73: 'Defesa Benoni', A74: 'Defesa Benoni', A75: 'Defesa Benoni', A76: 'Defesa Benoni',
  A77: 'Defesa Benoni', A78: 'Defesa Benoni', A79: 'Defesa Benoni', A80: 'Defesa Holandesa',
  A81: 'Defesa Holandesa', A82: 'Defesa Holandesa', A83: 'Defesa Holandesa', A84: 'Defesa Holandesa',
  A85: 'Defesa Holandesa', A86: 'Defesa Holandesa', A87: 'Defesa Holandesa', A88: 'Defesa Holandesa',
  A89: 'Defesa Holandesa', A90: 'Defesa Holandesa', A91: 'Defesa Holandesa', A92: 'Defesa Holandesa',
  A93: 'Defesa Holandesa', A94: 'Defesa Holandesa', A95: 'Defesa Holandesa', A96: 'Defesa Holandesa',
  A97: 'Defesa Holandesa', A98: 'Defesa Holandesa', A99: 'Defesa Holandesa',
  // B — Defesas semi-abertas
  B00: 'Defesa irregular', B01: 'Defesa Escandinava', B02: 'Defesa Alekhine',
  B03: 'Defesa Alekhine', B04: 'Defesa Alekhine', B05: 'Defesa Alekhine', B06: 'Defesa Moderna',
  B07: 'Defesa Pirc', B08: 'Defesa Pirc', B09: 'Defesa Pirc', B10: 'Defesa Caro-Kann',
  B11: 'Defesa Caro-Kann', B12: 'Defesa Caro-Kann', B13: 'Defesa Caro-Kann', B14: 'Defesa Caro-Kann',
  B15: 'Defesa Caro-Kann', B16: 'Defesa Caro-Kann', B17: 'Defesa Caro-Kann', B18: 'Defesa Caro-Kann',
  B19: 'Defesa Caro-Kann', B20: 'Defesa Siciliana', B21: 'Defesa Siciliana', B22: 'Defesa Siciliana',
  B23: 'Defesa Siciliana', B24: 'Defesa Siciliana', B25: 'Defesa Siciliana', B26: 'Defesa Siciliana',
  B27: 'Defesa Siciliana', B28: 'Defesa Siciliana', B29: 'Defesa Siciliana', B30: 'Defesa Siciliana',
  B31: 'Defesa Siciliana', B32: 'Defesa Siciliana', B33: 'Defesa Siciliana', B34: 'Defesa Siciliana',
  B35: 'Defesa Siciliana', B36: 'Defesa Siciliana', B37: 'Defesa Siciliana', B38: 'Defesa Siciliana',
  B39: 'Defesa Siciliana', B40: 'Defesa Siciliana', B41: 'Defesa Siciliana', B42: 'Defesa Siciliana',
  B43: 'Defesa Siciliana', B44: 'Defesa Siciliana', B45: 'Defesa Siciliana', B46: 'Defesa Siciliana',
  B47: 'Defesa Siciliana', B48: 'Defesa Siciliana', B49: 'Defesa Siciliana', B50: 'Defesa Siciliana',
  B51: 'Defesa Siciliana', B52: 'Defesa Siciliana', B53: 'Defesa Siciliana', B54: 'Defesa Siciliana',
  B55: 'Defesa Siciliana', B56: 'Defesa Siciliana', B57: 'Defesa Siciliana', B58: 'Defesa Siciliana',
  B59: 'Defesa Siciliana', B60: 'Defesa Siciliana', B61: 'Defesa Siciliana', B62: 'Defesa Siciliana',
  B63: 'Defesa Siciliana', B64: 'Defesa Siciliana', B65: 'Defesa Siciliana', B66: 'Defesa Siciliana',
  B67: 'Defesa Siciliana', B68: 'Defesa Siciliana', B69: 'Defesa Siciliana', B70: 'Defesa Siciliana',
  B71: 'Defesa Siciliana', B72: 'Defesa Siciliana', B73: 'Defesa Siciliana', B74: 'Defesa Siciliana',
  B75: 'Defesa Siciliana', B76: 'Defesa Siciliana', B77: 'Defesa Siciliana', B78: 'Defesa Siciliana',
  B79: 'Defesa Siciliana', B80: 'Defesa Siciliana', B81: 'Defesa Siciliana', B82: 'Defesa Siciliana',
  B83: 'Defesa Siciliana', B84: 'Defesa Siciliana', B85: 'Defesa Siciliana', B86: 'Defesa Siciliana',
  B87: 'Defesa Siciliana', B88: 'Defesa Siciliana', B89: 'Defesa Siciliana', B90: 'Defesa Siciliana',
  B91: 'Defesa Siciliana', B92: 'Defesa Siciliana', B93: 'Defesa Siciliana', B94: 'Defesa Siciliana',
  B95: 'Defesa Siciliana', B96: 'Defesa Siciliana', B97: 'Defesa Siciliana', B98: 'Defesa Siciliana',
  B99: 'Defesa Siciliana',
  // C — Aberturas abertas e de jogo
  C00: 'Defesa Francesa', C01: 'Defesa Francesa', C02: 'Defesa Francesa', C03: 'Defesa Francesa',
  C04: 'Defesa Francesa', C05: 'Defesa Francesa', C06: 'Defesa Francesa', C07: 'Defesa Francesa',
  C08: 'Defesa Francesa', C09: 'Defesa Francesa', C10: 'Defesa Francesa', C11: 'Defesa Francesa',
  C12: 'Defesa Francesa', C13: 'Defesa Francesa', C14: 'Defesa Francesa', C15: 'Defesa Francesa',
  C16: 'Defesa Francesa', C17: 'Defesa Francesa', C18: 'Defesa Francesa', C19: 'Defesa Francesa',
  C20: 'Abertura do Peão do Rei', C21: 'Gambito do Centro', C22: 'Gambito do Centro',
  C23: 'Abertura do Bispo', C24: 'Abertura do Bispo', C25: 'Abertura Vienense', C26: 'Abertura Vienense',
  C27: 'Abertura Vienense', C28: 'Abertura Vienense', C29: 'Gambito Vienense', C30: 'Gambito do Rei Aceito',
  C31: 'Gambito do Rei Recusado', C32: 'Gambito do Rei Recusado', C33: 'Gambito do Rei Aceito',
  C34: 'Gambito do Rei Aceito', C35: 'Gambito do Rei Aceito', C36: 'Gambito do Rei Aceito',
  C37: 'Gambito do Rei Aceito', C38: 'Gambito do Rei Aceito', C39: 'Gambito do Rei Recusado',
  C40: 'Abertura do Cavalo do Rei', C41: 'Defesa Philidor', C42: 'Defesa Petrov',
  C43: 'Defesa Petrov', C44: 'Abertura do Peão do Rei', C45: 'Abertura do Peão do Rei',
  C46: 'Abertura do Peão do Rei', C47: 'Abertura dos Quatro Cavalos', C48: 'Abertura dos Quatro Cavalos',
  C49: 'Abertura dos Quatro Cavalos', C50: 'Abertura Italiana', C51: 'Gambito Evans',
  C52: 'Gambito Evans', C53: 'Abertura Italiana', C54: 'Abertura Italiana', C55: 'Defesa dos Dois Cavalos',
  C56: 'Defesa dos Dois Cavalos', C57: 'Defesa dos Dois Cavalos', C58: 'Defesa dos Dois Cavalos',
  C59: 'Defesa dos Dois Cavalos', C60: 'Defesa Ruy López', C61: 'Defesa Ruy López',
  C62: 'Defesa Ruy López', C63: 'Defesa Ruy López', C64: 'Defesa Ruy López', C65: 'Defesa Ruy López',
  C66: 'Defesa Ruy López', C67: 'Defesa Ruy López', C68: 'Defesa Ruy López', C69: 'Defesa Ruy López',
  C70: 'Defesa Ruy López', C71: 'Defesa Ruy López', C72: 'Defesa Ruy López', C73: 'Defesa Ruy López',
  C74: 'Defesa Ruy López', C75: 'Defesa Ruy López', C76: 'Defesa Ruy López', C77: 'Defesa Ruy López',
  C78: 'Defesa Ruy López', C79: 'Defesa Ruy López', C80: 'Defesa Ruy López', C81: 'Defesa Ruy López',
  C82: 'Defesa Ruy López', C83: 'Defesa Ruy López', C84: 'Defesa Ruy López', C85: 'Defesa Ruy López',
  C86: 'Defesa Ruy López', C87: 'Defesa Ruy López', C88: 'Defesa Ruy López', C89: 'Defesa Ruy López',
  C90: 'Defesa Ruy López', C91: 'Defesa Ruy López', C92: 'Defesa Ruy López', C93: 'Defesa Ruy López',
  C94: 'Defesa Ruy López', C95: 'Defesa Ruy López', C96: 'Defesa Ruy López', C97: 'Defesa Ruy López',
  C98: 'Defesa Ruy López', C99: 'Defesa Ruy López',
  // D — Aberturas fechadas e gambitos da dama
  D00: 'Abertura do Peão da Dama', D01: 'Abertura do Peão da Dama', D02: 'Abertura do Peão da Dama',
  D03: 'Abertura do Peão da Dama', D04: 'Abertura do Peão da Dama', D05: 'Abertura do Peão da Dama',
  D06: 'Gambito da Dama', D07: 'Gambito da Dama', D08: 'Gambito da Dama Recusado', D09: 'Gambito da Dama Recusado',
  D10: 'Defesa Eslava', D11: 'Defesa Eslava', D12: 'Defesa Eslava', D13: 'Defesa Eslava', D14: 'Defesa Eslava',
  D15: 'Defesa Eslava', D16: 'Defesa Eslava', D17: 'Defesa Eslava', D18: 'Defesa Eslava', D19: 'Defesa Eslava',
  D20: 'Gambito da Dama Aceito', D21: 'Gambito da Dama Aceito', D22: 'Gambito da Dama Aceito',
  D23: 'Gambito da Dama Aceito', D24: 'Gambito da Dama Aceito', D25: 'Gambito da Dama Aceito',
  D26: 'Gambito da Dama Aceito', D27: 'Gambito da Dama Aceito', D28: 'Gambito da Dama Aceito',
  D29: 'Gambito da Dama Aceito', D30: 'Gambito da Dama Recusado', D31: 'Gambito da Dama Recusado',
  D32: 'Defesa Tarrasch', D33: 'Defesa Tarrasch', D34: 'Defesa Tarrasch', D35: 'Gambito da Dama Recusado',
  D36: 'Gambito da Dama Recusado', D37: 'Gambito da Dama Recusado', D38: 'Gambito da Dama Recusado',
  D39: 'Gambito da Dama Recusado', D40: 'Gambito da Dama Recusado', D41: 'Gambito da Dama Recusado',
  D42: 'Gambito da Dama Recusado', D43: 'Defesa Semi-Eslava', D44: 'Defesa Semi-Eslava',
  D45: 'Defesa Semi-Eslava', D46: 'Defesa Semi-Eslava', D47: 'Defesa Semi-Eslava', D48: 'Defesa Semi-Eslava',
  D49: 'Defesa Semi-Eslava', D50: 'Gambito da Dama Recusado', D51: 'Gambito da Dama Recusado',
  D52: 'Gambito da Dama Recusado', D53: 'Gambito da Dama Recusado', D54: 'Gambito da Dama Recusado',
  D55: 'Gambito da Dama Recusado', D56: 'Gambito da Dama Recusado', D57: 'Gambito da Dama Recusado',
  D58: 'Gambito da Dama Recusado', D59: 'Gambito da Dama Recusado', D60: 'Defesa Ortodoxa',
  D61: 'Defesa Ortodoxa', D62: 'Defesa Ortodoxa', D63: 'Defesa Ortodoxa', D64: 'Defesa Ortodoxa',
  D65: 'Defesa Ortodoxa', D66: 'Defesa Ortodoxa', D67: 'Defesa Ortodoxa', D68: 'Defesa Ortodoxa',
  D69: 'Defesa Ortodoxa', D70: 'Defesa Neo-Grunfeld', D71: 'Defesa Neo-Grunfeld', D72: 'Defesa Neo-Grunfeld',
  D73: 'Defesa Neo-Grunfeld', D74: 'Defesa Neo-Grunfeld', D75: 'Defesa Neo-Grunfeld', D76: 'Defesa Neo-Grunfeld',
  D77: 'Defesa Neo-Grunfeld', D78: 'Defesa Neo-Grunfeld', D79: 'Defesa Neo-Grunfeld', D80: 'Defesa Grunfeld',
  D81: 'Defesa Grunfeld', D82: 'Defesa Grunfeld', D83: 'Defesa Grunfeld', D84: 'Defesa Grunfeld',
  D85: 'Defesa Grunfeld', D86: 'Defesa Grunfeld', D87: 'Defesa Grunfeld', D88: 'Defesa Grunfeld',
  D89: 'Defesa Grunfeld', D90: 'Defesa Grunfeld', D91: 'Defesa Grunfeld', D92: 'Defesa Grunfeld',
  D93: 'Defesa Grunfeld', D94: 'Defesa Grunfeld', D95: 'Defesa Grunfeld', D96: 'Defesa Grunfeld',
  D97: 'Defesa Grunfeld', D98: 'Defesa Grunfeld', D99: 'Defesa Grunfeld',
  // E — Defesas indianas
  E00: 'Defesa Indiana da Dama', E01: 'Defesa Indiana da Dama', E02: 'Defesa Indiana da Dama',
  E03: 'Defesa Indiana da Dama', E04: 'Defesa Indiana da Dama', E05: 'Defesa Indiana da Dama',
  E06: 'Defesa Indiana da Dama', E07: 'Defesa Indiana da Dama', E08: 'Defesa Indiana da Dama',
  E09: 'Defesa Indiana da Dama', E10: 'Defesa Indiana da Dama', E11: 'Defesa Indiana da Dama',
  E12: 'Defesa Indiana da Dama', E13: 'Defesa Indiana da Dama', E14: 'Defesa Indiana da Dama',
  E15: 'Defesa Indiana da Dama', E16: 'Defesa Indiana da Dama', E17: 'Defesa Indiana da Dama',
  E18: 'Defesa Indiana da Dama', E19: 'Defesa Indiana da Dama', E20: 'Defesa Nimzo-Indiana',
  E21: 'Defesa Nimzo-Indiana', E22: 'Defesa Nimzo-Indiana', E23: 'Defesa Nimzo-Indiana',
  E24: 'Defesa Nimzo-Indiana', E25: 'Defesa Nimzo-Indiana', E26: 'Defesa Nimzo-Indiana',
  E27: 'Defesa Nimzo-Indiana', E28: 'Defesa Nimzo-Indiana', E29: 'Defesa Nimzo-Indiana',
  E30: 'Defesa Nimzo-Indiana', E31: 'Defesa Nimzo-Indiana', E32: 'Defesa Nimzo-Indiana',
  E33: 'Defesa Nimzo-Indiana', E34: 'Defesa Nimzo-Indiana', E35: 'Defesa Nimzo-Indiana',
  E36: 'Defesa Nimzo-Indiana', E37: 'Defesa Nimzo-Indiana', E38: 'Defesa Nimzo-Indiana',
  E39: 'Defesa Nimzo-Indiana', E40: 'Defesa Nimzo-Indiana', E41: 'Defesa Nimzo-Indiana',
  E42: 'Defesa Nimzo-Indiana', E43: 'Defesa Nimzo-Indiana', E44: 'Defesa Nimzo-Indiana',
  E45: 'Defesa Nimzo-Indiana', E46: 'Defesa Nimzo-Indiana', E47: 'Defesa Nimzo-Indiana',
  E48: 'Defesa Nimzo-Indiana', E49: 'Defesa Nimzo-Indiana', E50: 'Defesa Nimzo-Indiana',
  E51: 'Defesa Nimzo-Indiana', E52: 'Defesa Nimzo-Indiana', E53: 'Defesa Nimzo-Indiana',
  E54: 'Defesa Nimzo-Indiana', E55: 'Defesa Nimzo-Indiana', E56: 'Defesa Nimzo-Indiana',
  E57: 'Defesa Nimzo-Indiana', E58: 'Defesa Nimzo-Indiana', E59: 'Defesa Nimzo-Indiana',
  E60: 'Defesa Indiana do Rei', E61: 'Defesa Indiana do Rei', E62: 'Defesa Indiana do Rei',
  E63: 'Defesa Indiana do Rei', E64: 'Defesa Indiana do Rei', E65: 'Defesa Indiana do Rei',
  E66: 'Defesa Indiana do Rei', E67: 'Defesa Indiana do Rei', E68: 'Defesa Indiana do Rei',
  E69: 'Defesa Indiana do Rei', E70: 'Defesa Indiana do Rei', E71: 'Defesa Indiana do Rei',
  E72: 'Defesa Indiana do Rei', E73: 'Defesa Indiana do Rei', E74: 'Defesa Indiana do Rei',
  E75: 'Defesa Indiana do Rei', E76: 'Defesa Indiana do Rei', E77: 'Defesa Indiana do Rei',
  E78: 'Defesa Indiana do Rei', E79: 'Defesa Indiana do Rei', E80: 'Defesa Indiana do Rei',
  E81: 'Defesa Indiana do Rei', E82: 'Defesa Indiana do Rei', E83: 'Defesa Indiana do Rei',
  E84: 'Defesa Indiana do Rei', E85: 'Defesa Indiana do Rei', E86: 'Defesa Indiana do Rei',
  E87: 'Defesa Indiana do Rei', E88: 'Defesa Indiana do Rei', E89: 'Defesa Indiana do Rei',
  E90: 'Defesa Indiana do Rei', E91: 'Defesa Indiana do Rei', E92: 'Defesa Indiana do Rei',
  E93: 'Defesa Indiana do Rei', E94: 'Defesa Indiana do Rei', E95: 'Defesa Indiana do Rei',
  E96: 'Defesa Indiana do Rei', E97: 'Defesa Indiana do Rei', E98: 'Defesa Indiana do Rei',
  E99: 'Defesa Indiana do Rei',
};

/**
 * Extrai o nome da abertura de um PGN, em ordem de confiabilidade:
 * 1. Cabeçalho [Opening] (padrão PGN/Lichess)
 * 2. Cabeçalho [ECOUrl] (Chess.com) — o nome está embutido no caminho da URL
 * 3. Cabeçalho [ECO] → tabela de códigos ECO padrão
 * Retorna null quando nenhuma fonte confiável está disponível.
 */
export function extractOpeningNameFromPgn(pgn: string): string | null {
  // 1. Cabeçalho [Opening] — mais confiável, presente em PGNs da Lichess
  const headerName = getHeader(pgn, 'Opening');
  if (headerName && headerName !== '?') return headerName;

  // 2. Cabeçalho [ECOUrl] — Chess.com inclui o nome no caminho da URL
  //    ex: https://www.chess.com/openings/Sicilian-Defense-Open
  const ecoUrl = getHeader(pgn, 'ECOUrl');
  if (ecoUrl) {
    const match = ecoUrl.match(/\/openings\/(.+)$/);
    if (match) {
      // Converter hifens em espaços e capitalizar palavras
      const name = match[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return name;
    }
  }

  // 3. Cabeçalho [ECO] → tabela de códigos ECO padrão
  const eco = getHeader(pgn, 'ECO');
  if (eco && eco !== '?') {
    return ECO_NAMES[eco] ?? null;
  }

  return null;
}

interface ExtractedOpeningInfo {
  name: string | null;
  eco: string | null;
  moves: string[];
  fen: string;
}

// Cache de PGNs já processados: game.id → resultado extraído.
// Evita reprocessar o mesmo PGN (new Chess + loadPgn + history) múltiplas vezes
// quando computeOpeningFrequency, computeCriticalPositions e computeVariantTrees
// rodam na mesma lista de partidas.
const openingInfoCache = new Map<string, ExtractedOpeningInfo>();

function extractOpeningInfo(game: GameForRepertoire): ExtractedOpeningInfo {
  const cached = openingInfoCache.get(game.id);
  if (cached) return cached;

  let name = game.opening_name;
  let eco = game.opening_eco;

  if (!name || name === '?') {
    const pgnName = extractOpeningNameFromPgn(game.pgn);
    if (pgnName) name = pgnName;
  }

  if (!eco || eco === '?') {
    const headerEco = getHeader(game.pgn, 'ECO');
    if (headerEco && headerEco !== '?') eco = headerEco;
  }

  let moves: string[] = [];
  let fen = '';
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    moves = chess.history();
    fen = chess.fen();
  } catch {
    const result: ExtractedOpeningInfo = { name, eco, moves: [], fen: 'start' };
    openingInfoCache.set(game.id, result);
    return result;
  }

  const result: ExtractedOpeningInfo = { name, eco, moves, fen };
  openingInfoCache.set(game.id, result);
  return result;
}

/** Limpa o cache de aberturas. Chamar quando a lista de partidas muda. */
export function clearOpeningInfoCache(): void {
  openingInfoCache.clear();
}

function buildOpeningKey(moves: string[], depth: number): string {
  return moves.slice(0, depth).join(' ');
}

function classifyResult(
  result: string | null,
  userColor: 'white' | 'black' | null,
): 'win' | 'draw' | 'loss' | null {
  if (!result) return null;
  if (result === '1/2-1/2') return 'draw';
  if (!userColor) return null;
  if (result === '1-0') return userColor === 'white' ? 'win' : 'loss';
  if (result === '0-1') return userColor === 'black' ? 'win' : 'loss';
  return null;
}

export function computeOpeningFrequency(
  games: GameForRepertoire[],
  filters: { period: 'all' | '30d' | '90d'; timeControl: 'all' | 'blitz' | 'rapid' | 'classical' },
): OpeningStat[] {
  const now = Date.now();
  const periodMs = filters.period === '30d' ? 30 * 86400000 : filters.period === '90d' ? 90 * 86400000 : 0;

  const filtered = games.filter((g) => {
    if (filters.period !== 'all' && g.played_at) {
      const ts = new Date(g.played_at).getTime();
      if (now - ts > periodMs) return false;
    }
    if (filters.timeControl !== 'all' && g.time_control) {
      const tc = g.time_control.toLowerCase();
      if (filters.timeControl === 'blitz' && !tc.includes('blitz') && !tc.includes('180') && !tc.includes('300')) return false;
      if (filters.timeControl === 'rapid' && !tc.includes('rapid') && !tc.includes('600') && !tc.includes('900') && !tc.includes('1800')) return false;
      if (filters.timeControl === 'classical' && !tc.includes('classical') && !tc.includes('2700') && !tc.includes('3600')) return false;
    }
    return true;
  });

  const groups = new Map<string, GameForRepertoire[]>();

  // Pré-extrair info de todas as partidas uma única vez (popula o cache).
  // Os acessos subsequentes dentro deste loop e nas outras funções usam o cache.
  const infos = filtered.map((g) => ({ game: g, info: extractOpeningInfo(g) }));

  for (const { game, info } of infos) {
    const key =
      info.name && info.name !== '?'
        ? info.name
        : buildOpeningKey(info.moves, OPENING_PLY_DEPTH) || 'unknown';

    const existing = groups.get(key) ?? [];
    existing.push(game);
    groups.set(key, existing);
  }

  const stats: OpeningStat[] = [];

  for (const [key, group] of groups.entries()) {
    // Usar o cache em vez de chamar extractOpeningInfo novamente para cada jogo.
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let asWhite = 0;
    let asBlack = 0;
    let firstInfo: ExtractedOpeningInfo | null = null;

    for (const g of group) {
      const gInfo = extractOpeningInfo(g); // cache hit — sem reprocessamento
      if (!firstInfo) firstInfo = gInfo;
      if (g.user_color === 'white') asWhite++;
      if (g.user_color === 'black') asBlack++;
      const outcome = classifyResult(g.result, g.user_color);
      if (outcome === 'win') wins++;
      else if (outcome === 'draw') draws++;
      else if (outcome === 'loss') losses++;
    }

    const decided = wins + draws + losses;
    const info = firstInfo ?? extractOpeningInfo(group[0]);
    const name = info.name && info.name !== '?' ? info.name : key === 'unknown' ? 'Abertura não identificada' : `Lances: ${key}`;

    stats.push({
      key,
      name,
      eco: info.eco && info.eco !== '?' ? info.eco : null,
      moveSequence: info.moves.slice(0, OPENING_PLY_DEPTH),
      totalGames: group.length,
      asWhite,
      asBlack,
      wins,
      draws,
      losses,
      winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    });
  }

  stats.sort((a, b) => b.totalGames - a.totalGames);
  return stats;
}

export interface AnalysisForRepertoire {
  game_id: string;
  positions: PositionAnalysis[];
}

export function computeCriticalPositions(
  games: GameForRepertoire[],
  analyses: AnalysisForRepertoire[],
): CriticalPosition[] {
  const gameMap = new Map(games.map((g) => [g.id, g]));
  const analysisMap = new Map(analyses.map((a) => [a.game_id, a]));
  const positions: CriticalPosition[] = [];

  for (const game of games) {
    const analysis = analysisMap.get(game.id);
    if (!analysis) continue;

    const info = extractOpeningInfo(game);

    for (const pos of analysis.positions) {
      if (pos.ply === 0 || pos.ply > CRITICAL_PLY_LIMIT) continue;
      if (!pos.classification) continue;
      if (pos.classification === 'best' || pos.classification === 'excellent' || pos.classification === 'good') continue;

      positions.push({
        gameId: game.id,
        ply: pos.ply,
        fen: pos.fen,
        move: pos.move,
        bestMove: pos.bestMove,
        evalCp: pos.evalCp,
        evalMate: pos.evalMate,
        classification: pos.classification,
        depth: pos.depth,
        openingName: info.name && info.name !== '?' ? info.name : null,
        whitePlayer: game.white_player,
        blackPlayer: game.black_player,
        result: game.result,
      });
    }
  }

  positions.sort((a, b) => {
    const severity: Record<string, number> = { blunder: 0, mistake: 1, inaccuracy: 2 };
    return (severity[a.classification ?? ''] ?? 3) - (severity[b.classification ?? ''] ?? 3);
  });

  return positions;
}

export function computeVariantTrees(
  games: GameForRepertoire[],
  analyses: AnalysisForRepertoire[],
): { asWhite: VariantTree; asBlack: VariantTree } {
  const whiteGames = games.filter((g) => g.user_color === 'white');
  const blackGames = games.filter((g) => g.user_color === 'black');

  return {
    asWhite: buildVariantTree(whiteGames, analyses),
    asBlack: buildVariantTree(blackGames, analyses),
  };
}

function buildVariantTree(
  games: GameForRepertoire[],
  analyses: AnalysisForRepertoire[],
): VariantTree {
  const analysisMap = new Map(analyses.map((a) => [a.game_id, a]));
  const root: VariantNode = {
    ply: 0,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    move: null,
    evalCp: null,
    evalMate: null,
    bestMove: null,
    depth: 0,
    hasEngineData: false,
    games: games.map((g) => ({ id: g.id, white: g.white_player, black: g.black_player, result: g.result })),
  };

  const children = new Map<string, { move: string; node: VariantNode }[]>();

  const nodesByKey = new Map<string, VariantNode>();
  nodesByKey.set(`0:${root.fen}`, root);

  for (const game of games) {
    const info = extractOpeningInfo(game);
    if (info.moves.length === 0) continue;

    const analysis = analysisMap.get(game.id);
    const positions = analysis?.positions ?? [];

    let chess: Chess;
    try {
      chess = new Chess();
    } catch {
      continue;
    }

    const maxPly = Math.min(info.moves.length, OPENING_PLY_DEPTH);
    let prevKey = `0:${root.fen}`;

    for (let i = 0; i < maxPly; i++) {
      const move = info.moves[i];
      try {
        chess.move(move);
      } catch {
        break;
      }

      const fen = chess.fen();
      const ply = i + 1;
      const key = `${ply}:${fen}`;

      let node = nodesByKey.get(key);
      if (!node) {
        const analysisPos = positions.find((p) => p.ply === ply);
        node = {
          ply,
          fen,
          move,
          evalCp: analysisPos?.evalCp ?? null,
          evalMate: analysisPos?.evalMate ?? null,
          bestMove: analysisPos?.bestMove ?? null,
          depth: analysisPos?.depth ?? 0,
          hasEngineData: !!analysisPos,
          games: [{ id: game.id, white: game.white_player, black: game.black_player, result: game.result }],
        };
        nodesByKey.set(key, node);

        const childList = children.get(prevKey) ?? [];
        childList.push({ move, node });
        children.set(prevKey, childList);
      } else {
        node.games.push({ id: game.id, white: game.white_player, black: game.black_player, result: game.result });
      }

      prevKey = key;
    }
  }

  return { root, children };
}
