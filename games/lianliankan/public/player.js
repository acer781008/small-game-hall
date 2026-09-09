const $ = id => document.getElementById(id);

const files = {
  fruit:['01_蘋果.png','02_香蕉.png','03_柳橙.png','04_草莓.png','05_葡萄.png','06_西瓜.png','07_鳳梨.png','08_櫻桃.png','09_水蜜桃.png','10_奇異果.png','11_檸檬.png','12_藍莓.png'],
  pet:['13_貓咪.png','14_狗狗.png','15_兔子.png','16_熊熊.png','17_熊貓.png','18_狐狸.png','19_小豬.png','20_小雞.png','21_企鵝.png','22_青蛙.png','23_無尾熊.png','24_綿羊.png'],
  dessert:['25_杯子蛋糕.png','26_甜甜圈.png','27_草莓蛋糕.png','28_餅乾.png','29_馬卡龍.png','30_巧克力杯子.png','31_冰淇淋.png','32_布丁.png','33_鬆餅.png','34_瑞士捲.png','35_愛心餅乾.png','36_鬆餅格.png']
};
files.all=[...files.fruit,...files.pet,...files.dessert];

const DIFFICULTY={
  easy:{rows:4,cols:6,copies:2,label:'簡單 4×6・24 格'},
  normal:{rows:6,cols:8,copies:4,label:'普通 6×8・48 格'},
  hard:{rows:8,cols:9,copies:6,label:'困難 8×9・72 格'}
};

