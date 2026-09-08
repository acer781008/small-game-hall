const express = require("express");
const path = require("path");
const crypto = require("crypto");

module.exports = function initBingo({app, io, isAdmin, awardPrize, isGameEnabled=()=>true, isActivityCurrent=()=>true, isActivityOpen=()=>true}) {
const rooms = new Map();
const timers = new Map();
function generateRoomId(){let id;do{id=String(Math.floor(100000+Math.random()*900000));}while(rooms.has(id));return id;}
function getTimers(id){if(!timers.has(id))timers.set(id,{});return timers.get(id);}
function clearTimers(id){const t=getTimers(id);Object.values(t).forEach(v=>{clearTimeout(v);clearInterval(v)});timers.set(id,{});}
function onlinePlayerCount(room){return [...room.players.values()].filter(p=>p.socketId&&io.sockets.sockets.has(p.socketId)).length;}
function emitPlayerCount(room){io.to(room.id).emit('playerCountUpdate',{roomId:room.id,playerCount:onlinePlayerCount(room)});}
function ranking(room){return [...room.players.values()].sort((a,b)=>(b.successCount-a.successCount)||((a.bestCompletionMs||Infinity)-(b.bestCompletionMs||Infinity))||(a.gamesPlayed-b.gamesPlayed)||(a.lastSubmitAt-b.lastSubmitAt)).map((p,i)=>({rank:i+1,name:p.name,gamesPlayed:p.gamesPlayed,successCount:p.successCount||0,bestCompletionMs:p.bestCompletionMs||0,prizeClaimCount:p.prizeClaimCount||0,status:p.activeRun?'遊戲中':'等待中'}));}
function emitRanking(room){io.to(room.id).emit('rankingUpdate',ranking(room));}
const FARM_DUPLICATE_GROUPS=[["farm-046","farm-131"],["farm-047","farm-132"],["farm-048","farm-099","farm-133"],["farm-049","farm-050"],["farm-101","farm-102"],["farm-123","farm-126"]];
function pickFarmItems(count){const groupById=new Map();FARM_DUPLICATE_GROUPS.forEach((g,i)=>g.forEach(id=>groupById.set(id,'dup-'+i)));const shuffled=FARM_ITEMS.slice().sort(()=>Math.random()-.5),used=new Set(),picked=[];for(const item of shuffled){const key=groupById.get(item.id)||item.id;if(used.has(key))continue;used.add(key);picked.push(item);if(picked.length>=count)break;}return picked;}

function roomInfo(room){return {roomId:room.id,controlMode:room.controlMode||'admin',version:room.version,theme:room.theme,playMode:room.playMode,items:room.items,size:room.size,phase:room.phase,timeLimitEnabled:room.timeLimitEnabled,gameSeconds:room.gameSeconds,drawIntervalMs:room.drawIntervalMs,targetLines:1,note:room.note,maxPlays:room.maxPlays||0,startCount:room.startCount||0,finishCount:room.finishCount||0};}
function ensureRoom(roomId){roomId=String(roomId||'').trim();if(!roomId)return null;if(rooms.has(roomId))return rooms.get(roomId);const size=25,version='farm',playMode='normal';const room={id:roomId,controlMode:'admin',version,theme:'farm',playMode,items:pickFarmItems(size),size,phase:'playing',timeLimitEnabled:true,gameSeconds:90,drawIntervalMs:4000,targetLines:1,note:'',maxPlays:1,players:new Map(),startCount:0,finishCount:0};rooms.set(roomId,room);return room;}
function hallGetSettings(roomId){const r=ensureRoom(roomId);return r?roomInfo(r):null;}
function hallSetSettings(roomId,patch={}){const room=ensureRoom(roomId);const size=[25,36,49,64].includes(Number(patch.size))?Number(patch.size):room.size;const version=['number','picture','farm'].includes(patch.version)?patch.version:room.version;const playMode=['normal','advanced'].includes(patch.playMode)?patch.playMode:room.playMode;if(version==='picture'&&![25,36].includes(size))throw new Error('麻將版目前只開放 5×5、6×6');room.version=version;room.theme=version==='picture'?'mahjong':version==='farm'?'farm':null;room.playMode=playMode;room.size=size;room.gameSeconds=Math.max(30,Number(patch.gameSeconds||room.gameSeconds||90));room.drawIntervalMs=Math.max(1000,Number(patch.drawIntervalMs||room.drawIntervalMs||4000));room.maxPlays=Math.max(0,Number(patch.maxPlays??room.maxPlays)||0);let items=null;if(version==='picture'){const shuffled=MAHJONG_ITEMS.slice().sort(()=>Math.random()-.5);items=playMode==='normal'?shuffled.slice(0,size):MAHJONG_ITEMS.slice();}if(version==='farm'){const poolSize=playMode==='normal'?size:({25:45,36:60,49:75,64:90}[size]||45);items=pickFarmItems(poolSize);}room.items=items;io.to(room.id).emit('roomState',{...roomInfo(room),ranking:ranking(room),playerCount:onlinePlayerCount(room)});return roomInfo(room);}
function openActivity(room){if(!room||room.phase!=='waiting')return;room.phase='playing';io.to(room.id).emit('activityOpened',{activityEndsAt:room.activityEndsAt});}
function endActivity(room){if(!room||room.phase==='ended')return;room.phase='ended';room.endedAt=Date.now();io.to(room.id).emit('activityEnded',{ranking:ranking(room)});}
function scheduleRoom(room){clearTimers(room.id);const t=getTimers(room.id);if(room.scheduledAt) t.start=setTimeout(()=>openActivity(room),Math.max(0,room.scheduledAt-Date.now()));if(room.activityEndsAt)t.end=setTimeout(()=>endActivity(room),Math.max(0,room.activityEndsAt-Date.now()));}


const MAHJONG_ITEMS = [
  {id:"white",face:"白",group:"字",name:"白",file:"01-white-dragon.svg"},
  {id:"green",face:"發",group:"字",name:"發",file:"02-green-dragon.svg"},
  {id:"red",face:"中",group:"字",name:"中",file:"03-red-dragon.svg"},
  {id:"east",face:"東",group:"字",name:"東",file:"04-east-wind.svg"},
  {id:"south",face:"南",group:"字",name:"南",file:"05-south-wind.svg"},
  {id:"west",face:"西",group:"字",name:"西",file:"06-west-wind.svg"},
  {id:"north",face:"北",group:"字",name:"北",file:"07-north-wind.svg"},
  {id:"wan1",face:"1萬",group:"萬",name:"1萬",file:"08-characters-1.svg"},
  {id:"wan2",face:"2萬",group:"萬",name:"2萬",file:"09-characters-2.svg"},
  {id:"wan3",face:"3萬",group:"萬",name:"3萬",file:"10-characters-3.svg"},
  {id:"wan4",face:"4萬",group:"萬",name:"4萬",file:"11-characters-4.svg"},
  {id:"wan5",face:"5萬",group:"萬",name:"5萬",file:"12-characters-5.svg"},
  {id:"wan6",face:"6萬",group:"萬",name:"6萬",file:"13-characters-6.svg"},
  {id:"tong1",face:"1筒",group:"筒",name:"1筒",file:"17-circles-1.svg"},
  {id:"tong2",face:"2筒",group:"筒",name:"2筒",file:"18-circles-2.svg"},
  {id:"tong3",face:"3筒",group:"筒",name:"3筒",file:"19-circles-3.svg"},
  {id:"tong4",face:"4筒",group:"筒",name:"4筒",file:"20-circles-4.svg"},
  {id:"tong5",face:"5筒",group:"筒",name:"5筒",file:"21-circles-5.svg"},
  {id:"tong6",face:"6筒",group:"筒",name:"6筒",file:"22-circles-6.svg"},
  {id:"tiao1",face:"1條",group:"條",name:"1條",file:"26-bamboos-1.svg"},
  {id:"tiao2",face:"2條",group:"條",name:"2條",file:"27-bamboos-2.svg"},
  {id:"tiao3",face:"3條",group:"條",name:"3條",file:"28-bamboos-3.svg"},
  {id:"tiao4",face:"4條",group:"條",name:"4條",file:"29-bamboos-4.svg"},
  {id:"tiao5",face:"5條",group:"條",name:"5條",file:"30-bamboos-5.svg"},
  {id:"tiao6",face:"6條",group:"條",name:"6條",file:"31-bamboos-6.svg"},
  {id:"wan7",face:"7萬",group:"萬",name:"7萬",file:"14-characters-7.svg"},
  {id:"wan8",face:"8萬",group:"萬",name:"8萬",file:"15-characters-8.svg"},
  {id:"wan9",face:"9萬",group:"萬",name:"9萬",file:"16-characters-9.svg"},
  {id:"tong7",face:"7筒",group:"筒",name:"7筒",file:"23-circles-7.svg"},
  {id:"tong8",face:"8筒",group:"筒",name:"8筒",file:"24-circles-8.svg"},
  {id:"tong9",face:"9筒",group:"筒",name:"9筒",file:"25-circles-9.svg"},
  {id:"tiao7",face:"7條",group:"條",name:"7條",file:"32-bamboos-7.svg"},
  {id:"tiao8",face:"8條",group:"條",name:"8條",file:"33-bamboos-8.svg"},
  {id:"tiao9",face:"9條",group:"條",name:"9條",file:"34-bamboos-9.svg"},
  {id:"spring",face:"春",group:"花",name:"春",file:"35-spring.svg"},
  {id:"summer",face:"夏",group:"花",name:"夏",file:"36-summer.svg"},
  {id:"autumn",face:"秋",group:"花",name:"秋",file:"37-autumn.svg"},
  {id:"winter",face:"冬",group:"花",name:"冬",file:"38-winter.svg"},
  {id:"plum",face:"梅",group:"花",name:"梅",file:"39-plum.svg"},
  {id:"orchid",face:"蘭",group:"花",name:"蘭",file:"40-orchid.svg"},
  {id:"chrysanthemum",face:"菊",group:"花",name:"菊",file:"41-chrysanthemum.svg"},
  {id:"bambooFlower",face:"竹",group:"花",name:"竹",file:"42-bamboo.svg"}
];

const FARM_ITEMS = Array.from({length: 144}, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  return { id: `farm-${n}`, face: n, group: "farm", name: `圖案 ${n}`, file: `farm-${n}.png` };
});


