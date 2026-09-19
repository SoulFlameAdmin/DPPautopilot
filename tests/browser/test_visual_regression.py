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

def png_dimensions(path: Path) -> tuple[int,int]:
    raw=path.read_bytes()
    if len(raw)<24 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise AssertionError(f"{path.name}: invalid PNG")
    return struct.unpack(">II",raw[16:24])

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    baseline=json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    expected_browser=baseline["approved_candidate"]["browser_version"]
    viewport=baseline["approved_candidate"]["viewport"]
    report={
        "version":1,
        "baseline_path":str(BASELINE_PATH.relative_to(ROOT)),
        "expected_browser_version":expected_browser,
        "viewport":viewport,
        "surfaces":{},
        "mismatches":[],
    }
    server=subprocess.Popen(
        [sys.executable,"-m","http.server","8000"],
        cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
    )
    try:
        wait_server()
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            report["actual_browser_version"]=browser.version
            if browser.version!=expected_browser:
                report["mismatches"].append({
                    "type":"browser_version",
                    "expected":expected_browser,
                    "actual":browser.version,
                })
            try:
                context=browser.new_context(
                    viewport={"width":viewport["width"],"height":viewport["height"]},
                    device_scale_factor=1,
                    locale="bg-BG",
                    timezone_id="Europe/Sofia",
                    color_scheme="dark",
                    reduced_motion="reduce",
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
                    page.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}")
                    page.evaluate("() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0,0); }")
                    page.wait_for_timeout(100)
                    path=OUT/f"{name}.png"
                    page.screenshot(path=str(path),full_page=True,animations="disabled")
                    width,height=png_dimensions(path)
                    actual_hash=digest(path)
                    actual={"sha256":actual_hash,"width":width,"height":height,"bytes":path.stat().st_size}
                    status="pass"
                    for field in ("sha256","width","height"):
                        if actual[field]!=expected[field]:
                            status="fail"
                            report["mismatches"].append({
                                "surface":name,
                                "field":field,
                                "expected":expected[field],
                                "actual":actual[field],
                            })
                    report["surfaces"][name]={"status":status,"expected":expected,"actual":actual}
                context.close()
            finally:
                browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

    report["status"]="pass" if not report["mismatches"] else "fail"
    (OUT/"report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    if report["mismatches"]:
        raise AssertionError(f"U07 visual regression mismatches: {report['mismatches']}")
    print(f"U07_VISUAL_REGRESSION_PASS: {len(report['surfaces'])} approved deterministic screenshots match exactly")

if __name__=="__main__":
    main()
