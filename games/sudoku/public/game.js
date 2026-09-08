window.SudokuUI = class SudokuUI {
  constructor({boardEl,keypadEl,onProgress,onInput}){this.boardEl=boardEl;this.keypadEl=keypadEl;this.onProgress=onProgress||(()=>{});this.onInput=onInput||(()=>{});this.puzzle=[];this.grid=[];this.meta={};this.variant='標準數獨';this.selected=null;this.size=9;this.locked=false;}
  load(puzzle,meta,variant,savedGrid=null){this.puzzle=puzzle.map(r=>r.slice());this.grid=(Array.isArray(savedGrid)&&savedGrid.length===puzzle.length)?savedGrid.map(r=>r.slice()):puzzle.map(r=>r.slice());this.meta=meta||{};this.variant=variant;this.size=puzzle.length;this.selected=null;this.locked=false;this.render();this.renderKeys();}
  render(){
    const n=this.size;this.boardEl.innerHTML='';this.boardEl.style.gridTemplateColumns=`repeat(${n},1fr)`;this.boardEl.style.gridTemplateRows=`repeat(${n},1fr)`;const [br,bc]=n===12?[3,4]:[3,3];
    const cageOf=Array.from({length:n},()=>Array(n).fill(-1)),cageStart=new Map();
    if(this.meta.cages)this.meta.cages.forEach((cg,i)=>{cg.cells?.forEach(([r,c])=>cageOf[r][c]=i);if(cg.cells?.length){const ordered=[...cg.cells].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);cageStart.set(ordered[0].join(','),cg.sum);}});
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
      const d=document.createElement('div');d.className='cell';const val=this.grid[r][c];if(this.puzzle[r][c])d.classList.add('given');else if(val)d.classList.add('user');
      if(this.variant==='對角線數獨'&&(r===c||r+c===n-1))d.classList.add('diag');
      if(this.variant==='彩色數獨'&&this.meta.colors){const gid=this.meta.colors[r][c];d.classList.add('color-group');d.style.setProperty('--group-color',`hsl(${Math.round(gid*360/n)} 82% 80%)`);}
      if(cageStart.has(`${r},${c}`)){d.classList.add('cage-start');d.dataset.sum=cageStart.get(`${r},${c}`);}
      d.textContent=val||'';
      const normal='#65756f',thick=(this.variant==='不規則數獨'?'#8b45c6':'#173f35');let top=`1px solid ${normal}`,right=`1px solid ${normal}`,bottom=`1px solid ${normal}`,left=`1px solid ${normal}`;
      if(this.variant==='不規則數獨'&&this.meta.regions){const id=this.meta.regions[r][c];top=(r===0||this.meta.regions[r-1][c]!==id)?`4px solid ${thick}`:top;bottom=(r===n-1||this.meta.regions[r+1][c]!==id)?`4px solid ${thick}`:bottom;left=(c===0||this.meta.regions[r][c-1]!==id)?`4px solid ${thick}`:left;right=(c===n-1||this.meta.regions[r][c+1]!==id)?`4px solid ${thick}`:right;}
      else{if(r===0)top=`2px solid ${thick}`;if(c===0)left=`2px solid ${thick}`;if((c+1)%bc===0)right=`4px solid ${thick}`;if((r+1)%br===0)bottom=`4px solid ${thick}`;}
      d.style.borderTop=top;d.style.borderRight=right;d.style.borderBottom=bottom;d.style.borderLeft=left;
      if(this.variant==='殺手數獨'&&this.meta.cages){const id=cageOf[r][c],dash='2px dashed #b56c32';if(r===0||cageOf[r-1][c]!==id)d.style.boxShadow=(d.style.boxShadow?d.style.boxShadow+', ':'')+'inset 0 2px 0 #b56c32';if(c===0||cageOf[r][c-1]!==id)d.classList.add('cage-left');if(r===n-1||cageOf[r+1][c]!==id)d.classList.add('cage-bottom');if(c===n-1||cageOf[r][c+1]!==id)d.classList.add('cage-right');}
      if(!this.puzzle[r][c]&&!this.locked)d.addEventListener('click',()=>{this.selected=[r,c];this.render()});if(this.selected&&this.selected[0]===r&&this.selected[1]===c)d.classList.add('selected');if(this.variant==='不連續數獨'&&this.selected&&Math.abs(this.selected[0]-r)+Math.abs(this.selected[1]-c)===1)d.style.boxShadow='inset 0 0 0 4px rgba(235,137,48,.55)';this.boardEl.appendChild(d);
    }
  }
  renderKeys(){this.keypadEl.innerHTML='';for(let i=1;i<=this.size;i++){const b=document.createElement('button');b.type='button';b.textContent=i;b.disabled=this.locked;b.addEventListener('click',()=>this.put(i));this.keypadEl.appendChild(b)}}
  put(v){if(this.locked||!this.selected)return;const [r,c]=this.selected;if(this.puzzle[r][c])return;const old=this.grid[r][c];this.grid[r][c]=v;this.onInput(r,c,v,old);this.render();this.onProgress(this.filled(),this.grid.map(r=>r.slice()))}
  clear(){if(this.locked||!this.selected)return;const [r,c]=this.selected;if(!this.puzzle[r][c]){this.grid[r][c]=0;this.render();this.onProgress(this.filled(),this.grid.map(r=>r.slice()))}}
  filled(){let count=0;for(let r=0;r<this.size;r++)for(let c=0;c<this.size;c++)if(!this.puzzle[r][c]&&this.grid[r][c])count++;return count}
  lock(){this.locked=true;this.selected=null;this.render();this.renderKeys()}
  unlock(){this.locked=false;this.render();this.renderKeys()}
};
window.fmtMs=function(ms){if(ms==null)return '—';const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
window.copyText=async function(text){try{await navigator.clipboard.writeText(text);return true}catch(e){window.prompt('請複製以下文字：',text);return false}}
