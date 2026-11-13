// Animal shogi rules. Coordinates use a fixed board: 1P advances toward row 0.
const WIDTH = 3;
const HEIGHT = 4;
const TYPES = ['E', 'G', 'C'];
const MATERIAL = { L: 0, E: 28, G: 38, C: 14, H: 52 };
const WIN = 100000;
const MOVEMENT = {
  L:[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]],
  E:[[-1,-1],[1,-1],[-1,1],[1,1]],
  G:[[0,-1],[-1,0],[1,0],[0,1]],
  C0:[[0,-1]], C1:[[0,1]],
  H0:[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[0,1]],
  H1:[[-1,1],[0,1],[1,1],[-1,0],[1,0],[0,-1]],
};
const movement = (type,owner) => MOVEMENT[type === 'C' || type === 'H' ? `${type}${owner}` : type] || [];

export function directions(type, owner) {
  return movement(type,owner).map(d=>d.slice());
}

export function positionKey(state) {
  const board = state.board.map(p => p ? `${p.owner}${p.type}` : '--').join('');
  return `${board}/${state.hands.map(h => TYPES.map(t => h[t]).join(',')).join('/')}/${state.turn}`;
}

export function newGame(first = 0) {
  if (first !== 0 && first !== 1) throw new Error('First player must be 0 or 1.');
  const piece = (type, owner) => ({type, owner});
  const state = {
    board: [piece('G',1),piece('L',1),piece('E',1), null,piece('C',1),null,
      null,piece('C',0),null, piece('E',0),piece('L',0),piece('G',0)],
    hands: [{E:0,G:0,C:0},{E:0,G:0,C:0}],
    turn:first, result:null, ply:0, lastMove:null, pendingTry:null,
    history: {counts:{}, twice:[]},
  };
  state.history.counts[positionKey(state)] = 1;
  return state;
}

export function isAttacked(state, square, byOwner) {
  const x = square % WIDTH, y = Math.floor(square / WIDTH);
  for (let from = 0; from < 12; from++) {
    const p = state.board[from];
    if (!p || p.owner !== byOwner) continue;
    const dx = x - from % WIDTH, dy = y - Math.floor(from / WIDTH);
    if (movement(p.type,p.owner).some(d => d[0] === dx && d[1] === dy)) return true;
  }
  return false;
}

// These rules allow a lion to enter danger; the opponent must actually catch it.
// Drops have neither the double-chick nor last-rank restrictions of full shogi.
export function legalMoves(state) {
  return collectMoves(state);
}

function collectMoves(state, stopAfterOne = false) {
  if (state.result) return [];
  const moves = [];
  for (let from = 0; from < 12; from++) {
    const p = state.board[from];
    if (!p || p.owner !== state.turn) continue;
    const x = from % WIDTH, y = Math.floor(from / WIDTH);
    for (const [dx,dy] of movement(p.type,p.owner)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
      const to = ny * WIDTH + nx;
      if (state.board[to]?.owner !== p.owner) {
        moves.push({from,to});
        if (stopAfterOne) return moves;
      }
    }
  }
  for (const drop of TYPES) {
    if (state.hands[state.turn][drop] <= 0) continue;
    for (let to = 0; to < 12; to++) if (!state.board[to]) {
      moves.push({from:null,to,drop});
      if (stopAfterOne) return moves;
    }
  }
  return moves;
}

function sameMove(a,b) {
  return a.from === b.from && a.to === b.to && a.drop === b.drop;
}

export function applyMove(state, move) {
  if (!legalMoves(state).some(candidate => sameMove(candidate,move))) throw new Error('Illegal move.');
  return advance(state,move);
}

function advance(state, move) {
  const owner = state.turn;
  const captured = state.board[move.to];
  const board = state.board.slice();
  const hands = state.hands.slice();
  if (move.from === null || captured && captured.type !== 'L') hands[owner] = {...hands[owner]};
  let moved;
  if (move.from === null) {
    moved = {type:move.drop,owner};
    hands[owner][move.drop]--;
  } else {
    moved = {...board[move.from]};
    board[move.from] = null;
    if (moved.type === 'C' && Math.floor(move.to / WIDTH) === (owner === 0 ? 0 : 3)) moved.type = 'H';
  }
  board[move.to] = moved;
  if (captured && captured.type !== 'L') hands[owner][captured.type === 'H' ? 'C' : captured.type]++;
  const next = {
    board,hands,turn:1-owner,result:null,ply:state.ply+1,
    lastMove:{...move},pendingTry:null,history:state.history,
  };
  if (captured?.type === 'L') {
    next.result = {winner:owner,reason:'catch'};
  } else if (state.pendingTry && state.pendingTry.owner !== owner) {
    next.result = {winner:state.pendingTry.owner,reason:'try'};
  } else if (moved.type === 'L' && Math.floor(move.to / WIDTH) === (owner === 0 ? 0 : 3)) {
    if (!isAttacked(next,move.to,1-owner)) next.result = {winner:owner,reason:'try'};
    else next.pendingTry = {owner,square:move.to};
  }
  const key = positionKey(next);
  const count = (state.history.counts[key] || 0) + 1;
  next.history = {
    counts:{...state.history.counts,[key]:count},
    twice:count === 2 ? [...state.history.twice,key].sort() : state.history.twice,
  };
  if (!next.result && count >= 3) next.result = {winner:null,reason:'repetition'};
  if (!next.result && !collectMoves(next,true).length) next.result = {winner:owner,reason:'no-moves'};
  return next;
}

