'use strict';
const byId=id=>document.getElementById(id);
(async()=>{
  try{
    const response=await fetch('../data/dpp-crypto-status.json',{cache:'no-store'});
    if(!response.ok)throw new Error('status unavailable');
    const s=await response.json();
    byId('pct').textContent=String(s.percent_green)+'% GREEN';
    byId('green').textContent=String(s.counts?.green??'–');
    byId('yellow').textContent=String(s.counts?.yellow??'–');
    byId('blocked').textContent=String(s.counts?.blocked??'–');
    byId('current').textContent=String(s.current??'');
    byId('blocker').textContent=String(s.blocker?.summary??'');
    byId('commit').textContent=String(s.latest_commit??'');
    const root=byId('points');
    root.replaceChildren();
    for(const point of Array.isArray(s.points)?s.points:[]){
      const card=document.createElement('div');
      card.className='p';
      const strong=document.createElement('b');
      strong.textContent=String(point.id??'');
      card.append(strong,document.createElement('br'),document.createTextNode(String(point.status??'')));
      root.appendChild(card);
    }
  }catch{
    byId('current').textContent='Status JSON unavailable. Open repository evidence.';
  }
})();