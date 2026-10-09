(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.SoulFlameAIIntake=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const KEYS=Object.freeze(["country","company","products","sku","annualVolume","users","systems","automation"]);
  const KEY_SET=new Set(KEYS);
  const STATES=new Set(["unverified","accepted","rejected"]);

  function clean(value,max=5000){
    return String(value??"").trim().slice(0,max);
  }

  // One-prompt extraction contract: at most one candidate per onboarding field.
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

  // Persisted Worker-A snapshot contract: multiple candidates for the same field are valid
  // because disagreements must remain visible until a human explicitly resolves them.
  function sanitizeSnapshotCandidates(candidates){
    const input=Array.isArray(candidates)?candidates:[];
    const seenIds=new Set();
    const out=[];
    for(const raw of input){
      const id=clean(raw?.id,80);
      const key=clean(raw?.field_key??raw?.key,64);
      const value=clean(raw?.value??raw?.candidate_value,5000);
      const evidence=clean(raw?.evidence,1000);
      const sourceType=clean(raw?.source_type,32)||"user";
      const sourceRef=clean(raw?.source_ref,500);
      const state=clean(raw?.verification_state,32)||"unverified";
      if(!id||seenIds.has(id)||!KEY_SET.has(key)||!value||!evidence||!STATES.has(state))continue;
      seenIds.add(id);
      out.push({
        id,key,value,evidence,source_type:sourceType,source_ref:sourceRef,
        source_id:clean(raw?.source_id,80)||null,
        verification_state:state,
        reviewed_by:clean(raw?.reviewed_by,80)||null,
        reviewed_at:clean(raw?.reviewed_at,80)||null
      });
    }
    return out;
  }

  function canonicalValue(value){
    return clean(value,5000).toLocaleLowerCase().replace(/\s+/g," ");
  }

  function groupSnapshotCandidates(candidates){
    const safe=sanitizeSnapshotCandidates(candidates);
    const groups={};
    for(const key of KEYS)groups[key]=[];
    for(const candidate of safe)groups[candidate.key].push(candidate);
    return groups;
  }

  function conflictKeys(candidates){
    const groups=groupSnapshotCandidates(candidates);
    const conflicts=[];
    for(const key of KEYS){
      const values=new Set(
        groups[key]
          .filter(candidate=>candidate.verification_state!=="rejected")
          .map(candidate=>canonicalValue(candidate.value))
          .filter(Boolean)
      );
      if(values.size>1)conflicts.push(key);
    }
    return conflicts;
  }

  function acceptedAnswers(candidates){
    const groups=groupSnapshotCandidates(candidates);
    const answers={};
    for(const key of KEYS){
      const accepted=groups[key].filter(candidate=>candidate.verification_state==="accepted");
      if(accepted.length===1)answers[key]=accepted[0].value;
    }
    return answers;
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

  return Object.freeze({
    KEYS,sanitizeCandidates,sanitizeSnapshotCandidates,groupSnapshotCandidates,
    conflictKeys,acceptedAnswers,canonicalValue,selectedAnswers,remainingKeys,canFinishExplicitly
  });
});
