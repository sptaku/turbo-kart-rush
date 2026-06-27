// Web Audio をモックし、ピコピコ/オーケストラ両スタイルで発音が例外なく走るか検証
async function rd(p){ return await Deno.readTextFile(p); }
function param(){ return {value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}}; }
let oscCount=0, convCount=0, srcCount=0;
function node(extra={}){ const n=Object.assign({connect:(d)=>d||n, disconnect(){}, gain:param(), frequency:param(), detune:param()}, extra); return n; }
class MockCtx{
  constructor(){ this.currentTime=0; this.sampleRate=44100; this.state='running'; this.destination=node(); }
  createGain(){ return node(); }
  createOscillator(){ oscCount++; return node({type:'sine',start(){},stop(){}}); }
  createBiquadFilter(){ return node({type:'lowpass'}); }
  createConvolver(){ convCount++; return node({buffer:null}); }
  createBufferSource(){ srcCount++; return node({buffer:null,start(){},stop(){}}); }
  createDynamicsCompressor(){ return node({threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}); }
  createBuffer(ch,len){ const d=Array.from({length:ch},()=>new Float32Array(len)); return {numberOfChannels:ch,length:len,getChannelData:(i)=>d[i]}; }
  resume(){}
}
const win={ AudioContext:MockCtx, webkitAudioContext:MockCtx, addEventListener(){}, removeEventListener(){} };
let src=await rd('js/audio.js'); src+='\nreturn { audio, SONGS };';
const { audio, SONGS }=new Function('window','Math','console',src)(win,Math,console);
let fail=0; const t=(n,c)=>{ console.log(`  ${n}: ${c?'OK':'NG'}`); if(!c)fail++; };

audio.init();
t('リバーブ生成(convolver+IR)', !!(audio.reverb && audio.reverb.buffer && convCount===1));

// 2変種が別物(スタイル・テンポ・メロディが異なる)
t('chip/orch 別アレンジ', SONGS.race1.chip.style==='chip' && SONGS.race1.orch.style==='orch');
t('テンポが異なる(orchはゆったり)', SONGS.race1.orch.bpm < SONGS.race1.chip.bpm);
const chipLead=SONGS.race1.chip.voices.find(v=>v.role==='lead').fn;
const orchLead=SONGS.race1.orch.voices.find(v=>v.role==='lead').fn;
let diff=0; for(let i=0;i<32;i++){ if(JSON.stringify(chipLead(i))!==JSON.stringify(orchLead(i)))diff++; }
t('メロディが異なる', diff>10);

function play(songName, styleKey){
  audio.song=SONGS[songName][styleKey]; oscCount=0;
  for(let i=0;i<audio.song.steps;i++) audio._playStep(i, 1+i*0.1);
  return oscCount;
}
let chip=0,orch=0;
try{ chip=play('race1','chip'); } catch(e){ console.log('chip throw',e.message); }
try{ orch=play('race1','orch'); } catch(e){ console.log('orch throw',e.message); }
t('ピコピコ発音あり', chip>0);
t('オーケストラ発音あり', orch>0);
// star も両スタイルでクラッシュしない
let ok2=true; try{ play('star','chip'); play('star','orch'); }catch(e){ ok2=false; console.log('star throw',e.message); }
t('スター曲も両スタイルOK', ok2);
// playMusic/setMusicStyle が変種を選ぶ
audio.setMusicStyle('orchestra'); audio.playMusic('race2');
t('orchestra選択でorch曲', audio.song===SONGS.race2.orch);
audio.setMusicStyle('chip');
t('chip選択でchip曲(再生中も即差替)', audio.song===SONGS.race2.chip);
audio.setMusicStyle('xxx'); t('不正値はchipに', audio.musicStyle==='chip');
audio.stopMusic();   // setInterval を止める(プロセスが終了するように)
console.log(fail?`=== ${fail}件NG ===`:'=== 音楽スタイル すべてOK ===');
if(typeof Deno!=='undefined') Deno.exit(fail?1:0);
