// ゴースト(タイムアタックの自己ベスト再生)の検証:
//   記録データの形式 / 再生位置の一致 / 補間 / 終端フェード / ミラー反転 / タイム差 / 間引き / モード制限
async function rd(p) { return await Deno.readTextFile(p); }
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mc : () => mockCtx), set: () => true });
function mk() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; } const mc = mk();
const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js']; let src = '';
for (const f of files) src += '\n;' + (await rd(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio, GhostRecorder, GhostReplay, GHOST_STEP, GHOST_MAX_SAMPLES };';
const { Game, TRACKS, audio, GhostRecorder, GhostReplay, GHOST_STEP, GHOST_MAX_SAMPLES } =
  new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(
    win, { createElement: () => mk() }, { now: () => 0 }, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};
let fail = 0; const t = (n, c) => { console.log(`  ${n}: ${c ? 'OK' : 'NG'}`); if (!c) fail++; };

// --- AIに1周させてゴーストを記録する ------------------------------------
function record(trackIndex, opts = {}) {
  const g = new Game(mc);
  let res = null; g.onFinish = (r) => { res = r; }; g.onGameOver = () => {};
  g.startRace(Object.assign({ mode: 'time', trackIndex, players: 1, numKarts: 1, lifeOn: false }, opts));
  g._readHuman = (kk) => kk.computeAI(g);
  for (let i = 0; i < 60 * 400 && !res; i++) g.update(1 / 60);
  return { g, res };
}

const { g: g1, res: res1 } = record(0);
t('タイムアタックで完走してリザルトが出る', !!res1 && res1.order[0].time != null);
const data = res1 && res1.ghost;
t('ゴースト記録が返る', !!data);
t('記録の形式(n>=2 / d.length = n*5)', !!data && data.n >= 2 && data.d.length === data.n * 5);
t('記録のメタ情報(コースid/タイム/周回/ミラー)', !!data && data.track === TRACKS[0].id
  && Math.abs(data.time - res1.order[0].time) < 0.001 && data.laps === TRACKS[0].laps && data.mirror === false);
t('記録は全て整数(保存サイズを抑える)', !!data && data.d.every((v) => Number.isInteger(v)));
t('記録の間隔は既定値(長い走行は倍々に間引き)', !!data && data.step >= GHOST_STEP - 1e-9
  && Math.abs(Math.log2(data.step / GHOST_STEP) % 1) < 1e-9 && data.n <= GHOST_MAX_SAMPLES);
t('記録の長さがタイムとほぼ一致', !!data && Math.abs((data.n - 1) * data.step - data.time) < 0.5);
t('未完走(記録なし)ならゴーストは返らない', (() => {
  const g = new Game(mc); let r = null; g.onFinish = (x) => { r = x; };
  g.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, lifeOn: false });
  g.state = 'racing'; g.countdown = 0;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  g.humans[0]._exploded = true; for (let i = 0; i < 200; i++) g.update(1 / 60);
  return r && r.ghost === null;
})());

// --- 再生: サンプル時刻の姿勢が記録と一致する ---------------------------
const track0 = new (Object.getPrototypeOf(g1.track).constructor)(TRACKS[0], false);
const rep = new GhostReplay(data, track0);
t('再生データが有効', rep.active && rep.n === data.n);
let maxErr = 0;
for (let i = 0; i < data.n; i += 7) {
  rep.update(i * data.step);
  maxErr = Math.max(maxErr, Math.hypot(rep.x - data.d[i * 5], rep.y - data.d[i * 5 + 1]));
}
t('サンプル時刻の位置が記録と一致(誤差<1px)', maxErr < 1);
// サンプルの中間は線形補間
rep.update(0.5 * data.step);
const midX = (data.d[0] + data.d[5]) / 2, midY = (data.d[1] + data.d[6]) / 2;
t('サンプル間は補間される', Math.abs(rep.x - midX) < 1 && Math.abs(rep.y - midY) < 1);
// 終端: done になり、少し経つと消える(fade→0)
rep.update((data.n - 1) * data.step + 0.01);
t('記録の終端で done', rep.done === true && rep.visible === true);
rep.update((data.n - 1) * data.step + 2.0);
t('終端の2秒後には消える', rep.visible === false);

// --- ミラー: 記録時と設定が違えばX反転して現在のコースに合わせる ---------
const track0m = new (Object.getPrototypeOf(g1.track).constructor)(TRACKS[0], true);
const repM = new GhostReplay(data, track0m);
repM.update(3 * data.step); rep.update(3 * data.step);
t('ミラー時はX反転して走る', repM.flip === true && Math.abs(repM.x - (track0m.w - rep.x)) < 1
  && Math.abs(repM.y - rep.y) < 1 && Math.abs(Math.cos(repM.angle) + Math.cos(rep.angle)) < 0.01);

// --- タイム差(timeAtProg): 進捗→その地点にゴーストが居た時刻 -------------
t('進捗0の時刻は0', rep.timeAtProg(rep.prg[0]) === 0);
// 進捗が確実に増えている(=止まっていない)中間地点で照合する
let midIdx = Math.floor(data.n / 2);
while (midIdx < data.n - 2 && !(rep.prg[midIdx - 1] < rep.prg[midIdx] && rep.prg[midIdx] < rep.prg[midIdx + 1])) midIdx++;
const tm = rep.timeAtProg(rep.prg[midIdx]);
t('中間地点の時刻が妥当', Math.abs(tm - midIdx * data.step) < data.step * 2);
t('進捗が進むほど時刻も進む(単調)', rep.timeAtProg(rep.prg[10]) <= rep.timeAtProg(rep.prg[20])
  && rep.timeAtProg(rep.prg[data.n - 10]) > rep.timeAtProg(rep.prg[10]));
