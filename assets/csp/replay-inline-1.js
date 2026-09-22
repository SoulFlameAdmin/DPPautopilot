const snapshotEl=document.getElementById('snapshot');
const statusEl=document.getElementById('status');
const mutateButton=document.getElementById('mutate');
const resetButton=document.getElementById('reset');
const replayButton=document.getElementById('replay');
let baseline=null,state=null;
const show=()=>{snapshotEl.textContent=JSON.stringify({manufacturer:state?.model?.identification?.manufacturer?.name,modelId:state?.model?.identification?.model_id,itemId:state?.items?.[0]?.unique_identifier},null,2)};
function mutateState(){state.model.identification.manufacturer.name='MUTATED DEMO';state.items[0].lifecycle_status='repurposed';document.body.dataset.mutatedDetected=String(JSON.stringify(state)!==JSON.stringify(baseline));statusEl.innerHTML='<span class="warn">Mutated state detected</span>';show()}
function resetState(){state=structuredClone(baseline);const equal=JSON.stringify(state)===JSON.stringify(baseline);document.body.dataset.resetEqual=String(equal);statusEl.innerHTML=equal?'<span class="ok">Reset returned to exact known fixture state</span>':'<span class="warn">Reset mismatch</span>';show()}
async function replayScenario(){mutateState();resetState()}
mutateButton.onclick=mutateState;resetButton.onclick=resetState;replayButton.onclick=replayScenario;
(async()=>{try{const r=await fetch('/data/sample-battery.json',{cache:'no-store'});if(!r.ok)throw new Error('fixture load failed');baseline=await r.json();state=structuredClone(baseline);document.body.dataset.resetReady='true';statusEl.textContent='Known fixture loaded';show();if(new URLSearchParams(location.search).get('auto')==='1')await replayScenario()}catch(e){statusEl.textContent=e.message}})();
