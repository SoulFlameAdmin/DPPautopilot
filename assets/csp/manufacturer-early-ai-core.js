(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.SoulFlameAIIntake=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const KEYS=Object.freeze(["country","company","products","sku","annualVolume","users","systems","automation"]);
  const KEY_SET=new Set(KEYS);

  function clean(value,max=5000){
    return String(value??"").trim().slice(0,max);
  }

  function sanitizeCandidates(candidates){
    const input=Array.isArray(candidates)?candidates:[];
    const seen=new Set();
    const out=[];
    for(const raw of input){
      const key=clean(raw?.key,64);
      const value=clean(raw?.value,5000);
      const evidence=clean(raw?.evidence,1000);
      if(!KEY_SET.has(key)||!value||!evidence||seen.has(key))continue;
      seen.add(key);
      out.push({key,value,evidence,verified:false});
    }
    return out;
  }

  function selectedAnswers(candidates,selection,editedValues){
    const safe=sanitizeCandidates(candidates);
    const selected=selection&&typeof selection==="object"?selection:{};
    const edits=editedValues&&typeof editedValues==="object"?editedValues:{};
    const answers={};
    for(const candidate of safe){
      if(selected[candidate.key]!==true)continue;
      const value=clean(Object.prototype.hasOwnProperty.call(edits,candidate.key)?edits[candidate.key]:candidate.value,5000);
      if(value)answers[candidate.key]=value;
    }
    return answers;
  }

  function remainingKeys(confirmedKeys){
    const set=new Set(Array.isArray(confirmedKeys)?confirmedKeys.filter(key=>KEY_SET.has(key)):[]);
    return KEYS.filter(key=>!set.has(key));
  }

  function canFinishExplicitly(confirmedKeys){
    return remainingKeys(confirmedKeys).length===0;
  }

  return Object.freeze({KEYS,sanitizeCandidates,selectedAnswers,remainingKeys,canFinishExplicitly});
});
