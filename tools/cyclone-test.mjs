// サイクロン・ワークス(最難関コース)の検証:
//   複雑な形状 / 動くタイヤ(大きい・痛い) / 横風で流される＋風下にタイヤ /
//   意味のある分岐×3 / 意味のあるワープ×2(CPUのラインからは踏めない) / 落雷×5 / 風の音
async function rd(p) { return await Deno.readTextFile(p); }
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mc : () => mockCtx), set: () => true });
function mk() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; } const mc = mk();
const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js']; let src = '';
for (const f of files) src += '\n;' + (await rd(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio, MOVER_KINDS };';
const { Game, TRACKS, audio, MOVER_KINDS } = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(
  win, { createElement: () => mk() }, { now: () => 0 }, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};
let fail = 0; const t = (n, c) => { console.log(`  ${n}: ${c ? 'OK' : 'NG'}`); if (!c) fail++; };

const CY = TRACKS.findIndex((x) => x.id === 'cyclone');
const def = TRACKS[CY];
const newGame = (opts = {}) => {
  const g = new Game(mc); g.onFinish = () => {}; g.onGameOver = () => {};
  g.startRace(Object.assign({ mode: 'time', trackIndex: CY, players: 1, numKarts: 1, lifeOn: true, playerDamageScale: 1 }, opts));
  g.state = 'racing'; g.countdown = 0; g.raceTime = 1;
  return g;
};

// --- コース構成 -----------------------------------------------------------
{
  t('最難関コースとして追加されている', CY >= 0 && CY === TRACKS.length - 1 && def.difficulty.includes('激ムズ'));
  const g = newGame({ mode: 'vs', numKarts: 2 });   // ？ブロックはタイムアタックだと消えるのでVSで見る
  const T = g.track;
  t('意味のある分岐が2つ以上ある', T.branchPaths.length >= 2);
  t('意味のあるワープが2つ以上ある', T.warps.length >= 2);
  t('落雷ポイントがある', T.bolts.length >= 4);
  t('横風ゾーンがある(2本の直線)', T.winds.length >= 8);
  t('動くタイヤが配置されている', T.movers.filter((m) => m.kind === 'tire').length >= 6);
  // 単純な円ではない=方位が何度も反転する複雑な形
  let turns = 0, prev = null;
  for (let i = 0; i < T.path.length; i += 4) {
    const a = T._pathDir(i);
    if (prev != null) { const d = Math.atan2(Math.sin(a - prev), Math.cos(a - prev)); if (Math.abs(d) > 0.12) turns++; }
    prev = a;
  }
  t('単純な円ではない(曲がりの向きが何度も変わる)', turns >= 25);
  // 分岐/ワープの意味: 分岐上にリスク(オイル)と報酬(？ブロック)が置かれている
  const onBranch = (p) => T.branchPaths.some((bp) => {
    let best = 1e9;
    for (let i = 0; i < bp.length - 1; i++) best = Math.min(best, Math.hypot(bp[i].x - p.x, bp[i].y - p.y));
    return best < T.wallDist;
  });
  t('分岐に代償(オイル)が置かれている', T.hazards.some(onBranch));
  t('分岐に報酬(？ブロック)が置かれている', T.itemBoxes.some(onBranch));
  t('ワープ入口は分岐の上にある(本線からは踏めない)', T.warps.every((w) => onBranch({ x: w.ex, y: w.ey })));
  // ワープ入口は本線から離れている=センターラインを走るCPUは踏まない
  const farFromMain = T.warps.every((w) => T._distInfo(w.ex, w.ey).d > T.roadHalf + T.warpR);
  t('ワープ入口は本線の走行ラインから離れている', farFromMain);
}

// --- 動くタイヤ: 大きく・痛く・強く弾く ------------------------------------
{
  t('タイヤはボールより大きく痛い', MOVER_KINDS.tire.r > MOVER_KINDS.ball.r
    && MOVER_KINDS.tire.dmg > MOVER_KINDS.ball.dmg && MOVER_KINDS.tire.push > MOVER_KINDS.ball.push);
  const g = newGame();
  const m = g.track.movers.find((x) => x.kind === 'tire');
  const k = g.humans[0];
  k.x = m.cx + 20; k.y = m.cy + 12; k.speed = 300;   // 中心から少しずらして当たる(弾かれる向きが出る)
  k.invincTimer = 0; k.spinTimer = 0; k.life = 100; k.kbx = 0; k.kby = 0;
  g._collisions();
  t('タイヤに当たるとスピン＋ダメージ', k.spinTimer > 0 && Math.abs(k.life - (100 - MOVER_KINDS.tire.dmg)) < 1e-6);
  t('タイヤに当たると弾かれる', Math.hypot(k.kbx, k.kby) > 0);
}

// --- 横風: 流されて、その先(風下)にタイヤがある ----------------------------
{
  const g = newGame();
  const T = g.track, k = g.humans[0];
  const w = T.winds[2];                                  // 下ストレートの風(下向き)
  t('風は下ストレートで外(下)へ吹く', Math.abs(w.dy - 1) < 1e-6 && Math.abs(w.dx) < 1e-6);
  // 操作せずに風ゾーンを直進すると風下へ流される
  k.x = w.x; k.y = w.y; k.angle = 0; k.speed = 260; k.steerSmooth = 0;
  g._readHuman = (kk) => { kk.control = { throttle: 1, steer: 0, drift: false, item: false }; };
  const y0 = k.y;
  for (let i = 0; i < 45; i++) g.update(1 / 60);
  t('無操作だと風下へ流される', k.y - y0 > T.tile * 0.5);
  // 風下(流された先)にはタイヤが待っている=ダメージを受ける配置
  const leeTire = T.movers.some((m) => m.kind === 'tire' && m.cy > w.y + T.tile * 1.5 && Math.abs(m.cx - w.x) < T.tile * 26);
  t('風下にタイヤ(ダメージ源)が置かれている', leeTire);
}

// --- CPUは風に逆らって走る(風下の罠に落ち続けない) ------------------------
{
  const g = newGame();
  const T = g.track, k = g.humans[0];
  const w = T.winds[2];
  k.x = w.x - T.tile * 4; k.y = w.y; k.angle = 0; k.speed = 300;
  g._readHuman = (kk) => kk.computeAI(g);
  let maxOff = 0;
  for (let i = 0; i < 120; i++) { g.update(1 / 60); maxOff = Math.max(maxOff, T._distInfo(k.x, k.y).d); }
  t('CPUは風に当て舵をして走路内に留まる', maxOff < T.roadHalf * T.tile);
}

// --- ワープ: 使うと前へ進む(ショートカットになっている) --------------------
{
  const g = newGame();
  const T = g.track, k = g.humans[0];
  for (const w of T.warps) {
    k.x = w.ex; k.y = w.ey; k._lastSeg = T._distInfo(w.ex, w.ey).i; k._warpCd = 0;
    const before = k._prog;
    g.warpKart(k, w);
    t(`ワープで前方へ進む (${Math.round(w.ex / T.tile)},${Math.round(w.ey / T.tile)})`,
      k._prog > before && Math.hypot(k.x - w.tx, k.y - w.ty) < 1e-6);
  }
}

// --- 落雷: 半径は道幅の半分より小さい(避けられる) --------------------------
{
  const g = newGame();
  const T = g.track;
  t('落雷の輪は道幅の半分より小さい', T.bolts.every((b) => b.r < T.roadHalf));
  t('落雷の周期はバラバラ', new Set(T.bolts.map((b) => b.period)).size === T.bolts.length);
}

// --- 風の音: 風ゾーンに入ると鳴り、離れると止まる --------------------------
{
  const g = newGame();
  const T = g.track, k = g.humans[0];
  let lv = -1;
  audio.updateWind = (v) => { lv = v; };
  k.x = T.winds[2].x; k.y = T.winds[2].y;
  g.update(1 / 60);
  t('風ゾーンの中では風の音が鳴る', lv > 0.5);
  k.x = T.path[Math.floor(T.path.length * 0.55)].x; k.y = T.path[Math.floor(T.path.length * 0.55)].y;
  g.update(1 / 60);
  t('風ゾーンから離れると鳴らない', lv === 0);
  // 風ゾーンの無いコースでは風の音を出さない(startWindを呼ばない)
  let started = false;
  audio.startWind = () => { started = true; };
  const g2 = new Game(mc); g2.onFinish = () => {};
  g2.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1 });
  t('風の無いコースでは風の音を出さない', started === false);
  const g3 = new Game(mc); g3.onFinish = () => {};
  g3.startRace({ mode: 'time', trackIndex: CY, players: 1, numKarts: 1 });
  t('風のあるコースでは風の音を鳴らし始める', started === true);
}

// --- 描画が通る(タイヤ・風・落雷・ワープ込み) ------------------------------
{
  const g = newGame();
  let ok = true;
  try { g.render(); g.update(1 / 60); g.render(); } catch (e) { ok = false; console.log('   render error:', e.message); }
  t('新コースの描画が通る', ok);
}

console.log(fail ? `=== ${fail}件NG ===` : '=== サイクロン・ワークス すべてOK ==='); if (fail) Deno.exit(1);