app.get('/api/admin/new-room-id',(req,res)=>{if(!isAdmin(req))return res.status(401).json({success:false,message:'未登入管理員'});res.json({success:true,roomId:generateRoomId()});});
app.post('/api/admin/create-room',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({success:false,message:'未登入管理員'});
  const roomId=String(req.body.roomId||generateRoomId()).trim();
  const size=Number(req.body.size);const version=['number','picture','farm'].includes(req.body.version)?req.body.version:'farm';
  const controlMode='admin';
  const playMode=['normal','advanced'].includes(req.body.playMode)?req.body.playMode:'normal';
  const timeLimitEnabled=true;const gameSeconds=Math.max(30,Number(req.body.gameSeconds||90));const drawIntervalMs=Number(req.body.drawIntervalMs||4000);const targetLines=1;const note=String(req.body.note||'').trim();const maxPlays=Math.max(0,Number(req.body.maxPlays)||0);
  if(!roomId||rooms.has(roomId))return res.status(400).json({success:false,message:rooms.has(roomId)?'房間號碼已存在':'房間號碼錯誤'});
  if(![25,36,49,64].includes(size))return res.status(400).json({success:false,message:'盤面格數錯誤'});
  if(version==='picture'&&![25,36].includes(size))return res.status(400).json({success:false,message:'麻將版目前只開放 5×5、6×6'});
  const theme=version==='picture'?'mahjong':version==='farm'?'farm':null;
  let items=null;
  if(version==='picture'){const shuffled=MAHJONG_ITEMS.slice().sort(()=>Math.random()-.5);items=playMode==='normal'?shuffled.slice(0,size):MAHJONG_ITEMS.slice();}
  if(version==='farm'){const poolSize=playMode==='normal'?size:({25:45,36:60,49:75,64:90}[size]||45);items=pickFarmItems(poolSize);}
  const room={id:roomId,controlMode,version,theme,playMode,items,size,phase:'playing',timeLimitEnabled,gameSeconds,drawIntervalMs,targetLines,note,maxPlays,players:new Map(),startCount:0,finishCount:0};
  rooms.set(roomId,room);res.json({success:true,room:roomInfo(room)});
});
app.put('/api/admin/room/:roomId',(req,res)=>{
  if(!isAdmin(req))return res.status(401).json({success:false,message:'未登入管理員'});
  const room=rooms.get(String(req.params.roomId||'').trim());if(!room)return res.status(404).json({success:false,message:'找不到房間'});
  const size=Number(req.body.size);const version=['number','picture','farm'].includes(req.body.version)?req.body.version:room.version;const controlMode='admin';const playMode=['normal','advanced'].includes(req.body.playMode)?req.body.playMode:room.playMode;const targetLines=1;
  if(![25,36,49,64].includes(size))return res.status(400).json({success:false,message:'盤面格數錯誤'});if(version==='picture'&&![25,36].includes(size))return res.status(400).json({success:false,message:'麻將版目前只開放 5×5、6×6'});
  room.controlMode=controlMode;room.version=version;room.theme=version==='picture'?'mahjong':version==='farm'?'farm':null;room.playMode=playMode;room.size=size;room.targetLines=targetLines;room.timeLimitEnabled=true;room.gameSeconds=Math.max(30,Number(req.body.gameSeconds||90));room.drawIntervalMs=Number(req.body.drawIntervalMs||4000);room.note=String(req.body.note||'').trim();room.maxPlays=Math.max(0,Number(req.body.maxPlays)||0);
  let items=null;if(version==='picture'){const shuffled=MAHJONG_ITEMS.slice().sort(()=>Math.random()-.5);items=playMode==='normal'?shuffled.slice(0,size):MAHJONG_ITEMS.slice();}if(version==='farm'){const poolSize=playMode==='normal'?size:({25:45,36:60,49:75,64:90}[size]||45);items=pickFarmItems(poolSize);}room.items=items;
  io.to(room.id).emit('roomState',{...roomInfo(room),ranking:ranking(room),playerCount:onlinePlayerCount(room)});res.json({success:true,room:roomInfo(room)});
});
app.get('/api/admin/room/:roomId',(req,res)=>{if(!isAdmin(req))return res.status(401).json({success:false,message:'未登入管理員'});const room=rooms.get(String(req.params.roomId||'').trim());if(!room)return res.status(404).json({success:false,message:'找不到房間'});res.json({success:true,room:{...roomInfo(room),playerCount:onlinePlayerCount(room),ranking:ranking(room)}});});
app.delete('/api/admin/room/:roomId',(req,res)=>{if(!isAdmin(req))return res.status(401).json({success:false,message:'未登入管理員'});const id=String(req.params.roomId||'').trim();if(!rooms.has(id))return res.status(404).json({success:false,message:'找不到房間'});io.to(id).emit('roomDeleted');rooms.delete(id);res.json({success:true});});

