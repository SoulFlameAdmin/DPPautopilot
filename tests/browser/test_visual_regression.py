#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import sys
import time
import urllib.request
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
BASELINE_PATH=ROOT/"data"/"u07-visual-baseline.json"
OUT=ROOT/"artifacts"/"u07-visual-regression"
OUT.mkdir(parents=True,exist_ok=True)
BASE="http://127.0.0.1:8000"
MARKERS={
    "dashboard":None,
    "model":"formReady",
    "item":"itemReady",
    "import":"importLoaded",
    "import-validation":"validationReady",
    "passport":"passportReady",
    "settings":"settingsReady",
    "onboarding":"onboardingReady",
    "mapping":"mappingReady",
    "auth":None,
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

def normalize_page(page,name):
    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}")
    if name=="dashboard":
        page.evaluate("""() => {
          const fixed={
            workerStamp:'BASELINE',
            currentTask:'Stable visual baseline',
            lastCompleted:'Stable visual baseline',
            nextTask:'Stable visual baseline',
            workerMessage:'Stable visual baseline state.',
            overallPct:'50%',
            greenCount:'00',
            remainingCount:'00',
            blockedCount:'00'
          };
          for (const [id,text] of Object.entries(fixed)) {
            const el=document.getElementById(id); if (el) el.textContent=text;
          }
          const bar=document.getElementById('overallBar'); if(bar) bar.style.width='50%';
          document.querySelectorAll('#gates .gate-count').forEach(el=>el.textContent='BASELINE');
          document.querySelectorAll('#gates .progress>span').forEach(el=>el.style.width='50%');
        }""")
    page.evaluate("() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0,0); }")
    page.wait_for_timeout(100)

def png_rgb(path: Path):
    data=path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path.name}: invalid PNG signature")
    pos=8; idat=b""; width=height=bit_depth=color_type=interlace=None
    while pos<len(data):
        length=struct.unpack(">I",data[pos:pos+4])[0]
        kind=data[pos+4:pos+8]
        payload=data[pos+8:pos+8+length]
        pos+=12+length
        if kind==b"IHDR":
            width,height,bit_depth,color_type,_,_,interlace=struct.unpack(">IIBBBBB",payload)
        elif kind==b"IDAT":
            idat+=payload
        elif kind==b"IEND":
            break
    if bit_depth!=8 or color_type not in (2,6) or interlace!=0:
        raise AssertionError(f"{path.name}: unsupported PNG format bit={bit_depth} color={color_type} interlace={interlace}")
    bpp=3 if color_type==2 else 4
    raw=zlib.decompress(idat)
    stride=width*bpp
    rows=[]; prev=bytearray(stride); off=0
    for _ in range(height):
        filter_type=raw[off]; off+=1
        cur=bytearray(raw[off:off+stride]); off+=stride
        for x in range(stride):
            a=cur[x-bpp] if x>=bpp else 0
            b=prev[x]
            c=prev[x-bpp] if x>=bpp else 0
            if filter_type==1:
                cur[x]=(cur[x]+a)&255
            elif filter_type==2:
                cur[x]=(cur[x]+b)&255
            elif filter_type==3:
                cur[x]=(cur[x]+((a+b)//2))&255
            elif filter_type==4:
                p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
                pr=a if pa<=pb and pa<=pc else b if pb<=pc else c
                cur[x]=(cur[x]+pr)&255
            elif filter_type!=0:
                raise AssertionError(f"{path.name}: unsupported PNG filter {filter_type}")
        prev=cur; rows.append(cur)
    return width,height,bpp,rows

def visual_signature(path: Path,grid=32,samples=4):
    width,height,bpp,rows=png_rgb(path)
    values=[]
    for gy in range(grid):
        y0=gy*height/grid; y1=(gy+1)*height/grid
        for gx in range(grid):
            x0=gx*width/grid; x1=(gx+1)*width/grid
            total=0
            for sy in range(samples):
                y=min(height-1,int(y0+(sy+0.5)*(y1-y0)/samples))
                row=rows[y]
                for sx in range(samples):
                    x=min(width-1,int(x0+(sx+0.5)*(x1-x0)/samples))
                    i=x*bpp; r,g,b=row[i],row[i+1],row[i+2]
                    total+=(54*r+183*g+19*b)//256
            avg=total/(samples*samples)
            values.append(max(0,min(15,round(avg/17))))
    return "".join(format(v,"x") for v in values)

def main():
    baseline=json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    expected_browser=baseline["approved_candidate"]["browser_version"]
    viewport=baseline["approved_candidate"]["viewport"]
    sig_cfg=baseline["signature"]
    report={
        "version":2,
        "baseline_path":str(BASELINE_PATH.relative_to(ROOT)),
        "expected_browser_version":expected_browser,
        "viewport":viewport,
        "signature":sig_cfg,
        "surfaces":{},
        "mismatches":[],
    }
    server=subprocess.Popen([sys.executable,"-m","http.server","8000"],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        wait_server()
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            report["actual_browser_version"]=browser.version
            if browser.version!=expected_browser:
                report["mismatches"].append({"type":"browser_version","expected":expected_browser,"actual":browser.version})
            try:
                context=browser.new_context(
                    viewport={"width":viewport["width"],"height":viewport["height"]},
                    device_scale_factor=1,locale="bg-BG",timezone_id="Europe/Sofia",
                    color_scheme="dark",reduced_motion="reduce",
                )
                page=context.new_page()
                for name,expected in baseline["surfaces"].items():
                    response=page.goto(BASE+expected["route"],wait_until="networkidle",timeout=30000)
                    page.wait_for_timeout(700)
                    if response is None or not response.ok:
                        raise AssertionError(f"{name}: HTTP navigation failed")
                    marker=MARKERS[name]
                    if marker:
                        value=page.evaluate("(name)=>document.body.dataset[name] ?? null",marker)
                        if value!="true":
                            raise AssertionError(f"{name}: data-{marker} not ready ({value})")
                    normalize_page(page,name)
                    path=OUT/f"{name}.png"
                    page.screenshot(path=str(path),full_page=True,animations="disabled")
                    width,height,_,_=png_rgb(path)
                    raw_sha=hashlib.sha256(path.read_bytes()).hexdigest()
                    sig=visual_signature(path,grid=sig_cfg["grid"],samples=sig_cfg["samples_per_axis"])
                    sig_sha=hashlib.sha256(sig.encode()).hexdigest()
                    actual={
                        "raw_sha256":raw_sha,
                        "visual_signature_sha256":sig_sha,
                        "width":width,
                        "height":height,
                        "bytes":path.stat().st_size,
                    }
                    status="pass"
                    for field in ("visual_signature_sha256","width","height"):
                        if actual[field]!=expected[field]:
                            status="fail"
                            report["mismatches"].append({
                                "surface":name,"field":field,
                                "expected":expected[field],"actual":actual[field],
                            })
                    report["surfaces"][name]={"status":status,"expected":expected,"actual":actual}
                context.close()
            finally:
                browser.close()
    finally:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill()

    report["status"]="pass" if not report["mismatches"] else "fail"
    (OUT/"report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    if report["mismatches"]:
        raise AssertionError(f"U07 visual regression mismatches: {report['mismatches']}")
    print(f"U07_VISUAL_REGRESSION_PASS: {len(report['surfaces'])} normalized approved visual signatures and dimensions match")

if __name__=="__main__":
    main()
