const $=id=>document.getElementById(id);
const activity=new URLSearchParams(location.search).get('activity')||'';
const DIFF={
  easy:{label:'簡單',rows:5,cols:6,goal:5,max:9,minParts:2,maxParts:3,tier:'C1'},
  normal:{label:'普通',rows:6,cols:6,goal:8,max:15,minParts:2,maxParts:4,tier:'C2'},
  hard:{label:'困難',rows:7,cols:7,goal:10,max:20,minParts:3,maxParts:5,tier:'C3'}
};
const MODES={sum:{label:'湊數',icon:'🎯'},rush:{label:'連續挑戰',icon:'⚡'}};
let settings=null,run=null,playerName='',difficulty='easy',mode='sum',meta=DIFF.easy;
let board=[],selected=new Set(),target=0,successes=0,combo=0,running=false,locked=false;
let tickId=null,questionEndsAt=0;

function fmt(sec){sec=Math.max(0,Math.floor(sec));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function rand(n){return Math.floor(Math.random()*n)}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function diffTier(d){return settings?.tierByDifficulty?.[d]||DIFF[d]?.tier||'C1'}
function diffText(d){const m=DIFF[d]||DIFF.easy;return `${m.label}｜${m.rows}×${m.cols}｜完成 ${m.goal} 題`}
function modeText(m){const x=MODES[m]||MODES.sum;return `${x.icon} ${x.label}`}
function stateKey(){return run?`numberbattle:${activity}:${playerName.toLocaleLowerCase()}:${run.runId}`:''}
function saveState(){if(!run||!running)return;try{localStorage.setItem(stateKey(),JSON.stringify({board,successes,combo,target,questionEndsAt,difficulty,mode}))}catch{}}
function loadState(){if(!run)return null;try{return JSON.parse(localStorage.getItem(stateKey())||'null')}catch{return null}}
function clearState(){try{if(run)localStorage.removeItem(stateKey())}catch{}}
function prizeText(p){if(!p)return '';if(p.status==='awarded')return `🎁 恭喜獲得：${p.prizeName||'獎品'}`;if(p.status==='tier_out_of_stock')return '🎁 目前這個級別的獎品已兌換完畢';if(p.status==='game_out_of_stock')return '🎁 此遊戲獎品已兌換完畢';if(p.status==='out_of_stock')return '🎁 獎品已全數發放完畢';if(p.status==='limit_reached')return '🎁 已達可得獎次數上限';return p.status==='activity_closed'?'🏁 活動已結束，本局不再發獎':''}

async function api(url,opt){const r=await fetch(url,opt),d=await r.json();if(!r.ok)throw new Error(d.message||'操作失敗');return d}
function updatePrizeHint(){const d=$('playerDifficulty')?.value||settings?.difficulty||'easy';window.setPrizeTier?.(diffTier(d),DIFF[d]?.label||'難度')}
async function loadSettings(){
  try{
    const d=await api('/games/numberbattle/api/settings?activity='+encodeURIComponent(activity));settings=d.settings;
    const allowedD=(settings.allowedDifficulties||['easy','normal','hard']).filter(x=>DIFF[x]);
    const allowedM=(settings.allowedModes||['sum','rush']).filter(x=>MODES[x]);
    $('playerDifficulty').innerHTML=allowedD.map(x=>`<option value="${x}">${diffText(x)} → ${diffTier(x)}</option>`).join('');
    $('playerMode').innerHTML=allowedM.map(x=>`<option value="${x}">${modeText(x)}</option>`).join('');
    if(allowedD.includes(settings.difficulty))$('playerDifficulty').value=settings.difficulty;
    if(allowedM.includes(settings.mode))$('playerMode').value=settings.mode;
    $('choiceBox').classList.toggle('hidden',!settings.selfSelect);
    const fixed=settings.selfSelect?`可選玩法：${allowedM.map(x=>MODES[x].label).join('／')}｜可選難度：${allowedD.map(x=>DIFF[x].label).join('／')}`:`${modeText(settings.mode)}｜${diffText(settings.difficulty)}`;
    const qText=Number(settings.questionSeconds)>0?`每題 ${settings.questionSeconds} 秒`:'每題不限制';
    $('settingSummary').textContent=`${settings.selfSelect?'允許玩家自選':'主控指定'}｜${fixed}｜${qText}｜${Number(settings.timeMinutes)>0?'整局 '+settings.timeMinutes+' 分鐘':'整局不限時'}`;
    updatePrizeHint();
  }catch(e){$('settingSummary').textContent='讀取設定失敗：'+e.message}
}
$('playerDifficulty').addEventListener('change',updatePrizeHint);

function createBoard(){board=Array.from({length:meta.rows*meta.cols},()=>1+rand(meta.max));selected.clear();renderBoard()}
function renderBoard(){
  const el=$('board');el.style.setProperty('--cols',meta.cols);el.innerHTML='';
  board.forEach((v,i)=>{const b=document.createElement('button');b.type='button';b.className='num-cell'+(selected.has(i)?' selected':'');b.textContent=v;b.dataset.i=i;b.onclick=()=>tap(i);el.appendChild(b)});
}
function makeTarget(){
  const count=meta.minParts+rand(meta.maxParts-meta.minParts+1),ids=shuffle(Array.from({length:board.length},(_,i)=>i)).slice(0,count);
  target=ids.reduce((s,i)=>s+board[i],0);selected.clear();const qSec=Number(run.settings.questionSeconds)||0;questionEndsAt=qSec>0?Date.now()+qSec*1000:0;$('target').textContent=target;renderBoard();saveState();
}
function refreshSelected(){for(const i of selected)board[i]=1+rand(meta.max);selected.clear();renderBoard()}
function updateProgress(){$('progress').textContent=`${successes} / ${meta.goal}`;$('combo').textContent=`COMBO ×${combo}`}
function flashCells(ids){ids.forEach(i=>{const e=document.querySelector(`.num-cell[data-i="${i}"]`);if(e){e.classList.add('burst');setTimeout(()=>e.classList.remove('burst'),300)}})}

function tap(i){
  if(!running||locked)return;
  if(selected.has(i)){selected.delete(i);renderBoard();return}
  selected.add(i);renderBoard();
  const sum=[...selected].reduce((s,x)=>s+board[x],0);
  if(sum===target){
    locked=true;const ids=[...selected];successes++;combo++;updateProgress();$('message').textContent=combo>=2?`✅ 答對！${combo} COMBO！`:'✅ 答對！';flashCells(ids);
    const pause=mode==='rush'?90:330;
    setTimeout(async()=>{ids.forEach(x=>board[x]=1+rand(meta.max));selected.clear();renderBoard();if(successes>=meta.goal){await complete();return}makeTarget();$('message').textContent=mode==='rush'?'⚡ 下一題！':'下一題！快找出組合';locked=false},pause);
  }else if(sum>target){
    locked=true;combo=0;updateProgress();const ids=[...selected];$('message').textContent='💥 爆了！換新數字';flashCells(ids);
    setTimeout(()=>{refreshSelected();makeTarget();$('message').textContent=mode==='rush'?'⚡ 立刻接下一題！':'換一題，繼續！';locked=false},mode==='rush'?150:320);
  }
}

function tick(){
  if(!running||!run)return;
  const now=Date.now();
  if(run.endsAt){const left=Math.ceil((run.endsAt-now)/1000);$('timeLabel').textContent='剩餘時間';$('roundTime').textContent=fmt(left);if(left<=0){timeout();return}}else{$('timeLabel').textContent='遊戲時間';$('roundTime').textContent=fmt((now-run.startedAt)/1000)}
  const qSec=Number(run.settings.questionSeconds)||0;
  if(qSec<=0){$('questionTime').textContent='不限';$('questionTime').classList.remove('q-danger');}
  else{const q=Math.max(0,(questionEndsAt-now)/1000);$('questionTime').textContent=q.toFixed(1);$('questionTime').classList.toggle('q-danger',q<=2.5);if(q<=0&&!locked){locked=true;combo=0;updateProgress();$('message').textContent='⏰ 本題時間到！';setTimeout(()=>{makeTarget();locked=false;$('message').textContent=mode==='rush'?'⚡ 新目標！':'新目標出現！'},mode==='rush'?100:280)}}
}
function beginRun(d){
  run=d;difficulty=d.settings.difficulty;mode=d.settings.mode||'sum';meta=DIFF[difficulty]||DIFF.easy;playerName=$('playerName').value.trim();localStorage.setItem(`numberbattleName:${activity}`,playerName);
  $('modeBadge').textContent=modeText(mode);$('gameCard').classList.toggle('rush-mode',mode==='rush');
  window.setPrizeTier?.(d.tier,meta.label);window.setPrizeInfoVisible?.(false);$('entryCard').classList.add('hidden');$('gameCard').classList.remove('hidden');running=true;locked=false;successes=0;combo=0;
  const old=loadState();if(d.resumed&&old&&Array.isArray(old.board)&&old.board.length===meta.rows*meta.cols){board=old.board.map(Number);successes=Math.max(0,Number(old.successes)||0);combo=Math.max(0,Number(old.combo)||0);target=Math.max(0,Number(old.target)||0);const qSec=Number(d.settings.questionSeconds)||0;questionEndsAt=qSec>0?Math.max(Date.now()+500,Number(old.questionEndsAt)||0):0;selected.clear();renderBoard();$('target').textContent=target||0;if(!target)makeTarget()}else{createBoard();makeTarget()}
  updateProgress();clearInterval(tickId);tickId=setInterval(tick,100);tick();$('message').textContent=d.resumed?'已接回尚未完成的挑戰':(mode==='rush'?'⚡ 連續挑戰開始！':(Number(d.settings.questionSeconds)>0?'開始！在倒數內湊出目標':'開始！用心算湊出目標'));
  loadNumberBattleLeaderboard();
}
async function startGame(){
  const name=$('playerName').value.trim();if(!name){$('entryMsg').textContent='請先輸入玩家名稱';$('entryMsg').classList.remove('hidden');return}
  if(!settings)await loadSettings();const diff=settings.selfSelect?$('playerDifficulty').value:settings.difficulty;const chosenMode=settings.selfSelect?$('playerMode').value:settings.mode;
  $('startBtn').disabled=true;$('entryMsg').classList.add('hidden');
  try{const d=await api('/games/numberbattle/api/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activity,player:name,difficulty:diff,mode:chosenMode})});beginRun(d)}catch(e){$('entryMsg').textContent='❌ '+e.message;$('entryMsg').classList.remove('hidden')}finally{$('startBtn').disabled=false}
}
async function sendFinish(completed){return api('/games/numberbattle/api/finish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activity,player:playerName,runId:run.runId,completed,score:successes})})}
async function complete(){
  if(!running)return;running=false;locked=true;clearInterval(tickId);$('message').textContent='🎉 完成指定題數！';
  try{const d=await sendFinish(true);clearState();$('finishText').textContent=`答對 ${successes} 題｜使用時間：${fmt(d.elapsedMs/1000)}｜${modeText(mode)}｜${meta.label}`;$('finishPrize').textContent=prizeText(d.prize);loadNumberBattleLeaderboard();window.setPrizeInfoVisible?.(true);$('finishModal').classList.remove('hidden')}catch(e){$('message').textContent='回報失敗：'+e.message;running=true;locked=false;tickId=setInterval(tick,100)}
}
async function timeout(){if(!running)return;running=false;locked=true;clearInterval(tickId);$('roundTime').textContent='00:00';try{await sendFinish(false);clearState();loadNumberBattleLeaderboard()}catch{}window.setPrizeInfoVisible?.(true);$('timeoutModal').classList.remove('hidden')}
function hall(){location.href='/?activity='+encodeURIComponent(activity)}
function resetToEntry(){run=null;running=false;locked=false;clearInterval(tickId);$('timeoutModal').classList.add('hidden');$('gameCard').classList.add('hidden');$('entryCard').classList.remove('hidden');window.setPrizeInfoVisible?.(true);loadSettings()}
function scoreFmt(ms){return fmt((Number(ms)||0)/1000)}
function escHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadNumberBattleLeaderboard(){
  const box=$('numberBattleLeaderboard');if(!box||!activity)return;
  try{const d=await api('/games/numberbattle/api/leaderboard?activity='+encodeURIComponent(activity)+'&t='+Date.now()),rows=d.rows||[];box.innerHTML=`<h2>🏆 數字大亂鬥排行榜</h2><p class="hall-rank-note">答對題數多者優先；答對題數相同時，使用時間較短者在前。</p>${rows.length?`<table class="hall-rank-table"><thead><tr><th>排名</th><th>玩家</th><th>答對</th><th>使用時間</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.rank<=3?['🥇','🥈','🥉'][x.rank-1]:x.rank}</td><td>${escHtml(x.player)}</td><td class="hall-rank-best">${Number(x.bestScore)||0} 題</td><td>${scoreFmt(x.bestScoreElapsedMs)}</td></tr>`).join('')}</tbody></table>`:'<div class="hall-rank-empty">目前還沒有成績，第一名等你來 ✨</div>'}`;}catch(e){box.innerHTML='<h2>🏆 數字大亂鬥排行榜</h2><div class="hall-rank-empty">排行榜暫時讀取不到，稍後會自動更新。</div>'}
}
window.refreshHallLeaderboard=loadNumberBattleLeaderboard;
$('startBtn').onclick=startGame;$('clearBtn').onclick=()=>{if(!running||locked)return;selected.clear();renderBoard()};$('finishHall').onclick=hall;$('timeoutHall').onclick=hall;$('timeoutAgain').onclick=resetToEntry;
const saved=localStorage.getItem(`numberbattleName:${activity}`);if(saved)$('playerName').value=saved;loadSettings();loadNumberBattleLeaderboard();setInterval(loadNumberBattleLeaderboard,5000);
