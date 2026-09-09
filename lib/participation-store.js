module.exports = async function createParticipationStore({ adapter, file, getCurrentActivityCode }) {
  const rootDefaults={activities:{}};
  let data=await adapter.load('participation',file,rootDefaults);
  data=data&&typeof data==='object'?data:{activities:{}};
  data.activities=data.activities&&typeof data.activities==='object'?data.activities:{};

  function code(c){return String(c||getCurrentActivityCode?.()||'').trim();}
  function bucket(root,c){
    c=code(c);
    root.activities=root.activities&&typeof root.activities==='object'?root.activities:{};
    if(!root.activities[c])root.activities[c]={games:{}};
    const b=root.activities[c];
    b.games=b.games&&typeof b.games==='object'?b.games:{};
    return b;
  }
  function cleanName(name){return String(name||'玩家').trim().slice(0,40)||'玩家';}
  function keyOf(playerKey,playerName){return String(playerKey||playerName||'').trim().toLocaleLowerCase();}
  function normalizeGameId(id){return String(id||'').trim().slice(0,30);}
  function normalizeGameName(name,id){return String(name||id||'遊戲').trim().slice(0,40)||'遊戲';}
  function state(c){
    const cc=code(c),b=bucket(data,cc),records=[];
    for(const [gameId,gRaw] of Object.entries(b.games||{})){
      const g=gRaw&&typeof gRaw==='object'?gRaw:{};
      const players=g.players&&typeof g.players==='object'?g.players:{};
      for(const p of Object.values(players)){
        records.push({
          activityCode:cc,
          gameId,
          game:String(g.name||gameId),
          player:String(p.name||'玩家'),
          plays:Math.max(0,Math.floor(Number(p.plays)||0)),
          firstPlayedAt:Number(p.firstPlayedAt)||0,
          lastPlayedAt:Number(p.lastPlayedAt)||0,
        });
      }
    }
    records.sort((a,b)=>a.gameId.localeCompare(b.gameId)||(b.plays-a.plays)||(b.lastPlayedAt-a.lastPlayedAt)||a.player.localeCompare(b.player,'zh-Hant'));
    return {activityCode:cc,records};
  }
  async function record({activityCode,gameId,gameName,playerName,playerKey}){
    const cc=code(activityCode),gid=normalizeGameId(gameId),gname=normalizeGameName(gameName,gid),name=cleanName(playerName),key=keyOf(playerKey,name);
    if(!cc||!gid||!key)throw new Error('玩家參與紀錄資料不完整');
    const now=Date.now();
    const tx=await adapter.transact('participation',file,rootDefaults,root=>{
      const b=bucket(root,cc);
      if(!b.games[gid])b.games[gid]={name:gname,players:{}};
      const g=b.games[gid];
      g.name=gname;
      g.players=g.players&&typeof g.players==='object'?g.players:{};
      const p=g.players[key]||{name,plays:0,firstPlayedAt:now,lastPlayedAt:now};
      p.name=name;
      p.plays=Math.max(0,Math.floor(Number(p.plays)||0))+1;
      p.firstPlayedAt=Number(p.firstPlayedAt)||now;
      p.lastPlayedAt=now;
      g.players[key]=p;
      return {activityCode:cc,gameId:gid,game:gname,player:name,plays:p.plays,firstPlayedAt:p.firstPlayedAt,lastPlayedAt:p.lastPlayedAt};
    });
    data=tx.data;
    return tx.result;
  }

  return {state,record};
};
