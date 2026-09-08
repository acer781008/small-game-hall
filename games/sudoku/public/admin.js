const socket=io(),$=s=>document.querySelector(s);let ready=false;
function settings(){let size=+$('#size').value,variant=$('#variant').value;if(size===12&&['殺手數獨','不規則數獨'].includes(variant)){size=9;$('#size').value='9';alert('殺手數獨、不規則數獨目前支援 9×9；已自動切回 9×9。')}return {variant,size,difficulty:$('#difficulty').value,roundMinutes:+$('#roundMinutes').value||5,showWrongCount:$('#showWrongCount').value==='true'}}
function apply(a){const s=a.settings||{};$('#variant').value=s.variant||'標準數獨';$('#size').value=String(s.size||9);$('#difficulty').value=s.difficulty||'初級';$('#roundMinutes').value=String(s.roundMinutes||5);$('#showWrongCount').value=String(s.showWrongCount===true);$('#note').value=a.note||''}
function playerLink(){return `${location.origin}/games/sudoku/player.html`}
function copyText(t){navigator.clipboard?.writeText(t).then(()=>alert('已複製')).catch(()=>prompt('請手動複製',t))}
function shareText(){const s=settings();return `🧠 數獨小遊戲\n玩家連結：${playerLink()}\n玩法：${s.variant}（${s.size}×${s.size}）\n難度：${s.difficulty}\n單局時間：${s.roundMinutes} 分鐘\n獲獎條件：時間內正確完成整盤\n${$('#note').value?`備註：${$('#note').value}`:''}`}
function save(){if(!ready)return alert('設定載入中，請再試一次');socket.emit('host:update',{settings:settings(),note:$('#note').value},ack=>{if(!ack?.ok)return alert(ack?.message||'儲存失敗');const n=$('#saveNotice');n.classList.remove('hidden');n.textContent='✅ 設定已儲存';setTimeout(()=>n.classList.add('hidden'),1600)})}
$('#save').onclick=save;$('#copyLink').onclick=()=>copyText(playerLink());$('#copyShare').onclick=()=>copyText(shareText());$('#rulesBtn').onclick=()=>openRule($('#variant').value);
socket.on('host:ready',a=>{ready=true;apply(a)});socket.on('activity:update',a=>apply(a));socket.on('error:msg',m=>alert(m));socket.on('connect',()=>socket.emit('host:join',{}));
