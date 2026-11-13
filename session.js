import {newGame, applyMove} from './engine.js?v=13';

const DEFAULT_CONFIG = Object.freeze({mode:'pvp', level:'medium', first:0});
const PIECES = new Set(['L','E','G','C','H']);
const REASONS = new Set(['catch','try','repetition','no-moves','resign']);
const ARCHIVE_LIMIT = 7;
const EMPTY_METADATA = Object.freeze({id:null,completedAt:null,completedLocal:null,timeZone:null});
const clone = value => JSON.parse(JSON.stringify(value));

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function configuration(value = DEFAULT_CONFIG) {
  const config = {mode:value.mode ?? 'pvp', level:value.level ?? 'medium', first:value.first ?? 0};
  if (!['pvp','com'].includes(config.mode) || !['low','medium','high'].includes(config.level) || ![0,1].includes(config.first)) {
    throw new Error('Invalid game configuration.');
  }
  return Object.freeze(config);
}

function validMove(move) {
  if (!move || !Number.isInteger(move.to) || move.to < 0 || move.to >= 12) return false;
  return move.from === null ? ['E','G','C'].includes(move.drop) :
    Number.isInteger(move.from) && move.from >= 0 && move.from < 12 && move.drop === undefined;
}

function validResult(result, allowResign = true) {
  if (!result || !REASONS.has(result.reason)) return false;
  if (result.reason === 'repetition') return result.winner === null;
  if (![0,1].includes(result.winner)) return false;
  return result.reason !== 'resign' || (allowResign && [0,1].includes(result.resignedBy) && result.winner === 1-result.resignedBy);
}

function validState(state) {
  if (!state || !Array.isArray(state.board) || state.board.length !== 12 ||
    !state.board.every(piece => piece === null || (piece && PIECES.has(piece.type) && [0,1].includes(piece.owner))) ||
    ![0,1].includes(state.turn) || !Number.isInteger(state.ply) || state.ply < 0 ||
    !Array.isArray(state.hands) || state.hands.length !== 2 ||
    !state.hands.every(hand => hand && ['E','G','C'].every(type => Number.isInteger(hand[type]) && hand[type] >= 0)) ||
    !state.history || !state.history.counts || typeof state.history.counts !== 'object' ||
    !Array.isArray(state.history.twice) || !state.history.twice.every(key => typeof key === 'string') ||
    !Object.values(state.history.counts).every(count => Number.isInteger(count) && count > 0)) return false;
  // Resignation belongs to the record's terminal event, never its starting board.
  if (state.result !== null && !validResult(state.result,false)) return false;
  if (state.pendingTry !== null && (!state.pendingTry || ![0,1].includes(state.pendingTry.owner) ||
    !Number.isInteger(state.pendingTry.square) || state.pendingTry.square < 0 || state.pendingTry.square >= 12)) return false;
  return state.lastMove === null || validMove(state.lastMove);
}

function canonicalResult(result) {
  return result === null ? null : result.reason === 'resign'
    ? {winner:result.winner,reason:'resign',resignedBy:result.resignedBy}
    : {winner:result.winner,reason:result.reason};
}

function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id); }

function metadata(saved = {}) {
  return {
    id:validId(saved.id) ? saved.id : null,
    completedAt:typeof saved.completedAt === 'string' && Number.isFinite(Date.parse(saved.completedAt)) ? saved.completedAt : null,
    completedLocal:typeof saved.completedLocal === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(saved.completedLocal) ? saved.completedLocal : null,
    timeZone:typeof saved.timeZone === 'string' && saved.timeZone.length <= 100 ? saved.timeZone : null,
  };
}

function record(config, states, details = EMPTY_METADATA) {
  const first = states[0];
  const baseState = first.result?.reason === 'resign' ? {...first,result:null} : first;
  return freeze({config,baseState,moves:states.slice(1).map(state => ({...state.lastMove})),
    result:canonicalResult(states.at(-1).result),...metadata(details)});
}

function restoreRecord(saved, mustBeFinished = false) {
  if (!saved || !validState(saved.baseState) || !Array.isArray(saved.moves) || saved.moves.length > 10000 || !saved.moves.every(validMove)) {
    throw new Error('Invalid saved game.');
  }
  const config = configuration(saved.config);
  const states = [freeze(clone(saved.baseState))];
  for (const move of saved.moves) states.push(freeze(applyMove(states.at(-1), move)));
  const final = states.at(-1);
  if (saved.result !== undefined && saved.result !== null) {
    if (!validResult(saved.result)) throw new Error('Invalid saved result.');
    const result = canonicalResult(saved.result);
    if (result.reason === 'resign') {
      if (final.result || result.resignedBy !== (config.mode === 'com' ? 0 : final.turn)) throw new Error('Invalid saved resignation.');
      states[states.length-1] = freeze({...final,result});
    } else if (JSON.stringify(result) !== JSON.stringify(canonicalResult(final.result))) {
      throw new Error('The saved result does not match its moves.');
    }
  } else if (saved.result === null && final.result) {
    throw new Error('A terminal result cannot be removed.');
  }
  if (mustBeFinished && !states.at(-1).result) throw new Error('A review must contain a finished game.');
  return {config,states,record:record(config,states,saved)};
}

