// 全カートをAI走行させ、各コースを問題なく周回/完走できるか確認(ナビ性能の検証)。
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
  game._readHuman = (k) => k.computeAI(game);   // 人間枠もAIで走らせる
  let offGrassFrames = 0, total = 0, pickups = 0, bumps = 0;
  const had = game.karts.map(() => false);
  const hadBump = game.karts.map(() => false);
  // 最大300秒シミュレート(激ムズは1周が長いため)
  for (let i = 0; i < 300 * 60; i++) {
    nowMs += 1000 / 60; game.update(1 / 60);
    total++;
    // アイテム取得を検出(？ブロックから取れているか)
    game.karts.forEach((k, idx) => {
      if (k.item && !had[idx]) { pickups++; had[idx] = true; }
      if (!k.item) had[idx] = false;
      if (k.bumpTimer > 0.3 && !hadBump[idx]) { bumps++; hadBump[idx] = true; }
      if (k.bumpTimer <= 0) hadBump[idx] = false;
    });
    const lead = game.karts.reduce((a, b) => (b.progress > a.progress ? b : a));
    if (game.track.surfaceAt(lead.x, lead.y) === 'grass') offGrassFrames++;
    if (game.karts.every(k => k.finished)) break;
  }
  const laps = game.karts.map(k => k.lapCount);
  const maxLap = Math.max(...laps);
  const finished = game.karts.filter(k => k.finished).length;
  const grassPct = (offGrassFrames / total * 100).toFixed(1);
  const ok = maxLap >= 3 && finished >= 1 && pickups > 0;   // 完走+アイテム取得=OK
  console.log(`[${TRACKS[ti].id}] laps=[${laps}] 完走=${finished}/4 アイテム取得=${pickups}回 カート衝突=${bumps}回 先頭の芝生滞在=${grassPct}%  ${ok ? 'OK' : 'NG'}`);
  if (!ok) fail++;
}
console.log('\n=== ' + (fail ? `${fail}件NG(コースを曲がり切れていない可能性)` : 'AI完走 すべてOK') + ' ===');
if (fail && typeof Deno !== 'undefined') Deno.exit(1);
