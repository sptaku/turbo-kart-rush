// 周回判定(中心線連続位置方式)の検証:
//  (A) レスキュー多発でも一周が必ずカウントされ完走する(永久ループしない)
//  (B) 後退でスタートを跨いでも周回が増えない(誤カウント防止)
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
  // (A) レスキュー多発でも完走
  const game = new Game(mockCanvas);
  game.onFinish = () => {};
  game.startRace({ trackIndex: ti, players: 1, lifeOn: false });
  game.state = 'racing'; game.countdown = 0;
  const k = game.humans[0];
  const T = game.track;
  game._readHuman = (kk) => kk.computeAI(game);
  let lastYank = 0;
  // 激ムズは1周が長いので猶予を多めに(永久ループ検出が目的。完走できればOK)
  for (let i = 0; i < 480 * 60 && !k.finished; i++) {
    nowMs += 1000 / 60; game.update(1 / 60);
    if (game.raceTime - lastYank > 10.0) {
      lastYank = game.raceTime;
      const info = T._distInfo(k.x, k.y);
      const a = T.path[info.i], b = T.path[(info.i + 8) % T.path.length];
      let dx = b.x - a.x, dy = b.y - a.y; const dl = Math.hypot(dx, dy) || 1;
      const ox = -dy / dl, oy = dx / dl;
      k.x = b.x + ox * (T.roadHalf + T.shoulder + 30);
      k.y = b.y + oy * (T.roadHalf + T.shoulder + 30);
    }
  }
  const finished = k.finished;

  // (B) 後退カウント防止: 別レースで、一周してから後退でスタートを跨ぐ
  const g2 = new Game(mockCanvas); g2.onFinish = () => {};
  g2.startRace({ trackIndex: ti, players: 1, lifeOn: false });
  g2.state = 'racing'; g2.countdown = 0;
  const k2 = g2.humans[0]; const T2 = g2.track, N = T2.path.length;
  // 中間地点へワープ→スタート手前→前方クロスで1周、その後 後退クロスを複数回
  const placeAt = (segIdx) => { const p = T2.path[segIdx % N]; k2.x = p.x; k2.y = p.y; };
  k2._passedHalf = false; k2._lastSeg = null;
  // 半周通過させる
  placeAt(Math.floor(N * 0.5)); g2.checkProgress(k2);
  placeAt(Math.floor(N * 0.95)); g2.checkProgress(k2);
  placeAt(2); g2.checkProgress(k2);             // 前方クロス → lap1
  const afterFwd = k2.lapCount;
  // 後退クロスを3回(行ったり来たり)
  for (let r = 0; r < 3; r++) {
    placeAt(2); g2.checkProgress(k2);
    placeAt(Math.floor(N * 0.95)); g2.checkProgress(k2);   // 後退クロス → lap戻る
    placeAt(Math.floor(N * 0.5)); g2.checkProgress(k2);
  }
  const noFarm = k2.lapCount <= afterFwd;       // 振動で増えていない

  const ok = finished && noFarm;
  console.log(`[${TRACKS[ti].id}] レスキュー多発で完走=${finished}(lap${k.lapCount}) / 前方1周=${afterFwd} 後退振動後=${k2.lapCount} 誤カウント無=${noFarm}  ${ok ? 'OK' : 'NG'}`);
  if (!ok) fail++;
}
console.log('\n=== ' + (fail ? `${fail}件NG` : '周回判定 すべてOK') + ' ===');
if (fail && typeof Deno !== 'undefined') Deno.exit(1);
