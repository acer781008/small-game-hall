const GAME_IDS=['bingo','sudoku','memory','shelf','lianliankan','puzzle','numberbattle'];
module.exports = async function createActivityStore({ adapter, file }) {
  const defaults = () => ({
    code:'', note:'', createdAt:Date.now(), startAt:null, endAt:null, retiredAt:null, recordsClearedAt:null,
    maxCompletionsPerGame:1,
    games:Object.fromEntries(GAME_IDS.map(id=>[id,true]))
  });
  const rootDefaults = { currentCode:'', activities:{} };
  let data = await adapter.load('activities', file, rootDefaults);
  data = data && typeof data === 'object' ? data : { ...rootDefaults };
  data.activities = data.activities && typeof data.activities === 'object' ? data.activities : {};

  function gen(){ let c; do{ c=String(Math.floor(100000+Math.random()*900000)); }while(data.activities[c]); return c; }
  function normalize(a){
    const hadLimit=!!(a&&Object.prototype.hasOwnProperty.call(a,'maxCompletionsPerGame'));
    a={...defaults(),...(a||{})};
    a.startAt=Number.isFinite(Number(a.startAt))&&Number(a.startAt)>0?Number(a.startAt):null;
    a.endAt=Number.isFinite(Number(a.endAt))&&Number(a.endAt)>0?Number(a.endAt):null;
    a.retiredAt=Number.isFinite(Number(a.retiredAt))&&Number(a.retiredAt)>0?Number(a.retiredAt):null;
    a.recordsClearedAt=Number.isFinite(Number(a.recordsClearedAt))&&Number(a.recordsClearedAt)>0?Number(a.recordsClearedAt):null;
    a.maxCompletionsPerGame=Math.max(0,Math.min(99,Math.floor(Number(a.maxCompletionsPerGame) || 0)));
    // 舊活動沒有此欄位時，預設每款遊戲可成功完成 1 次。
    if(!hadLimit)a.maxCompletionsPerGame=1;
    a.games=a.games&&typeof a.games==='object'?a.games:{};
    for(const id of GAME_IDS) if(!(id in a.games)) a.games[id]=true;
    return a;
  }
  function ensureCurrent(){
    if(!data.currentCode||!data.activities[data.currentCode]){
      const code=gen();
      data.activities[code]={...defaults(),code};
      data.currentCode=code;
    }
    data.activities[data.currentCode]=normalize(data.activities[data.currentCode]);
    return data.activities[data.currentCode];
  }
  function current(){ return JSON.parse(JSON.stringify(ensureCurrent())); }
  function currentCode(){ return ensureCurrent().code; }
  function get(code){ const a=data.activities[String(code||'')]; return a?JSON.parse(JSON.stringify(normalize(a))):null; }
  function isCurrent(code){ return String(code||'')===currentCode(); }
  function status(code=currentCode(),now=Date.now()){
    const a=get(code); if(!a||!isCurrent(code)) return {state:'invalid',open:false,message:'活動碼已失效'};
    if(a.startAt&&now<a.startAt) return {state:'scheduled',open:false,startAt:a.startAt,endAt:a.endAt,message:'活動尚未開始'};
    if(a.endAt&&now>=a.endAt) return {state:'ended',open:false,startAt:a.startAt,endAt:a.endAt,message:'活動已結束'};
    return {state:'open',open:true,startAt:a.startAt,endAt:a.endAt,message:'活動進行中'};
  }
  function isOpen(code=currentCode()){ return status(code).open; }
  function isGameEnabled(id){ return ensureCurrent().games[id]!==false; }

  async function persist(){ await adapter.save('activities', file, data); }
  async function create(){
    const snapshot=JSON.parse(JSON.stringify(data));
    try{
      const now=Date.now();
      const old=ensureCurrent();
      old.retiredAt=now;
      const code=gen();
      data.activities[code]={...defaults(),code};
      data.currentCode=code;
      await persist();
      return current();
    }catch(e){ data=snapshot; throw e; }
  }

  function recordRetentionCandidates(retentionMs,now=Date.now()){
    const keep=Math.max(0,Number(retentionMs)||0),cur=currentCode(),out=[];
    for(const [code,aRaw] of Object.entries(data.activities||{})){
      const a=normalize(aRaw);
      let base=0;
      if(code===cur){
        // 目前活動只有在主控設定的結束時間已過後，才開始計算保留時間。
        if(a.endAt&&now>=a.endAt)base=a.endAt;
      }else{
        // 換新活動碼後，從舊活動被替換的時間開始計算；舊版資料則退回使用結束/建立時間。
        base=a.retiredAt||a.endAt||a.createdAt||0;
      }
      if(!base||now<base+keep)continue;
      if(a.recordsClearedAt&&a.recordsClearedAt>=base)continue;
      out.push(code);
    }
    return out;
  }

  async function markRecordsCleared(code,at=Date.now()){
    const key=String(code||'').trim();
    if(!key||!data.activities[key])return false;
    const snapshot=JSON.parse(JSON.stringify(data));
    try{
      data.activities[key]=normalize(data.activities[key]);
      data.activities[key].recordsClearedAt=Math.max(0,Number(at)||Date.now());
      await persist();
      return true;
    }catch(e){data=snapshot;throw e;}
  }
  async function update(patch={}){
    const snapshot=JSON.parse(JSON.stringify(data));
    try{
      const a=ensureCurrent();
      if(patch.note!==undefined)a.note=String(patch.note||'').slice(0,500);
      if(patch.startAt!==undefined)a.startAt=Number(patch.startAt)>0?Number(patch.startAt):null;
      if(patch.endAt!==undefined)a.endAt=Number(patch.endAt)>0?Number(patch.endAt):null;
      if(patch.maxCompletionsPerGame!==undefined)a.maxCompletionsPerGame=Math.max(0,Math.min(99,Math.floor(Number(patch.maxCompletionsPerGame)||0)));
      if(a.startAt&&a.endAt&&a.endAt<=a.startAt)throw new Error('結束時間必須晚於開賽時間');
      if(patch.games&&typeof patch.games==='object')for(const id of GAME_IDS)if(id in patch.games)a.games[id]=patch.games[id]!==false;
      await persist();
      return current();
    }catch(e){ data=snapshot; throw e; }
  }

  const before = data.currentCode;
  ensureCurrent();
  if(!before) await persist();

  return {GAME_IDS,current,currentCode,create,update,get,isCurrent,status,isOpen,isGameEnabled,recordRetentionCandidates,markRecordsCleared};
};
