import {applyMove} from './engine.js?v=14';

// The compact animal-shogi convention uses R (Rooster) for the promoted chick.
// Piece case follows the actual first mover; board coordinates stay a–c / 1–4.
const SYMBOLS = {L:'L', E:'E', G:'G', C:'C', H:'R'};
const NAMES = {L:'獅子', E:'大象', G:'長頸鹿', C:'小雞', H:'母雞'};
const square = index => `${'abc'[index % 3]}${Math.floor(index / 3) + 1}`;
const spokenSquare = index => square(index).toUpperCase();

function describe(before, move, first) {
  if (first !== 0 && first !== 1) throw new Error('First player must be 0 or 1.');
  const after = applyMove(before, move);
  const owner = before.turn;
  const side = owner === first ? 'sente' : 'gote';
  const type = move.from === null ? move.drop : before.board[move.from].type;
  const symbol = side === 'sente' ? SYMBOLS[type] : SYMBOLS[type].toLowerCase();
  const capture = move.from !== null ? before.board[move.to] : null;
  const promoted = move.from !== null && type === 'C' && after.board[move.to].type === 'H';
  const notation = move.from === null
    ? `${symbol}*${square(move.to)}`
    : `${symbol}${square(move.from)}${capture ? 'x' : '-'}${square(move.to)}${promoted ? '+' : ''}`;
  const action = move.from === null
    ? `打入 ${spokenSquare(move.to)}`
    : `${spokenSquare(move.from)} 到 ${spokenSquare(move.to)}${capture ? `，捕獲${NAMES[capture.type]}` : ''}${promoted ? '，升級為母雞' : ''}`;
  const label = `第 ${after.ply} 手，${side === 'sente' ? '先手' : '後手'}，${owner === 0 ? '森林隊' : '天空隊'}，${NAMES[type]}，${action}`;
  return {after, notation, label, owner, side};
}

export function moveNotation(before, move, first = 0) {
  return describe(before, move, first).notation;
}

export function buildMoveRecord(record) {
  if (!record?.baseState || !Array.isArray(record.moves)) throw new Error('Invalid move record.');
  const first = record.config?.first ?? 0;
  if (first !== 0 && first !== 1) throw new Error('First player must be 0 or 1.');
  let state = record.baseState;
  const entries = [{
    index:0,
    ply:state.ply,
    notation:state.ply === 0 ? '開局' : `第 ${state.ply} 手`,
    label:state.ply === 0 ? '開局配置' : `記錄起點，第 ${state.ply} 手`,
    owner:null,
    side:null,
  }];
  for (const [index, move] of record.moves.entries()) {
    const {after, ...entry} = describe(state, move, first);
    entries.push({index:index + 1, ply:after.ply, ...entry});
    state = after;
  }
  return entries;
}
