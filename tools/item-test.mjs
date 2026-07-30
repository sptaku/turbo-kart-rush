// アイテム2ストックの検証:
//   空き順に入る / 2つまで / 使えるのは1ストック目だけ / 使うと2ストック目が繰り上がる /
//   3つキノコは使い切ってから繰り上がる / ？ブロックは1つ持っていても取れる(2つ持ちだと取れない)
async function rd(p) { return await Deno.readTextFile(p); }
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mc : () => mockCtx), set: () => true });
function mk() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; } const mc = mk();
const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js']; let src = '';
for (const f of files) src += '\n;' + (await rd(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio };';
const { Game, audio } = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(
  win, { createElement: () => mk() }, { now: () => 0 }, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};
let fail = 0; const t = (n, c) => { console.log(`  ${n}: ${c ? 'OK' : 'NG'}`); if (!c) fail++; };

const newGame = (opts = {}) => {
  const g = new Game(mc); g.onFinish = () => {}; g.onGameOver = () => {};
  g.startRace(Object.assign({ mode: 'vs', trackIndex: 0, players: 1, numKarts: 2, lifeOn: false }, opts));
  g.state = 'racing'; g.countdown = 0; g.raceTime = 1;
  return g;
};

// --- 初期状態 -------------------------------------------------------------
{
  const g = newGame();
  const k = g.humans[0];
  t('開始時は2ストックとも空', k.item === null && k.item2 === null && k.itemCount === 0 && k.itemCount2 === 0);
}

// --- 空いている方から順に入る(1つ目→2つ目)、3つ目は入らない ---------------
{
  const g = newGame();
  const k = g.humans[0];
  g.giveItem(k);
  const first = k.item;
  t('1回目は1ストック目に入る', !!k.item && k.item2 === null);
  g.giveItem(k);
  t('2回目は2ストック目に入る', !!k.item2 && k.item === first);
  const snap = [k.item, k.itemCount, k.item2, k.itemCount2];
  g.giveItem(k);
  t('3回目は入らない(2ストックまで)', k.item === snap[0] && k.itemCount === snap[1] && k.item2 === snap[2] && k.itemCount2 === snap[3]);
}

// --- 使えるのは1ストック目だけ / 使うと2ストック目が繰り上がる -------------
{
  const g = newGame();
  const k = g.humans[0];
  k.item = 'banana'; k.itemCount = 1; k.item2 = 'green'; k.itemCount2 = 1;
  g.useItem(k);
  t('1ストック目を使うと2ストック目が繰り上がる', k.item === 'green' && k.itemCount === 1 && k.item2 === null && k.itemCount2 === 0);
  t('繰り上がりの合図が出る(itemShift)', k.itemShift > 0);
  g.useItem(k);
  t('繰り上がった分も使える→空になる', k.item === null && k.item2 === null);
  g.useItem(k);
  t('空の状態で使っても何も起きない', k.item === null && k.item2 === null);
}

// --- 2ストック目は「持っているだけ」= 効果が出ない ------------------------
{
  const g = newGame();
  const k = g.humans[0];
  k.item = 'banana'; k.itemCount = 1; k.item2 = 'mushroom'; k.itemCount2 = 1;
  k.boostTimer = 0;
  g.useItem(k);                       // 1つ目(バナナ)を使用 → キノコの加速は起きない
  t('2ストック目(キノコ)の効果は出ない', k.boostTimer === 0 && g.obstacles.length === 1);
  g.useItem(k);                       // 繰り上がったキノコを使用 → ここで初めて加速
  t('繰り上がってから使うと効果が出る', k.boostTimer > 0);
}

// --- 3つキノコ: 3回使い切ってから繰り上がる -------------------------------
{
  const g = newGame();
  const k = g.humans[0];
  k.item = 'mushroom3'; k.itemCount = 3; k.item2 = 'star'; k.itemCount2 = 1;
  g.useItem(k); g.useItem(k);
  t('3つキノコを使い切るまでは繰り上がらない', k.item === 'mushroom3' && k.itemCount === 1 && k.item2 === 'star');
  g.useItem(k);
  t('3回使い切ると2ストック目が繰り上がる', k.item === 'star' && k.itemCount === 1 && k.item2 === null);
}
{
  const g = newGame();
  const k = g.humans[0];
  k.item = 'banana'; k.itemCount = 1; k.item2 = 'mushroom3'; k.itemCount2 = 3;
  g.useItem(k);
  t('2ストック目の残り回数も繰り上がる(×3を維持)', k.item === 'mushroom3' && k.itemCount === 3);
}

// --- ？ブロック: 1つ持ちなら取れる / 2つ持ちなら取れない(箱も消えない) ----
{
  const g = newGame();
  const k = g.humans[0], b = g.track.itemBoxes[0];
  const put = () => { k.angle = 0; k.x = b.x - (k.radius + 12); k.y = b.y; };   // 先端を箱に当てる
  k.item = null; k.item2 = null; k.itemFlash = 0; put();
  g._collisions();
  t('？ブロックで1つ目を取得', !!k.item && b.active === false);
  b.active = true; k.itemFlash = 0; put();
  g._collisions();
  t('1つ持っていても2つ目を取得できる', !!k.item2 && b.active === false);
  b.active = true; k.itemFlash = 0; put();
  g._collisions();
  t('2つ持ちでは取得しない(？ブロックも消えない)', b.active === true);
}

// --- CPUも2ストック持てて、使うのは1ストック目 ----------------------------
{
  const g = newGame();
  const cpu = g.karts.find((c) => !c.isHuman);
  g.giveItem(cpu); g.giveItem(cpu);
  t('CPUも2ストック持てる', !!cpu.item && !!cpu.item2);
  const next = cpu.item2;
  cpu.aiItemTimer = -1; cpu.computeAI(g);
  t('CPUはアイテムを使う判断ができる', cpu.control.item === true);
  g.useItem(cpu);
  t('CPUも使うと繰り上がる', cpu.item === next && cpu.item2 === null);
}

// --- タイムアタックの開始アイテムは1ストック目だけ ------------------------
{
  const g = new Game(mc); g.onFinish = () => {};
  g.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, lifeOn: false, startItem: 'mushroom3' });
  const k = g.humans[0];
  t('TA開始時は1ストック目に3つキノコ・2ストック目は空', k.item === 'mushroom3' && k.itemCount === 3 && k.item2 === null);
}

// --- 描画(2ストック表示)が通る -------------------------------------------
{
  const g = newGame();
  const k = g.humans[0];
  k.item = 'mushroom3'; k.itemCount = 3; k.item2 = 'mushroom3'; k.itemCount2 = 3; k.itemShift = 0.4; k.itemFlash = 0.3;
  let ok = true;
  try { g.render(); } catch (e) { ok = false; console.log('   render error:', e.message); }
  t('2ストック表示の描画が通る', ok);
}

console.log(fail ? `=== ${fail}件NG ===` : '=== アイテム2ストック すべてOK ==='); if (fail) Deno.exit(1);
