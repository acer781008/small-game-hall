const fs=require('fs');
const path=require('path');
module.exports=function createActivityStore(file){
  const defaults=()=>({code:'',note:'',createdAt:Date.now(),startAt:null,endAt:null,games:{bingo:true,sudoku:true,memory:true,shelf:true}});
  let data={currentCode:'',activities:{}};
  try{data={...data,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}
  data.activities=data.activities&&typeof data.activities==='object'?data.activities:{};
  function save(){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));}
  function gen(){let c;do{c=String(Math.floor(100000+Math.random()*900000));}while(data.activities[c]);return c;}
  function normalize(a){
    a={...defaults(),...(a||{})};
    a.startAt=Number.isFinite(Number(a.startAt))&&Number(a.startAt)>0?Number(a.startAt):null;
    a.endAt=Number.isFinite(Number(a.endAt))&&Number(a.endAt)>0?Number(a.endAt):null;
    a.games=a.games&&typeof a.games==='object'?a.games:{};
    for(const id of ['bingo','sudoku','memory','shelf'])if(!(id in a.games))a.games[id]=true;
    return a;
  }
  function ensureCurrent(){
    if(!data.currentCode||!data.activities[data.currentCode]){const code=gen();data.activities[code]={...defaults(),code};data.currentCode=code;save();}
    data.activities[data.currentCode]=normalize(data.activities[data.currentCode]);
    return data.activities[data.currentCode];
  }
  function current(){return JSON.parse(JSON.stringify(ensureCurrent()));}
  function currentCode(){return ensureCurrent().code;}
  function create(){const code=gen();data.activities[code]={...defaults(),code};data.currentCode=code;save();return current();}
  function update(patch={}){
    const a=ensureCurrent();
    if(patch.note!==undefined)a.note=String(patch.note||'').slice(0,500);
    if(patch.startAt!==undefined)a.startAt=Number(patch.startAt)>0?Number(patch.startAt):null;
    if(patch.endAt!==undefined)a.endAt=Number(patch.endAt)>0?Number(patch.endAt):null;
    if(a.startAt&&a.endAt&&a.endAt<=a.startAt)throw new Error('結束時間必須晚於開賽時間');
    if(patch.games&&typeof patch.games==='object')for(const id of ['bingo','sudoku','memory','shelf'])if(id in patch.games)a.games[id]=patch.games[id]!==false;
    save();return current();
  }
  function get(code){const a=data.activities[String(code||'')];return a?JSON.parse(JSON.stringify(normalize(a))):null;}
  function isCurrent(code){return String(code||'')===currentCode();}
  function status(code=currentCode(),now=Date.now()){
    const a=get(code);if(!a||!isCurrent(code))return {state:'invalid',open:false,message:'活動碼已失效'};
    if(a.startAt&&now<a.startAt)return {state:'scheduled',open:false,startAt:a.startAt,endAt:a.endAt,message:'活動尚未開始'};
    if(a.endAt&&now>=a.endAt)return {state:'ended',open:false,startAt:a.startAt,endAt:a.endAt,message:'活動已結束'};
    return {state:'open',open:true,startAt:a.startAt,endAt:a.endAt,message:'活動進行中'};
  }
  function isOpen(code=currentCode()){return status(code).open;}
  function isGameEnabled(id){return ensureCurrent().games[id]!==false;}
  ensureCurrent();
  return {current,currentCode,create,update,get,isCurrent,status,isOpen,isGameEnabled};
};
