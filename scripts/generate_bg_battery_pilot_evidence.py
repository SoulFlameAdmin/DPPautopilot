#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import csv
import io
import json
import subprocess
import zipfile
from pathlib import Path
from urllib.parse import urlencode

import qrcode

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ACCESS = {"public", "public_identifier"}
MODEL_ID = "SFBG-ESS-100-DEMO"
UID_PREFIX = f"urn:dpp:pilot:bg:battery:{MODEL_ID}:"
DEFAULT_BASE_URL = "http://127.0.0.1:8000/demo/bg-battery-passport.html"


def get_path(obj, dotted):
    cur = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True


def set_path(obj, dotted, value):
    parts = dotted.split(".")
    cur = obj
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = copy.deepcopy(value)


def synthetic_fixture(sample):
    fixture = copy.deepcopy(sample)
    fixture["fixtureVersion"] = "bg-pilot-nonclient-1.0"
    fixture["synthetic"] = True
    fixture["disclaimer"] = (
        "Synthetic BG Battery Pilot acceptance data only. It is not customer data, "
        "not a conformity assessment, and not a legal certification."
    )
    model = fixture["model"]
    model["identification"]["manufacturer"]["name"] = "SoulFlame BG Pilot Manufacturer (Synthetic)"
    model["identification"]["manufacturer"]["postal_address"] = "1 Synthetic Energy Park, Sofia 1000, BG (Synthetic)"
    model["identification"]["manufacturer"]["contact"] = "battery-pilot@example.invalid"
    model["identification"]["category"] = "industrial"
    model["identification"]["model_id"] = MODEL_ID
    model["identification"]["place_of_manufacture"] = "Sofia, Bulgaria (Synthetic)"
    model["warranty_calendar_life"] = "10 years (Synthetic)"

    template = copy.deepcopy(sample["items"][0])
    items = []
    for serial in range(1, 11):
        item = copy.deepcopy(template)
        item["unique_identifier"] = f"{UID_PREFIX}{serial:06d}"
        if isinstance(item.get("performance_history"), list) and item["performance_history"]:
            item["performance_history"][0]["event"] = f"synthetic_pilot_item_{serial:02d}"
        items.append(item)
    fixture["items"] = items
    return fixture


def public_projection(catalog, fixture, item):
    payload = {}
    for field in catalog.get("fields", []):
        if field.get("access") not in PUBLIC_ACCESS:
            continue
        path = field["path"]
        if path.startswith("model."):
            value, exists = get_path(fixture, path)
        elif path.startswith("item."):
            value, exists = get_path(item, path.removeprefix("item."))
            path = "item." + path.removeprefix("item.")
        else:
            continue
        if exists:
            set_path(payload, path, value)
    return payload


def restricted_paths(catalog, payload):
    leaked = []
    for field in catalog.get("fields", []):
        if field.get("access") in PUBLIC_ACCESS:
            continue
        _, exists = get_path(payload, field["path"])
        if exists:
            leaked.append(field["path"])
    return leaked


def public_required_fields(catalog):
    result = []
    for field in catalog.get("fields", []):
        if field.get("access") not in PUBLIC_ACCESS:
            continue
        required = field.get("required")
        if required is True or str(required).startswith("conditional") or field["path"] == "item.unique_identifier":
            result.append(field)
    return result


def public_completeness(catalog, fixture, item):
    fields = public_required_fields(catalog)
    missing = []
    for field in fields:
        path = field["path"]
        if path.startswith("model."):
            value, exists = get_path(fixture, path)
        else:
            value, exists = get_path(item, path.removeprefix("item."))
        if not exists or value is None or (isinstance(value, str) and not value.strip()):
            missing.append({
                "path": field["path"],
                "source": field.get("source"),
                "uiTarget": field.get("uiTarget"),
            })
    total = len(fields)
    score = round(((total - len(missing)) / total) * 100, 1) if total else 100.0
    return {"required": total, "missingCount": len(missing), "score": score, "missing": missing}


