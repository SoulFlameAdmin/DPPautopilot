#!/usr/bin/env python3
from __future__ import annotations
import json, re, unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RULES=json.loads((ROOT/"data/mapping-assistant-rules.json").read_text(encoding="utf-8"))

def normalize(value: str) -> str:
    value=unicodedata.normalize("NFKD",value).encode("ascii","ignore").decode("ascii")
    value=value.lower().replace("%"," percent ")
    return " ".join(re.findall(r"[a-z0-9]+",value))

def tokens(value: str) -> set[str]:
    return set(normalize(value).split())

def suggest(header: str, threshold: float=0.70) -> list[dict]:
    h=normalize(header)
    ht=tokens(header)
    ranked=[]
    for field in RULES["fields"]:
        best=None
        for alias in field["aliases"]+[field["path"]]:
            a=normalize(alias)
            if h==a:
                candidate=(0.99,"exact normalized alias match",alias)
            else:
                at=tokens(alias)
                if not ht or not at:
                    continue
                overlap=len(ht & at)/len(ht | at)
                containment=len(ht & at)/min(len(ht),len(at))
                score=round(0.55*overlap+0.35*containment,3)
                candidate=(score,"token overlap",alias)
            if best is None or candidate[0]>best[0]:
                best=candidate
        if best and best[0]>=threshold:
            ranked.append({
                "path":field["path"],
                "confidence":best[0],
                "evidence":{"reason":best[1],"matchedAlias":best[2],"normalizedHeader":h}
            })
    return sorted(ranked,key=lambda x:(-x["confidence"],x["path"]))

def best_suggestion(header: str, threshold: float=0.70) -> dict|None:
    results=suggest(header,threshold)
    return results[0] if results else None

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("header")
    args=p.parse_args()
    print(json.dumps(suggest(args.header),indent=2))