function boardIdentity(state) {
  return JSON.stringify([state.board,state.hands,state.turn,state.result,state.ply,state.pendingTry]);
}

function migrateLegacy(saved) {
  if (!validState(saved.state)) throw new Error('Invalid legacy game.');
  const oldStates = [...(Array.isArray(saved.undoStack) ? saved.undoStack : []), saved.state];
  if (!oldStates.every(validState)) throw new Error('Invalid legacy history.');
  const migrated = restoreRecord({config:saved.config,baseState:oldStates[0],moves:oldStates.slice(1).map(state=>state.lastMove)});
  if (migrated.states.some((state,index) => boardIdentity(state) !== boardIdentity(oldStates[index]))) throw new Error('Broken legacy history.');
  return migrated;
}

function legacyRecord(value) {
  // Older saves have no completion timestamp. A deterministic id also prevents
  // the same legacy game being duplicated when active and previous games match.
  let hash = 2166136261;
  for (const char of JSON.stringify([value.config,value.baseState,value.moves])) {
    hash = Math.imul(hash ^ char.charCodeAt(0),16777619) >>> 0;
  }
  return freeze({...value,id:`legacy-${hash.toString(16)}`,completedAt:null,completedLocal:null,timeZone:null});
}

/** The live game and the review cursor never share a writable playback state. */
export class GameSession {
  #config = DEFAULT_CONFIG;
  #states = [freeze(newGame())];
  #screen = 'home';
  #revision = 0;
  #hasGame = false;
  #archive = Object.freeze([]);
  #gameMetadata = EMPTY_METADATA;
  #reviewGame = null;
  #importedReview = false;
  #reviewStates = [];
  #reviewIndex = 0;
  #now;
  #idCounter = 0;

