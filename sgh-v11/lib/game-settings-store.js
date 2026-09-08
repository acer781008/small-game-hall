module.exports = async function createGameSettingsStore({adapter,file}){
  const defaults={games:{}};
  let data=await adapter.load('game-settings',file,defaults);
  data=data&&typeof data==='object'?data:{games:{}};
  data.games=data.games&&typeof data.games==='object'?data.games:{};
  function get(id){const v=data.games[id];return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):null;}
  async function set(id,settings){
    const tx=await adapter.transact('game-settings',file,defaults,root=>{
      root.games=root.games&&typeof root.games==='object'?root.games:{};
      root.games[id]=JSON.parse(JSON.stringify(settings||{}));
      return root.games[id];
    });
    data=tx.data;
    return JSON.parse(JSON.stringify(tx.result));
  }
  return {get,set,all:()=>JSON.parse(JSON.stringify(data.games))};
};
