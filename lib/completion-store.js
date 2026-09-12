module.exports = async function createCompletionStore({adapter,file,getCurrentActivityCode}){
  const rootDefaults={activities:{}};
  let data=await adapter.load('completions',file,rootDefaults);
  data=data&&typeof data==='object'?data:{activities:{}};
  data.activities=data.activities&&typeof data.activities==='object'?data.activities:{};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function code(c){return String(c||getCurrentActivityCode?.()||'').trim()}
  function keyOf(playerKey,playerName){return String(playerKey||playerName||'').trim().toLocaleLowerCase()}
  function bucket(root,c){
    c=code(c);root.activities=root.activities&&typeof root.activities==='object'?root.activities:{};
    if(!root.activities[c])root.activities[c]={games:{}};
    const b=root.activities[c];b.games=b.games&&typeof b.games==='object'?b.games:{};return b;
  }
  function gameBucket(root,c,gid,gname=''){
    const b=bucket(root,c);gid=String(gid||'').trim();
    if(!b.games[gid])b.games[gid]={name:String(gname||gid||'遊戲'),players:{},seen:{},scoreSeen:{}};
    const g=b.games[gid];g.name=String(gname||g.name||gid||'遊戲');g.players=g.players&&typeof g.players==='object'?g.players:{};g.seen=g.seen&&typeof g.seen==='object'?g.seen:{};g.scoreSeen=g.scoreSeen&&typeof g.scoreSeen==='object'?g.scoreSeen:{};return g;
  }
  function playerStats(c,gid,playerName,playerKey){
    const g=bucket(data,c).games[String(gid||'').trim()];if(!g)return {completions:0,bestElapsedMs:0,lastCompletedAt:0};
    const p=g.players?.[keyOf(playerKey,playerName)];if(!p)return {completions:0,bestElapsedMs:0,lastCompletedAt:0};
    return {completions:Math.max(0,Number(p.completions)||0),bestElapsedMs:Math.max(0,Number(p.bestElapsedMs)||0),lastCompletedAt:Math.max(0,Number(p.lastCompletedAt)||0)};
  }
  function leaderboard(c,gid,limit=100){
    const g=bucket(data,c).games[String(gid||'').trim()];
    if(!g)return {activityCode:code(c),gameId:String(gid||''),game:'',rows:[]};
    const rows=Object.values(g.players||{}).map(p=>({player:String(p.name||'玩家'),completions:Math.max(0,Number(p.completions)||0),bestElapsedMs:Math.max(0,Number(p.bestElapsedMs)||0),lastCompletedAt:Math.max(0,Number(p.lastCompletedAt)||0)})).filter(x=>x.completions>0).sort((a,b)=>(a.bestElapsedMs-b.bestElapsedMs)||(b.completions-a.completions)||(a.lastCompletedAt-b.lastCompletedAt)||a.player.localeCompare(b.player,'zh-Hant')).slice(0,Math.max(1,Math.min(500,Number(limit)||100))).map((x,i)=>({rank:i+1,...x}));
    return {activityCode:code(c),gameId:String(gid||''),game:String(g.name||gid||''),rows};
  }
  function scoreLeaderboard(c,gid,limit=100){
    const g=bucket(data,c).games[String(gid||'').trim()];
    if(!g)return {activityCode:code(c),gameId:String(gid||''),game:'',rows:[]};
    const rows=Object.values(g.players||{}).map(p=>({player:String(p.name||'玩家'),bestScore:Math.max(0,Math.floor(Number(p.bestScore)||0)),bestScoreElapsedMs:Math.max(0,Number(p.bestScoreElapsedMs)||0),lastScoreAt:Math.max(0,Number(p.lastScoreAt)||0)})).filter(x=>x.bestScore>0).sort((a,b)=>(b.bestScore-a.bestScore)||(a.bestScoreElapsedMs-b.bestScoreElapsedMs)||(a.lastScoreAt-b.lastScoreAt)||a.player.localeCompare(b.player,'zh-Hant')).slice(0,Math.max(1,Math.min(500,Number(limit)||100))).map((x,i)=>({rank:i+1,...x}));
    return {activityCode:code(c),gameId:String(gid||''),game:String(g.name||gid||''),rows};
  }
  async function recordScore({activityCode,gameId,gameName,playerName,playerKey,score,elapsedMs,playedAt=Date.now(),runKey=''}){
    const cc=code(activityCode),gid=String(gameId||'').trim(),name=String(playerName||'玩家').trim().slice(0,40)||'玩家',pk=keyOf(playerKey,name),points=Math.max(0,Math.floor(Number(score)||0)),elapsed=Math.max(0,Math.round(Number(elapsedMs)||0)),doneAt=Math.max(0,Number(playedAt)||Date.now()),rk=String(runKey||'').slice(0,160);
    if(!cc||!gid||!pk)throw new Error('成績紀錄資料不完整');
    const tx=await adapter.transact('completions',file,rootDefaults,root=>{
      const g=gameBucket(root,cc,gid,gameName);
      if(rk&&g.scoreSeen[rk]){const p=g.players[pk];return {duplicate:true,activityCode:cc,gameId:gid,game:g.name,player:name,bestScore:Number(p?.bestScore)||0,bestScoreElapsedMs:Number(p?.bestScoreElapsedMs)||0};}
      const p=g.players[pk]||{name,completions:0,bestElapsedMs:0,lastCompletedAt:0};p.name=name;
      const oldScore=Math.max(0,Math.floor(Number(p.bestScore)||0)),oldTime=Math.max(0,Number(p.bestScoreElapsedMs)||0);
      if(points>oldScore||(points===oldScore&&points>0&&(!oldTime||elapsed<oldTime))){p.bestScore=points;p.bestScoreElapsedMs=elapsed;}
      p.lastScore=points;p.lastScoreElapsedMs=elapsed;p.lastScoreAt=doneAt;g.players[pk]=p;
      if(rk){g.scoreSeen[rk]=doneAt;const keys=Object.keys(g.scoreSeen);if(keys.length>10000)for(const k of keys.slice(0,keys.length-8000))delete g.scoreSeen[k];}
      return {duplicate:false,activityCode:cc,gameId:gid,game:g.name,player:name,bestScore:Number(p.bestScore)||0,bestScoreElapsedMs:Number(p.bestScoreElapsedMs)||0,lastScore:points,lastScoreElapsedMs:elapsed,lastScoreAt:doneAt};
    });data=tx.data;return clone(tx.result);
  }
  function allPlayerStats(c){
    const b=bucket(data,c),out=[];
    for(const [gameId,g] of Object.entries(b.games||{}))for(const [playerKey,p] of Object.entries(g.players||{}))out.push({gameId,game:String(g.name||gameId),playerKey,player:String(p.name||'玩家'),completions:Math.max(0,Number(p.completions)||0),bestElapsedMs:Math.max(0,Number(p.bestElapsedMs)||0),lastCompletedAt:Math.max(0,Number(p.lastCompletedAt)||0)});
    return out;
  }
  async function record({activityCode,gameId,gameName,playerName,playerKey,elapsedMs,completedAt=Date.now(),runKey=''}){
    const cc=code(activityCode),gid=String(gameId||'').trim(),name=String(playerName||'玩家').trim().slice(0,40)||'玩家',pk=keyOf(playerKey,name),elapsed=Math.max(0,Math.round(Number(elapsedMs)||0)),doneAt=Math.max(0,Number(completedAt)||Date.now()),rk=String(runKey||'').slice(0,160);
    if(!cc||!gid||!pk)throw new Error('完成紀錄資料不完整');
    const tx=await adapter.transact('completions',file,rootDefaults,root=>{
      const g=gameBucket(root,cc,gid,gameName);
      if(rk&&g.seen[rk]){const p=g.players[pk];return {duplicate:true,activityCode:cc,gameId:gid,game:g.name,player:name,completions:Number(p?.completions)||0,bestElapsedMs:Number(p?.bestElapsedMs)||0,lastCompletedAt:Number(p?.lastCompletedAt)||0};}
      const p=g.players[pk]||{name,completions:0,bestElapsedMs:0,lastCompletedAt:0};p.name=name;p.completions=Math.max(0,Number(p.completions)||0)+1;p.bestElapsedMs=!Number(p.bestElapsedMs)?elapsed:Math.min(Number(p.bestElapsedMs),elapsed);p.lastCompletedAt=doneAt;g.players[pk]=p;if(rk){g.seen[rk]=doneAt;const keys=Object.keys(g.seen);if(keys.length>10000)for(const k of keys.slice(0,keys.length-8000))delete g.seen[k];}
      return {duplicate:false,activityCode:cc,gameId:gid,game:g.name,player:name,completions:p.completions,bestElapsedMs:p.bestElapsedMs,lastCompletedAt:p.lastCompletedAt};
    });data=tx.data;return clone(tx.result);
  }
  return {playerStats,leaderboard,scoreLeaderboard,allPlayerStats,record,recordScore};
};
