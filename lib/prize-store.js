module.exports = async function createPrizeStore({ adapter, file, getCurrentActivityCode }) {
  const GAME_IDS=['bingo','sudoku','memory','shelf','lianliankan','puzzle','numberbattle'];
  const TIERS=['C1','C2','C3'];
  const fresh=()=>({awardMode:'A',bDistribution:'random',maxClaimsPerPlayer:1,prizes:[],records:[],cPrizes:[],cRecords:[],claims:{}});
  const rootDefaults={activities:{}};
  let data=await adapter.load('prizes',file,rootDefaults);
  data=data&&typeof data==='object'?data:{activities:{}};
  data.activities=data.activities&&typeof data.activities==='object'?data.activities:{};

  function code(c){return String(c||getCurrentActivityCode?.()||'').trim();}
  function normalizeGames(v){
    if(!Array.isArray(v))return GAME_IDS.slice();
    return [...new Set(v.map(x=>String(x||'').trim()).filter(x=>GAME_IDS.includes(x)))];
  }
  function normalizeTier(v){v=String(v||'').toUpperCase();return TIERS.includes(v)?v:'';}
  function bucket(root,c){
    c=code(c);
    root.activities=root.activities&&typeof root.activities==='object'?root.activities:{};
    if(!root.activities[c])root.activities[c]=fresh();
    const b=root.activities[c];
    const mode=String(b.awardMode||'A').toUpperCase();
    b.awardMode=['A','B','C'].includes(mode)?mode:'A';
    const bdist=String(b.bDistribution||'random').toLowerCase();
    b.bDistribution=['random','sequential'].includes(bdist)?bdist:'random';
    b.prizes=Array.isArray(b.prizes)?b.prizes:[];
    b.records=Array.isArray(b.records)?b.records:[];
    b.cPrizes=Array.isArray(b.cPrizes)?b.cPrizes:[];
    b.cRecords=Array.isArray(b.cRecords)?b.cRecords:[];
    b.claims=b.claims&&typeof b.claims==='object'?b.claims:{};
    b.maxClaimsPerPlayer=Math.max(0,Math.floor(Number(b.maxClaimsPerPlayer)||0));
    for(const p of b.prizes){
      p.enabled=p.enabled!==false;
      p.quantity=Math.max(0,Math.floor(Number(p.quantity)||0));
      p.games=normalizeGames(p.games);
    }
    for(const p of b.cPrizes){
      p.enabled=p.enabled!==false;
      p.quantity=Math.max(0,Math.floor(Number(p.quantity)||0));
      p.tier=normalizeTier(p.tier)||'C1';
      p.gameId=normalizeGameId(p.gameId,'');
    }
    return b;
  }
  function cleanPrize(p){return {id:p.id,name:p.name,quantity:p.quantity,enabled:p.enabled!==false,games:normalizeGames(p.games)};}
  function cleanCPrize(p){return {id:p.id,name:p.name,quantity:p.quantity,enabled:p.enabled!==false,tier:normalizeTier(p.tier)||'C1',gameId:normalizeGameId(p.gameId,'')};}
  function state(c){
    const b=bucket(data,c);
    return {
      activityCode:code(c),awardMode:b.awardMode,bDistribution:b.bDistribution,maxClaimsPerPlayer:Number(b.maxClaimsPerPlayer)||0,
      prizes:b.prizes.map(cleanPrize),records:b.records.slice().reverse(),
      cPrizes:b.cPrizes.map(cleanCPrize),cRecords:b.cRecords.slice().reverse()
    };
  }
  function publicState(c){
    const s=state(c);
    return {
      activityCode:s.activityCode,awardMode:s.awardMode,bDistribution:s.bDistribution,
      prizes:s.prizes.filter(p=>p.enabled!==false),
      cPrizes:s.cPrizes.filter(p=>p.enabled!==false)
    };
  }
  async function run(mutator){
    const tx=await adapter.transact('prizes',file,rootDefaults,mutator);
    data=tx.data;
    return tx.result;
  }
  async function setSettings(patch={},c){
    const cc=code(c);
    return run(root=>{
      const b=bucket(root,cc);
      if(patch.maxClaimsPerPlayer!==undefined)b.maxClaimsPerPlayer=Math.max(0,Math.floor(Number(patch.maxClaimsPerPlayer)||0));
      if(patch.awardMode!==undefined){const m=String(patch.awardMode||'A').toUpperCase();b.awardMode=['A','B','C'].includes(m)?m:'A';}
      if(patch.bDistribution!==undefined){const d=String(patch.bDistribution||'random').toLowerCase();b.bDistribution=['random','sequential'].includes(d)?d:'random';}
      return {
        activityCode:cc,awardMode:b.awardMode,bDistribution:b.bDistribution,maxClaimsPerPlayer:b.maxClaimsPerPlayer,
        prizes:b.prizes.map(cleanPrize),records:b.records.slice().reverse(),
        cPrizes:b.cPrizes.map(cleanCPrize),cRecords:b.cRecords.slice().reverse()
      };
    });
  }
  async function setMaxClaims(n,c){return setSettings({maxClaimsPerPlayer:n},c);}
  async function addPrize(name,quantity,c,games){
    const cc=code(c); name=String(name||'').trim().slice(0,80); quantity=Math.max(0,Math.floor(Number(quantity)||0));
    if(!name)throw new Error('請輸入獎品名稱');
    return run(root=>{const b=bucket(root,cc);const p={id:`p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,quantity,enabled:true,games:normalizeGames(games)};b.prizes.push(p);return cleanPrize(p);});
  }
  async function updatePrize(id,patch={},c){
    const cc=code(c);
    return run(root=>{const b=bucket(root,cc);const p=b.prizes.find(x=>x.id===id);if(!p)throw new Error('找不到獎品');if(patch.name!==undefined){const name=String(patch.name||'').trim().slice(0,80);if(!name)throw new Error('獎品名稱不可空白');p.name=name;}if(patch.quantity!==undefined)p.quantity=Math.max(0,Math.floor(Number(patch.quantity)||0));if(patch.enabled!==undefined)p.enabled=patch.enabled!==false;if(patch.games!==undefined)p.games=normalizeGames(patch.games);return cleanPrize(p);});
  }
  async function removePrize(id,c){
    const cc=code(c);
    return run(root=>{const b=bucket(root,cc);const i=b.prizes.findIndex(x=>x.id===id);if(i<0)throw new Error('找不到獎品');b.prizes.splice(i,1);return true;});
  }
  async function addCPrize(name,quantity,tier,c,gameId){
    const cc=code(c);name=String(name||'').trim().slice(0,80);quantity=Math.max(0,Math.floor(Number(quantity)||0));tier=normalizeTier(tier);gameId=normalizeGameId(gameId,'');
    if(!name)throw new Error('請輸入獎品名稱');if(!tier)throw new Error('C 模式獎品級別錯誤');if(!gameId)throw new Error('請選擇 C 模式獎品所屬遊戲');
    return run(root=>{const b=bucket(root,cc);const p={id:`cp_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,quantity,enabled:true,tier,gameId};b.cPrizes.push(p);return cleanCPrize(p);});
  }
  async function updateCPrize(id,patch={},c){
    const cc=code(c);
    return run(root=>{const b=bucket(root,cc);const p=b.cPrizes.find(x=>x.id===id);if(!p)throw new Error('找不到 C 模式獎品');if(patch.name!==undefined){const name=String(patch.name||'').trim().slice(0,80);if(!name)throw new Error('獎品名稱不可空白');p.name=name;}if(patch.quantity!==undefined)p.quantity=Math.max(0,Math.floor(Number(patch.quantity)||0));if(patch.enabled!==undefined)p.enabled=patch.enabled!==false;if(patch.tier!==undefined){const t=normalizeTier(patch.tier);if(!t)throw new Error('C 模式獎品級別錯誤');p.tier=t;}if(patch.gameId!==undefined){const g=normalizeGameId(patch.gameId,'');if(!g)throw new Error('C 模式獎品遊戲錯誤');p.gameId=g;}return cleanCPrize(p);});
  }
  async function removeCPrize(id,c){
    const cc=code(c);
    return run(root=>{const b=bucket(root,cc);const i=b.cPrizes.findIndex(x=>x.id===id);if(i<0)throw new Error('找不到 C 模式獎品');b.cPrizes.splice(i,1);return true;});
  }
  function normalizeGameId(gameId,game){
    if(GAME_IDS.includes(String(gameId||'')))return String(gameId);
    const n=String(game||'').trim();
    return ({'賓果':'bingo','數獨':'sudoku','翻牌':'memory','貨架整理':'shelf','連連看':'lianliankan','拼圖挑戰':'puzzle','拼圖':'puzzle','數字大亂鬥':'numberbattle'})[n]||'';
  }
  async function award({activityCode,gameId,game,playerName,playerKey,gameRef,tier,selection,elapsedMs}){
    const cc=code(activityCode);
    return run(root=>{
      const b=bucket(root,cc);
      const key=String(playerKey||playerName||'').trim().toLocaleLowerCase();
      const count=Number(b.claims[key]||0),max=Math.max(0,Number(b.maxClaimsPerPlayer)||0);
      if(max>0&&count>=max)return {status:'limit_reached',prizeClaimCount:count,maxClaimsPerPlayer:max,awardMode:b.awardMode};
      const gid=normalizeGameId(gameId,game);
      if(b.awardMode==='C'){
        const t=normalizeTier(tier);
        if(!t)return {status:'tier_missing',prizeClaimCount:count,maxClaimsPerPlayer:max,awardMode:'C'};
        if(!gid)return {status:'game_missing',tier:t,prizeClaimCount:count,maxClaimsPerPlayer:max,awardMode:'C'};
        const available=b.cPrizes.filter(p=>p.enabled!==false&&p.gameId===gid&&p.tier===t&&Number(p.quantity)>0);
        const total=available.reduce((s,p)=>s+Number(p.quantity||0),0);
        if(total<=0)return {status:'tier_out_of_stock',tier:t,gameId:gid,prizeClaimCount:count,maxClaimsPerPlayer:max,awardMode:'C'};
        let r=Math.floor(Math.random()*total),picked=available[0];
        for(const p of available){if(r<Number(p.quantity)){picked=p;break}r-=Number(p.quantity)}
        picked.quantity-=1;b.claims[key]=count+1;
        const rec={
          id:`cr_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,activityCode:cc,
          player:String(playerName||'玩家').trim()||'玩家',game:String(game||''),gameId:gid,
          tier:t,prize:picked.name,selection:selection&&typeof selection==='object'?JSON.parse(JSON.stringify(selection)):{},
          elapsedMs:Math.max(0,Number(elapsedMs)||0),gameRef:String(gameRef||''),awardedAt:Date.now()
        };
        b.cRecords.push(rec);if(b.cRecords.length>5000)b.cRecords=b.cRecords.slice(-5000);
        return {status:'awarded',prizeName:picked.name,tier:t,prizeClaimCount:count+1,maxClaimsPerPlayer:max,awardedAt:rec.awardedAt,awardMode:'C',gameId:gid};
      }
      let available=b.prizes.filter(p=>p.enabled!==false&&Number(p.quantity)>0);
      if(b.awardMode==='B')available=available.filter(p=>normalizeGames(p.games).includes(gid));
      const total=available.reduce((s,p)=>s+Number(p.quantity||0),0);
      if(total<=0)return {status:b.awardMode==='B'?'game_out_of_stock':'out_of_stock',prizeClaimCount:count,maxClaimsPerPlayer:max,awardMode:b.awardMode,gameId:gid};
      let picked=available[0];
      if(!(b.awardMode==='B'&&b.bDistribution==='sequential')){
        let r=Math.floor(Math.random()*total);
        for(const p of available){if(r<Number(p.quantity)){picked=p;break}r-=Number(p.quantity)}
      }
      picked.quantity-=1;b.claims[key]=count+1;
      const rec={id:`r_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,activityCode:cc,player:String(playerName||'玩家').trim()||'玩家',game:String(game||''),gameId:gid,prize:picked.name,gameRef:String(gameRef||''),awardedAt:Date.now()};
      b.records.push(rec); if(b.records.length>5000)b.records=b.records.slice(-5000);
      return {status:'awarded',prizeName:picked.name,prizeClaimCount:count+1,maxClaimsPerPlayer:max,awardedAt:rec.awardedAt,awardMode:b.awardMode,gameId:gid};
    });
  }
  async function clearRecords(c){
    const cc=code(c);
    return run(root=>{
      const b=bucket(root,cc);
      const normalCount=b.records.length,cCount=b.cRecords.length;
      b.records=[];
      b.cRecords=[];
      // 手動清除只移除可查看的得獎紀錄；獎品庫存與已領獎次數保留，避免活動中重複領獎。
      return {activityCode:cc,cleared:true,normalCount,cCount};
    });
  }
  async function clearExpiredActivityRecords(c){
    const cc=code(c);
    return run(root=>{
      const b=bucket(root,cc);
      const normalCount=b.records.length,cCount=b.cRecords.length,claimCount=Object.keys(b.claims||{}).length;
      b.records=[];
      b.cRecords=[];
      // 自動清理只會發生在活動已結束或已換新活動碼 48 小時後，因此領獎次數也可安全清掉。
      b.claims={};
      return {activityCode:cc,cleared:true,normalCount,cCount,claimCount};
    });
  }
  return {state,publicState,setSettings,setMaxClaims,addPrize,updatePrize,removePrize,addCPrize,updateCPrize,removeCPrize,award,clearRecords,clearExpiredActivityRecords};
};
