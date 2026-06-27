// 構文チェック + コース(中心線方式)の整合性チェック
const files = ['js/tracks.js', 'js/audio.js', 'js/input.js', 'js/game.js', 'js/main.js'];
let fail = 0;
async function readText(p) {
  if (typeof Deno !== 'undefined') return await Deno.readTextFile(p);
  const fs = await import('node:fs/promises'); return fs.readFile(p, 'utf8');
}

for (const f of files) {
  const code = await readText(f);
  try { new Function(code); console.log('SYNTAX OK  ', f); }
  catch (e) { console.log('SYNTAX FAIL', f, '->', e.message); fail++; }
}

const tcode = await readText('js/tracks.js');
const TRACKS = new Function('window', 'module', tcode + ';return TRACKS;')({}, { exports: {} });

// Catmull-Rom 閉曲線展開(game.js と同じ式)
function buildPath(pts, seg) {
  const n = pts.length, out = [];
  const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < seg; s++) { const t = s / seg; out.push({ x: cr(p0.x, p1.x, p2.x, p3.x, t), y: cr(p0.y, p1.y, p2.y, p3.y, t) }); }
  }
  return out;
}
function distToPath(P, x, y) {
  let best = 1e18;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const abx = b.x - a.x, aby = b.y - a.y, L = abx * abx + aby * aby || 1;
    let t = ((x - a.x) * abx + (y - a.y) * aby) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = a.x + abx * t - x, dy = a.y + aby * t - y; best = Math.min(best, dx * dx + dy * dy);
  }
  return Math.sqrt(best);
}

for (const t of TRACKS) {
  const errs = [];
  const tile = t.tile, W = t.cols, H = t.rows;
  const wall = (t.roadHalf + t.shoulder);
  const pts = t.waypoints.map(([c, r]) => ({ x: c, y: r }));
  const P = buildPath(pts, 12);
  // コース(中心線±wall)が盤内に収まるか(スプラインのはみ出し込み)
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const p of P) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
  if (minx - wall < 0.3) errs.push(`左にはみ出し (minx=${minx.toFixed(1)}, wall=${wall})`);
  if (miny - wall < 0.3) errs.push(`上にはみ出し (miny=${miny.toFixed(1)})`);
  if (maxx + wall > W - 0.3) errs.push(`右にはみ出し (maxx=${maxx.toFixed(1)}, cols=${W})`);
  if (maxy + wall > H - 0.3) errs.push(`下にはみ出し (maxy=${maxy.toFixed(1)}, rows=${H})`);
  // 設置物が走路+路肩内か
  const onCourse = (arr, label) => (arr || []).forEach(([c, r], i) => {
    const d = distToPath(P, c, r);
    if (d > wall + 0.05) errs.push(`${label}[${i}](${c},${r}) がコース外 (d=${d.toFixed(2)} > ${wall})`);
  });
  onCourse(t.items, 'item'); onCourse(t.boosts, 'boost'); onCourse(t.hazards, 'hazard');

  // 周回長の目安
  let len = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; len += Math.hypot(b.x - a.x, b.y - a.y); }
  console.log(`\n[${t.id}] ${W}x${H} 道幅=${(t.roadHalf * 2).toFixed(1)}tile 路肩=${t.shoulder}tile 周長≈${(len * tile).toFixed(0)}px (≈${(len * tile / 460).toFixed(1)}s/lap@460) laps=${t.laps}`);
  if (errs.length) { errs.forEach((e) => console.log('   NG:', e)); fail++; }
  else console.log('   OK: コース・設置物の整合');
}
console.log('\n=== ' + (fail ? `${fail}件の問題` : 'すべてOK') + ' ===');
if (fail && typeof Deno !== 'undefined') Deno.exit(1);