  constructor(saved = null, {now = () => new Date()} = {}) {
    this.#now = now;
    // Loading always returns home; opening an archive never resumes a worker.
    if (saved?.version === 3 || saved?.version === 2) {
      try {
        const game = restoreRecord(saved.game);
        this.#config = game.config;
        this.#states = game.states;
        this.#gameMetadata = metadata(game.record);
        this.#hasGame = true;
      } catch { /* Keep a fresh idle game when the live save is incomplete. */ }
      if (saved.version === 3) {
        const entries = [], ids = new Set();
        for (const entry of Array.isArray(saved.archive) ? saved.archive : []) {
          try {
            if (!validId(entry?.id) || ids.has(entry.id)) continue;
            const restored = restoreRecord(entry,true).record;
            entries.push(restored);ids.add(restored.id);
            if (entries.length === ARCHIVE_LIMIT) break;
          } catch { /* Preserve other valid records when one entry is damaged. */ }
        }
        this.#archive = Object.freeze(entries);
      } else {
        try { this.#archive = Object.freeze([legacyRecord(restoreRecord(saved.lastGame,true).record)]); } catch { /* No valid previous game. */ }
      }
    } else if (saved?.version === 1) {
      try {
        const game = migrateLegacy(saved);
        this.#config = game.config;
        this.#states = game.states;
        this.#hasGame = true;
      } catch { /* Legacy corruption must not prevent the app from opening. */ }
    }
    // Only old schemas need this fallback. Reconstructing a v3 archive from the
    // ended live game would resurrect an explicitly deleted archive entry.
    if (saved?.version !== 3 && this.#hasGame && this.state.result && !this.#archive.length) {
      const previous = legacyRecord(record(this.#config,this.#states));
      this.#archive = Object.freeze([previous]);
      this.#gameMetadata = metadata(previous);
    }
  }

  get screen() { return this.#screen; }
  get revision() { return this.#revision; }
  get config() { return this.#config; }
  get state() { return this.#states.at(-1); }
  get displayState() { return this.#screen === 'review' ? this.#reviewStates[this.#reviewIndex] : this.state; }
  get displayConfig() { return this.#screen === 'review' ? this.#reviewGame.config : this.#config; }
  get hasGame() { return this.#hasGame; }
  get archive() { return this.#archive; }
  get reviewGame() { return this.#reviewGame; }
  get isImportedReview() { return this.#screen === 'review' && this.#importedReview; }
  get hasLastGame() { return this.#archive.length > 0; }
  get lastGame() { return this.#archive[0] ?? null; }
  get canMove() { return this.#screen === 'play' && this.#hasGame && !this.state.result; }
  get canResign() { return this.canMove; }
  get isComputerTurn() { return this.canMove && this.#config.mode === 'com' && this.state.turn === 1; }
  get moveCount() { return this.#states.length - 1; }
  get reviewIndex() { return this.#reviewIndex; }
  get reviewLength() { return this.#reviewStates.length; }
  get canUndo() {
    if (!this.canMove || this.#states.length < 2) return false;
    return !(this.#config.mode === 'com' && this.#states.length === 2 && this.#states[0].turn === 1);
  }

  #clearReview() {
    this.#reviewGame = null;
    this.#importedReview = false;
    this.#reviewStates = [];
    this.#reviewIndex = 0;
  }

  #complete() {
    const date = this.#now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid completion time.');
    const pad = value => String(value).padStart(2,'0');
    const completedAt = date.toISOString();
    const completedLocal = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    let timeZone = null;
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* Local fields are still preserved. */ }
    const id = globalThis.crypto?.randomUUID?.() || `game-${date.getTime().toString(36)}-${++this.#idCounter}-${Math.random().toString(36).slice(2,10)}`;
    this.#gameMetadata = freeze({id,completedAt,completedLocal,timeZone});
    this.#archive = Object.freeze([record(this.#config,this.#states,this.#gameMetadata),...this.#archive].slice(0,ARCHIVE_LIMIT));
  }

  start(config = this.#config) {
    this.#config = configuration(config);
    this.#states = [freeze(newGame(this.#config.first))];
    this.#gameMetadata = EMPTY_METADATA;
    this.#hasGame = true;
    this.#screen = 'play';
    this.#clearReview();
    this.#revision++;
    return true;
  }

  move(move, source = 'human', expectedRevision = this.#revision) {
    if (!this.canMove || expectedRevision !== this.#revision || !['human','computer'].includes(source)) return false;
    if ((source === 'computer') !== this.isComputerTurn) return false;
    const next = freeze(applyMove(this.state,move));
    this.#states.push(next);
    this.#revision++;
    if (next.result) this.#complete();
    return true;
  }

  resign(expectedRevision = this.#revision) {
    if (!this.canResign || expectedRevision !== this.#revision) return false;
    const resignedBy = this.#config.mode === 'com' ? 0 : this.state.turn;
    const result = {winner:1-resignedBy,reason:'resign',resignedBy};
    this.#states[this.#states.length-1] = freeze({...this.state,result});
    this.#revision++;
    this.#complete();
    return true;
  }

  home() {
    this.#screen = 'home';
    this.#clearReview();
    this.#revision++;
    return true;
  }

  resume() {
    if (!this.#hasGame) return false;
    this.#screen = 'play';
    this.#clearReview();
    this.#revision++;
    return true;
  }

  enterReview(id = this.lastGame?.id) {
    const game = this.#archive.find(entry => entry.id === id);
    if (!game) return false;
    this.#reviewStates = restoreRecord(game,true).states;
    this.#reviewGame = game;
    this.#importedReview = false;
    this.#reviewIndex = this.#reviewStates.length-1;
    this.#screen = 'review';
    this.#revision++;
    return true;
  }

  enterImportedReview(saved) {
    if (this.#screen !== 'home') return false;
    let imported;
    try { imported = restoreRecord(saved,true); }
    catch { return false; }
    // The imported record belongs only to this playback. Nothing from it is
    // added to the archive, live game, or exported browser save.
    this.#reviewStates = imported.states;
    this.#reviewGame = imported.record;
    this.#importedReview = true;
    this.#reviewIndex = this.#reviewStates.length-1;
    this.#screen = 'review';
    this.#revision++;
    return true;
  }

  deleteGame(id) {
    if (!this.#archive.some(game => game.id === id)) return false;
    this.#archive = Object.freeze(this.#archive.filter(game => game.id !== id));
    if (this.#reviewGame?.id === id) {
      this.#screen = 'home';
      this.#clearReview();
    }
    this.#revision++;
    return true;
  }

  reviewAt(index) {
    if (this.#screen !== 'review' || !Number.isFinite(index)) return false;
    this.#reviewIndex = Math.max(0,Math.min(this.#reviewStates.length-1,Math.trunc(index)));
    return true;
  }

  exitReview() {
    if (this.#screen !== 'review') return false;
    return this.home();
  }

  undo() {
    if (!this.canUndo) return false;
    this.#states.pop();
    if (this.#config.mode === 'com' && this.state.turn === 1 && this.#states.length > 1) this.#states.pop();
    this.#revision++;
    return true;
  }

  exportSave() {
    return clone({version:3,game:this.#hasGame ? record(this.#config,this.#states,this.#gameMetadata) : null,archive:this.#archive});
  }
}
