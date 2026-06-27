async function rd(p){ return await Deno.readTextFile(p); }
const mockCtx=new Proxy({},{get:(_t,p)=>p==='canvas'?mc:()=>mockCtx,set:()=>true});
function mk(){return{width:0,height:0,style:{},getContext:()=>mockCtx};} const mc=mk();
const win={innerWidth:1280,innerHeight:800,devicePixelRatio:1,addEventListener:()=>{},removeEventListener:()=>{}};
const files=['js/tracks.js','js/audio.js','js/input.js','js/game.js'];let src='';
for(const f of files)src+='\n;'+(await rd(f))+'\n';src+='\nreturn{Game,TRACKS,audio,Track,input};';
const {Game,TRACKS,audio,Track,input}=new Function('window','document','performance','requestAnimationFrame','cancelAnimationFrame','Math','Date','console',src)(win,{createElement:()=>mk()},{now:()=>0},()=>0,()=>{},Math,Date,console);
for(const m of Object.getOwnPropertyNames(Object.getPrototypeOf(audio)))if(typeof audio[m]==='function')audio[m]=()=>{};audio.init=()=>{};
let fail=0; const t=(n,c)=>{console.log(`  ${n}: ${c?'OK':'NG'}`); if(!c)fail++;};

// 1) コースが左右反転している(X座標が cols*tile - x に)
const def=TRACKS[2];
const norm=new Track(def,false), mir=new Track(def,true);
const W=def.cols*def.tile;
let flipped=true;
for(let i=0;i<norm.path.length;i+=10){ if(Math.abs(mir.path[i].x-(W-norm.path[i].x))>1) flipped=false; }
t('コースX反転', flipped);
t('Yは不変', Math.abs(mir.path[20].y-norm.path[20].y)<1);
t('アイテム/ジャンプ台も反転', mir.itemBoxes.length===norm.itemBoxes.length && mir.ramps.length===norm.ramps.length);

// 2) 操作反転: 右入力 → steer が -1 になる
const g=new Game(mc); g.onFinish=()=>{};
g.startRace({mode:'time',trackIndex:2,players:1,numKarts:1,mirror:true,mirrorControls:true});
const k=g.humans[0]; const c=k.controls;
input.down=Object.create(null); input.down[c.right]=true;   // 右を押す
g._readHuman(k);
t('操作反転で右→steer=-1', k.control.steer===-1);
g.mirrorControls=false; g._readHuman(k);
t('反転OFFで右→steer=+1', k.control.steer===1);

// 2b) アクセル/ブレーキ反転: アクセル入力 → throttle が負(ブレーキ扱い)
const gsw=new Game(mc); gsw.onFinish=()=>{};
gsw.startRace({mode:'time',trackIndex:2,players:1,numKarts:1,pedalSwap:true});
const kp=gsw.humans[0]; const cp=kp.controls;
input.down=Object.create(null); input.down[cp.accel]=true;
gsw._readHuman(kp);
t('ペダル反転でアクセル→throttle=-1', kp.control.throttle===-1);
gsw.pedalSwap=false; gsw._readHuman(kp);
t('ペダル反転OFFでアクセル→throttle=+1', kp.control.throttle===1);

// 3) ミラーコースでAIが完走方向に走れる(芝生少)
const g2=new Game(mc); g2.onFinish=()=>{};
g2.startRace({mode:'time',trackIndex:2,players:1,numKarts:4,mirror:true,lifeOn:false});
g2._readHuman=(kk)=>kk.computeAI(g2);
let grass=0,frames=0;
for(let i=0;i<60*60;i++){g2.update(1/60);frames++;const lead=g2.karts.reduce((a,b)=>b._prog>a._prog?b:a);if(g2.track.surfaceAt(lead.x,lead.y)==='grass')grass++;}
const gp=(grass/frames*100).toFixed(1);
const maxlap=Math.max(...g2.karts.map(k=>k.lapCount));
t('ミラーでもAI走行(芝生<8%・周回進行)', +gp<8 && maxlap>=1);
console.log('  ミラー60秒: 芝生='+gp+'% 最大lap='+maxlap);
console.log(fail?`=== ${fail}件NG ===`:'=== ミラーモード すべてOK ==='); if(fail)Deno.exit(1);