// 停止していた区間(同じ進捗が続く)は「最初に到達した時刻」を返す
t('停止区間は最初に到達した時刻', (() => {
  const flat = { step: 1, n: 5, time: 4, d: [0, 0, 0, 0, 0, 10, 0, 0, 0, 100, 20, 0, 0, 0, 100, 30, 0, 0, 0, 100, 40, 0, 0, 0, 200] };
  const r = new GhostReplay(flat, track0);
  return Math.abs(r.timeAtProg(1) - 1) < 1e-9;      // 進捗100(=1.0)は時刻1で到達
})());
t('記録の先まで進んだらゴーストのタイムを返す', Math.abs(rep.timeAtProg(rep.prg[data.n - 1] + 999) - data.time) < 1e-6);

// --- ゲーム内: ゴーストと同時走行(当たり判定なし・タイム差が出る) --------
const g2 = new Game(mc); g2.onFinish = () => {};
g2.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, lifeOn: false, ghost: data });
t('ゴーストが読み込まれる', !!g2.ghost && g2.ghost.active);
t('ゴーストはカート一覧に入らない(すり抜ける)', g2.karts.length === 1 && g2.karts[0].isHuman);
t('ゴーストの見た目は自分と同じ車種', g2.ghost.kart.def.kind === g2.humans[0].def.kind);
g2._readHuman = (kk) => kk.computeAI(g2);
for (let i = 0; i < 60 * 12; i++) g2.update(1 / 60);   // カウントダウン3秒＋走行9秒
rep.update(g2.raceTime);
t('レース時間に同期してゴーストが動く', g2.raceTime > 8
  && Math.hypot(g2.ghost.x - rep.x, g2.ghost.y - rep.y) < 2);
t('ゴーストとのタイム差が算出される', g2.ghostDelta != null && isFinite(g2.ghostDelta) && Math.abs(g2.ghostDelta) < 30);
// 同じAI同士なので差はごく僅か(数秒以内)
t('同じ走りならタイム差はほぼ0', Math.abs(g2.ghostDelta) < 3);
// カウントダウン中はゴーストもスタート地点で待機
const g3 = new Game(mc); g3.onFinish = () => {};
g3.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, lifeOn: false, ghost: data });
for (let i = 0; i < 60; i++) g3.update(1 / 60);
t('カウントダウン中はゴーストが動かない', g3.state === 'countdown'
  && Math.hypot(g3.ghost.x - data.d[0], g3.ghost.y - data.d[1]) < 1);

// --- 壊れた/古いデータでも落ちない ---------------------------------------
const bad = [{ n: 1, d: [0, 0, 0, 0, 0] }, { n: 0, d: [] }, { d: [1, 2, 3] }, {}];
let crashed = false;
for (const b of bad) {
  try {
    const gb = new Game(mc); gb.onFinish = () => {};
    gb.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, lifeOn: false, ghost: b });
    if (gb.ghost) crashed = true;                       // 無効データはゴーストを作らない
    for (let i = 0; i < 30; i++) gb.update(1 / 60);
  } catch (e) { crashed = true; }
}
t('壊れたゴーストデータは無視して続行', !crashed);

// --- 長い記録は間引いて保存(容量対策) ------------------------------------
const recL = new GhostRecorder();
const fake = { x: 0, y: 0, angle: 0, airZ: 0, _prog: 0 };
for (let i = 0; i < GHOST_MAX_SAMPLES * 2 + 10; i++) {
  fake.x = i; fake.y = i * 2; fake._prog = i * 0.5;
  recL.sample(i * GHOST_STEP, fake);
}
const dataL = recL.toData({ time: 999 });
t('長い記録は上限以下に間引かれる', dataL.n <= GHOST_MAX_SAMPLES && dataL.n > GHOST_MAX_SAMPLES / 2);
t('間引いても記録間隔が伸びて総時間は保たれる', Math.abs((dataL.n - 1) * dataL.step - (recL.n - 1) * GHOST_STEP) < dataL.step);

// --- コマ落ちしても記録の時刻がずれない(間は補間して埋める) --------------
const recD = new GhostRecorder();
fake.x = 0; fake.y = 0; fake.angle = 0; fake._prog = 0; recD.sample(0, fake);
fake.x = 100; recD.sample(GHOST_STEP * 5, fake);       // 5コマ分まとめて進んだ
t('コマ落ち分を埋めて時刻を保つ', recD.n === 6 && recD.d[5 * 5] === 100);
t('埋めた分は直前の姿勢から補間', recD.d[1 * 5] === 20 && recD.d[3 * 5] === 60);

// --- タイムアタック以外ではゴーストを使わない/記録しない -----------------
const g4 = new Game(mc); g4.onFinish = () => {};
g4.startRace({ mode: 'vs', trackIndex: 0, players: 1, numKarts: 4, ghost: data });
t('VSではゴーストを走らせない/記録しない', g4.ghost === null && g4.ghostRec === null);
const g5 = new Game(mc); g5.onFinish = () => {};
g5.startRace({ mode: 'time', trackIndex: 0, players: 1, numKarts: 1, recordGhost: false });
t('recordGhost:false で記録しない', g5.ghostRec === null);

// --- 描画してもエラーにならない(ゴースト表示・ミニマップ・HUD) -----------
let drew = true;
try { g2.render(); } catch (e) { drew = false; console.log('   render error:', e.message); }
t('ゴースト表示込みの描画が通る', drew);

console.log(fail ? `=== ${fail}件NG ===` : '=== ゴースト すべてOK ==='); if (fail) Deno.exit(1);
