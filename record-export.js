import {buildMoveRecord} from './notation.js?v=14';

const LEVELS = {low:'簡單', medium:'普通', high:'困難'};
const REASONS = {
  catch:'抓住對方獅子',
  try:'獅子安全抵達對方底線',
  repetition:'相同局面出現三次',
  'no-moves':'對方已沒有可走的棋步',
  resign:'主動投降',
};

function configuration(record) {
  const config = record?.config;
  if (!config || !['pvp','com'].includes(config.mode) ||
      ![0,1].includes(config.first) || !Object.hasOwn(LEVELS,config.level)) {
    throw new Error('棋局資料不完整。');
  }
  return config;
}

function result(record) {
  const value = record?.result;
  if (!value || ![null,0,1].includes(value.winner) || !Object.hasOwn(REASONS,value.reason) ||
      (value.winner === null) !== (value.reason === 'repetition') ||
      (value.reason === 'resign' && (!Number.isInteger(value.resignedBy) ||
        ![0,1].includes(value.resignedBy) || value.resignedBy === value.winner))) {
    throw new Error('棋局尚未結束，或結果資料不完整。');
  }
  return value;
}

/** Preserve the date shown when the game ended, even after travelling. */
export function recordDate(record) {
  const value = record?.completedLocal;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return '日期不詳';
  const [date,time] = value.split(' ');
  const [hour,minute] = time.split(':').map(Number);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || hour > 23 || minute > 59) {
    return '日期不詳';
  }
  return value;
}

export function playerIdentity(owner, config) {
  if (![0,1].includes(owner) || !config || !['pvp','com'].includes(config.mode)) {
    throw new Error('玩家資料不完整。');
  }
  return owner === 0 ? '1P' : config.mode === 'com' ? 'AI' : '2P';
}

function sideName(owner, config) {
  return `${playerIdentity(owner,config)}${owner === config.first ? '先手' : '後手'}`;
}

export function recordOutcome(record) {
  const config = configuration(record), outcome = result(record);
  if (outcome.winner === null) {
    return `${sideName(config.first,config)} ${sideName(1-config.first,config)}和棋`;
  }
  return `${sideName(outcome.winner,config)}勝`;
}

export function recordTitle(record) {
  return `${recordDate(record)} ${recordOutcome(record)}`;
}

/** Reject unsupported input rather than silently changing the player's note. */
export function validateNote(value = '') {
  if (typeof value !== 'string') return {valid:false, note:'', error:'備註只能使用中英文字、數字與空白。'};
  if (Array.from(value).length > 20) return {valid:false, note:value, error:'備註最多20字。'};
  if (!/^[\p{Script=Han}A-Za-z0-9 ]*$/u.test(value)) {
    return {valid:false, note:value, error:'備註只能使用中英文字、數字與空白，不能使用特殊符號。'};
  }
  return {valid:true, note:value.trim(), error:''};
}

function playerDescription(owner, config) {
  return `${playerIdentity(owner,config)} ${owner === 0 ? '森林隊' : '天空隊'}`;
}

/** Build a portable plain-text file; the browser decides where it is saved. */
export function createRecordExport(record, note = '') {
  const config = configuration(record), outcome = result(record), checked = validateNote(note);
  if (!checked.valid) throw new Error(checked.error);
  const date = recordDate(record), summary = recordOutcome(record);
  const first = config.first, second = 1-first;
  const entries = buildMoveRecord(record);
  const lines = [
    'どうぶつしょうぎ · Let\'s Catch the Lion!',
    `棋局日期：${date}`,
  ];
  // The saved zone is descriptive metadata, never used to recalculate the date.
  if (typeof record.timeZone === 'string' && /^[A-Za-z0-9_+\-/:. ]{1,80}$/.test(record.timeZone)) {
    lines.push(`完局時區：${record.timeZone}`);
  }
  lines.push(
    `對弈模式：${config.mode === 'com' ? '挑戰電腦' : '雙人對弈'}`,
    `先手：${playerDescription(first,config)}`,
    `後手：${playerDescription(second,config)}`,
  );
  if (config.mode === 'com') lines.push(`電腦難度：${LEVELS[config.level]}`);
  lines.push(`結果：${summary}`, `結束方式：${REASONS[outcome.reason]}`);
  if (outcome.reason === 'resign') lines.push(`認輸：${playerIdentity(outcome.resignedBy,config)}認輸`);
  if (checked.note) lines.push(`備註：${checked.note}`);
  lines.push('', '棋譜', '先手大寫，後手小寫；x 吃子，* 打入，+ 升級。');
  const initial = entries[0];
  lines.push(initial.ply === 0 ? '開局' : `記錄起點：第 ${initial.ply} 手（較早棋步未保留）`);
  for (const entry of entries.slice(1)) lines.push(`${entry.ply}. ${entry.notation}`);
  lines.push('', `終局：${summary}`);
  if (outcome.reason === 'resign') lines.push(`${playerIdentity(outcome.resignedBy,config)}認輸`);
  const fileDate = date === '日期不詳' ? date : date.slice(0,10);
  return {
    filename:`${fileDate}  ${summary}${checked.note ? ` (${checked.note})` : ''}.txt`,
    text:lines.join('\r\n')+'\r\n',
  };
}
