const express=require('express');
const path=require('path');
const crypto=require('crypto');

module.exports=function initTurtle({app,awardPrize,recordPlay=async()=>({}),recordCompletion=async()=>({}),recordScore=async()=>({}),getCompletionStatus=()=>({allowed:true,completions:0,max:0}),isGameEnabled,getActivityCode,isActivityOpen=()=>true}){
  const DIFFS=['easy','normal','hard'];
  const TIERS={easy:'C1',normal:'C2',hard:'C3'};
  let settings={
    difficultyMode:'host',
    difficulty:'normal',
    allowedDifficulties:['easy','normal','hard'],
    timeMode:'limited',
    minutes:3,
    targetMode:'limited',
    target:30
  };
  const runs=new Map();

  function normalize(s={}){
    const difficultyMode=s.difficultyMode==='player'?'player':'host';
    const difficulty=DIFFS.includes(s.difficulty)?s.difficulty:(DIFFS.includes(settings.difficulty)?settings.difficulty:'normal');
    const allowedRaw=Array.isArray(s.allowedDifficulties)?s.allowedDifficulties:settings.allowedDifficulties;
    let allowedDifficulties=[...new Set((allowedRaw||DIFFS).filter(x=>DIFFS.includes(x)))];
    if(!allowedDifficulties.length)allowedDifficulties=[difficulty];

    const timeMode=s.timeMode==='unlimited'?'unlimited':'limited';
    const minutes=Math.max(1,Math.min(30,Math.floor(Number(s.minutes)||Number(settings.minutes)||3)));
    const targetMode=s.targetMode==='unlimited'?'unlimited':'limited';
    const target=Math.max(10,Math.min(300,Math.floor(Number(s.target)||Number(settings.target)||30)));

    return {difficultyMode,difficulty,allowedDifficulties,timeMode,minutes,targetMode,target};
  }

  function getSettings(){return JSON.parse(JSON.stringify(settings));}
  function setSettings(s={}){settings=normalize(s);return getSettings();}
  const key=(activity,player)=>`${activity}|${String(player||'').trim().toLocaleLowerCase()}`;
  const pub=r=>r?{runId:r.runId,startedAt:r.startedAt,endsAt:r.endsAt,difficulty:r.difficulty,tier:r.tier,settings:r.settings}:null;

  app.use('/games/turtle',express.static(path.join(__dirname,'public'),{etag:true,maxAge:0}));
  app.get('/games/turtle/api/settings',(req,res)=>res.json({ok:true,settings:getSettings()}));

  app.post('/games/turtle/api/start',async(req,res)=>{
    const activity=String(req.body?.activity||''),player=String(req.body?.player||'').trim().slice(0,30);
    if(activity!==String(getActivityCode()))return res.status(404).json({ok:false,message:'活動不存在'});
    if(!player)return res.status(400).json({ok:false,message:'請輸入玩家名稱'});
    if(!isGameEnabled('turtle'))return res.status(403).json({ok:false,message:'烏龜島大作戰目前未開放'});
    if(!isActivityOpen(activity))return res.status(403).json({ok:false,message:'目前不在活動開放時間'});

    const k=key(activity,player),existing=runs.get(k);
    if(existing)return res.json({ok:true,...pub(existing),resumed:true});

    const st=getCompletionStatus({activityCode:activity,gameId:'turtle',playerName:player,playerKey:player});
    if(!st.allowed)return res.status(409).json({ok:false,message:`已達每位玩家可完成次數上限（${st.max} 次）`,completionStatus:st});

    let difficulty=settings.difficulty;
    if(settings.difficultyMode==='player'){
      const allowed=settings.allowedDifficulties||DIFFS;
      if(allowed.includes(req.body?.difficulty))difficulty=req.body.difficulty;
      else difficulty=allowed[0]||settings.difficulty;
    }

    const startedAt=Date.now(),endsAt=settings.timeMode==='limited'?startedAt+settings.minutes*60000:null;
    const r={runId:crypto.randomUUID(),activity,player,startedAt,endsAt,difficulty,tier:TIERS[difficulty],settings:{...getSettings(),difficulty}};
    runs.set(k,r);

    await recordPlay({activityCode:activity,gameId:'turtle',gameName:'烏龜島大作戰',playerName:player,playerKey:player});
    res.json({ok:true,...pub(r),resumed:false,completionStatus:st});
  });

  app.post('/games/turtle/api/finish',async(req,res)=>{
    const activity=String(req.body?.activity||''),player=String(req.body?.player||'').trim().slice(0,30),runId=String(req.body?.runId||'');
    if(activity!==String(getActivityCode()))return res.status(404).json({ok:false,message:'活動不存在'});
    const k=key(activity,player),r=runs.get(k);
    if(!r||r.runId!==runId)return res.status(404).json({ok:false,message:'找不到本局資料'});

    runs.delete(k);
    const now=Date.now(),elapsedMs=Math.max(0,now-r.startedAt),within=!r.endsAt||now<=r.endsAt+1800;
    const score=Math.max(0,Math.floor(Number(req.body?.score)||0));
    const completed=!!req.body?.completed && r.settings.targetMode==='limited' && score>=r.settings.target && within;

    await recordScore({activityCode:activity,gameId:'turtle',gameName:'烏龜島大作戰',playerName:player,playerKey:player,score,elapsedMs,playedAt:now,runKey:r.runId});

    let completion=null,prize=null;
    if(completed){
      completion=await recordCompletion({activityCode:activity,gameId:'turtle',gameName:'烏龜島大作戰',playerName:player,playerKey:player,elapsedMs,completedAt:now,runKey:r.runId});
      const diffLabel={easy:'簡單',normal:'標準',hard:'困難'}[r.difficulty];
      prize=await awardPrize({
        activityCode:activity,gameId:'turtle',game:'烏龜島大作戰',
        playerName:player,playerKey:player,gameRef:activity,tier:r.tier,
        selection:{難度:diffLabel,分數:`${score} 分`,目標:`${r.settings.target} 分`},elapsedMs
      });
    }

    res.json({ok:true,completed,score,elapsedMs,completion,prize,tier:r.tier,completionStatus:getCompletionStatus({activityCode:activity,gameId:'turtle',playerName:player,playerKey:player})});
  });

  return {getSettings,setSettings,resetForActivity:()=>runs.clear()};
};
