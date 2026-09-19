'use strict';

(function(){
  function setError(input,errorNode,message){
    const text=String(message||'');
    input.setAttribute('aria-invalid',text?'true':'false');
    if(errorNode){
      errorNode.textContent=text;
      errorNode.dataset.fieldError=text?'true':'false';
    }
    return !text;
  }

  function snapshot(inputs){
    return Array.from(inputs).map((input,index)=>({
      index,
      value:input.value
    }));
  }

  function inputsPreserved(before,inputs){
    const now=Array.from(inputs);
    if(before.length!==now.length) return false;
    return before.every((entry,index)=>entry.index===index&&now[index].value===entry.value);
  }

  function markPreserved(before,inputs){
    const preserved=inputsPreserved(before,inputs);
    document.body.dataset.inputPreserved=String(preserved);
    return preserved;
  }

  window.DPPFormUX={setError,snapshot,inputsPreserved,markPreserved};
})();
