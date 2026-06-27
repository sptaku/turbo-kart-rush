// 入力→前進のエンドツーエンド検証(Wキー)。実 _readHuman を使う。
async function readText(p) {
  if (typeof Deno !== 'undefined') return await Deno.readTextFile(p);
  const fs = await import('node:fs/promises'); return fs.readFile(p, 'utf8');
}
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mockCanvas : () => mockCtx), set: () => true });
function makeCanvas() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; }
const mockCanvas = makeCanvas();

let nowMs = 0;
const listeners = {};
const win = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: () => {}, AudioContext: undefined, webkitAudioContext: undefined,
};
const doc = { createElement: () => makeCanvas() };
const perf = { now: () => nowMs };

const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js'];
let src = '';
for (const f of files) src += '\n;' + (await readText(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio, input };';
const factory = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src);
const { Game, TRACKS, audio, input } = factory(win, doc, perf, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};

function dispatch(type, code) { for (const fn of listeners[type] || []) fn({ code, preventDefault() {} }); }

let fail = 0;
for (let ti = 0; ti < TRACKS.length; ti++) {
  const game = new Game(mockCanvas);
  game.onFinish = () => {};
  game.startRace({ trackIndex: ti, players: 1, lifeOn: false });
  const k = game.humans[0];
  const sx = k.x, sy = k.y;

  // スポーンが壁にめり込んでいないこと
  const stuckAtSpawn = game.track.isBlocked(k.x, k.y, 18);

  // Wキーを押す
  dispatch('keydown', 'KeyW');
  game.update(1 / 60);
  const throttleOK = k.control.throttle === 1;

  // カウントダウン3秒 + 約5秒走行(W押しっぱなし) = 480フレーム
  for (let i = 0; i < 480; i++) { nowMs += 1000 / 60; game.update(1 / 60); game.render(); }
  const moved = Math.hypot(k.x - sx, k.y - sy);
  dispatch('keyup', 'KeyW');

  const ok = !stuckAtSpawn && throttleOK && moved > 300;
  console.log(`[${TRACKS[ti].id}] spawnStuck=${stuckAtSpawn} throttle=${k.control.throttle} 移動=${moved.toFixed(0)}px  ${ok ? 'OK' : 'NG'}`);
  if (!ok) fail++;
}
console.log('\n=== ' + (fail ? `${fail}件NG` : 'W→前進 すべてOK') + ' ===');
if (fail && typeof Deno !== 'undefined') Deno.exit(1);
