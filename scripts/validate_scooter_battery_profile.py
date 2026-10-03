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
    require(profile["batteryCategory"] == "light_means_of_transport", "scooter profile must map to the LMT database category")
    require(profile["qr"]["oneCarrierPerIndividualBattery"] is True, "each battery item must have an individual QR")
    require(profile["qr"]["sharedModelQrAllowed"] is False, "shared model QR must remain disabled")
    require(profile["provisioning"]["publicPassportRoute"].startswith("/passport?identifier="), "public route contract changed")

    accesses = {f.get("access") for f in fields}
    for required_access in profile["fieldRules"]["accessClasses"]:
        require(required_access in accesses, f"catalog has no {required_access} fields")

    public_required = [
        f for f in fields
        if f.get("access") == "public" and f.get("required") is True
    ]
    require(len(public_required) >= 10, "unexpectedly small required public battery field set")
    require(any(f.get("path") == "model.identification.category" for f in public_required), "category field missing")
    require(any(f.get("path") == "item.unique_identifier" for f in fields), "item unique identifier field missing")

    flow = profile["provisioning"]["targetFlow"]
    for step in ["create_battery_item", "assign_unique_identifier", "create_passport", "build_public_url", "generate_qr_label", "verify_qr_resolves"]:
        require(step in flow, f"provisioning flow missing {step}")
    require(flow.index("assign_unique_identifier") < flow.index("generate_qr_label"), "QR cannot precede identifier assignment")
    require(flow.index("create_passport") < flow.index("generate_qr_label"), "QR cannot precede passport creation")

    required_gates = set(profile["acceptance"]["required"])
    expected = {
        "stable_https_public_passport","unique_item_qr","profile_validation","single_item_provisioning",
        "manufacturer_dashboard","batch_import","access_classes","rbac_rls_runtime_proof",
        "lifecycle_and_audit","batch_qr_labels","api_and_export","deployed_e2e_monitoring_backup_restore"
    }
    require(required_gates == expected, "12-point scooter acceptance contract drifted")

    html = (ROOT / "passport/index.html").read_text(encoding="utf-8")
    js = (ROOT / "assets/csp/public-passport.js").read_text(encoding="utf-8")
    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    rewrites = vercel.get("rewrites", [])
    passport_rule = next((r for r in rewrites if r.get("source") == "/passport"), None)
    require(passport_rule and passport_rule.get("destination") == "/passport/index.html", "Vercel /passport route missing")
    catchall_index = next((i for i,r in enumerate(rewrites) if r.get("source") == "/((?!data/|api/).*)"), None)
    passport_index = next((i for i,r in enumerate(rewrites) if r.get("source") == "/passport"), None)
    require(passport_index is not None and catchall_index is not None and passport_index < catchall_index, "passport rewrite must precede catch-all")
    require('fetch("/api/passport?identifier="+encodeURIComponent(identifier)' in js, "public page must query sanitized public API by identifier")
    require("innerHTML" not in js, "public passport renderer must not inject untrusted HTML")
    require('data-public-passport="loading"' in html, "public passport state marker missing")

    print(f"SCOOTER_PROFILE_PASS: LMT profile validated against {len(fields)} catalog fields; 12-point contract and public passport route are stable")


if __name__ == "__main__":
    main()
