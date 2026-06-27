// 変速モードの検証:
//  AT  … シフト操作なしで最高速まで出る(従来挙動)
//  MT  … 1速のままだと頭打ち、シフトアップで最高速まで伸びる
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

function run(trans, shiftPlan) {
  const game = new Game(mockCanvas);
  game.onFinish = () => {};
  game.startRace({ trackIndex: 0, players: 1, numKarts: 1, trans, lifeOn: false });   // ソロ(AI干渉なし)で変速を単体検証
  game.state = 'racing'; game.countdown = 0;
  const k = game.humans[0];
  let frame = 0, maxSpeed = 0;
  game._readHuman = (kk) => {
    kk.computeAI(game);                 // ステアはコース追従
    kk.control.throttle = 1;            // 常時フルスロットルで最高速を測る
    kk.control.shiftUp = shiftPlan && shiftPlan.includes(frame);
    kk.control.shiftDown = false;
  };
  for (let i = 0; i < 600; i++) { frame = i; nowMs += 1000 / 60; game.update(1 / 60); maxSpeed = Math.max(maxSpeed, Math.abs(k.speed)); }
  return { speed: maxSpeed, gear: k.gear, baseMax: k.baseMax };
}

const at = run('auto', null);
const mt1 = run('manual', null);                       // ずっと1速
const mt5 = run('manual', [40, 80, 120, 160]);         // 徐々にシフトアップ

const gear1Top = at.baseMax * 0.24;
let fail = 0;
const atOK = at.speed > at.baseMax * 0.9;               // ATは最高速近く
const mt1OK = mt1.speed < gear1Top * 1.2 && mt1.gear === 1; // 1速で頭打ち
const mt5OK = mt5.speed > at.baseMax * 0.9 && mt5.gear === 5; // シフトで最高速
console.log(`AT: 速度=${at.speed.toFixed(0)} (baseMax=${at.baseMax}) ${atOK ? 'OK' : 'NG'}`);
console.log(`MT 1速固定: 速度=${mt1.speed.toFixed(0)} gear=${mt1.gear} (1速トップ≈${gear1Top.toFixed(0)}) ${mt1OK ? 'OK' : 'NG'}`);
console.log(`MT シフトアップ: 速度=${mt5.speed.toFixed(0)} gear=${mt5.gear} ${mt5OK ? 'OK' : 'NG'}`);
if (!atOK || !mt1OK || !mt5OK) fail++;
console.log('\n=== ' + (fail ? 'NG' : '変速 すべてOK') + ' ===');
if (fail && typeof Deno !== 'undefined') Deno.exit(1);