// 共用獎品控制室接口：遊戲只提供是否完成、遊玩次數與完成時間；不使用積分。
app.get('/api/game-result/:roomId/:clientId',(req,res)=>{
  const room=rooms.get(String(req.params.roomId||'').trim());
  const player=room?.players.get(String(req.params.clientId||'').trim());
  if(!room||!player)return res.status(404).json({success:false,message:'找不到玩家成績'});
  res.json({success:true,game:'bingo',roomId:room.id,clientId:player.clientId,name:player.name,gamesPlayed:player.gamesPlayed,successCount:player.successCount||0,maxPlays:room.maxPlays||0,lastCompleted:!!player.lastCompleted,lastCompletionMs:player.lastCompletionMs||0,bestCompletionMs:player.bestCompletionMs||0,prizeClaimCount:player.prizeClaimCount||0});
});
app.post('/api/prize/award',(req,res)=>{
  const room=rooms.get(String(req.body.roomId||'').trim());
  if(!room)return res.status(404).json({success:false,message:'找不到房間'});
  let player=null;
  const clientId=String(req.body.clientId||'').trim();
  if(clientId)player=room.players.get(clientId);
  if(!player){const name=String(req.body.name||'').trim();player=[...room.players.values()].find(p=>p.name===name);}
  if(!player)return res.status(404).json({success:false,message:'找不到玩家'});
  const status=['awarded','out_of_stock','limit_reached'].includes(req.body.status)?req.body.status:'awarded';
  const maxClaimsPerPlayer=Math.max(0,Number(req.body.maxClaimsPerPlayer)||0);
  player.prizeClaimCount=player.prizeClaimCount||0;
  if(status==='awarded'&&maxClaimsPerPlayer>0&&player.prizeClaimCount>=maxClaimsPerPlayer){const result={status:'limit_reached',message:'已達每位玩家可領獎次數上限',prizeClaimCount:player.prizeClaimCount,maxClaimsPerPlayer};if(player.socketId)io.to(player.socketId).emit('prizeResult',result);return res.json({success:true,player:{clientId:player.clientId,name:player.name},result});}
  const result={status,prizeName:String(req.body.prizeName||'').trim()||'獎品',prizeNote:String(req.body.prizeNote||'').trim(),message:String(req.body.message||'').trim(),maxClaimsPerPlayer,awardedAt:Date.now()};
  if(status==='awarded'){player.prizeClaimCount+=1;player.latestPrize=result;}
  result.prizeClaimCount=player.prizeClaimCount;
  if(player.socketId)io.to(player.socketId).emit('prizeResult',result);
  res.json({success:true,player:{clientId:player.clientId,name:player.name},result});
});

