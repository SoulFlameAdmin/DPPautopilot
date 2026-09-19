#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
ARTIFACTS=ROOT/"artifacts"
ARTIFACTS.mkdir(exist_ok=True)
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

def main():
    server=subprocess.Popen(
        [sys.executable,"-m","http.server","8000"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    report={"version":1,"engines":{}}
    try:
        wait_server()
        with sync_playwright() as p:
            for engine_name in ("chromium","firefox","webkit"):
                browser_type=getattr(p,engine_name)
                browser=browser_type.launch(headless=True)
                engine={"browser_version":browser.version,"surfaces":{}}
                report["engines"][engine_name]=engine
                try:
                    context=browser.new_context(viewport={"width":1280,"height":900})
                    page=context.new_page()
                    page_errors=[]
                    console_errors=[]
                    page.on("pageerror",lambda exc, errors=page_errors: errors.append(str(exc)))
                    page.on("console",lambda msg, errors=console_errors: errors.append(msg.text) if msg.type=="error" else None)

                    for surface,(route,marker) in SURFACES.items():
                        before_page=len(page_errors)
                        before_console=len(console_errors)
                        response=page.goto(BASE+route,wait_until="networkidle",timeout=30000)
                        page.wait_for_timeout(600)
                        if response is None or not response.ok:
                            raise AssertionError(f"{engine_name}/{surface}: HTTP navigation failed")
                        metrics=page.evaluate("""() => ({
                          mainCount: document.querySelectorAll('main,[role="main"]').length,
                          h1Count: document.querySelectorAll('h1').length,
                          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                          markerValue: null
                        })""")
                        if marker:
                            metrics["markerValue"]=page.evaluate(
                                "(name) => document.body.dataset[name] ?? null",marker
                            )
                        new_page_errors=page_errors[before_page:]
                        new_console_errors=console_errors[before_console:]
                        if metrics["mainCount"] < 1:
                            raise AssertionError(f"{engine_name}/{surface}: missing main landmark")
                        if metrics["h1Count"] != 1:
                            raise AssertionError(f"{engine_name}/{surface}: expected exactly one H1, got {metrics['h1Count']}")
                        if metrics["overflow"]:
                            raise AssertionError(f"{engine_name}/{surface}: horizontal overflow")
                        if marker and metrics["markerValue"] != "true":
                            raise AssertionError(
                                f"{engine_name}/{surface}: data-{marker} did not settle true ({metrics['markerValue']})"
                            )
                        if new_page_errors:
                            raise AssertionError(f"{engine_name}/{surface}: page errors {new_page_errors}")
                        engine["surfaces"][surface]={
                            "status":"pass",
                            "main_count":metrics["mainCount"],
                            "h1_count":metrics["h1Count"],
                            "horizontal_overflow":metrics["overflow"],
                            "marker":marker,
                            "marker_value":metrics["markerValue"],
                            "console_error_count":len(new_console_errors),
                        }
                    context.close()
                finally:
                    browser.close()
        (ARTIFACTS/"u06-cross-browser-report.json").write_text(
            json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"
        )
        print(
            "U06_CROSS_BROWSER_PASS: Chromium/Firefox/WebKit loaded 10 core surfaces "
            "without page errors, horizontal overflow or missing workflow readiness markers"
        )
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()

if __name__=="__main__":
    main()
