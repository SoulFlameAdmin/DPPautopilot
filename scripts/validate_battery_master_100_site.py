#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def require(condition: bool,message: str)->None:
    if not condition:
        raise AssertionError(message)

def main()->None:
    plan=json.loads((ROOT/"data/scooter-battery-master-100.json").read_text(encoding="utf-8"))
    page=(ROOT/"live/battery-master.html").read_text(encoding="utf-8")
    script=(ROOT/"assets/csp/battery-master-inline-1.js").read_text(encoding="utf-8")
    homepage=(ROOT/"index.html").read_text(encoding="utf-8")
    manufacturer=(ROOT/"live/manufacturer.html").read_text(encoding="utf-8")
    vercel=json.loads((ROOT/"vercel.json").read_text(encoding="utf-8"))

    require(plan.get("id")=="scooter-lmt-battery-master-100","wrong official Battery Master id")
    tasks=plan.get("tasks",[])
    require(len(tasks)==100,"official Battery Master must contain exactly 100 tasks")
    require([t["id"] for t in tasks]==list(range(1,101)),"Battery Master IDs must be exactly 1..100")
    require(all(t["status"] in {"green","yellow","red"} for t in tasks),"invalid task status")
    require(all(str(t.get("title","")).strip() and str(t.get("plain","")).strip() for t in tasks),"every task needs normal-language title and explanation")

    counts={s:sum(1 for t in tasks if t["status"]==s) for s in ("green","yellow","red")}
    require(plan.get("counts")=={**counts,"total":100},f"stored counts drift: {plan.get('counts')} vs {counts}")
    first_unfinished=next((t["id"] for t in tasks if t["status"]!="green"),None)
    expected_green_through=100 if first_unfinished is None else first_unfinished-1
    expected_next=None if first_unfinished is None else first_unfinished
    require(plan["sequentialProgress"]=={"greenThrough":expected_green_through,"next":expected_next},
            "sequential progress must match the first unfinished point")
    require(expected_green_through>=20,"points 1-20 must remain GREEN")
    require(tasks[99]["status"]=="red","point 100 cannot be GREEN before 1-99 are complete")

    covered=[]
    for phase in plan.get("phases",[]):
        start,end=phase["range"]
        covered.extend(range(start,end+1))
    require(covered==list(range(1,101)),"phase ranges must cover 1..100 exactly once")

    require("/data/scooter-battery-master-100.json" in script,"Battery Master UI must load canonical JSON")
    require('id="planHost"' in page and 'id="externalGates"' in page,"Battery Master UI hosts missing")
    require("/battery-master" in homepage,"DPP homepage must link official Battery Master")
    require("/battery-master" in manufacturer,"Manufacturer dashboard must link official Battery Master")
    rewrites={(r.get("source"),r.get("destination")) for r in vercel.get("rewrites",[])}
    require(("/battery-master","/live/battery-master") in rewrites,"clean /battery-master rewrite missing")
    require(("/battery-master/","/live/battery-master") in rewrites,"trailing slash Battery Master rewrite missing")

    print(f"BATTERY_MASTER_100_SITE_PASS: {counts['green']} GREEN / {counts['yellow']} YELLOW / {counts['red']} RED; official 1-100 page, data source and clean route are wired")

if __name__=="__main__":
    main()
