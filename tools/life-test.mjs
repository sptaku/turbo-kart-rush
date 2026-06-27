// ライフ(耐久)システムの検証:
//  芝生で減少 / 回復ゾーンで回復 / 0で爆発 / プレイヤー=ゲームオーバー / CPU=復活 / 衝突ダメージ
async function rd(p) { return await Deno.readTextFile(p); }
const mockCtx = new Proxy({}, { get: (_t, p) => (p === 'canvas' ? mc : () => mockCtx), set: () => true });
function mk() { return { width: 0, height: 0, style: {}, getContext: () => mockCtx }; } const mc = mk();
const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} };
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js']; let src = '';
for (const f of files) src += '\n;' + (await rd(f)) + '\n'; src += '\nreturn { Game, TRACKS, audio };';
const { Game, audio } = new Function('window', 'document', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Math', 'Date', 'console', src)(win, { createElement: () => mk() }, { now: () => 0 }, () => 0, () => {}, Math, Date, console);
for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (typeof audio[m] === 'function') audio[m] = () => {};
audio.init = () => {};
let fail = 0; const t = (n, c) => { console.log(`  ${n}: ${c ? 'OK' : 'NG'}`); if (!c) fail++; };

// --- 芝生でライフ減少 ---
const g = new Game(mc); g.onFinish = () => {};
g.startRace({ mode: 'time', trackIndex: 2, players: 1, numKarts: 1 });   // lifeOn デフォルトON
g.state = 'racing'; g.countdown = 0;
const k = g.humans[0], T = g.track;
const pi = 10, p = T.path[pi], ang = T._pathDir(pi);
const ox = Math.cos(ang + Math.PI / 2), oy = Math.sin(ang + Math.PI / 2);
const off = T.roadHalf + T.shoulder * 0.4;        // 芝生(roadHalf < d < wallDist)
const surf0 = T.surfaceAt(p.x + ox * off, p.y + oy * off);
k.speed = 0; const life0 = k.life;
for (let f = 0; f < 30; f++) { k.x = p.x + ox * off; k.y = p.y + oy * off; k.speed = 0; g.update(1 / 60); }
t('芝生でライフ減少', surf0 === 'grass' && k.life < life0);

// --- 回復ゾーンでライフ増加 ---
const rc = T.recover[0]; k.life = 40;
for (let f = 0; f < 30; f++) { k.x = rc.x; k.y = rc.y; k.speed = 0; g.update(1 / 60); }
t('回復ゾーンでライフ増加', T.surfaceAt(rc.x, rc.y) === 'recover' && k.life > 40);

// --- ライフ0でプレイヤー爆発 → ゲームオーバー ---
let fired = false; g.onGameOver = () => { fired = true; };
k.x = p.x; k.y = p.y; k.life = 5; k.hurt(20, g);
t('ライフ0で爆発→gameover状態', g.state === 'gameover' && k._exploded);
g.update(1.0);                                    // 遅延を超える
t('少し後に onGameOver 発火', fired);

// --- CPUは爆発後に復活(ライフ全快) ---
const g2 = new Game(mc); g2.onFinish = () => {};
g2.startRace({ mode: 'vs', trackIndex: 2, players: 1, numKarts: 4 });
g2.state = 'racing'; g2.countdown = 0;
const before = g2.karts.filter(c => !c.gone).length;
const cpu = g2.karts.find(c => !c.isHuman);
cpu.life = 3; cpu.hurt(20, g2);
t('CPU爆発でリタイヤ(消滅)', cpu._retired === true && cpu.gone === true && g2.state === 'racing');
for (let f = 0; f < 100; f++) g2.update(1 / 60);   // 時間が経っても復活しない
t('CPUはリタイヤのまま', cpu._retired === true);
t('残り台数が1減る', g2.karts.filter(c => !c.gone).length === before - 1);

// --- 衝突でライフ減少 ---
const g3 = new Game(mc); g3.onFinish = () => {};
g3.startRace({ mode: 'vs', trackIndex: 2, players: 1, numKarts: 4 });
g3.state = 'racing'; g3.raceTime = 1; g3.countdown = 0;
const a = g3.karts[0], b = g3.karts[1];
a.x = 1000; a.y = 1000; b.x = 1060; b.y = 1000;    // bodyR=56 → 重なり(60<112)
a.speed = 320; b.speed = 320; a.hurtCd = 0; b.hurtCd = 0; a.invincTimer = 0; b.invincTimer = 0;
const la = a.life, lb = b.life;
g3._collisions();
t('衝突でライフ減少', a.life < la && b.life < lb);

// --- lifeOff では減らない ---
const g4 = new Game(mc); g4.onFinish = () => {};
g4.startRace({ mode: 'time', trackIndex: 2, players: 1, numKarts: 1, lifeOn: false });
g4.state = 'racing'; g4.countdown = 0;
const k4 = g4.humans[0]; const l4 = k4.life;
for (let f = 0; f < 30; f++) { k4.x = p.x + ox * off; k4.y = p.y + oy * off; k4.speed = 0; g4.update(1 / 60); }
t('lifeOff時は無傷', k4.life === l4);

// --- コース外ダメージ OFF では芝生で減らない(衝突ダメージは生きる) ---
const g9 = new Game(mc); g9.onFinish = () => {};
g9.startRace({ mode: 'time', trackIndex: 2, players: 1, numKarts: 1, offcourseDamage: false });
g9.state = 'racing'; g9.countdown = 0;
const k9 = g9.humans[0]; const l9 = k9.life;
for (let f = 0; f < 30; f++) { k9.x = p.x + ox * off; k9.y = p.y + oy * off; k9.speed = 0; g9.update(1 / 60); }
t('コース外ダメージOFFは芝生で無傷', T.surfaceAt(p.x + ox * off, p.y + oy * off) === 'grass' && k9.life === l9);
k9.hurt(10, g9);
t('コース外OFFでも衝突ダメージは入る', k9.life < l9);

// --- VS 2人: 一人が爆発しても続行、両方爆発でゲームオーバー ---
const g5 = new Game(mc); let goFired = false; g5.onFinish = () => {}; g5.onGameOver = () => { goFired = true; };
g5.startRace({ mode: 'vs', trackIndex: 2, players: 2, numKarts: 4 });
g5.state = 'racing'; g5.countdown = 0;
const h1 = g5.humans[0], h2 = g5.humans[1];
h1.life = 2; h1.hurt(10, g5);
t('1人爆発でも続行(racingのまま)', h1._exploded && g5.state === 'racing');
h2.life = 2; h2.hurt(10, g5);
t('全員爆発でゲームオーバー', h2._exploded && g5.state === 'gameover');

// --- リタイヤCPUの引き継ぎ(次ステージで不在) ---
const g6 = new Game(mc); g6.onFinish = () => {};
g6.startRace({ mode: 'gp', trackIndex: 0, players: 1, numKarts: 6, retiredIds: [2, 4] });
const r2 = g6.karts.find(c => c.id === 2), r4 = g6.karts.find(c => c.id === 4);
t('引き継いだCPUは開始時リタイヤ', r2._retired && r4._retired);
t('引き継ぎ以外は通常', !g6.karts.find(c => c.id === 3)._retired);

// --- ダメージ倍率 ---
const g7 = new Game(mc); g7.onFinish = () => {};
g7.startRace({ mode: 'time', trackIndex: 2, players: 1, numKarts: 1, damageScale: 0.5 });
const k7 = g7.humans[0]; k7.life = 100; k7.hurt(10, g7);
t('ダメージ1/2(10→5)', Math.abs(k7.life - 95) < 0.001);
const g8 = new Game(mc); g8.onFinish = () => {};
g8.startRace({ mode: 'time', trackIndex: 2, players: 1, numKarts: 1, damageScale: 0 });
const k8 = g8.humans[0]; const l8 = k8.life; k8.hurt(50, g8);
t('ダメージなし(0倍)は無傷', k8.life === l8);

// --- プレイヤー/CPU 独立ダメージ(既定: プレイヤー1/2・CPU通常) ---
const gA = new Game(mc); gA.onFinish = () => {};
gA.startRace({ mode: 'vs', trackIndex: 2, players: 1, numKarts: 4, playerDamageScale: 0.5, cpuDamageScale: 1 });
const hpK = gA.humans[0], cpK = gA.karts.find(c => !c.isHuman);
hpK.life = 100; cpK.life = 100; hpK.invincTimer = 0; cpK.invincTimer = 0; hpK.hurtCd = 0; cpK.hurtCd = 0;
hpK.hurt(10, gA); cpK.hurt(10, gA);
t('プレイヤーは1/2倍(10→5)', Math.abs(hpK.life - 95) < 0.001);
t('CPUは通常(10→10)', Math.abs(cpK.life - 90) < 0.001);

// --- CPUダメージ ランダム(なし含む/除く) ---
const gR = new Game(mc); gR.onFinish = () => {};
gR.startRace({ mode: 'vs', trackIndex: 2, players: 1, numKarts: 6, cpuDamageRandom: 'excl' });
let exclZero = false, inclZero = false;
for (let i = 0; i < 300; i++) { if (gR._rollCpuDmg('excl') === 0) exclZero = true; if (gR._rollCpuDmg('incl') === 0) inclZero = true; }
t('ランダム(なし除く)は0倍を含まない', !exclZero);
t('ランダム(なし含む)は0倍を含みうる', inclZero);
// CPUごとに倍率が固定(同じCPUは再ロールしない)
const cpuR = gR.karts.find(c => !c.isHuman); cpuR.invincTimer = 0; cpuR.life = 100;
cpuR.hurt(0.001, gR); const s1 = cpuR._cpuDmgScale; cpuR.hurt(0.001, gR);
t('CPUごとのランダム倍率は固定', s1 != null && s1 === cpuR._cpuDmgScale);
// プレイヤーはCPUランダムの影響を受けない
const hpR = gR.humans[0]; hpR.invincTimer = 0; hpR.life = 100; hpR.hurt(10, gR);
t('プレイヤーはCPUランダムの影響なし(10→90)', Math.abs(hpR.life - 90) < 0.001);

// --- ランダムプール: 渡したプール(ハイパー解放時の追加倍率を含む)から選ぶ ---
const gP = new Game(mc); gP.onFinish = () => {};
gP.startRace({ mode: 'vs', trackIndex: 2, players: 1, numKarts: 4, cpuDamageRandom: 'excl', cpuDamagePool: [3, 2.5, 1 / 25, 1 / 30] });
const got = new Set(); for (let i = 0; i < 300; i++) got.add(gP._rollCpuDmg('excl'));
t('ランダムは渡されたプール(追加倍率)のみから選ぶ', [...got].every(v => [3, 2.5, 1 / 25, 1 / 30].includes(v)) && got.size >= 2);

// --- 突風(横風)ゾーン: 乗ると横へ流される(テンペスト/storm コース) ---
const gW = new Game(mc); gW.onFinish = () => {};
gW.startRace({ mode: 'time', trackIndex: 8, players: 1, numKarts: 1, lifeOn: false });
gW.state = 'racing'; gW.countdown = 0;
const kW = gW.humans[0], tileW = gW.track.tile;
kW.x = 140 * tileW; kW.y = 58 * tileW; kW.angle = -Math.PI / 2; kW.speed = 200;   // 右ストレートを上へ
gW._readHuman = (kk) => { kk.control = { throttle: 1, steer: 0, drift: false, item: false }; };
const wx0 = kW.x; for (let i = 0; i < 60; i++) gW.update(1 / 60);
t('突風ゾーンで横へ流される(無操作)', (kW.x - wx0) > tileW * 0.5);

// --- ワープゲート: 入口に触れると出口へ瞬間移動(warp コース) ---
const gWp = new Game(mc); gWp.onFinish = () => {};
gWp.startRace({ mode: 'time', trackIndex: 9, players: 1, numKarts: 1, lifeOn: false });
gWp.state = 'racing'; gWp.countdown = 0;
const kWp = gWp.humans[0], tileWp = gWp.track.tile, w0 = gWp.track.warps[0];
kWp.x = 92 * tileWp; kWp.y = 100 * tileWp; kWp.angle = Math.atan2(98 - 100, 88 - 92); kWp.speed = 200;
gWp._readHuman = (kk) => { kk.control = { throttle: 1, steer: 0, drift: false, item: false }; };
let warped = false;
for (let i = 0; i < 60; i++) { const px = kWp.x, py = kWp.y; gWp.update(1 / 60); if (Math.hypot(kWp.x - px, kWp.y - py) > 30 * tileWp) { warped = true; break; } }
t('ワープゲートで出口へ瞬間移動', warped && Math.hypot(kWp.x - w0.tx, kWp.y - w0.ty) < 6 * tileWp);

// --- ワープ・ネクサス(track10): 本線がワープ必須(空白=gap、ゲートで瞬間移動) ---
const gNx = new Game(mc); gNx.onFinish = () => {};
gNx.startRace({ mode: 'time', trackIndex: 10, players: 1, numKarts: 1, lifeOn: false });
gNx.state = 'racing'; gNx.countdown = 0;
const Tn = gNx.track, tn = Tn.tile, kn = gNx.humans[0];
t('ネクサス: ワープ入口が多数', Tn.warps.length >= 20);
t('ネクサス: ゲート先が空白(gap=ワープ必須)', Tn.surfaceAt(59 * tn, 131 * tn) === 'gap');
kn.x = 48 * tn; kn.y = 131 * tn; kn.angle = 0; kn.speed = 260;
gNx._readHuman = (kk) => { kk.control = { throttle: 1, steer: 0, drift: false, item: false }; };
let nWarp = false; for (let i = 0; i < 60; i++) { const px = kn.x; gNx.update(1 / 60); if (kn.x - px > 4 * tn) { nWarp = true; break; } }
t('ネクサス: ゲートでワープして空白を越える', nWarp && Tn.surfaceAt(kn.x, kn.y) !== 'gap');

console.log(fail ? `=== ${fail}件NG ===` : '=== ライフシステム すべてOK ==='); if (fail) Deno.exit(1);