app.use('/games/bingo', express.static(path.join(__dirname,'public'),{maxAge:'7d',etag:true,immutable:false}));
io.on('connection',socket=>{
  socket.on('watchRoom',({roomId})=>{const room=rooms.get(String(roomId||'').trim());if(!room)return;socket.join(room.id);socket.emit('roomState',{...roomInfo(room),ranking:ranking(room),playerCount:onlinePlayerCount(room)});});
  socket.on('joinRoom',({roomId,name,clientId})=>{if(!isGameEnabled('bingo'))return socket.emit('joinError','賓果目前未開放');if(!isActivityCurrent(roomId))return socket.emit('joinError','這個活動碼已失效');const room=rooms.get(String(roomId||'').trim());const cleanName=String(name||'').trim(),cleanClientId=String(clientId||'').trim();if(!room)return socket.emit('joinError','找不到這個房間');if(!cleanName)return socket.emit('joinError','請輸入玩家名稱');if(!cleanClientId)return socket.emit('joinError','玩家識別資料遺失');for(const [id,p] of room.players.entries())if(id!==cleanClientId&&p.name===cleanName)return socket.emit('joinError','這個玩家名稱已有人使用');const player=room.players.get(cleanClientId)||{clientId:cleanClientId,name:cleanName,gamesPlayed:0,lastSubmitAt:0,successCount:0,activeRun:null,latestPrize:null,lastCompleted:false,lastCompletionMs:0,bestCompletionMs:0,prizeClaimCount:0};player.name=cleanName;player.socketId=socket.id;room.players.set(cleanClientId,player);socket.data.roomId=room.id;socket.data.clientId=cleanClientId;socket.join(room.id);socket.emit('joinSuccess',{...roomInfo(room),name:player.name,gamesPlayed:player.gamesPlayed,successCount:player.successCount||0,bestCompletionMs:player.bestCompletionMs||0,prizeClaimCount:player.prizeClaimCount||0,latestPrize:player.latestPrize||null});emitPlayerCount(room);emitRanking(room);});
  socket.on('beginRun',()=>{if(!isGameEnabled('bingo'))return socket.emit('runDenied','賓果目前未開放');if(!isActivityCurrent(socket.data.roomId))return socket.emit('runDenied','活動已切換，請返回小遊戲館');if(!isActivityOpen(socket.data.roomId))return socket.emit('runDenied','目前不在活動開放時間');const room=rooms.get(socket.data.roomId),player=room?.players.get(socket.data.clientId);if(!room||!player)return;if(player.activeRun)return socket.emit('runDenied','目前已有一局進行中');if(room.maxPlays>0&&player.gamesPlayed>=room.maxPlays)return socket.emit('runDenied','已達可玩次數上限');let version=room.version,size=room.size,playMode=room.playMode;const theme=version==='picture'?'mahjong':version==='farm'?'farm':null;let items=null;if(version==='picture'){const shuffled=MAHJONG_ITEMS.slice().sort(()=>Math.random()-.5);items=playMode==='normal'?shuffled.slice(0,size):MAHJONG_ITEMS.slice();}if(version==='farm'){const poolSize=playMode==='normal'?size:({25:45,36:60,49:75,64:90}[size]||45);items=pickFarmItems(poolSize);}const runId=crypto.randomBytes(12).toString('hex');player.activeRun={id:runId,startedAt:Date.now(),size,version,playMode};room.startCount=(room.startCount||0)+1;socket.emit('runAuthorized',{runId,startedAt:player.activeRun.startedAt,size,version,playMode,theme,items});io.to(room.id).emit('roomStatsUpdate',{startCount:room.startCount,finishCount:room.finishCount||0});emitRanking(room);});
  socket.on('submitRun',async data=>{if(!isActivityCurrent(socket.data.roomId))return socket.emit('runDenied','活動已切換，本局不再發獎');const room=rooms.get(socket.data.roomId),player=room?.players.get(socket.data.clientId);if(!room||!player||!player.activeRun||player.activeRun.id!==data?.runId)return;const lines=Math.max(0,Number(data.bingoLines)||0);const elapsedMs=Math.max(0,Date.now()-player.activeRun.startedAt);const completed=lines>=1&&elapsedMs<=Math.max(30,Number(room.gameSeconds||90))*1000;player.gamesPlayed+=1;if(completed){player.successCount=(player.successCount||0)+1;player.lastCompletionMs=elapsedMs;player.bestCompletionMs=!player.bestCompletionMs?elapsedMs:Math.min(player.bestCompletionMs,elapsedMs);}else player.lastCompletionMs=0;player.lastCompleted=completed;player.lastSubmitAt=Date.now();player.activeRun=null;if(completed)room.finishCount=(room.finishCount||0)+1;socket.emit('runSaved',{gamesPlayed:player.gamesPlayed,completed,maxPlays:room.maxPlays||0,completionMs:completed?elapsedMs:0,bestCompletionMs:player.bestCompletionMs||0,successCount:player.successCount||0,prizeClaimCount:player.prizeClaimCount||0});if(completed){const prize=await awardPrize({game:'賓果',playerName:player.name,playerKey:player.name,gameRef:room.id});player.prizeClaimCount=Number(prize.prizeClaimCount||player.prizeClaimCount||0);socket.emit('prizeResult',prize);}io.to(room.id).emit('roomStatsUpdate',{startCount:room.startCount||0,finishCount:room.finishCount||0});emitRanking(room);});
  socket.on('disconnect',()=>{const room=rooms.get(socket.data.roomId);if(room){const p=room.players.get(socket.data.clientId);if(p&&p.socketId===socket.id)p.socketId=null;emitPlayerCount(room);}});
});
return {rooms,ensureRoom,getSettings:hallGetSettings,setSettings:hallSetSettings};
};
