// ダメージ倍率の解放条件テスト。
//  - hc(3倍/2.5倍/1/25/1/30) は通常ハイパー(=3)以上でのみ選べる。
//  - ただし「スーパーカオスでGP完走(scGpCleared)」済みなら、スーパー(=2)でも選べる。
//  main.js から実際の DMG_OPTS と dmgLocked 式を取り出して検証する(実装と乖離しないように)。
async function readText(p) {
  if (typeof Deno !== 'undefined') return await Deno.readTextFile(p);
  const fs = await import('node:fs/promises'); return fs.readFile(p, 'utf8');
}
const code = await readText('js/main.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  OK  ' : '  NG  ') + m); if (!c) fail++; };

// --- DMG_OPTS 配列リテラルを取り出す ---
const optsM = code.match(/const DMG_OPTS = (\[[\s\S]*?\]);/);
if (!optsM) { console.log('DMG_OPTS を抽出できませんでした'); Deno.exit(1); }
const DMG_OPTS = new Function('return ' + optsM[1] + ';')();

// --- dmgLocked のアロー式本体を取り出し、chaosLevel/scGpCleared を引数化して評価できる形にする ---
const lockM = code.match(/const dmgLocked = (\(o\) => [^;]+);/);
if (!lockM) { console.log('dmgLocked を抽出できませんでした'); Deno.exit(1); }
const makeLocked = new Function('chaosLevel', 'scGpCleared', 'return ' + lockM[1] + ';');
const lockedAt = (chaosLevel, scGpCleared) => {
  const f = makeLocked(chaosLevel, scGpCleared);
  // 実ゲームは if/while/filter の真偽値文脈で使う(falsy=選べる/truthy=ロック)。
  // 素の式は false のかわりに undefined を返す場合があるため、!! で真偽に正規化して検証する。
  return (label) => !!f(DMG_OPTS.find(o => o.label === label));
};

const HC = ['3倍', '2.5倍', '1/25', '1/30'];   // ハイパー相当の追加倍率
const SC = ['2倍', '1.5倍', '1/15', '1/20'];   // スーパー相当の倍率
const BASE = ['通常', '1/2', '1/3', '1/5', '1/10'];

console.log('\n[1] スーパー(2)・未達成(scGpCleared=false): hcはロック / scは選べる');
{
  const L = lockedAt(2, false);
  HC.forEach(l => ok(L(l) === true, `hc「${l}」はロック`));
  SC.forEach(l => ok(L(l) === false, `sc「${l}」は選べる`));
  BASE.forEach(l => ok(L(l) === false, `基本「${l}」は選べる`));
}

console.log('\n[2] スーパー(2)・達成済み(scGpCleared=true): hcも選べる（今回の要望の核心）');
{
  const L = lockedAt(2, true);
  HC.forEach(l => ok(L(l) === false, `hc「${l}」が解放されて選べる`));
  SC.forEach(l => ok(L(l) === false, `sc「${l}」も選べる`));
}

console.log('\n[3] カオス(1)・達成済みでも: hc/sc はまだ選べない（スーパー未満）');
{
  const L = lockedAt(1, true);
  HC.forEach(l => ok(L(l) === true, `hc「${l}」はロック(レベル<2)`));
  SC.forEach(l => ok(L(l) === true, `sc「${l}」はロック(レベル<2)`));
}

console.log('\n[4] ハイパー(3)・未達成でも: hcは従来どおり選べる（回帰チェック）');
{
  const L = lockedAt(3, false);
  HC.forEach(l => ok(L(l) === false, `hc「${l}」はハイパーで選べる`));
}

console.log('\n[5] OFF(0): hc/sc はすべてロック');
{
  const L = lockedAt(0, true);
  HC.concat(SC).forEach(l => ok(L(l) === true, `「${l}」はロック`));
  BASE.forEach(l => ok(L(l) === false, `基本「${l}」は常に選べる`));
}

// --- GP完走で保存する処理が実在するか(実装の存在チェック) ---
console.log('\n[6] スーパーカオスGP完走の解放・保存処理が実装されている');
ok(/chaosLevel === 2/.test(code) && /superchaos_gp_cleared/.test(code),
   'chaosLevel===2 で superchaos_gp_cleared を保存する分岐がある');
ok(/localStorage\.setItem\('superchaos_gp_cleared', '1'\)/.test(code),
   'localStorage に解放フラグを保存している');
ok(/getItem\('superchaos_gp_cleared'\)/.test(code),
   '起動時に解放フラグを読み込んでいる');

console.log(fail ? `\n=== NG (${fail}件) ===` : '\n=== ダメージ解放 すべてOK ===');
if (fail) Deno.exit(1);
