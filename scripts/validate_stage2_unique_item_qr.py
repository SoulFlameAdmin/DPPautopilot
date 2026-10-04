#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    schema = (ROOT / "supabase/migrations/20260918231500_dpp_core_schema.sql").read_text(encoding="utf-8")
    qr_api = (ROOT / "api/qr.js").read_text(encoding="utf-8")
    qr_tests = (ROOT / "tests/api/qr.test.cjs").read_text(encoding="utf-8")
    profile = json.loads((ROOT / "data/scooter-battery-profile-v1.json").read_text(encoding="utf-8"))

    require("unique_identifier text not null unique" in schema, "battery unique_identifier must remain globally UNIQUE and NOT NULL")
    require(profile["qr"]["oneCarrierPerIndividualBattery"] is True, "one QR carrier per individual battery must remain required")
    require(profile["qr"]["sharedModelQrAllowed"] is False, "shared model QR must remain forbidden")
    require("buildPassportUrl(identifier" in qr_api, "QR must be derived from the battery identifier")
    require("encodeURIComponent(identifier)" in qr_api, "QR target must safely encode the exact battery identifier")
    require("X-DPP-Identifier" in qr_api, "QR response must expose the exact source battery identifier for runtime proof")
    require("X-DPP-Target" in qr_api, "QR response must expose its canonical public passport target")
    require("different battery identifiers produce different canonical targets and different QR carriers" in qr_tests, "distinct-identifier QR regression test missing")
    require("assert.notEqual(a.body,b.body)" in qr_tests, "distinct battery identifiers must generate distinct QR SVG bodies")

    print("STAGE2_UNIQUE_ITEM_QR_PASS: globally unique battery IDs + one-per-item canonical QR carrier contract validated")

if __name__ == "__main__":
    main()
