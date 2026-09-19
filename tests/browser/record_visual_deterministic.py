#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"artifacts"/"u07-deterministic"
OUT.mkdir(parents=True,exist_ok=True)
BASE="http://127.0.0.1:8000"
VIEWPORT={"width":1440,"height":1000}

SURFACES={
    "dashboard":("/",None),
    "model":("/demo/model.html?sample=1","formReady"),
    "item":("/demo/item.html?sample=1","itemReady"),
    "import":("/demo/import.html?sample=1","importLoaded"),
    "import-validation":("/demo/import-validation.html","validationReady"),
    "passport":("/demo/passport.html?id=urn%3Adpp%3Ademo%3Abattery%3ANSD-EV-82-DEMO%3A000001","passportReady"),
    "settings":("/demo/settings.html?sample=1","settingsReady"),
    "onboarding":("/demo/onboarding.html?sample=1","onboardingReady"),
    "mapping":("/demo/mapping.html","mappingReady"),
    "auth":("/demo/auth.html",None),
}

DASHBOARD_NORMALIZATION={
    "currentTask":"Stable current task",
    "lastCompleted":"Stable completed task",
    "nextTask":"Stable next task",
    "workerMessage":"Stable worker status message for deterministic visual regression.",
    "workerStamp":"WORKING · UX · 19.09.2026 · 18:00:00",
    "overallPct":"00%",
    "greenCount":"00",
    "remainingCount":"00",
    "blockedCount":"00",
}

def wait_server():
    for _ in range(40):
        try:
            with urllib.request.urlopen(BASE+"/data/master-plan.json",timeout=1) as r:
                if r.status==200:
                    return
        except Exception:
            pass
        time.sleep(0.25)
    raise RuntimeError("local server did not become ready")

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def pixel_sha256(page, path: Path) -> str:
    encoded=base64.b64encode(path.read_bytes()).decode("ascii")
    return page.evaluate(
        """async (pngBase64) => {
          const img=new Image();
          await new Promise((resolve,reject)=>{
            img.onload=resolve;
            img.onerror=()=>reject(new Error('PNG decode failed'));
            img.src='data:image/png;base64,'+pngBase64;
          });
          const canvas=document.createElement('canvas');
          canvas.width=img.naturalWidth;
          canvas.height=img.naturalHeight;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(img,0,0);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          const digest=await crypto.subtle.digest('SHA-256',pixels);
          return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        }""",
        encoded,
    )

def normalize(page, surface: str):
    page.add_style_tag(content="""
      *,*::before,*::after{
        animation:none!important;
        transition:none!important;
        caret-color:transparent!important;
      }
      html{scroll-behavior:auto!important}
    """)
    page.evaluate("""async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.scrollTo(0,0);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }""")
    if surface=="import-validation":
        page.wait_for_function("""() => {
          const body=document.body;
          const summary=document.getElementById('summary');
          const rows=document.querySelectorAll('#errors tr');
          return body?.dataset.validationReady==='true'
            && body.dataset.downloadReady==='true'
            && summary?.dataset.asyncState==='success'
            && rows.length===Number(body.dataset.errorCount||'-1');
        }""", timeout=5000)
        page.evaluate("""async () => {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }""")
    if surface=="dashboard":
        page.evaluate(
            """values => {
              for (const [id,value] of Object.entries(values)) {
                const el=document.getElementById(id);
                if (el) el.textContent=value;
              }
              const bar=document.getElementById('overallBar');
              if (bar) bar.style.width='0%';
              const pulse=document.getElementById('workerPulse');
              if (pulse) pulse.style.background='rgb(68, 209, 157)';
              const gates=document.getElementById('gates');
              if (gates) {
                for (const node of gates.querySelectorAll('.count,.pct,.num')) {
                  node.textContent='00';
                }
              }
            }""",
            DASHBOARD_NORMALIZATION,
        )
    page.wait_for_timeout(250)

def capture_pass(playwright, pass_name: str):
    browser=playwright.chromium.launch(headless=True)
    result={}
    try:
        context=browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=1,
            locale="bg-BG",
            timezone_id="Europe/Sofia",
            color_scheme="dark",
            reduced_motion="reduce",
        )
        page=context.new_page()
        page.on("pageerror",lambda exc: (_ for _ in ()).throw(AssertionError(f"pageerror: {exc}")))
        for surface,(route,marker) in SURFACES.items():
            response=page.goto(BASE+route,wait_until="networkidle",timeout=30000)
            page.wait_for_timeout(500)
            if response is None or not response.ok:
                raise AssertionError(f"{surface}: HTTP navigation failed")
            if marker:
                value=page.evaluate("(name)=>document.body.dataset[name] ?? null",marker)
                if value!="true":
                    raise AssertionError(f"{surface}: data-{marker} not ready ({value})")
            normalize(page,surface)
            path=OUT/f"{pass_name}-{surface}.png"
            page.screenshot(path=str(path),full_page=False,animations="disabled")
            if path.stat().st_size<20_000:
                raise AssertionError(f"{surface}: suspiciously small screenshot ({path.stat().st_size} bytes)")
            result[surface]={
                "sha256":sha256(path),
                "pixel_sha256":pixel_sha256(page,path),
                "bytes":path.stat().st_size,
                "file":path.name,
            }
        context.close()
        return browser.version,result
    finally:
        browser.close()

def main():
    server=subprocess.Popen(
        [sys.executable,"-m","http.server","8000"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_server()
        with sync_playwright() as p:
            version_a,pass_a=capture_pass(p,"pass-a")
            version_b,pass_b=capture_pass(p,"pass-b")
        if version_a!=version_b:
            raise AssertionError(f"Chromium version drift inside run: {version_a} != {version_b}")
        mismatches=[]
        for surface in SURFACES:
            if pass_a[surface]["pixel_sha256"]!=pass_b[surface]["pixel_sha256"]:
                mismatches.append(surface)
        if mismatches:
            raise AssertionError(f"U07 nondeterministic screenshots: {mismatches}")
        report={
            "version":3,
            "browser":"chromium",
            "browser_version":version_a,
            "viewport":VIEWPORT,
            "normalization":{
                "dashboard_dynamic_fields":sorted(DASHBOARD_NORMALIZATION),
                "animations_disabled":True,
                "reduced_motion":"reduce",
                "full_page":False,
                "visual_digest":"decoded_rgba_sha256",
            },
            "surfaces":{
                name:{
                    "route":SURFACES[name][0],
                    "sha256":pass_a[name]["sha256"],
                    "pixel_sha256":pass_a[name]["pixel_sha256"],
                    "bytes":pass_a[name]["bytes"],
                    "candidate_file":pass_a[name]["file"],
                    "repeat_file":pass_b[name]["file"],
                }
                for name in SURFACES
            },
        }
        (OUT/"candidate-v2.json").write_text(
            json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"
        )
        print(
            "U07_DETERMINISM_PASS: 10 key-route viewport screenshots matched pixel-for-pixel "
            "across two independent Chromium contexts; PNG SHA-256 is retained for artifact integrity"
        )
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

if __name__=="__main__":
    main()
