import {directions} from './engine.js?v=14';

export const RULE_PAGE_COUNT = 4;

const ANIMALS = {
  L:{name:'獅子',image:'lion',action:'上下、左右、斜角，八個方向'},
  E:{name:'大象',image:'elephant',action:'只走斜角，四個方向'},
  G:{name:'長頸鹿',image:'giraffe',action:'上下、左右，四個方向'},
  C:{name:'小雞',image:'chick',action:'只能向前走一格'},
  H:{name:'母雞',image:'hen',action:'除了斜後方，其餘六個方向都能走'},
};

function movementDiagram(type) {
  const moves = directions(type,0);
  const squares = Array.from({length:9},(_,index)=>{
    const dx = index % 3 - 1, dy = Math.floor(index / 3) - 1;
    const className = index === 4 ? 'center' : moves.some(([x,y])=>x===dx&&y===dy) ? 'on' : '';
    return `<span class="${className}"></span>`;
  }).join('');
  return `<div class="move-diagram" role="img" aria-label="${ANIMALS[type].name}的移動方向，以向上為前方">${squares}</div>`;
}

function animalCard(type) {
  const animal = ANIMALS[type];
  return `<article class="rule-animal-card"><img src="./assets/${animal.image}.svg" alt=""><div class="rule-animal-text"><strong>${animal.name}</strong><span>${animal.action}</span></div>${movementDiagram(type)}</article>`;
}

const PAGES = [
  () => `<h2 id="rules-title" tabindex="-1">動物移動方式</h2>
    <p class="rules-copy">兩人輪流走。每回合選一隻自己的動物，點選目的地，每次只走一格。</p>
    <div class="rules-pieces">${['L','E','G'].map(animalCard).join('')}</div>
    <p class="rules-copy">紅色標示是可走方向。方向圖以向上為前方；天空隊的前方則朝下。</p>`,
  () => `<h2 id="rules-title" tabindex="-1">小雞會長大</h2>
    <div class="rules-pieces">${['C','H'].map(animalCard).join('')}</div>
    <p class="rules-copy">小雞<strong>走進對方底線</strong>，就會自動升級成母雞。</p>
    <p class="rules-copy">母雞被捕獲後，會<strong>變回小雞</strong>，成為對方的持駒。</p>`,
  () => `<h2 id="rules-title" tabindex="-1">吃子，變成新夥伴</h2>
    <p class="rules-copy">走到對方動物所在的格子，就能捕獲牠。牠會成為你的<strong>持駒</strong>，在棋盤外等待。</p>
    <p class="rules-copy">輪到你時，可以將一隻持駒<strong>打入任意空格</strong>。這會用掉一回合，不能再移動棋盤上的動物。</p>
    <ul class="rules-copy"><li>小雞直接打入對方底線，<strong>不會升級</strong>。</li><li>即便同一直行已經有自己的小雞，依然可在空格處打入第二隻小雞。</li></ul>`,
  () => `<h2 id="rules-title" tabindex="-1">兩種勝利</h2>
    <p class="rules-copy"><strong>Catch：抓住對方獅子</strong>，立即獲勝。</p>
    <p class="rules-copy"><strong>Try：自己的獅子到達對方底線</strong>，若不會立刻被抓，就獲勝。若能被抓，對方有下一手捕獲的機會；漏抓則由抵達方獲勝。</p>
    <ul class="rules-copy"><li>在一局對弈中，盤面棋子位置、雙方持駒，以及玩家輪序都相同的局面，<strong>出現第三次時判為和棋</strong>。不必連續出現也算。</li><li>不能跳過回合。規則允許獅子走進危險位置，落子前請留意。</li></ul>
`,
];

/** Render a single short page; navigation and all game state stay in the app. */
export function renderRulesPage(index = 0) {
  const page = typeof index === 'number' && Number.isFinite(index)
    ? Math.max(0,Math.min(RULE_PAGE_COUNT-1,Math.trunc(index))) : 0;
  return `<section class="rules-page" aria-label="遊戲規則，第${page+1}頁，共${RULE_PAGE_COUNT}頁">${PAGES[page]()}</section>`;
}
