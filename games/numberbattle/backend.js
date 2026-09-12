const express=require('express');
const path=require('path');
const crypto=require('crypto');

module.exports=function initNumberBattle({app,awardPrize,recordPlay=async()=>({}),recordCompletion=async()=>({}),recordScore=async()=>({}),getScoreLeaderboard=()=>({rows:[]}),getCompletionStatus=()=>({allowed:true,completions:0,max:0}),isGameEnabled,getActivityCode,isActivityOpen=()=>true}){
  const DIFFS=['easy','normal','hard'];
  const MODES=['sum','rush'];
  const TIERS=['C1','C2','C3'];
  const DEFAULT_TIER={easy:'C1',normal:'C2',hard:'C3'};
  let settings={
    mode:'sum',
    allowedModes:[...MODES],
    difficulty:'easy',
    selfSelect:true,
    allowedDifficulties:[...DIFFS],
    tierByDifficulty:{...DEFAULT_TIER},
    questionSeconds:8,
    timeMinutes:3,
  };
  const runs=new Map();

  const uniq=(arr,allowed,fallback)=>{const x=Array.isArray(arr)?[...new Set(arr.filter(v=>allowed.includes(v)))]:fallback.slice();return x.length?x:fallback.slice();};
  function normalize(s={}){
    const allowedModes=uniq(s.allowedModes,MODES,settings.allowedModes||MODES);
    const allowedDifficulties=uniq(s.allowedDifficulties,DIFFS,settings.allowedDifficulties||DIFFS);
    const selfSelect=s.selfSelect===true;
    let mode=MODES.includes(s.mode)?s.mode:(settings.mode||'sum');
    let difficulty=DIFFS.includes(s.difficulty)?s.difficulty:settings.difficulty;
    if(selfSelect&&!allowedModes.includes(mode))mode=allowedModes[0];
    if(selfSelect&&!allowedDifficulties.includes(difficulty))difficulty=allowedDifficulties[0];
    const tierByDifficulty={};
    for(const d of DIFFS){const t=String(s.tierByDifficulty?.[d]||settings.tierByDifficulty?.[d]||DEFAULT_TIER[d]).toUpperCase();tierByDifficulty[d]=TIERS.includes(t)?t:DEFAULT_TIER[d];}
    const q=[0,5,6,8,10,12,15].includes(Number(s.questionSeconds))?Number(s.questionSeconds):(Number.isFinite(Number(settings.questionSeconds))?Number(settings.questionSeconds):8);
    const mins=[0,1,2,3,5,10,15,20,30].includes(Number(s.timeMinutes))?Number(s.timeMinutes):Number(settings.timeMinutes)||3;
    return {mode,allowedModes,difficulty,selfSelect,allowedDifficulties,tierByDifficulty,questionSeconds:q,timeMinutes:mins};
  }
  function getSettings(){return JSON.parse(JSON.stringify(settings));}
  function setSettings(s={}){settings=normalize(s);return getSettings();}
  function runKey(activity,player){return `${activity}|${String(player||'').trim().toLocaleLowerCase()}`;}
  function publicRun(r){return r?{runId:r.runId,startedAt:r.startedAt,endsAt:r.endsAt,settings:r.settings,tier:r.tier,selection:r.selection}:null;}
  function choose(req={}){
    let mode=settings.mode,difficulty=settings.difficulty;
    if(settings.selfSelect&&settings.allowedModes.includes(req.mode))mode=req.mode;
    if(settings.selfSelect&&settings.allowedDifficulties.includes(req.difficulty))difficulty=req.difficulty;
    return {mode,difficulty};
  }

  app.use('/games/numberbattle',express.static(path.join(__dirname,'public'),{etag:true,maxAge:0}));
  app.get('/games/numberbattle/api/settings',(req,res)=>res.json({ok:true,settings:getSettings()}));
  app.get('/games/numberbattle/api/leaderboard',(req,res)=>{const activity=String(req.query.activity||'');if(activity!==String(getActivityCode()))return res.status(404).json({ok:false,message:'活動不存在'});res.set('Cache-Control','no-store');res.json({ok:true,...getScoreLeaderboard({activityCode:activity,gameId:'numberbattle',limit:100})});});
  app.get('/games/numberbattle/api/active',(req,res)=>{const activity=String(req.query.activity||''),player=String(req.query.player||'').trim();if(activity!==String(getActivityCode()))return res.status(404).json({ok:false,message:'活動不存在'});res.json({ok:true,activeRun:publicRun(runs.get(runKey(activity,player)))});});
  app.post('/games/numberbattle/api/start',async(req,res)=>{
    const activity=String(req.body?.activity||''),player=String(req.body?.player||'').trim().slice(0,30);
    if(activity!==String(getActivityCode()))return res.status(404).json({ok:false,message:'活動不存在'});
    if(!player)return res.status(400).json({ok:false,message:'請輸入玩家名稱'});
    if(!isGameEnabled('numberbattle'))return res.status(403).json({ok:false,message:'數字大亂鬥目前未開放'});
    if(!isActivityOpen(activity))return res.status(403).json({ok:false,message:'目前不在活動開放時間'});
    const key=runKey(activity,player),existing=runs.get(key);if(existing)return res.json({ok:true,...publicRun(existing),resumed:true});
    const st=getCompletionStatus({activityCode:activity,gameId:'numberbattle',playerName:player,playerKey:player});if(!st.allowed)return res.status(409).json({ok:false,message:`已達每位玩家可完成次數上限（${st.max} 次）`,completionStatus:st});
    const choice=choose(req.body||{}),runSettings={...getSettings(),mode:choice.mode,difficulty:choice.difficulty};
    const startedAt=Date.now(),runId=crypto.randomUUID(),mins=Number(runSettings.timeMinutes)||0,endsAt=mins>0?startedAt+mins*60000:null;
    const tier=runSettings.tierByDifficulty[choice.difficulty]||'C1';
    const diffMeta={easy:{label:'簡單',board:'5×6',goal:'5 題'},normal:{label:'普通',board:'6×6',goal:'8 題'},hard:{label:'困難',board:'7×7',goal:'10 題'}}[choice.difficulty];
    const modeLabel={sum:'湊數',rush:'連續挑戰'}[choice.mode]||'湊數';
    const selection={玩法:modeLabel,難度:diffMeta.label,盤面:diffMeta.board,完成條件:diffMeta.goal,每題秒數:Number(runSettings.questionSeconds)>0?`${runSettings.questionSeconds} 秒`:'不限制'};
    const r={runId,activity,player,startedAt,endsAt,settings:runSettings,tier,selection};runs.set(key,r);
    await recordPlay({activityCode:activity,gameId:'numberbattle',gameName:'數字大亂鬥',playerName:player,playerKey:player});
    res.json({ok:true,...publicRun(r),resumed:false,completionStatus:st});
  });
  app.post('/games/numberbattle/api/finish',async(req,res)=>{
    const activity=String(req.body?.activity||''),player=String(req.body?.player||'').trim().slice(0,30),runId=String(req.body?.runId||''),completed=!!req.body?.completed;
    if(activity!==String(getActivityCode()))return res.status(404).json({ok:false,message:'活動不存在'});
    const key=runKey(activity,player),r=runs.get(key);if(!r||r.runId!==runId)return res.status(404).json({ok:false,message:'找不到本局資料'});
    const now=Date.now(),elapsedMs=Math.max(0,now-r.startedAt),within=!r.endsAt||now<=r.endsAt+1500,ok=completed&&within;runs.delete(key);
    const maxGoal={easy:5,normal:8,hard:10}[r.settings.difficulty]||5;
    const score=Math.max(0,Math.min(maxGoal,Math.floor(Number(req.body?.score)||0)));
    let completion=null,prize=null;
    await recordScore({activityCode:activity,gameId:'numberbattle',gameName:'數字大亂鬥',playerName:player,playerKey:player,score,elapsedMs,playedAt:now,runKey:r.runId});
    if(ok){completion=await recordCompletion({activityCode:activity,gameId:'numberbattle',gameName:'數字大亂鬥',playerName:player,playerKey:player,elapsedMs,completedAt:now,runKey:r.runId});prize=await awardPrize({activityCode:activity,gameId:'numberbattle',game:'數字大亂鬥',playerName:player,playerKey:player,gameRef:activity,tier:r.tier,selection:{...r.selection,答對題數:`${score} 題`},elapsedMs});}
    res.json({ok:true,completed:ok,score,elapsedMs,completion,prize,tier:r.tier,selection:r.selection,completionStatus:getCompletionStatus({activityCode:activity,gameId:'numberbattle',playerName:player,playerKey:player})});
  });
  return {getSettings,setSettings,resetForActivity:()=>runs.clear()};
};
