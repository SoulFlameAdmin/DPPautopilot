#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"artifacts"/"u07-candidate"
OUT.mkdir(parents=True,exist_ok=True)
BASE="http://127.0.0.1:8000"

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

def png_dimensions(path: Path) -> tuple[int,int]:
    raw=path.read_bytes()
    if len(raw)<24 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise AssertionError(f"{path.name}: not a valid PNG")
    return struct.unpack(">II",raw[16:24])

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    server=subprocess.Popen(
        [sys.executable,"-m","http.server","8000"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    report={"version":1,"viewport":{"width":1440,"height":1000},"surfaces":{}}
    try:
        wait_server()
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            report["browser_version"]=browser.version
            try:
                context=browser.new_context(
                    viewport={"width":1440,"height":1000},
                    device_scale_factor=1,
                    locale="bg-BG",
                    timezone_id="Europe/Sofia",
                    color_scheme="dark",
                    reduced_motion="reduce",
                )
                page=context.new_page()
                for name,(route,marker) in SURFACES.items():
                    response=page.goto(BASE+route,wait_until="networkidle",timeout=30000)
                    page.wait_for_timeout(700)
                    if response is None or not response.ok:
                        raise AssertionError(f"{name}: HTTP navigation failed")
                    if marker:
                        value=page.evaluate("(name)=>document.body.dataset[name] ?? null",marker)
                        if value!="true":
                            raise AssertionError(f"{name}: data-{marker} not ready ({value})")
                    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}")
                    page.evaluate("() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0,0); }")
                    page.wait_for_timeout(100)
                    path=OUT/f"{name}.png"
                    page.screenshot(path=str(path),full_page=True,animations="disabled")
                    width,height=png_dimensions(path)
                    if width<1000 or height<500:
                        raise AssertionError(f"{name}: suspicious screenshot dimensions {width}x{height}")
                    report["surfaces"][name]={
                        "route":route,
                        "sha256":sha256(path),
                        "width":width,
                        "height":height,
                        "bytes":path.stat().st_size,
                    }
                context.close()
            finally:
                browser.close()
        (OUT/"candidate.json").write_text(
            json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"
        )
        print(f"U07_VISUAL_CANDIDATE_PASS: captured {len(report['surfaces'])} deterministic screenshots")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

if __name__=="__main__":
    main()
