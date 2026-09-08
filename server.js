const fs=require('fs');
const path=require('path');
if(!process.env.ADMIN_PASSWORD){try{const env=fs.readFileSync(path.join(__dirname,'.env'),'utf8');for(const line of env.split(/\r?\n/)){const m=line.match(/^\s*ADMIN_PASSWORD\s*=\s*(.*)\s*$/);if(m){process.env.ADMIN_PASSWORD=m[1].replace(/^['"]|['"]$/g,'');break}}}catch{}}
const express=require('express');
const http=require('http');
const crypto=require('crypto');
const {Server}=require('socket.io');
const createActivityStore=require('./lib/activity-store');
const createPrizeStore=require('./lib/prize-store');
const app=express();
const server=http.createServer(app);
const io=new Server(server);
const PORT=process.env.PORT||3000;
const sessions=new Set();
const ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||'');
function verifyPassword(password){
  if(!ADMIN_PASSWORD)return false;
  const a=Buffer.from(String(password||''));
  const b=Buffer.from(ADMIN_PASSWORD);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function createAdminSession(res){const t=crypto.randomBytes(24).toString('hex');sessions.add(t);res.setHeader('Set-Cookie',`admin_session=${t}; HttpOnly; Path=/; SameSite=Lax`);return t}
const activities=createActivityStore(path.join(__dirname,'data','activities.json'));
const prizes=createPrizeStore(path.join(__dirname,'data','store.json'),()=>activities.currentCode());
app.use(express.json({limit:'500kb'}));
function cookies(req){const out={};String(req.headers.cookie||'').split(';').forEach(x=>{const i=x.indexOf('=');if(i>0)out[x.slice(0,i).trim()]=x.slice(i+1).trim()});return out}
function isAdmin(req){const t=cookies(req).admin_session;return !!t&&sessions.has(t)}
function needAdmin(req,res,next){if(!isAdmin(req))return res.status(401).json({ok:false,success:false,message:'請先登入主控'});next()}
function gameEnabled(id){return activities.isGameEnabled(id)}
function currentCode(){return activities.currentCode()}
function activityOpen(code=currentCode()){return activities.isOpen(code)}
function awardPrize(payload){if(!activityOpen(payload?.activityCode||currentCode()))return {status:'activity_closed'};return prizes.award({...payload,activityCode:currentCode()})}

app.post('/api/admin/login',(req,res)=>{
  if(!ADMIN_PASSWORD)return res.status(503).json({ok:false,success:false,message:'尚未設定主控密碼，請在部署環境設定 ADMIN_PASSWORD'});
  if(!verifyPassword(req.body.password))return res.status(401).json({ok:false,success:false,message:'主控密碼錯誤'});
  createAdminSession(res);
  res.json({ok:true,success:true});
});
app.get('/api/admin/status',(req,res)=>res.json({ok:isAdmin(req)}));
app.post('/api/admin/logout',(req,res)=>{const t=cookies(req).admin_session;if(t)sessions.delete(t);res.setHeader('Set-Cookie','admin_session=; Max-Age=0; Path=/');res.json({ok:true})});

// 主控頁保護：只登入一次，之後所有遊戲設定都共用同一個登入狀態。
app.get('/admin.html',(req,res)=>isAdmin(req)?res.sendFile(path.join(__dirname,'public','admin.html')):res.redirect('/admin-login.html'));
for(const id of ['bingo','sudoku','memory','shelf'])app.get(`/games/${id}/admin.html`,(req,res)=>isAdmin(req)?res.sendFile(path.join(__dirname,'games',id,'public','admin.html')):res.redirect('/admin-login.html'));

// 共用活動碼／共用備註／遊戲開關。
app.get('/api/activity',(req,res)=>res.json({ok:true,activity:activities.current(),status:activities.status()}));
app.get('/api/activity/check/:code',(req,res)=>{const a=activities.get(req.params.code);res.json({ok:!!a&&activities.isCurrent(req.params.code),activity:a&&activities.isCurrent(req.params.code)?a:null})});
app.put('/api/activity',needAdmin,(req,res)=>{try{res.json({ok:true,activity:activities.update(req.body||{}),status:activities.status()})}catch(e){res.status(400).json({ok:false,message:e.message})}});

// 玩家直接貼舊網址或關閉遊戲時擋住入口。
function guardEntry(id,entry){return (req,res,next)=>{if(isAdmin(req))return next();if(!gameEnabled(id))return res.status(403).send(blocked('此遊戲目前未開放'));if(req.path===entry){const code=String(req.query.activity||req.query.room||'');if(code&&code!==currentCode())return res.status(403).send(blocked('這個活動碼已不是目前活動'));const st=activities.status(code||currentCode());if(!st.open)return res.status(403).send(blocked(st.state==='scheduled'?'活動尚未開始':'活動已結束'));}next()}}
function blocked(msg){return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小遊戲館</title><body style="font-family:system-ui;text-align:center;padding:42px"><h2>${msg}</h2><p><a href="/?activity=${currentCode()}">返回小遊戲館</a></p></body>`}
app.use('/games/bingo',guardEntry('bingo','/index.html'));
app.use('/games/sudoku',guardEntry('sudoku','/player.html'));
app.use('/games/memory',guardEntry('memory','/player.html'));
app.use('/games/shelf',guardEntry('shelf','/player.html'));

// 遊戲模組。
const bingo=require('./games/bingo/backend')({app,io,isAdmin,awardPrize,isGameEnabled:gameEnabled,isActivityCurrent:code=>activities.isCurrent(code),isActivityOpen:code=>activities.isOpen(code)});
const sudoku=require('./games/sudoku/backend')({app,io,isAdmin,awardPrize,isGameEnabled:gameEnabled,getActivityCode:currentCode,isActivityOpen:code=>activities.isOpen(code)});
const memory=require('./games/memory/backend')({app,io,isAdmin,awardPrize,isGameEnabled:gameEnabled,getActivityCode:currentCode,isActivityOpen:code=>activities.isOpen(code)});
const shelf=require('./games/shelf/backend')({app,io,isAdmin,awardPrize,isGameEnabled:gameEnabled,getActivityCode:currentCode,isActivityOpen:code=>activities.isOpen(code)});
function ensureCurrentGames(){const c=currentCode();bingo.ensureRoom(c);memory.ensureRoom(c);shelf.ensureRoom(c)}
ensureCurrentGames();

app.post('/api/activity/new',needAdmin,(req,res)=>{const activity=activities.create();bingo.ensureRoom(activity.code);sudoku.resetForActivity?.();memory.resetForActivity?.(activity.code);shelf.resetForActivity?.(activity.code);res.json({ok:true,activity})});

// 每款遊戲只保留自己專屬的玩法設定，不再有房號／活動狀態／備註。
app.get('/api/game-settings/:id',needAdmin,(req,res)=>{try{const id=req.params.id;const mod={bingo,sudoku,memory,shelf}[id];if(!mod?.getSettings)return res.status(404).json({ok:false,message:'找不到遊戲'});res.json({ok:true,settings:id==='bingo'?mod.getSettings(currentCode()):mod.getSettings()})}catch(e){res.status(400).json({ok:false,message:e.message})}});
app.put('/api/game-settings/:id',needAdmin,(req,res)=>{try{const id=req.params.id;const mod={bingo,sudoku,memory,shelf}[id];if(!mod?.setSettings)return res.status(404).json({ok:false,message:'找不到遊戲'});const settings=id==='bingo'?mod.setSettings(currentCode(),req.body||{}):mod.setSettings(req.body||{});res.json({ok:true,settings})}catch(e){res.status(400).json({ok:false,message:e.message})}});

// 共用獎品池：每個活動碼各自一份。
app.get('/api/prizes',needAdmin,(req,res)=>res.json({ok:true,...prizes.state(currentCode())}));
app.post('/api/prizes',needAdmin,(req,res)=>{try{res.json({ok:true,prize:prizes.addPrize(req.body.name,req.body.quantity,currentCode())})}catch(e){res.status(400).json({ok:false,message:e.message})}});
app.put('/api/prizes/:id',needAdmin,(req,res)=>{try{res.json({ok:true,prize:prizes.updatePrize(req.params.id,req.body,currentCode())})}catch(e){res.status(400).json({ok:false,message:e.message})}});
app.delete('/api/prizes/:id',needAdmin,(req,res)=>{try{prizes.removePrize(req.params.id,currentCode());res.json({ok:true})}catch(e){res.status(404).json({ok:false,message:e.message})}});
app.put('/api/prize-settings',needAdmin,(req,res)=>res.json({ok:true,...prizes.setMaxClaims(req.body.maxClaimsPerPlayer,currentCode())}));
app.get('/api/prize-records',needAdmin,(req,res)=>res.json({ok:true,activityCode:currentCode(),records:prizes.state(currentCode()).records}));

app.use(express.static(path.join(__dirname,'public')));
server.listen(PORT,'0.0.0.0',()=>console.log(`小遊戲館 V0.9：http://localhost:${PORT} 目前活動碼 ${currentCode()}`));
