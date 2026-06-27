// ヘッドレス煙テスト: DOM/Canvasをモックし、ゲームのコアループを実行して
// 例外なく走り切るか確認する(描画は無効化、ロジックのみ検証)。
async function readText(p) {
  if (typeof Deno !== 'undefined') return await Deno.readTextFile(p);
  const fs = await import('node:fs/promises'); return fs.readFile(p, 'utf8');
}

// --- モック ---------------------------------------------------------------
const mockCtx = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'canvas') return mockCanvas;
    return () => mockCtx;       // メソッドは no-op。戻り値は ctx 自身(createLinearGradient等の連鎖に対応)
  },
  set: () => true,             // fillStyle 等の代入は無視
});
function makeCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => mockCtx };
}
const mockCanvas = makeCanvas();

let nowMs = 0;
const win = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: () => {}, removeEventListener: () => {},
  AudioContext: undefined, webkitAudioContext: undefined,
};
const doc = { createElement: () => makeCanvas() };
const perf = { now: () => nowMs };
const RAF = () => 0, CAF = () => {};

// --- 4ファイルを同一スコープに連結して評価 -------------------------------
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js'];
let src = '';
for (const f of files) src += '\n;' + (await readText(f)) + '\n';
src += '\nreturn { Game, TRACKS, audio, input };';

const factory = new Function(
  'window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
  'Math', 'Date', 'console',
  src,
);
const { Game, TRACKS, audio } = factory(win, doc, perf, RAF, CAF, Math, Date, console);

// オーディオを完全スタブ化(AudioContext不要に)
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio)))
  if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};

// --- 実行 -----------------------------------------------------------------
let problems = 0;
for (let ti = 0; ti < TRACKS.length; ti++) {
  const players = ti === 1 ? 2 : 1;   // 1Pと2Pの両方を確認
  const game = new Game(mockCanvas);
  let finishedResults = null;
  game.onFinish = (r) => { finishedResults = r; };

  try {
    game.startRace({ trackIndex: ti, players, lifeOn: false });

    // 全アイテム種を強制使用して各コードパスを踏む
    const forceItems = ['mushroom', 'star', 'banana', 'green', 'red', 'bomb', 'grapple'];
    const step = (dt) => { nowMs += dt * 1000; game.update(dt); game.render(); };

    // カウントダウンを消化
    for (let i = 0; i < 260; i++) step(1 / 60);

    for (const it of forceItems) {
      game.karts[0].item = it;
      game.karts[0].control = { throttle: 1, steer: 0.2, drift: false, item: true };
      game.update(1 / 60);
      for (let i = 0; i < 80; i++) step(1 / 60); // 投擲/爆発/スロー/スターを進める
    }

    // 通常進行
    for (let i = 0; i < 1800; i++) step(1 / 60);

    // 強制的に全人間ゴール → リザルト遷移を検証
    for (const k of game.karts) if (k.isHuman) { k.finished = true; k.finishTime = game.raceTime || 1; if (!game.finishOrder.includes(k)) game.finishOrder.push(k); }
    for (let i = 0; i < 120 && !finishedResults; i++) step(1 / 60);
    game.stop();

    const rows = finishedResults && finishedResults.order;
    const ok = Array.isArray(rows) && rows.length === 4;
    console.log(`[${TRACKS[ti].id}] players=${players}  frames OK  resultRows=${rows ? rows.length : 0}  ${ok ? 'OK' : 'NG'}`);
    if (!ok) problems++;
  } catch (e) {
    problems++;
    console.log(`[${TRACKS[ti].id}] FAILED: ${e.stack || e}`);
  }
}

console.log('\n=== ' + (problems ? `${problems} 件の問題` : '煙テスト すべてOK') + ' ===');
if (problems && typeof Deno !== 'undefined') Deno.exit(1);
