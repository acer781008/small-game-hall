const fs=require('fs');
const path=require('path');

// 本機測試可用 .env；Render 正式部署請改用 Environment Variables。
try{
  const envText=fs.readFileSync(path.join(__dirname,'.env'),'utf8');
  for(const line of envText.split(/\r?\n/)){
    const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if(!m||process.env[m[1]]!==undefined)continue;
    process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
  }
}catch{}

const express=require('express');
const http=require('http');
const crypto=require('crypto');
const {Server}=require('socket.io');
const createStateAdapter=require('./lib/state-adapter');
const createActivityStore=require('./lib/activity-store');
const createPrizeStore=require('./lib/prize-store');
const createGameSettingsStore=require('./lib/game-settings-store');
const createParticipationStore=require('./lib/participation-store');
const createCompletionStore=require('./lib/completion-store');

async function main(){
  const app=express();
  const server=http.createServer(app);
  const io=new Server(server);
  const PORT=process.env.PORT||3000;
  const ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||'');
  const ADMIN_SESSION_MS=7*24*60*60*1000;

  const adapter=await createStateAdapter({databaseUrl:process.env.DATABASE_URL||''});
  const activities=await createActivityStore({adapter,file:path.join(__dirname,'data','activities.json')});
  const prizes=await createPrizeStore({adapter,file:path.join(__dirname,'data','store.json'),getCurrentActivityCode:()=>activities.currentCode()});
  const gameSettings=await createGameSettingsStore({adapter,file:path.join(__dirname,'data','game-settings.json')});
  const participation=await createParticipationStore({adapter,file:path.join(__dirname,'data','participation.json'),getCurrentActivityCode:()=>activities.currentCode()});
  const completions=await createCompletionStore({adapter,file:path.join(__dirname,'data','completions.json'),getCurrentActivityCode:()=>activities.currentCode()});

  const RECORD_RETENTION_HOURS=Math.max(1,Math.floor(Number(process.env.RECORD_RETENTION_HOURS)||48));
  const RECORD_RETENTION_MS=RECORD_RETENTION_HOURS*60*60*1000;
  let retentionCleanupRunning=false;
  async function cleanupExpiredRecords(){
    if(retentionCleanupRunning)return;
    retentionCleanupRunning=true;
    try{
      const codes=activities.recordRetentionCandidates?.(RECORD_RETENTION_MS,Date.now())||[];
      for(const code of codes){
        await participation.clearActivity(code);
        await completions.clearActivity(code);
        await prizes.clearExpiredActivityRecords(code);
        await activities.markRecordsCleared(code,Date.now());
        console.log(`已自動清除活動 ${code} 超過 ${RECORD_RETENTION_HOURS} 小時的玩家／完成／得獎紀錄`);
      }
    }catch(e){
      console.error('自動清理舊紀錄失敗：',e);
    }finally{
      retentionCleanupRunning=false;
    }
  }

  function verifyPassword(password){
    if(!ADMIN_PASSWORD)return false;
    const a=Buffer.from(String(password||'')),b=Buffer.from(ADMIN_PASSWORD);
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }
  function adminSignature(exp){return crypto.createHmac('sha256',ADMIN_PASSWORD).update(`admin|${exp}`).digest('hex');}
  function createAdminSession(res){const exp=Date.now()+ADMIN_SESSION_MS,t=`${exp}.${adminSignature(exp)}`;res.setHeader('Set-Cookie',`admin_session=${t}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(ADMIN_SESSION_MS/1000)}`);return t;}
  function validAdminSession(t){if(!ADMIN_PASSWORD||!t)return false;const [expRaw,sig]=String(t).split('.');const exp=Number(expRaw);if(!Number.isFinite(exp)||exp<Date.now()||!sig)return false;const expected=adminSignature(exp),a=Buffer.from(sig),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}

  app.use(express.json({limit:'500kb'}));
  function cookies(req){const out={};String(req.headers.cookie||'').split(';').forEach(x=>{const i=x.indexOf('=');if(i>0)out[x.slice(0,i).trim()]=x.slice(i+1).trim()});return out;}
  function isAdmin(req){return validAdminSession(cookies(req).admin_session);}
  function needAdmin(req,res,next){if(!isAdmin(req))return res.status(401).json({ok:false,success:false,message:'請先登入主控'});next();}
  function gameEnabled(id){return activities.isGameEnabled(id);}
  function currentCode(){return activities.currentCode();}
  function activityOpen(code=currentCode()){return activities.isOpen(code);}
  async function awardPrize(payload){
    if(!activityOpen(payload?.activityCode||currentCode()))return {status:'activity_closed'};
    try{return await prizes.award({...payload,activityCode:currentCode()});}
    catch(e){console.error('awardPrize storage error:',e);return {status:'storage_error',message:'獎品資料保存失敗，請洽主控'};}
  }
  async function recordPlay(payload){
    if(!activityOpen(payload?.activityCode||currentCode()))return {status:'activity_closed'};
    try{return {status:'recorded',...(await participation.record({...payload,activityCode:payload?.activityCode||currentCode()}))};}
    catch(e){console.error('participation storage error:',e);return {status:'storage_error'};}
  }
  function getCompletionStatus({activityCode=currentCode(),gameId,playerName,playerKey}){
    const code=String(activityCode||currentCode());
    const max=Math.max(0,Number(activities.get(code)?.maxCompletionsPerGame)||0);
    const stats=completions.playerStats(code,gameId,playerName,playerKey);
    return {...stats,max,allowed:max===0||stats.completions<max};
  }
  async function recordCompletion(payload){
    if(!activityOpen(payload?.activityCode||currentCode()))return {status:'activity_closed'};
    return completions.record({...payload,activityCode:payload?.activityCode||currentCode()});
  }
  async function recordScore(payload){
    if(!activityOpen(payload?.activityCode||currentCode()))return {status:'activity_closed'};
    return completions.recordScore({...payload,activityCode:payload?.activityCode||currentCode()});
  }
  function getScoreLeaderboard({activityCode=currentCode(),gameId,limit=100}){return completions.scoreLeaderboard(String(activityCode||currentCode()),gameId,limit);}

  app.post('/api/admin/login',(req,res)=>{
    if(!ADMIN_PASSWORD)return res.status(503).json({ok:false,success:false,message:'尚未設定主控密碼，請在部署環境設定 ADMIN_PASSWORD'});
    if(!verifyPassword(req.body.password))return res.status(401).json({ok:false,success:false,message:'主控密碼錯誤'});
    createAdminSession(res);res.json({ok:true,success:true});
  });
  app.get('/api/admin/status',(req,res)=>res.json({ok:isAdmin(req)}));
  app.post('/api/admin/logout',(req,res)=>{res.setHeader('Set-Cookie','admin_session=; Max-Age=0; Path=/; SameSite=Lax');res.json({ok:true});});
  app.get('/api/storage-status',needAdmin,(req,res)=>res.json({ok:true,persistent:adapter.persistent,mode:adapter.mode}));

  app.get('/admin.html',(req,res)=>isAdmin(req)?res.sendFile(path.join(__dirname,'public','admin.html')):res.redirect('/admin-login.html'));
  for(const id of ['bingo','sudoku','memory','shelf','lianliankan','puzzle','numberbattle'])app.get(`/games/${id}/admin.html`,(req,res)=>isAdmin(req)?res.sendFile(path.join(__dirname,'games',id,'public','admin.html')):res.redirect('/admin-login.html'));

  app.get('/api/activity',(req,res)=>res.json({ok:true,activity:activities.current(),status:activities.status()}));
  app.get('/api/activity/check/:code',(req,res)=>{const a=activities.get(req.params.code);res.json({ok:!!a&&activities.isCurrent(req.params.code),activity:a&&activities.isCurrent(req.params.code)?a:null});});
  app.put('/api/activity',needAdmin,async(req,res)=>{try{const activity=await activities.update(req.body||{});res.json({ok:true,activity,status:activities.status()});}catch(e){res.status(400).json({ok:false,message:e.message});}});

  function guardEntry(id,entry){return (req,res,next)=>{if(isAdmin(req))return next();if(!gameEnabled(id))return res.status(403).send(blocked('此遊戲目前未開放'));if(req.path===entry){const code=String(req.query.activity||req.query.room||'');if(code&&code!==currentCode())return res.status(403).send(blocked('這個活動碼已不是目前活動'));const st=activities.status(code||currentCode());if(!st.open)return res.status(403).send(blocked(st.state==='scheduled'?'活動尚未開始':'活動已結束'));}next();};}
  function blocked(msg){return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小遊戲館</title><body style="font-family:system-ui;text-align:center;padding:42px"><h2>${msg}</h2><p><a href="/?activity=${currentCode()}">返回小遊戲館</a></p></body>`;}
  app.use('/games/bingo',guardEntry('bingo','/index.html'));
  app.use('/games/sudoku',guardEntry('sudoku','/player.html'));
  app.use('/games/memory',guardEntry('memory','/player.html'));
  app.use('/games/shelf',guardEntry('shelf','/player.html'));
  app.use('/games/lianliankan',guardEntry('lianliankan','/player.html'));
  app.use('/games/puzzle',guardEntry('puzzle','/player.html'));
  app.use('/games/numberbattle',guardEntry('numberbattle','/player.html'));

  const commonGameDeps={awardPrize,recordPlay,recordCompletion,recordScore,getScoreLeaderboard,getCompletionStatus,isGameEnabled:gameEnabled,getActivityCode:currentCode,isActivityOpen:code=>activities.isOpen(code)};
  const bingo=require('./games/bingo/backend')({app,io,isAdmin,...commonGameDeps,isActivityCurrent:code=>activities.isCurrent(code)});
  const sudoku=require('./games/sudoku/backend')({app,io,isAdmin,...commonGameDeps});
  const memory=require('./games/memory/backend')({app,io,isAdmin,...commonGameDeps});
  const shelf=require('./games/shelf/backend')({app,io,isAdmin,...commonGameDeps});
  const lianliankan=require('./games/lianliankan/backend')({app,...commonGameDeps});
  const puzzle=require('./games/puzzle/backend')({app,...commonGameDeps});
  const numberbattle=require('./games/numberbattle/backend')({app,...commonGameDeps});
  const modules={bingo,sudoku,memory,shelf,lianliankan,puzzle,numberbattle};

  function moduleGetSettings(id){const mod=modules[id];return id==='bingo'?mod.getSettings(currentCode()):mod.getSettings();}
  function moduleSetSettings(id,settings){const mod=modules[id];return id==='bingo'?mod.setSettings(currentCode(),settings):mod.setSettings(settings);}
  function ensureCurrentGames(){const c=currentCode();bingo.ensureRoom(c);memory.ensureRoom(c);shelf.ensureRoom(c);}
  ensureCurrentGames();

  // 啟動時把上次儲存在永久資料庫的遊戲設定套回所有遊戲。
  for(const id of Object.keys(modules)){
    const saved=gameSettings.get(id);
    if(saved){try{moduleSetSettings(id,saved);}catch(e){console.warn(`restore ${id} settings failed:`,e.message);}}
    else{try{await gameSettings.set(id,moduleGetSettings(id));}catch(e){console.warn(`seed ${id} settings failed:`,e.message);}}
  }

  // 短期保存：活動結束或換新活動碼後保留 48 小時，再自動清除紀錄；設定與獎品內容保留。
  await cleanupExpiredRecords();
  const retentionTimer=setInterval(cleanupExpiredRecords,60*60*1000);
  retentionTimer.unref?.();

  app.post('/api/activity/new',needAdmin,async(req,res)=>{
    try{
      const activity=await activities.create();
      bingo.ensureRoom(activity.code);sudoku.resetForActivity?.();memory.resetForActivity?.(activity.code);shelf.resetForActivity?.(activity.code);lianliankan.resetForActivity?.(activity.code);puzzle.resetForActivity?.(activity.code);numberbattle.resetForActivity?.(activity.code);
      // 新活動沿用目前所有遊戲設定；設定本身已由 game-settings 永久保存。
      for(const id of Object.keys(modules)){const saved=gameSettings.get(id);if(saved){try{moduleSetSettings(id,saved);}catch{}}}
      res.json({ok:true,activity});
    }catch(e){res.status(500).json({ok:false,message:'建立新活動失敗：'+e.message});}
  });

  app.get('/api/game-settings/:id',needAdmin,(req,res)=>{try{const id=req.params.id,mod=modules[id];if(!mod?.getSettings)return res.status(404).json({ok:false,message:'找不到遊戲'});res.json({ok:true,settings:moduleGetSettings(id)});}catch(e){res.status(400).json({ok:false,message:e.message});}});
  app.put('/api/game-settings/:id',needAdmin,async(req,res)=>{try{const id=req.params.id,mod=modules[id];if(!mod?.setSettings)return res.status(404).json({ok:false,message:'找不到遊戲'});const settings=moduleSetSettings(id,req.body||{});await gameSettings.set(id,settings);res.json({ok:true,settings});}catch(e){res.status(400).json({ok:false,message:e.message});}});

  app.get('/api/prizes',needAdmin,(req,res)=>res.json({ok:true,...prizes.state(currentCode())}));
  app.get('/api/public/prizes',(req,res)=>{const code=String(req.query.activity||currentCode());if(code!==currentCode())return res.status(404).json({ok:false,message:'活動碼已失效'});res.json({ok:true,...prizes.publicState(code)});});
  app.post('/api/prizes',needAdmin,async(req,res)=>{try{res.json({ok:true,prize:await prizes.addPrize(req.body.name,req.body.quantity,currentCode(),req.body.games)});}catch(e){res.status(400).json({ok:false,message:e.message});}});
  app.put('/api/prizes/:id',needAdmin,async(req,res)=>{try{res.json({ok:true,prize:await prizes.updatePrize(req.params.id,req.body,currentCode())});}catch(e){res.status(400).json({ok:false,message:e.message});}});
  app.delete('/api/prizes/:id',needAdmin,async(req,res)=>{try{await prizes.removePrize(req.params.id,currentCode());res.json({ok:true});}catch(e){res.status(404).json({ok:false,message:e.message});}});
  app.post('/api/c-prizes',needAdmin,async(req,res)=>{try{res.json({ok:true,prize:await prizes.addCPrize(req.body.name,req.body.quantity,req.body.tier,currentCode(),req.body.gameId)});}catch(e){res.status(400).json({ok:false,message:e.message});}});
  app.put('/api/c-prizes/:id',needAdmin,async(req,res)=>{try{res.json({ok:true,prize:await prizes.updateCPrize(req.params.id,req.body,currentCode())});}catch(e){res.status(400).json({ok:false,message:e.message});}});
  app.delete('/api/c-prizes/:id',needAdmin,async(req,res)=>{try{await prizes.removeCPrize(req.params.id,currentCode());res.json({ok:true});}catch(e){res.status(404).json({ok:false,message:e.message});}});
  app.put('/api/prize-settings',needAdmin,async(req,res)=>{try{res.json({ok:true,...await prizes.setSettings(req.body||{},currentCode())});}catch(e){res.status(400).json({ok:false,message:e.message});}});
  app.get('/api/prize-records',needAdmin,(req,res)=>res.json({ok:true,activityCode:currentCode(),records:prizes.state(currentCode()).records}));
  app.get('/api/c-prize-records',needAdmin,(req,res)=>res.json({ok:true,activityCode:currentCode(),records:prizes.state(currentCode()).cRecords}));
  app.delete('/api/prize-records',needAdmin,async(req,res)=>{try{res.json({ok:true,...await prizes.clearRecords(currentCode())});}catch(e){res.status(500).json({ok:false,message:'清除得獎紀錄失敗：'+e.message});}});
  app.delete('/api/player-records',needAdmin,async(req,res)=>{try{await participation.clearActivity(currentCode());await completions.clearActivity(currentCode());res.json({ok:true,activityCode:currentCode(),cleared:true});}catch(e){res.status(500).json({ok:false,message:'清除玩家／完成紀錄失敗：'+e.message});}});
  app.get('/api/public/leaderboard/:gameId',(req,res)=>{const code=String(req.query.activity||currentCode()),gameId=String(req.params.gameId||'');if(code!==currentCode())return res.status(404).json({ok:false,message:'活動碼已失效'});res.set('Cache-Control','no-store');res.json({ok:true,...completions.leaderboard(code,gameId,100)});});
  app.get('/api/participation',needAdmin,(req,res)=>{const code=String(req.query.activity||currentCode()),base=participation.state(code),crows=completions.allPlayerStats(code),map=new Map(crows.map(x=>[`${x.gameId}|${x.player.toLocaleLowerCase()}`,x]));const records=(base.records||[]).map(r=>{const c=map.get(`${r.gameId}|${String(r.player||'').toLocaleLowerCase()}`)||{};return {...r,completions:Number(c.completions)||0,bestElapsedMs:Number(c.bestElapsedMs)||0}});res.json({ok:true,...base,records});});

  app.use(express.static(path.join(__dirname,'public'),{setHeaders(res,file){if(/\.(?:html|js|css)$/i.test(file))res.setHeader('Cache-Control','no-cache, must-revalidate');}}));

  server.listen(PORT,'0.0.0.0',()=>{
    console.log(`小遊戲館 V1.6 數字大亂鬥測試版：http://localhost:${PORT} 目前活動碼 ${currentCode()}`);
    console.log(`資料保存模式：${adapter.persistent?'PostgreSQL 永久資料庫':'本機 JSON（僅供測試）'}`);
    console.log(`紀錄保存政策：活動結束／換新活動碼後保留 ${RECORD_RETENTION_HOURS} 小時，自動清除玩家／完成／得獎紀錄`);
  });

  async function shutdown(){try{await adapter.close();}finally{process.exit(0);}}
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}

main().catch(err=>{console.error('小遊戲館啟動失敗：',err);process.exit(1);});
