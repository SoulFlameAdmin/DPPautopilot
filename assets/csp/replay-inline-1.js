let baseline=null,state=null;
const show=()=>{snapshot.textContent=JSON.stringify({manufacturer:state?.model?.identification?.manufacturer?.name,modelId:state?.model?.identification?.model_id,itemId:state?.items?.[0]?.unique_identifier},null,2)};
function mutateState(){state.model.identification.manufacturer.name='MUTATED DEMO';state.items[0].lifecycle_status='repurposed';document.body.dataset.mutatedDetected=String(JSON.stringify(state)!==JSON.stringify(baseline));status.innerHTML='<span class="warn">Mutated state detected</span>';show()}
function resetState(){state=structuredClone(baseline);const equal=JSON.stringify(state)===JSON.stringify(baseline);document.body.dataset.resetEqual=String(equal);status.innerHTML=equal?'<span class="ok">Reset returned to exact known fixture state</span>':'<span class="warn">Reset mismatch</span>';show()}
async function replayScenario(){mutateState();resetState()}
mutate.onclick=mutateState;reset.onclick=resetState;replay.onclick=replayScenario;
(async()=>{try{const r=await fetch('/data/sample-battery.json',{cache:'no-store'});if(!r.ok)throw new Error('fixture load failed');baseline=await r.json();state=structuredClone(baseline);document.body.dataset.resetReady='true';status.textContent='Known fixture loaded';show();if(new URLSearchParams(location.search).get('auto')==='1')await replayScenario()}catch(e){status.textContent=e.message}})();
