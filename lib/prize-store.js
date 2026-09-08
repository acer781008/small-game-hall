const fs=require('fs');
const path=require('path');
module.exports=function createPrizeStore(file,getCurrentActivityCode){
  const fresh=()=>({maxClaimsPerPlayer:1,prizes:[],records:[],claims:{}});
  let data={activities:{}};
  try{data={...data,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}
  data.activities=data.activities&&typeof data.activities==='object'?data.activities:{};
  function code(c){return String(c||getCurrentActivityCode?.()||'').trim();}
  function bucket(c){c=code(c);if(!data.activities[c])data.activities[c]=fresh();const b=data.activities[c];b.prizes=Array.isArray(b.prizes)?b.prizes:[];b.records=Array.isArray(b.records)?b.records:[];b.claims=b.claims&&typeof b.claims==='object'?b.claims:{};return b;}
  function save(){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));}
  function cleanPrize(p){return {id:p.id,name:p.name,quantity:p.quantity,enabled:p.enabled!==false};}
  function state(c){const b=bucket(c);return {activityCode:code(c),maxClaimsPerPlayer:Number(b.maxClaimsPerPlayer)||0,prizes:b.prizes.map(cleanPrize),records:b.records.slice().reverse()};}
  function setMaxClaims(n,c){const b=bucket(c);b.maxClaimsPerPlayer=Math.max(0,Math.floor(Number(n)||0));save();return state(c);}
  function addPrize(name,quantity,c){const b=bucket(c);name=String(name||'').trim().slice(0,80);quantity=Math.max(0,Math.floor(Number(quantity)||0));if(!name)throw new Error('請輸入獎品名稱');const p={id:`p_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,quantity,enabled:true};b.prizes.push(p);save();return cleanPrize(p);}
  function updatePrize(id,patch={},c){const b=bucket(c);const p=b.prizes.find(x=>x.id===id);if(!p)throw new Error('找不到獎品');if(patch.name!==undefined){const name=String(patch.name||'').trim().slice(0,80);if(!name)throw new Error('獎品名稱不可空白');p.name=name;}if(patch.quantity!==undefined)p.quantity=Math.max(0,Math.floor(Number(patch.quantity)||0));if(patch.enabled!==undefined)p.enabled=patch.enabled!==false;save();return cleanPrize(p);}
  function removePrize(id,c){const b=bucket(c);const i=b.prizes.findIndex(x=>x.id===id);if(i<0)throw new Error('找不到獎品');b.prizes.splice(i,1);save();}
  function award({activityCode,game,playerName,playerKey,gameRef}){const c=code(activityCode),b=bucket(c);const key=String(playerKey||playerName||'').trim().toLocaleLowerCase();const count=Number(b.claims[key]||0);const max=Math.max(0,Number(b.maxClaimsPerPlayer)||0);if(max>0&&count>=max)return {status:'limit_reached',prizeClaimCount:count,maxClaimsPerPlayer:max};const available=b.prizes.filter(p=>p.enabled!==false&&Number(p.quantity)>0);const total=available.reduce((s,p)=>s+Number(p.quantity||0),0);if(total<=0)return {status:'out_of_stock',prizeClaimCount:count,maxClaimsPerPlayer:max};let r=Math.floor(Math.random()*total),picked=available[0];for(const p of available){if(r<Number(p.quantity)){picked=p;break}r-=Number(p.quantity)}picked.quantity-=1;b.claims[key]=count+1;const rec={id:`r_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,activityCode:c,player:String(playerName||'玩家').trim()||'玩家',game:String(game||''),prize:picked.name,gameRef:String(gameRef||''),awardedAt:Date.now()};b.records.push(rec);if(b.records.length>5000)b.records=b.records.slice(-5000);save();return {status:'awarded',prizeName:picked.name,prizeClaimCount:count+1,maxClaimsPerPlayer:max,awardedAt:rec.awardedAt};}
  return {state,setMaxClaims,addPrize,updatePrize,removePrize,award};
};