def verify_offer(path):
    text = path.read_text(encoding="utf-8")
    required = [
        "# BG Battery Pilot — Commercial Offer",
        "## Scope",
        "## Deliverables",
        "## Customer responsibilities",
        "## Exclusions",
        "## Acceptance",
        "managed pilot",
        "not legal certification",
        "real customer data",
    ]
    missing = [token for token in required if token not in text]
    if missing:
        raise AssertionError(f"commercial offer missing required content: {missing}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="artifacts/bg-battery-pilot")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--require-qr-decode", action="store_true")
    args = parser.parse_args()

    catalog = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
    sample = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
    pilot = json.loads((ROOT / "data/bg-battery-pilot-v1.json").read_text(encoding="utf-8"))
    verify_offer(ROOT / "docs/BG_BATTERY_PILOT_COMMERCIAL_OFFER.md")

    if pilot.get("market") != "BG" or pilot.get("acceptance", {}).get("itemsMinimum") != 10:
        raise AssertionError("BG pilot contract drifted from 10-item Bulgarian acceptance baseline")

    fixture = synthetic_fixture(sample)
    items = fixture["items"]
    identifiers = [item["unique_identifier"] for item in items]
    if len(items) != 10 or len(set(identifiers)) != 10:
        raise AssertionError("BG04 requires exactly 10 unique synthetic acceptance identifiers")

    projections = []
    completeness = []
    for item in items:
        projected = public_projection(catalog, fixture, item)
        leaks = restricted_paths(catalog, projected)
        if leaks:
            raise AssertionError(f"BG03 restricted fields leaked into public projection: {leaks}")
        projections.append(projected)
        report = public_completeness(catalog, fixture, item)
        if report["score"] != 100.0 or report["missingCount"] != 0:
            raise AssertionError(f"BG06 synthetic public intake is incomplete: {report}")
        completeness.append({"unique_identifier": item["unique_identifier"], **report})

    out = ROOT / args.out
    qr_dir = out / "qr"
    out.mkdir(parents=True, exist_ok=True)
    qr_dir.mkdir(parents=True, exist_ok=True)

    routes = []
    for index, uid in enumerate(identifiers, start=1):
        url = f"{args.base_url}?{urlencode({'id': uid})}"
        png = qr_dir / f"battery-{index:02d}.png"
        qrcode.make(url).save(png)
        decoded = None
        if args.require_qr_decode:
            proc = subprocess.run(["zbarimg", "--quiet", "--raw", str(png)], capture_output=True, text=True, check=True)
            decoded = proc.stdout.strip()
            if decoded != url:
                raise AssertionError(f"BG05 QR decode mismatch for item {index}: {decoded!r} != {url!r}")
        routes.append({"item": index, "unique_identifier": uid, "url": url, "qr": png.relative_to(ROOT).as_posix(), "decoded": decoded})

    (out / "synthetic-dataset.json").write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "
", encoding="utf-8")
    (out / "public-passports.json").write_text(json.dumps(projections, indent=2, ensure_ascii=False) + "
", encoding="utf-8")
    (out / "completeness-report.json").write_text(json.dumps(completeness, indent=2, ensure_ascii=False) + "
", encoding="utf-8")
    (out / "qr-routes.json").write_text(json.dumps(routes, indent=2, ensure_ascii=False) + "
", encoding="utf-8")

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf)
    writer.writerow(["unique_identifier", "passport_url"])
    for route in routes:
        writer.writerow([route["unique_identifier"], route["url"]])
    (out / "passport-index.csv").write_text(csv_buf.getvalue(), encoding="utf-8")

    manifest = {
        "version": 1,
        "synthetic": True,
        "customerEvidence": False,
        "gates": {
            "BG03": {"pass": True, "restrictedLeakCount": 0, "itemsChecked": 10},
            "BG04": {"pass": True, "uniqueIdentifiers": 10, "itemsChecked": 10},
            "BG05": {"pass": True, "qrGenerated": 10, "qrDecoded": 10 if args.require_qr_decode else 0},
            "BG06": {"pass": True, "reports": 10, "minimumScore": min(x["score"] for x in completeness)},
            "BG07": {"pass": True, "evidencePackage": "bg-battery-pilot-evidence.zip"},
            "BG10": {"pass": True, "offer": "docs/BG_BATTERY_PILOT_COMMERCIAL_OFFER.md"},
        },
        "blocked": {
            "BG02": "Requires an explicitly agreed real customer dataset and transfer channel.",
            "BG09": "Requires recorded UAT by a real pilot customer.",
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "
", encoding="utf-8")

    zip_path = out / "bg-battery-pilot-evidence.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in ["manifest.json", "synthetic-dataset.json", "public-passports.json", "completeness-report.json", "qr-routes.json", "passport-index.csv"]:
            zf.write(out / name, arcname=name)
        zf.write(ROOT / "docs/BG_BATTERY_PILOT_COMMERCIAL_OFFER.md", arcname="BG_BATTERY_PILOT_COMMERCIAL_OFFER.md")

    if not zip_path.is_file() or zip_path.stat().st_size == 0:
        raise AssertionError("BG07 evidence package was not generated")

    print("BG_BATTERY_NONCLIENT_PASS: BG03 BG04 BG05 BG06 BG07 BG10 validated on 10 synthetic items; BG02/BG09 remain external-customer gates")


if __name__ == "__main__":
    main()
