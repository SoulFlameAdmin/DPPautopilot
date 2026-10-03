#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    profile = json.loads((ROOT / "data/scooter-battery-profile-v1.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / profile["fieldCatalog"]).read_text(encoding="utf-8"))
    fields = catalog.get("fields", [])

    require(profile["profileId"] == "scooter-battery-dpp-v1", "profile id changed")
    require(profile["batteryCategory"] == "light_means_of_transport", "scooter profile must map to LMT")
    require(profile["qr"]["oneCarrierPerIndividualBattery"] is True, "each battery must have its own QR")
    require(profile["qr"]["sharedModelQrAllowed"] is False, "shared model QR must remain disabled")
    require(profile["qr"]["printLabelImplemented"] is True, "print label software flow must be present")
    require(profile["qr"]["physicalPrinterAcceptanceRequired"] is True, "physical printer acceptance must remain explicit")

    accesses = {f.get("access") for f in fields}
    for required_access in profile["fieldRules"]["accessClasses"]:
        require(required_access in accesses, f"catalog has no {required_access} fields")

    public_required = [f for f in fields if f.get("access") == "public" and f.get("required") is True]
    require(len(public_required) >= 10, "unexpectedly small required public field set")
    require(any(f.get("path") == "model.identification.category" for f in public_required), "category field missing")
    require(any(f.get("path") == "item.unique_identifier" for f in fields), "unique identifier field missing")

    flow = profile["provisioning"]["targetFlow"]
    for step in ["create_battery_item","assign_unique_identifier","create_passport","build_public_url","generate_qr_label","verify_qr_resolves"]:
        require(step in flow, f"provisioning flow missing {step}")
    require(flow.index("assign_unique_identifier") < flow.index("generate_qr_label"), "QR cannot precede identifier assignment")
    require(flow.index("create_passport") < flow.index("generate_qr_label"), "QR cannot precede passport creation")

    expected = {
        "stable_https_public_passport","unique_item_qr","profile_validation","single_item_provisioning",
        "manufacturer_dashboard","batch_import","access_classes","rbac_rls_runtime_proof",
        "lifecycle_and_audit","batch_qr_labels","api_and_export","deployed_e2e_monitoring_backup_restore"
    }
    require(set(profile["acceptance"]["required"]) == expected, "12-point scooter acceptance contract drifted")

    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    rewrites = vercel.get("rewrites", [])
    passport_index = next((i for i,r in enumerate(rewrites) if r.get("source") == "/passport" and r.get("destination") == "/live/passport.html"), None)
    qr_index = next((i for i,r in enumerate(rewrites) if r.get("source") == "/qr" and r.get("destination") == "/live/qr.html"), None)
    catchall_index = next((i for i,r in enumerate(rewrites) if r.get("source") == "/((?!data/|api/).*)"), None)
    require(passport_index is not None, "live /passport rewrite missing")
    require(qr_index is not None, "live /qr rewrite missing")
    require(catchall_index is not None and passport_index < catchall_index and qr_index < catchall_index, "live routes must precede catch-all")

    qr_html = (ROOT / "live/qr.html").read_text(encoding="utf-8")
    qr_js = (ROOT / "assets/csp/qr-inline-1.js").read_text(encoding="utf-8")
    qr_api = (ROOT / "api/qr.js").read_text(encoding="utf-8")
    passport_js = (ROOT / "assets/csp/live-passport-inline-1.js").read_text(encoding="utf-8")

    require('id="printLabel"' in qr_html, "print label action missing")
    require("window.print()" in qr_js, "physical print trigger missing")
    require("verifyPublicPassport" in qr_js and "/api/passport?identifier=" in qr_js, "QR label must verify public passport")
    require("data.qrReady" not in qr_js, "unexpected print state contract")
    require("document.body.dataset.qrReady!=='true'" in qr_js, "print action must be gated by verified QR state")
    require("https://" in qr_api or "canonicalOrigin" in qr_api, "QR API must build canonical HTTPS target")
    require("/api/passport?identifier=" in passport_js, "live passport must load sanitized passport API")

    print(f"SCOOTER_QR_RELEASE_PASS: LMT profile, live passport, verified QR label and printer gate validated against {len(fields)} catalog fields")

if __name__ == "__main__":
    main()