const activity=new URLSearchParams(location.search).get('activity')||'';let settings=null,runId=null;
let playerName='';
let rows=4,cols=6,grid=[],selected=null,totalTiles=0,matchedTiles=0;
let shuffleRemain=0,initialShuffleLimit=0,running=false,locked=false;
let timerId=null,startedAt=null,deadline=null;

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function fmt(sec){
  sec=Math.max(0,Math.floor(sec));
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function themeName(v){return {fruit:'水果',pet:'寵物',dessert:'甜點',mixed:'混合'}[v]||v}
async function loadSettings(){
  const r=await fetch('/games/lianliankan/api/settings',{cache:'no-store'});const data=await r.json();settings=data.settings;const t=Number(settings.timeMinutes)>0?`${settings.timeMinutes} 分鐘`:'不限時間';$('settingSummary').textContent=`${themeName(settings.theme)}系列｜${DIFFICULTY[settings.difficulty].label}｜手動洗牌 ${settings.shuffleLimit} 次｜${t}`;
}
function showEntry(text,ok=false){
  $('entryMsg').textContent=text;
  $('entryMsg').classList.remove('hidden');
  $('entryMsg').style.background=ok?'#e8f8ef':'#ffe9ed';
  $('entryMsg').style.color=ok?'#2a744b':'#a84255';
}
async function startGame(){
  await loadSettings();
  playerName=$('playerName').value.trim();if(!playerName){showEntry('請先輸入玩家名稱');return}localStorage.setItem(`llkName:${activity}`,playerName);let auth;try{const rr=await fetch('/games/lianliankan/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activity,player:playerName})}),dd=await rr.json();if(!rr.ok)throw new Error(dd.message||'無法開始');auth=dd;settings=auth.settings||settings;runId=auth.runId}catch(e){showEntry(e.message);return}

  $('entryCard').classList.add('hidden');
  $('gameCard').classList.remove('hidden');
  $('finishModal').classList.add('hidden');
  $('timeoutModal').classList.add('hidden');

  const cfg=DIFFICULTY[settings.difficulty];
  rows=cfg.rows; cols=cfg.cols;
  $('board').style.setProperty('--cols',cols);

  let icons=settings.theme==='mixed'?shuffle(files.all).slice(0,12):[...files[settings.theme]];
  let tiles=[];
  icons.forEach((file,id)=>{for(let n=0;n<cfg.copies;n++)tiles.push({id,file})});
  tiles=shuffle(tiles);

  totalTiles=tiles.length; matchedTiles=0; selected=null; locked=false; running=true;
  shuffleRemain=settings.shuffleLimit; initialShuffleLimit=settings.shuffleLimit;
  grid=Array.from({length:rows},()=>Array(cols).fill(null));
  let k=0;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)grid[r][c]=tiles[k++];
  if(auth.resumed){const saved=loadState(runId);if(saved&&saved.rows===rows&&saved.cols===cols){grid=saved.grid;matchedTiles=saved.matchedTiles||0;shuffleRemain=saved.shuffleRemain;initialShuffleLimit=saved.initialShuffleLimit??settings.shuffleLimit}}

  $('remain').textContent=totalTiles;
  updateShuffleUI();
  render();
  $('message').textContent='開始囉！找找看哪些相同圖案可以連起來 ✨';

  startedAt=Number(auth.startedAt)||Date.now();
  if(auth.endsAt){
    $('timeLabel').textContent='剩餘時間';deadline=Number(auth.endsAt);$('time').textContent=fmt((deadline-Date.now())/1000);
  }else{
    $('timeLabel').textContent='遊戲時間';
    deadline=null;
    $('time').textContent='00:00';
  }
  clearInterval(timerId);
  timerId=setInterval(updateTimer,200);
  saveState();ensureMove();
}
function updateTimer(){
  if(!running)return;
  if(deadline){
    const sec=Math.ceil((deadline-Date.now())/1000);
    $('time').textContent=fmt(sec);
    if(sec<=0) timeout();
  }else{
    $('time').textContent=fmt((Date.now()-startedAt)/1000);
  }
}
function updateShuffleUI(){
  $('shuffleRemain').textContent=shuffleRemain;
  $('shuffleBtn').textContent=`🔀 洗牌（剩 ${shuffleRemain} 次）`;
  $('shuffleBtn').disabled=!running||shuffleRemain<=0;
}
function render(){
  const board=$('board');
  board.innerHTML='';
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const tile=grid[r][c];
      const b=document.createElement('button');
      b.className='tile'; b.dataset.r=r;b.dataset.c=c;
      if(!tile)b.classList.add('empty');
      else{
        const img=document.createElement('img');
        img.src='/games/lianliankan/assets/'+encodeURIComponent(tile.file);
        b.appendChild(img);
        b.addEventListener('click',()=>clickTile(r,c,b));
      }
      board.appendChild(b);
    }
  }
}
function tileButton(r,c){return document.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`)}
function nope(a,b){
  a?.classList.add('nope');b?.classList.add('nope');
  setTimeout(()=>{a?.classList.remove('nope');b?.classList.remove('nope')},250);
}
function clickTile(r,c,btn){
  if(!running||locked||!grid[r][c])return;
  if(!selected){selected={r,c,btn};btn.classList.add('selected');return}
  if(selected.r===r&&selected.c===c){btn.classList.remove('selected');selected=null;return}

  const a=grid[selected.r][selected.c],b=grid[r][c];
  if(a.id!==b.id){
    nope(selected.btn,btn);selected.btn.classList.remove('selected');selected=null;
    $('message').textContent='圖案不一樣，再找找看～';return;
  }
  const path=findPath(selected.r,selected.c,r,c);
  if(!path){
    nope(selected.btn,btn);selected.btn.classList.remove('selected');selected=null;
    $('message').textContent='這一對現在被擋住了，換一組試試看！';return;
  }
  locked=true;btn.classList.add('selected');drawPath(path);$('message').textContent='配對成功！✨';
  const first=selected;
  setTimeout(()=>{
    grid[first.r][first.c]=null;grid[r][c]=null;
    first.btn.classList.add('matched');btn.classList.add('matched');
    first.btn.classList.remove('selected');btn.classList.remove('selected');
    matchedTiles+=2;$('remain').textContent=totalTiles-matchedTiles;saveState();
    selected=null;hideLine();locked=false;
    if(matchedTiles>=totalTiles) complete();
    else setTimeout(ensureMove,40);
  },260);
}
function findPath(sr,sc,tr,tc){
  const R=rows+2,C=cols+2;
  const blocked=Array.from({length:R},()=>Array(C).fill(false));
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(grid[r][c])blocked[r+1][c+1]=true;
  const s=[sr+1,sc+1],t=[tr+1,tc+1];blocked[s[0]][s[1]]=false;blocked[t[0]][t[1]]=false;
  const dirs=[[-1,0],[0,1],[1,0],[0,-1]];
  const best=Array.from({length:R},()=>Array.from({length:C},()=>Array(4).fill(99)));
  const q=[];let head=0;
  for(let d=0;d<4;d++){
    const nr=s[0]+dirs[d][0],nc=s[1]+dirs[d][1];
    if(nr<0||nr>=R||nc<0||nc>=C)continue;
    if(blocked[nr][nc]&&!(nr===t[0]&&nc===t[1]))continue;
    best[nr][nc][d]=0;q.push({r:nr,c:nc,d,turns:0,path:[s,[nr,nc]]});
  }
  while(head<q.length){
    const cur=q[head++];
    if(cur.r===t[0]&&cur.c===t[1])return simplify(cur.path).map(([r,c])=>[r-1,c-1]);
    for(let nd=0;nd<4;nd++){
      const turns=cur.turns+(nd===cur.d?0:1);
      if(turns>2)continue;
      const nr=cur.r+dirs[nd][0],nc=cur.c+dirs[nd][1];
      if(nr<0||nr>=R||nc<0||nc>=C)continue;
      if(blocked[nr][nc]&&!(nr===t[0]&&nc===t[1]))continue;
      if(best[nr][nc][nd]<=turns)continue;
      best[nr][nc][nd]=turns;q.push({r:nr,c:nc,d:nd,turns,path:[...cur.path,[nr,nc]]});
    }
  }
  return null;
}
function simplify(path){
  if(path.length<=2)return path;
  const out=[path[0]];let prev=null;
  for(let i=1;i<path.length;i++){
    const dir=(path[i][0]-path[i-1][0])!==0?'v':'h';
    if(prev&&dir!==prev)out.push(path[i-1]);prev=dir;
  }
  out.push(path[path.length-1]);return out;
}
function pointFor(r,c){
  const wrap=$('boardWrap'),wr=wrap.getBoundingClientRect();
  if(r>=0&&r<rows&&c>=0&&c<cols){
    const rect=tileButton(r,c).getBoundingClientRect();
    return {x:rect.left-wr.left+rect.width/2+wrap.scrollLeft,y:rect.top-wr.top+rect.height/2+wrap.scrollTop};
  }
  const first=tileButton(0,0).getBoundingClientRect();
  const secondC=cols>1?tileButton(0,1).getBoundingClientRect():first;
  const secondR=rows>1?tileButton(1,0).getBoundingClientRect():first;
  const stepX=secondC.left-first.left||first.width+7,stepY=secondR.top-first.top||first.height+7;
  const x0=first.left-wr.left+first.width/2+wrap.scrollLeft,y0=first.top-wr.top+first.height/2+wrap.scrollTop;
  return {x:x0+c*stepX,y:y0+r*stepY};
}
function drawPath(path){
  const wrap=$('boardWrap'),svg=$('lineLayer');
  const w=wrap.scrollWidth,h=wrap.scrollHeight;
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.style.width=w+'px';svg.style.height=h+'px';
  const pts=path.map(([r,c])=>pointFor(r,c));
  const pl=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  pl.setAttribute('class','link-line');pl.setAttribute('points',pts.map(p=>`${p.x},${p.y}`).join(' '));
  svg.innerHTML='';svg.appendChild(pl);
}
function hideLine(){$('lineLayer').innerHTML=''}
function remaining(){
  const arr=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(grid[r][c])arr.push({r,c,t:grid[r][c]});
  return arr;
}
function hasMove(){
  const groups=new Map();
  remaining().forEach(x=>{if(!groups.has(x.t.id))groups.set(x.t.id,[]);groups.get(x.t.id).push(x)});
  for(const g of groups.values())for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)if(findPath(g[i].r,g[i].c,g[j].r,g[j].c))return true;
  return false;
}
function reshuffle(){
  const pos=[],tiles=[];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(grid[r][c]){pos.push([r,c]);tiles.push(grid[r][c])}
  const mix=shuffle(tiles);pos.forEach(([r,c],i)=>grid[r][c]=mix[i]);selected=null;hideLine();render();saveState();
}
function manualShuffle(){
  if(!running||locked||shuffleRemain<=0)return;
  shuffleRemain--;reshuffle();let tries=0;
  while(!hasMove()&&tries<100){reshuffle();tries++}
  updateShuffleUI();
  $('message').textContent=shuffleRemain>0?`已洗牌，還可以手動洗 ${shuffleRemain} 次 🔀`:'手動洗牌次數已用完；真正無解時系統仍會自動洗牌。';
}
function ensureMove(){
  if(!running||matchedTiles>=totalTiles||hasMove())return;
  locked=true;$('message').textContent='目前沒有任何可連組合，系統自動洗牌中… 🔀';
  setTimeout(()=>{
    let tries=0;do{reshuffle();tries++}while(!hasMove()&&tries<150);
    locked=false;$('message').textContent='已自動洗牌！這次不扣玩家洗牌次數 ✅';
  },260);
}
async function sendFinish(completed){const r=await fetch('/games/lianliankan/api/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activity,player:playerName,runId,completed})});const d=await r.json();if(!r.ok)throw new Error(d.message||'結果回報失敗');return d}
async function complete(){
  running=false;locked=true;clearInterval(timerId);updateShuffleUI();
  const elapsed=Math.floor((Date.now()-startedAt)/1000);if(!deadline)$('time').textContent=fmt(elapsed);
  $('message').textContent='全部消除完成！🎉';
  try{const result=await sendFinish(true);clearState();$('finishText').textContent=`實際完成時間：${fmt(result.elapsedMs/1000)}`;$('finishPrize').textContent=prizeText(result.prize);window.refreshHallLeaderboard?.();setTimeout(()=>$('finishModal').classList.remove('hidden'),160)}catch(e){showEntry(e.message)}
}
async function timeout(){
  if(!running)return;
  running=false;locked=true;clearInterval(timerId);$('time').textContent='00:00';updateShuffleUI();
  $('message').textContent='時間到！這局還沒完成。';
  try{await sendFinish(false);clearState()}catch{}$('timeoutModal').classList.remove('hidden');
}
function backToEntry(){
  running=false;locked=false;clearInterval(timerId);hideLine();
  $('finishModal').classList.add('hidden');$('timeoutModal').classList.add('hidden');
  $('gameCard').classList.add('hidden');$('entryCard').classList.remove('hidden');
  loadSettings();
}

function stateKey(id=runId){return `llkRun:${activity}:${playerName.toLowerCase()}:${id||''}`}
function saveState(){if(!runId||!running)return;try{localStorage.setItem(stateKey(),JSON.stringify({runId,rows,cols,grid,matchedTiles,shuffleRemain,initialShuffleLimit}))}catch{}}
function loadState(id){try{return JSON.parse(localStorage.getItem(stateKey(id))||'null')}catch{return null}}
function clearState(){try{localStorage.removeItem(stateKey())}catch{}}
function prizeText(p){if(!p)return '';if(p.status==='awarded')return `🎁 恭喜獲得：${p.prizeName||'獎品'}`;if(p.status==='game_out_of_stock')return '🎁 此遊戲獎品已兌換完畢';if(p.status==='out_of_stock')return '🎁 獎品已全數發放完畢';if(p.status==='limit_reached')return '🎁 已達可得獎次數上限';return p.status==='activity_closed'?'🏁 活動已結束，本局不再發獎':''}
function hall(){location.href='/?activity='+encodeURIComponent(activity)}
$('startBtn').addEventListener('click',startGame);
$('shuffleBtn').addEventListener('click',manualShuffle);
$('finishHall').addEventListener('click',hall);$('timeoutHall').addEventListener('click',hall);$('timeoutAgain').addEventListener('click',()=>{runId=null;$('timeoutModal').classList.add('hidden');$('gameCard').classList.add('hidden');$('entryCard').classList.remove('hidden');startGame()});
window.addEventListener('resize',hideLine);
const savedName=localStorage.getItem(`llkName:${activity}`);if(savedName)$('playerName').value=savedName;loadSettings();
