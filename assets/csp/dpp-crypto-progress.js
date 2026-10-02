const $=id=>document.getElementById(id);
const LABELS={CR01:"Threat model",CR02:"Hardware decision matrix",CR03:"Cryptographic identity model",CR04:"No passport-on-chip rule",CR05:"Key-generation rule",CR06:"Private-key protection",CR07:"Trust root / PKI",CR08:"KMS/HSM boundary",CR09:"Manufacturing provisioning",CR10:"Provisioning evidence",CR11:"Dynamic Tap & Verify",CR12:"Server challenge API",CR13:"NFC proof operation",CR14:"Verification API",CR15:"Anti-replay",CR16:"Result contract",CR17:"Verification history",CR18:"Revocation / replacement",CR19:"Key/certificate rotation",CR20:"Physical anti-swap / tamper",CR21:"BMS binding hook",CR22:"Privacy",CR23:"Security test matrix",CR24:"Integration evidence",CR25:"Visible progress tracker"};
fetch("/data/dpp-crypto-status.json",{cache:"no-store"})
.then(r=>{if(!r.ok)throw new Error("status load failed");return r.json()})
.then(s=>{
 $("pct").textContent=s.greenPercent+"%"; $("green").textContent=s.counts.green;
 $("yellow").textContent=s.counts.yellow; $("red").textContent=s.counts.red; $("blocked").textContent=s.counts.blocked;
 $("current").textContent=s.currentTask||"—"; $("last").textContent=s.lastCompletedTask||"—"; $("next").textContent=s.nextTask||"—";
 $("blocker").textContent=s.blocker?((s.blockerType?"["+s.blockerType+"] ":"")+s.blocker):"Няма";
 $("branch").textContent=s.branch; $("pr").textContent="#"+s.pullRequest.number; $("pr").href=s.pullRequest.url;
 $("commit").textContent=s.trackedCommitSha||"—";
 $("ci").textContent=(s.ci&&s.ci.state?String(s.ci.state).toUpperCase():"—")+(s.ci&&s.ci.detail?" · "+s.ci.detail:"");
 $("updated").textContent=s.updatedAt; $("total").textContent=s.totalPoints+" точки";
 $("points").innerHTML=s.points.map(p=>"<article class=\"point\"><span class=\"badge "+p.status+"\">"+p.status.toUpperCase()+"</span><div><h3>"+p.id+" · "+(LABELS[p.id]||p.id)+"</h3><p>"+(p.evidence||"—")+"</p></div></article>").join("");
})
.catch(e=>{$("points").textContent="Неуспешно зареждане на DPP CRYPTO status: "+e.message;});
