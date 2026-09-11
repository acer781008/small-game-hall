(()=>{
  const qs=new URLSearchParams(location.search),path=location.pathname,match=path.match(/\/games\/([^/]+)/),gameId=match?match[1]:'';
  function resolveActivity(){
    let a=qs.get('activity')||qs.get('room')||qs.get('code')||'';
    if(!a&&gameId==='bingo'){
      for(const store of [sessionStorage,localStorage]){try{const x=JSON.parse(store.getItem('bingoPlayer')||'null');if(x?.roomId){a=String(x.roomId);break}}catch{}}
    }
    return String(a||'');
  }
  let activity=resolveActivity();
  const labels={
    bingo:{C1:'5×5',C2:'6×6',C3:'7×7'},
    sudoku:{C1:'初級',C2:'中級',C3:'高級'},
    memory:{C1:'4×4',C2:'6×6',C3:'8×8'},
    shelf:{C1:'普通',C2:'困難',C3:'地獄'},
    lianliankan:{C1:'簡單',C2:'普通',C3:'困難'},
    puzzle:{C1:'4×4',C2:'5×5',C3:'6×6'}
  };
  let data=null,currentTier='',currentLabel='',visible=true,bar=null,modal=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tierLabel=t=>labels[gameId]?.[t]||t;
  function startAnchor(){
    const selectors={bingo:'#startRunBtn',sudoku:'#startRound',memory:'#startBtn',shelf:'#startBtn',lianliankan:'#startBtn',puzzle:'#startBtn'};
    const b=document.querySelector(selectors[gameId]||'#startBtn');
    if(!b)return null;
    return gameId==='bingo'?(b.closest('.run-actions')||b):b;
  }
  function ensure(){
    if(bar)return;
    bar=document.createElement('div');bar.className='c-prize-compact';bar.id='commonCPrizes';bar.style.display='none';
    bar.innerHTML='<div class="c-prize-current" id="cPrizeCurrent"></div><button type="button" class="c-prize-help" id="cPrizeHelp">🎁 獎品說明</button>';
    const anchor=startAnchor();
    if(anchor?.parentNode)anchor.parentNode.insertBefore(bar,anchor);else (document.querySelector('main,.app,.wrap,.page')||document.body).appendChild(bar);
    modal=document.createElement('div');modal.className='c-prize-modal hidden';modal.innerHTML='<div class="c-prize-dialog" role="dialog" aria-modal="true"><div class="c-prize-dialog-head"><b>🎁 獎品說明</b><button type="button" id="cPrizeClose" aria-label="關閉">✕</button></div><div id="cPrizeModalBody"></div></div>';
    document.body.appendChild(modal);
    bar.querySelector('#cPrizeHelp').onclick=()=>{paintModal();modal.classList.remove('hidden')};
    modal.querySelector('#cPrizeClose').onclick=()=>modal.classList.add('hidden');
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
  }
  function paintBar(){
    ensure();
    const on=String(data?.awardMode||'').toUpperCase()==='C'&&visible;
    bar.style.display=on?'grid':'none';
    if(!on)return;
    const t=currentTier||'C1',label=currentLabel||tierLabel(t);
    bar.querySelector('#cPrizeCurrent').innerHTML=`<span>目前</span><b>${esc(label)} → ${esc(t)}</b>`;
  }
  function paintModal(){
    ensure();const all=(Array.isArray(data?.cPrizes)?data.cPrizes:[]).filter(p=>String(p.gameId||'')===gameId);
    modal.querySelector('#cPrizeModalBody').innerHTML=['C1','C2','C3'].map(t=>{const rows=all.filter(p=>String(p.tier).toUpperCase()===t),total=rows.reduce((s,p)=>s+Math.max(0,Number(p.quantity)||0),0);return `<section class="c-prize-tier ${currentTier===t?'active':''}"><div class="c-prize-head"><span>${t}・${esc(tierLabel(t))}</span><small>共剩 ${total}</small></div>${rows.length?rows.map(p=>`<div class="c-prize-row ${Number(p.quantity)<=0?'soldout':''}"><span>${esc(p.name)}</span><b>${Number(p.quantity)>0?'剩 '+Number(p.quantity):'已領完'}</b></div>`).join(''):'<div class="c-prize-empty">尚未設定獎品</div>'}</section>`}).join('');
  }
  async function refresh(){
    if(!activity)activity=resolveActivity();
    if(!activity)return;
    try{const r=await fetch('/api/public/prizes?activity='+encodeURIComponent(activity),{cache:'no-store'}),d=await r.json();if(r.ok){data=d;paintBar();if(modal&&!modal.classList.contains('hidden'))paintModal()}}catch{}
  }
  window.setPrizeActivity=a=>{activity=String(a||'');refresh()};
  window.setPrizeTier=(t,label='')=>{currentTier=String(t||'').toUpperCase();currentLabel=String(label||'');paintBar()};
  window.setPrizeInfoVisible=v=>{visible=!!v;paintBar()};
  window.refreshCommonPrizes=refresh;
  const boot=()=>{refresh();let n=0;const id=setInterval(()=>{if(data||n++>=10)return clearInterval(id);activity=resolveActivity()||activity;refresh()},300)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