function evaluate(state) {
  let score = 0;
  for (let i=0;i<12;i++) {
    const p = state.board[i];
    if (!p) continue;
    const sign = p.owner === state.turn ? 1 : -1;
    const progress = p.owner === 0 ? 3-Math.floor(i/3) : Math.floor(i/3);
    let value = MATERIAL[p.type] + (i%3 === 1 ? 2 : 0);
    if (p.type === 'L') {
      value += progress * 5;
      if (isAttacked(state,i,1-p.owner)) value -= 90;
    } else if (p.type === 'C') value += progress * 3;
    score += sign * value;
  }
  for (const owner of [0,1]) for (const t of TYPES) {
    score += (owner === state.turn ? 1 : -1) * state.hands[owner][t] * (MATERIAL[t]+2);
  }
  return score;
}

function orderScore(state, move, preferred) {
  if (preferred && sameMove(move,preferred)) return 1000000;
  const capture = state.board[move.to];
  let score = capture ? capture.type === 'L' ? 500000 : MATERIAL[capture.type]*20 : 0;
  const p = move.from === null ? {type:move.drop,owner:state.turn} : state.board[move.from];
  const row = Math.floor(move.to/3), far = state.turn === 0 ? 0 : 3;
  if (p.type === 'C' && move.from !== null && row === far) score += 500;
  if (p.type === 'L' && row === far) score += 300;
  if (move.to%3 === 1) score += 5;
  return score;
}

// Search is deliberately deterministic; randomness only chooses whether to make
// a strictly worse move without a forced loss visible at the selected depth.
// The Web Worker keeps the full-depth search off UI.
export function chooseMove(state, level = 'medium', options = {}) {
  const config = {
    low:{depth:2,chance:0.30},medium:{depth:4,chance:0.20},high:{depth:6,chance:0.10},
    easy:{depth:2,chance:0.30},normal:{depth:4,chance:0.20},hard:{depth:6,chance:0.10},
  }[level];
  if (!config) throw new Error('Unknown AI level.');
  const random = options.random || Math.random;
  const moves = legalMoves(state);
  if (!moves.length) return {move:null,depth:config.depth,mistake:false,nodes:0};
  const table = new Map();
  let nodes = 0;
  const search = (s,depth,alpha,beta) => {
    nodes++;
    if (s.result) return s.result.winner === null ? 0 : (s.result.winner === s.turn ? 1 : -1)*(WIN+depth);
    if (depth === 0) return evaluate(s);
    // With at most three plies left, only positions already seen twice can
    // cause threefold repetition. Longer searches retain the complete history.
    const historyKey = depth <= 3 ? s.history.twice.join('~') :
      Object.keys(s.history.counts).sort().map(k => `${k}:${s.history.counts[k]}`).join('~');
    const key = `${positionKey(s)}|${s.pendingTry?.owner ?? '-'}|${historyKey}`;
    const cached = table.get(key);
    const originalAlpha = alpha, originalBeta = beta;
    if (cached && cached.depth >= depth) {
      if (cached.flag === 'exact') return cached.value;
      if (cached.flag === 'lower') alpha = Math.max(alpha,cached.value);
      else beta = Math.min(beta,cached.value);
      if (alpha >= beta) return cached.value;
    }
    const ordered = legalMoves(s).sort((a,b) => orderScore(s,b,cached?.move)-orderScore(s,a,cached?.move));
    let best = -Infinity, bestMove = null;
    for (const move of ordered) {
      const value = -search(advance(s,move),depth-1,-beta,-alpha);
      if (value > best) {best = value;bestMove = move;}
      alpha = Math.max(alpha,value);
      if (alpha >= beta) break;
    }
    if (!ordered.length) best = -WIN-depth;
    table.set(key,{depth,value:best,move:bestMove,flag:best<=originalAlpha?'upper':best>=originalBeta?'lower':'exact'});
    return best;
  };
  const ranked = moves.sort((a,b)=>orderScore(state,b)-orderScore(state,a)).map(move => ({
    move,score:-search(advance(state,move),config.depth-1,-Infinity,Infinity),
  })).sort((a,b)=>b.score-a.score);
  // Terminal losses use scores at or below -WIN. Even a deliberate mistake
  // must not offer an immediate catch/Try, or a forced loss already found by
  // this search. When every line loses, keep the best delaying defence.
  const worse = ranked.filter(item => item.score > -WIN && item.score < ranked[0].score);
  const mistake = random() < config.chance && worse.length > 0;
  const pick = mistake ? worse[Math.min(worse.length-1,Math.floor(random()*worse.length))] : ranked[0];
  return {move:pick.move,depth:config.depth,mistake,nodes};
}
