// アイテムのストック(1〜3個・既定2)の検証:
//   空き順に入る / 上限まで / 使えるのは1ストック目だけ / 使うと繰り上がる /
//   3つキノコは使い切ってから繰り上がる / ？ブロックは空きがあれば取れる /
//   所持数の設定(1〜3)が効く / 🍄✨金キノコ
async function rd(p) { return await Deno.readTextFile(p); }
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mc : () => mockCtx), set: () => true });
function mk() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; } const mc = mk();
const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js']; let src = '';
for (const f of files) src += '\n;' + (await rd(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio, ITEM_STOCK_DEFAULT };';
const { Game, audio, ITEM_STOCK_DEFAULT } = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(
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
// ストックの中身を [type, ...] で取り出す
const types = (k) => k.stock.map((s) => s.type);
// ストックを決め打ちで用意する
const setStock = (k, list) => { k.clearItems(); for (const [ty, cnt] of list) k.addItem(ty, cnt); };

// --- 既定は2ストック -------------------------------------------------------
{
  const g = newGame();
  const k = g.humans[0];
  t('既定の所持数は2個', ITEM_STOCK_DEFAULT === 2 && g.itemSlots === 2 && k.maxStock === 2);
  t('開始時はストックが空', k.stock.length === 0 && k.item === null && k.itemCount === 0);
}

// --- 空いている方から順に入る / 上限を超えて取れない -----------------------
{
  const g = newGame();
  const k = g.humans[0];
  g.giveItem(k);
  const first = k.item;
  t('1回目は1ストック目に入る', k.stock.length === 1 && !!k.item);
  g.giveItem(k);
  t('2回目は2ストック目に入る', k.stock.length === 2 && k.item === first);
  const snap = types(k).join(',');
  g.giveItem(k);
  t('3回目は入らない(2ストックまで)', k.stock.length === 2 && types(k).join(',') === snap);
  t('満杯は itemFull で分かる', k.itemFull === true);
}

// --- 使えるのは1ストック目だけ / 使うと繰り上がる ---------------------------
{
  const g = newGame();
  const k = g.humans[0];
  setStock(k, [['banana', 1], ['green', 1]]);
  g.useItem(k);
  t('1ストック目を使うと後ろが繰り上がる', k.item === 'green' && k.itemCount === 1 && k.stock.length === 1);
  t('繰り上がりの合図が出る(itemShift)', k.itemShift > 0);
  g.useItem(k);
  t('繰り上がった分も使える→空になる', k.stock.length === 0 && k.item === null);
  g.useItem(k);
  t('空の状態で使っても何も起きない', k.stock.length === 0);
}

// --- 2ストック目は「持っているだけ」= 効果が出ない ------------------------
{
  const g = newGame();
  const k = g.humans[0];
  setStock(k, [['banana', 1], ['mushroom', 1]]);
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
  setStock(k, [['mushroom3', 3], ['star', 1]]);
  g.useItem(k); g.useItem(k);
  t('3つキノコを使い切るまでは繰り上がらない', k.item === 'mushroom3' && k.itemCount === 1 && k.stock[1].type === 'star');
  g.useItem(k);
  t('3回使い切ると次が繰り上がる', k.item === 'star' && k.itemCount === 1 && k.stock.length === 1);
}
{
  const g = newGame();
  const k = g.humans[0];
  setStock(k, [['banana', 1], ['mushroom3', 3]]);
  g.useItem(k);
  t('後ろのストックの残り回数も繰り上がる(×3を維持)', k.item === 'mushroom3' && k.itemCount === 3);
}

// --- ？ブロック: 空きがあれば取れる / 満杯なら取れない(箱も消えない) ------
{
  const g = newGame();
  const k = g.humans[0], b = g.track.itemBoxes[0];
  const put = () => { k.angle = 0; k.x = b.x - (k.radius + 12); k.y = b.y; };   // 先端を箱に当てる
  k.clearItems(); k.itemFlash = 0; put();
  g._collisions();
  t('？ブロックで1つ目を取得', k.stock.length === 1 && b.active === false);
  b.active = true; k.itemFlash = 0; put();
  g._collisions();
  t('1つ持っていても2つ目を取得できる', k.stock.length === 2 && b.active === false);
  b.active = true; k.itemFlash = 0; put();
  g._collisions();
  t('満杯では取得しない(？ブロックも消えない)', k.stock.length === 2 && b.active === true);
}

// --- 所持数の設定(1〜3) ---------------------------------------------------
{
  const g1 = newGame({ itemSlots: 1 });
  const k1 = g1.humans[0];
  t('所持数1: 全カートが1個まで', g1.itemSlots === 1 && g1.karts.every((c) => c.maxStock === 1));
  g1.giveItem(k1); g1.giveItem(k1);
  t('所持数1: 2つ目は持てない', k1.stock.length === 1);
  g1.useItem(k1);
  t('所持数1: 使うと空になる', k1.stock.length === 0);

  const g3 = newGame({ itemSlots: 3 });
  const k3 = g3.humans[0];
  t('所持数3: 全カートが3個まで', g3.itemSlots === 3 && g3.karts.every((c) => c.maxStock === 3));
  setStock(k3, [['banana', 1], ['green', 1], ['mushroom', 1]]);
  g3.giveItem(k3);
  t('所持数3: 4つ目は持てない', k3.stock.length === 3);
  g3.useItem(k3);
  t('所持数3: 使うと2つずつ繰り上がる', types(k3).join(',') === 'green,mushroom');
  g3.giveItem(k3);
  t('所持数3: 空いた3つ目に入る', k3.stock.length === 3 && types(k3)[0] === 'green');

  t('所持数の指定は1〜3に丸められる', newGame({ itemSlots: 9 }).itemSlots === 3 && newGame({ itemSlots: 0 }).itemSlots === 2);
}

// --- CPUも同じ仕様 --------------------------------------------------------
{
  const g = newGame();
  const cpu = g.karts.find((c) => !c.isHuman);
  g.giveItem(cpu); g.giveItem(cpu);
  t('CPUも2ストック持てる', cpu.stock.length === 2);
  cpu.aiItemTimer = -1; cpu.computeAI(g);
  t('CPUはアイテムを使う判断ができる', cpu.control.item === true);
  setStock(cpu, [['banana', 1], ['green', 1]]);       // 1回で消える組合せに固定
  g.useItem(cpu);
  t('CPUも使うと繰り上がる', cpu.item === 'green' && cpu.stock.length === 1);
}

// --- 🍄✨金キノコ: 一定時間、押すたびに何度でもダッシュできる --------------
{
  const g = newGame();
  const k = g.humans[0];
  setStock(k, [['goldshroom', 1], ['banana', 1]]);
  k.boostTimer = 0; k.goldTimer = 0; k.goldCd = 0;
  g.useItem(k);
  t('金キノコ: 発動でブースト＋残り時間がつく', k.boostTimer > 0 && k.goldTimer > 7);
  t('金キノコ: 使ってもアイテム枠から消えない', k.item === 'goldshroom' && k.stock.length === 2);
  // 連打の間引き(すぐ押しても増えない)→ 間隔をあけると再ダッシュできる
  k.boostTimer = 0;
  g.useItem(k);
  t('金キノコ: 連打間隔中は反応しない', k.boostTimer === 0);
  k.goldCd = 0; g.useItem(k);
  t('金キノコ: 間隔をあければ何度でもダッシュできる', k.boostTimer > 0);
  const left = k.goldTimer;
  k.goldCd = 0; g.useItem(k);
  t('金キノコ: 押し直しても残り時間は延びない', k.goldTimer <= left);
}
{
  // 時間切れ: アイテム枠から消えて次が繰り上がる
  const g = newGame();
  const k = g.humans[0];
  setStock(k, [['goldshroom', 1], ['banana', 1]]);
  g.useItem(k);
  for (let i = 0; i < 60 * 9; i++) g.update(1 / 60);      // 発動時間(7.5秒)を過ぎるまで走らせる
  t('金キノコ: 時間切れで消えて次が繰り上がる', k.goldTimer === 0 && k.item === 'banana' && k.stock.length === 1);
}
{
  // CPUは発動中に連打して加速し続ける
  const g = newGame();
  const cpu = g.karts.find((c) => !c.isHuman);
  setStock(cpu, [['goldshroom', 1]]);
  cpu.goldTimer = 3; cpu.aiItemTimer = 99;
  cpu.computeAI(g);
  t('金キノコ: CPUは発動中ずっと押し続ける', cpu.control.item === true);
}
{
  // 抽選プール: 1位は出ない / 2位以下では出る
  const g = newGame();
  const k = g.humans[0];
  const drawn = (place) => {
    const got = new Set();
    for (let i = 0; i < 400; i++) { k.clearItems(); k.place = place; g.giveItem(k); got.add(k.item); }
    return got;
  };
  t('金キノコ: トップ(1位)には出ない', !drawn(1).has('goldshroom'));
  t('金キノコ: 2位・3位以下では出る', drawn(2).has('goldshroom') && drawn(5).has('goldshroom'));
}

// --- タイムアタックの開始アイテムは1ストック目だけ ------------------------
{
  const g = new Game(mc); g.onFinish = () => {};
  g.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, lifeOn: false, startItem: 'mushroom3' });
  const k = g.humans[0];
  t('TA開始時は1ストック目に3つキノコだけ', k.item === 'mushroom3' && k.itemCount === 3 && k.stock.length === 1);
}

// --- 描画(1〜3ストック表示)が通る ----------------------------------------
{
  let ok = true;
  for (const slots of [1, 2, 3]) {
    const g = newGame({ itemSlots: slots });
    const k = g.humans[0];
    setStock(k, [['mushroom3', 3], ['goldshroom', 1], ['star', 1]].slice(0, slots));
    k.itemShift = 0.4; k.itemFlash = 0.3; k.goldTimer = slots > 1 ? 0 : 0;
    try { g.render(); } catch (e) { ok = false; console.log(`   render error(slots=${slots}):`, e.message); }
  }
  t('1〜3ストック表示の描画が通る', ok);
  const g = newGame();
  const k = g.humans[0];
  setStock(k, [['goldshroom', 1], ['goldshroom', 1]]);
  k.goldTimer = 4.2;
  try { g.render(); } catch (e) { ok = false; console.log('   render error:', e.message); }
  t('金キノコ(残り時間バッジ)の描画が通る', ok);
}

console.log(fail ? `=== ${fail}件NG ===` : '=== アイテムストック すべてOK ==='); if (fail) Deno.exit(1);
