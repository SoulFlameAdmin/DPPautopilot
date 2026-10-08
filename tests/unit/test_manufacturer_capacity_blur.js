// Regression for PR #297: unsaved capacity must survive blur and late API responses.
// Run: node tests/unit/test_manufacturer_capacity_blur.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("assets/csp/manufacturer-detail-hardening.js", "utf8");
const listeners = {};
const capacity = {value:"101", addEventListener(type,fn){listeners[type]=fn;}};
const status = {textContent:"ACTIVE"};
const battery = {textContent:"battery-1"};
const label = {textContent:""};
const row = {dataset:{passportId:"passport-A"}};
const qr = {hidden:false,removeAttribute(){},closest(){return {querySelector(){return {textContent:""};}}}};
const document = {
  activeElement:null,
  querySelector(s){return s.includes("passport-rows")?row:null;},
  addEventListener(){},
};
const nodes = {"#detailQrImage":qr,"#detailStatus":status,"#detailBatteryId":battery,
  "#detailFieldCapacity":label,"#detailPilotCapacity":capacity};
document.querySelector = s => nodes[s] || (s.includes("passport-rows")?row:null);
const pending=[];
const context = {document,sessionStorage:{getItem(){return JSON.stringify({access_token:"test"});}},
  localStorage:{getItem(){return null;}}, HTMLImageElement:function(){},
  MutationObserver:class {observe(){}},queueMicrotask(){},setTimeout(){},
  fetch(){return new Promise(resolve=>pending.push(resolve));}};
context.HTMLImageElement.prototype={};
vm.runInNewContext(source,context);
async function tick(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
(async()=>{
  // Trigger selection request via the registered click callback, with immediate timer.
  // Source exposes no test hook, so invoke its sync function inside the VM.
  const sync=vm.runInNewContext("syncPassportSpecificDetail",context);
  const request=sync();
  capacity.value="125";listeners.input();document.activeElement=null;
  pending.shift()({ok:true,json:async()=>({data:{public_payload:{model:{rated_capacity_ah:101}}}})});
  await request;
  assert.equal(capacity.value,"125","late response must not erase unsaved edit after blur");
  row.dataset.passportId="passport-B";
  const request2=sync();
  pending.shift()({ok:true,json:async()=>({data:{public_payload:{model:{rated_capacity_ah:90}}}})});
  await request2;
  assert.equal(capacity.value,"90","switching passport resets dirty guard");
  console.log("PASS: blur race and passport-switch reset");
})().catch(e=>{console.error(e);process.exitCode=1;});
