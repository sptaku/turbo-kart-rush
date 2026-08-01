// ⚡落雷(スコール)ギミックの検証:
//   周期(予兆→落雷) / 判定は落ちた瞬間だけ / 輪の外は安全 / 大ダメージだが単発では倒れない /
//   倍率の適用 / 無敵・ゴール後は無効 / ミラー反転 / カウントダウン中は落ちない / AIが完走できる
async function rd(p) { return await Deno.readTextFile(p); }
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mc : () => mockCtx), set: () => true });
function mk() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; } const mc = mk();
const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js']; let src = '';
for (const f of files) src += '\n;' + (await rd(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio, BOLT_DMG, BOLT_MIN_LIFE, BOLT_STRIKE };';
const { Game, TRACKS, audio, BOLT_DMG, BOLT_MIN_LIFE, BOLT_STRIKE } =
  new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(
    win, { createElement: () => mk() }, { now: () => 0 }, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};
let fail = 0; const t = (n, c) => { console.log(`  ${n}: ${c ? 'OK' : 'NG'}`); if (!c) fail++; };

const RIO = TRACKS.findIndex((x) => x.id === 'rio');
const newGame = (opts = {}) => {
  const g = new Game(mc); g.onFinish = () => {}; g.onGameOver = () => {};
  g.startRace(Object.assign({ mode: 'time', trackIndex: RIO, players: 1, numKarts: 1 }, opts));
  g.state = 'racing'; g.countdown = 0; g.raceTime = 0;
  return g;
};
// bolt b が cycle 回目に落ちる瞬間の raceTime
const strikeAt = (b, cycle = 1) => cycle * b.period + b.warn - b.phase + BOLT_STRIKE * 0.3;

// --- コースデータ ---------------------------------------------------------
const g0 = newGame();
const B = g0.track.bolts;
t('リオに落雷ポイントがある', B.length >= 4);
t('落雷は最難関コースだけ(易しいコースには無し)',
  TRACKS.every((x) => ['rio', 'cyclone'].includes(x.id) || !(x.bolts || []).length));
t('危険範囲は道幅の半分より小さい(外側を通れば避けられる)',
  B.every((b) => b.r < TRACKS[RIO].roadHalf * TRACKS[RIO].tile));
t('周期はバラバラ(同時に落ちて逃げ場が無くならない)', new Set(B.map((b) => b.period)).size === B.length);

// --- 周期: 予兆 → 落雷 → 待機 --------------------------------------------
{
  const g = newGame();
  const b = g.track.bolts[0];
  g.raceTime = b.period - b.phase + 0.01; g._updateBolts();          // サイクル先頭=予兆の開始
  const warnStart = b.warnT >= 0 && b.strikeT === 0;
  g.raceTime = strikeAt(b); g._updateBolts();
  const striking = b.strikeT > 0 && b.warnT < 0;
  g.raceTime = b.period * 1.5 + b.warn - b.phase; g._updateBolts();   // 周期の後半=待機
  const idle = b.warnT < 0 && b.strikeT === 0;
  t('予兆→落雷→待機 の順に切り替わる', warnStart && striking && idle);
}

// --- 落ちた瞬間に輪の中に居ると大ダメージ＋スピン --------------------------
{
  const g = newGame();
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x; k.y = b.y; k.invincTimer = 0; k.life = 100; k.speed = 300;
  g.raceTime = strikeAt(b); g._updateBolts();
  t('直撃で大ダメージ(倍率1倍で BOLT_DMG ぶん)', Math.abs(k.life - (100 - BOLT_DMG)) < 1e-6);
  t('直撃でスピンする', k.spinTimer > 0);
  t('直撃で画面が揺れる(bumpTimer)', k.bumpTimer > 0);
  // 同じサイクルでは二度と落ちない
  const life1 = k.life;
  g.raceTime += 0.05; g._updateBolts();
  t('同じ落雷で二重に食らわない', k.life === life1);
}

// --- 輪の外は安全(タイミング/ライン取りで避けられる) ----------------------
{
  const g = newGame();
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x + b.r * 1.25; k.y = b.y; k.invincTimer = 0; k.life = 100;
  g.raceTime = strikeAt(b); g._updateBolts();
  t('危険範囲の外なら無傷', k.life === 100 && k.spinTimer === 0);
}

// --- 予兆の間はまだ当たらない(落ちる前に逃げられる) ------------------------
{
  const g = newGame();
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x; k.y = b.y; k.invincTimer = 0; k.life = 100;
  g.raceTime = b.period + b.warn * 0.5 - b.phase; g._updateBolts();
  t('予兆中はまだ無傷', b.warnT >= 0 && k.life === 100);
}

// --- 単発では倒れない(下限を残す) → レースが破綻しない --------------------
{
  const g = newGame({ playerDamageScale: 3 });     // 最大倍率(ハイパー相当)でも一撃死しない
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x; k.y = b.y; k.invincTimer = 0; k.life = 100;
  g.raceTime = strikeAt(b); g._updateBolts();
  t('3倍でも一撃死しない(下限が残る)', !k._exploded && k.life >= k.maxLife * BOLT_MIN_LIFE - 1e-9);
  // 何度落ちてもゴーストにならない(ライフは下限で止まる)
  for (let c = 2; c < 12; c++) {
    k.x = b.x; k.y = b.y; k.invincTimer = 0; k.spinTimer = 0; k.hurtCd = 0; k.mercyTimer = 0;
    g.raceTime = strikeAt(b, c); g._updateBolts();
  }
  t('連続直撃でも爆発しない(下限で止まる)', !k._exploded && k.life >= k.maxLife * BOLT_MIN_LIFE - 1e-9);
  t('下限までは確実に削れる', k.life <= k.maxLife * BOLT_MIN_LIFE + 1e-9);
}

// --- 直撃直後は追い打ちを受けない(よろけている間の即死を防ぐ) --------------
{
  const g = newGame();
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x; k.y = b.y; k.invincTimer = 0; k.life = 100;
  g.raceTime = strikeAt(b); g._updateBolts();
  const after = k.life;
  t('直撃後は小休止がつく(mercyTimer)', k.mercyTimer > 0);
  k.hurtCd = 0; k.hurt(30, g);
  t('小休止中は他のダメージも入らない', k.life === after);
  k.mercyTimer = 0; k.hurt(30, g);
  t('小休止が明ければ通常どおりダメージが入る', k.life === after - 30);   // このテストは倍率1倍
}

// --- ダメージ倍率が効く(自分/CPU独立) ------------------------------------
{
  const dmgOf = (scale) => {
    const g = newGame({ playerDamageScale: scale, cpuDamageScale: scale });
    const b = g.track.bolts[0], k = g.humans[0];
    k.x = b.x; k.y = b.y; k.invincTimer = 0; k.life = 100;
    g.raceTime = strikeAt(b); g._updateBolts();
    return 100 - k.life;
  };
  t('倍率1倍のダメージ = BOLT_DMG', Math.abs(dmgOf(1) - BOLT_DMG) < 1e-6);
  t('倍率1/2でダメージ半分', Math.abs(dmgOf(0.5) - BOLT_DMG / 2) < 1e-6);
  t('ダメージなし(0倍)なら無傷', dmgOf(0) === 0);
}

// --- 無敵(スター)・ゴール後は無効 -----------------------------------------
{
  const g = newGame();
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x; k.y = b.y; k.life = 100; k.invincTimer = 5;
  g.raceTime = strikeAt(b); g._updateBolts();
  t('スター(無敵)中は落雷が効かない', k.life === 100 && k.spinTimer === 0);
  k.invincTimer = 0; k.finished = true; k.spinTimer = 0;
  g.raceTime = strikeAt(b, 2); g._updateBolts();
  t('ゴール後は落雷が効かない', k.life === 100 && k.spinTimer === 0);
}

// --- カウントダウン中は落ちない -------------------------------------------
{
  const g = new Game(mc); g.onFinish = () => {}; g.onGameOver = () => {};
  g.startRace({ mode: 'time', trackIndex: RIO, players: 1, numKarts: 1 });
  const b = g.track.bolts[0], k = g.humans[0];
  k.x = b.x; k.y = b.y; k.life = 100; k.invincTimer = 0;
  for (let i = 0; i < 60 * 2; i++) g.update(1 / 60);       // カウントダウン中(3秒)
  t('カウントダウン中は落雷しない', g.state === 'countdown' && k.life === 100
    && g.track.bolts.every((x) => x.strikeT === 0));
}

// --- ミラーモードでは落雷地点も左右反転 -----------------------------------
{
  const gm = newGame({ mirror: true });
  const def = TRACKS[RIO];
  t('ミラーで落雷地点がX反転', Math.abs(gm.track.bolts[0].x - (def.cols - def.waypoints ? 0 : 0) - (gm.track.w - g0.track.bolts[0].x)) < 1e-6
    && Math.abs(gm.track.bolts[0].y - g0.track.bolts[0].y) < 1e-6);
}

// --- 実走: 走り続けると落雷を食らうが、レースは成立する(AIが完走できる) ----
//     ゲーム既定のプレイヤー倍率(1/2)では確実に完走。CPU相当の等倍でも大半は完走する。
const runLap = (scale, withBolts = true) => {
  const g = newGame({ lifeOn: true, playerDamageScale: scale, aiDiff: 'normal' });
  if (!withBolts) g.track.bolts = [];                       // 比較用: 落雷なしで同じ条件を走る
  g._readHuman = (kk) => kk.computeAI(g);
  let hits = 0, prev = g.humans[0].life;
  for (let i = 0; i < 60 * 400; i++) {
    g.update(1 / 60);
    const k = g.humans[0];
    if (k.life < prev - 5) hits++;                          // 大きく減った=落雷
    prev = k.life;
    if (k.finished || k.gone) break;
  }
  const k = g.humans[0];
  return { struck: g.track.bolts.some((b) => b.fired >= 0), done: k.finished && !k._exploded, hits, life: k.life };
};
{
  const r = runLap(0.5);                                    // 既定(自分のダメージ=1/2)
  t('落雷が実走中に発生する', r.struck);
  t('既定の倍率(1/2)ならAIは確実に完走できる', r.done);
  console.log(`   （参考・倍率1/2）大ダメージ回数=${r.hits} 残ライフ=${r.life.toFixed(1)}`);
  // CPU相当(等倍)は、リオ自体が元々きつい(ボール/芝生で稀に落ちる)ので
  // 「落雷なしの場合と比べて完走数が落ちない」ことで“落雷が壊していない”を見る。
  let withB = 0, without = 0, lives = [];
  for (let i = 0; i < 4; i++) {
    const a = runLap(1, true); if (a.done) { withB++; lives.push(a.life); }
    if (runLap(1, false).done) without++;
  }
  t('等倍(CPU相当)でも落雷なしと同程度に完走する', withB >= without - 1);
  console.log(`   （参考・倍率1倍）完走 落雷あり ${withB}/4・落雷なし ${without}/4 残ライフ=${lives.map((v) => v.toFixed(0)).join(',')}`);
}

// --- 描画してもエラーにならない(予兆/落雷/ミニマップ) ---------------------
{
  const g = newGame();
  let ok = true;
  try {
    const b = g.track.bolts[0];
    g.humans[0].x = b.x - 400; g.humans[0].y = b.y;
    g.raceTime = b.period - b.phase + b.warn * 0.6; g._updateBolts(); g.render();   // 予兆
    g.raceTime = strikeAt(b); g._updateBolts(); g.render();                          // 落雷
  } catch (e) { ok = false; console.log('   render error:', e.message); }
  t('落雷の描画が通る', ok);
}

console.log(fail ? `=== ${fail}件NG ===` : '=== 落雷 すべてOK ==='); if (fail) Deno.exit(1);
