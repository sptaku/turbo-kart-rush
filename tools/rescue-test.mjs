// レスキュー検証: カートをコース外(壁の中)へ飛ばし、走路へ戻されるか確認。
async function readText(p) {
  if (typeof Deno !== 'undefined') return await Deno.readTextFile(p);
  const fs = await import('node:fs/promises'); return fs.readFile(p, 'utf8');
}
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mockCanvas : () => mockCtx), set: () => true });
function makeCanvas() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; }
const mockCanvas = makeCanvas();
let nowMs = 0;
const win = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {}, AudioContext: undefined, webkitAudioContext: undefined };
const doc = { createElement: () => makeCanvas() };
const perf = { now: () => nowMs };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js'];
let src = '';
for (const f of files) src += '\n;' + (await readText(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio };';
const { Game, TRACKS, audio } = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(win, doc, perf, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};

let fail = 0;
for (let ti = 0; ti < TRACKS.length; ti++) {
  const game = new Game(mockCanvas);
  game.onFinish = () => {};
  game.startRace({ trackIndex: ti, players: 1, lifeOn: false });
  game.state = 'racing'; game.countdown = 0;
  const k = game.humans[0];
  // コース外(マップ隅=壁)へワープ
  k.x = game.track.tile * 2; k.y = game.track.tile * 2;
  k.control = { throttle: 0, steer: 0, drift: false, item: false };
  const startSurf = game.track.surfaceAt(k.x, k.y);

  let rescued = false;
  for (let i = 0; i < 6 * 60; i++) {       // 最大6秒
    nowMs += 1000 / 60;
    // 人間入力は止まったまま(レスキューを待つ)
    game._readHuman = (kk) => { kk.control = { throttle: 0, steer: 0, drift: false, item: false }; };
    game.update(1 / 60);
    const s = game.track.surfaceAt(k.x, k.y);
    if (s === 'road' || s === 'boost') { rescued = true; break; }
  }
  const finalSurf = game.track.surfaceAt(k.x, k.y);
  const onTrack = finalSurf === 'road' || finalSurf === 'boost';
  const ok = startSurf === 'wall' && rescued && onTrack;
  console.log(`[${TRACKS[ti].id}] 開始=${startSurf} → 復帰後=${finalSurf} レスキュー=${rescued ? '成功' : '失敗'}  ${ok ? 'OK' : 'NG'}`);
  if (!ok) fail++;
}
// 追加: 壁を向いてアクセル全開でも動けない(デッドロック)カートが ~3秒で復帰するか
{
  const game = new Game(mockCanvas); game.onFinish = () => {};
  game.startRace({ trackIndex: 4, players: 1, numKarts: 1, lifeOn: false });
  game.state = 'racing'; game.countdown = 0;
  const k = game.humans[0];
  k.x = game.track.tile * 2; k.y = game.track.tile * 2; k.angle = 0; k.speed = 0;   // 隅(壁)で壁向き
  game._readHuman = (kk) => { kk.control = { throttle: 1, steer: 0, drift: false, item: false }; };
  let rescued = false, tRescue = 0;
  for (let i = 0; i < 4 * 60; i++) {       // 最大4秒(pinは2.5秒で発動)
    nowMs += 1000 / 60; game.update(1 / 60);
    const s = game.track.surfaceAt(k.x, k.y);
    if (s === 'road' || s === 'boost') { rescued = true; tRescue = i / 60; break; }
  }
  console.log(`[デッドロック] 壁向きアクセル全開 → ${rescued ? `${tRescue.toFixed(1)}秒で復帰OK` : '復帰せずNG'}`);
  if (!rescued) fail++;
}

console.log('\n=== ' + (fail ? `${fail}件NG` : 'レスキュー すべてOK') + ' ===');
if (fail && typeof Deno !== 'undefined') Deno.exit(1);
