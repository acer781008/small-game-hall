if(!sessionStorage.mkAdminToken)location='admin-login.html';
const s=io({auth:{adminToken:sessionStorage.mkAdminToken}}),$=id=>document.getElementById(id);let room='';
function settings(){return {type:$('type').value,boardSize:$('boardSize').value,gameMinutes:$('gameMinutes').value,maxPlays:$('maxPlays').value,note:$('note').value}}
function notice(id,text){$(id).textContent=text;setTimeout(()=>{if($(id).textContent===text)$(id).textContent=''},1800)}
async function copyText(text,id='copyMsg'){try{await navigator.clipboard.writeText(text);notice(id,'✓ 已複製')}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();notice(id,'✓ 已複製')}}
function url(){return location.origin+'/player.html?room='+room}
$('newRoom').onclick=()=>s.emit('createRoom',settings(),x=>{if(!x?.ok){alert(x?.msg||'建立房間失敗');return}room=x.code;$('code').textContent=room;$('roomState').textContent=room});
$('save').onclick=()=>{if(!room)return notice('saved','請先產生房號');s.emit('saveSettings',{code:room,settings:settings()},x=>notice('saved',x?.ok?'✓ 已儲存':'儲存失敗'))};
$('del').onclick=()=>{if(room&&confirm('確定刪除房間？'))s.emit('deleteRoom',{code:room})};
$('copyUrl').onclick=()=>room?copyText(url()):notice('copyMsg','請先產生房號');
$('copyShare').onclick=()=>{if(!room)return notice('copyMsg','請先產生房號');const a=settings(),t={farm:'種菜素材',idiom:'成語',poem:'唐詩'}[a.type],gm=a.gameMinutes==='unlimited'?'無限制':a.gameMinutes+'分鐘',mp=a.maxPlays==='unlimited'?'不限次數':a.maxPlays+'次';copyText(`🎴 翻牌小遊戲\n房號：${room}\n題型：${t}\n盤面：${a.boardSize}\n單局時間：${gm}\n每位玩家可完成：${mp}\n完成條件：時間內完成全部配對\n備註：${a.note||'無'}\n玩家連結：${url()}`)};
$('copyRank').onclick=()=>{const rows=[...$('rank').children];if(!rows.length)return notice('rankMsg','目前沒有玩家紀錄');copyText(['玩家｜遊玩｜完成｜最快完成｜狀態',...rows.map(tr=>[...tr.children].map(x=>x.textContent).join('｜'))].join('\n'),'rankMsg')};
s.on('room',r=>{if(room&&r.code!==room)return;if(!room){room=r.code;$('code').textContent=room}$('roomState').textContent=r.code;$('count').textContent=r.online||0;$('startCount').textContent=r.startCount||0;$('finishCount').textContent=r.finishCount||0;$('rank').innerHTML=(r.players||[]).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.gamesPlayed}</td><td>${p.successCount}</td><td>${p.bestTime==null?'—':fmt(p.bestTime)}</td><td>${esc(p.status)}</td></tr>`).join('')});
s.on('deleted',()=>{alert('房間已刪除');location.reload()});
function fmt(ms){let x=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`}
function esc(x){return String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
