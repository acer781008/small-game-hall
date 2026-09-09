(()=>{
  const box=document.getElementById('hallLeaderboard');if(!box)return;
  const gameId=box.dataset.game||'';
  const params=new URLSearchParams(location.search);const activity=params.get('activity')||params.get('room')||'';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=ms=>{ms=Math.max(0,Number(ms)||0);const sec=Math.floor(ms/1000),m=Math.floor(sec/60),s=sec%60,cs=Math.floor(ms%1000/10);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`};
  async function load(){
    if(!gameId||!activity)return;
    try{const r=await fetch(`/api/public/leaderboard/${encodeURIComponent(gameId)}?activity=${encodeURIComponent(activity)}&t=${Date.now()}`,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.message||'讀取失敗');const rows=d.rows||[];box.innerHTML=`<h2>🏆 完成排行榜</h2><p class="hall-rank-note">依最快完成時間排序；只有成功完成才會上榜。</p>${rows.length?`<table class="hall-rank-table"><thead><tr><th>排名</th><th>玩家</th><th>最快完成</th><th>完成次數</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.rank<=3?['🥇','🥈','🥉'][x.rank-1]:x.rank}</td><td>${esc(x.player)}</td><td class="hall-rank-best">${fmt(x.bestElapsedMs)}</td><td>${x.completions} 次</td></tr>`).join('')}</tbody></table>`:'<div class="hall-rank-empty">目前還沒有玩家完成，第一名等你來 ✨</div>'}`;
    }catch(e){box.innerHTML='<h2>🏆 完成排行榜</h2><div class="hall-rank-empty">排行榜暫時讀取不到，稍後會自動更新。</div>'}
  }
  window.refreshHallLeaderboard=load;load();setInterval(load,5000);
})();
