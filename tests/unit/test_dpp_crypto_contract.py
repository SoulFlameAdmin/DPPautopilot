from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]

ALLOWED_RESULTS = {
    "authentic", "invalid", "replay", "expired",
    "revoked", "unregistered", "tampered", "backend_error",
}

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def test_cr01_covers_required_threats():
    text = read("docs/DPP_CRYPTO_CR01_THREAT_MODEL.md").lower()
    for term in ("clone", "copied static qr", "replay", "forged", "backend key",
                 "nfc tag swapped", "bms swapped", "tamper", "offline", "privacy"):
        assert term in text

def test_no_passport_on_chip_and_no_uid_auth():
    text = read("docs/DPP_CRYPTO_CR03_CR10_IDENTITY_PROVISIONING.md").lower()
    assert "nfc must not contain" in text
    assert "complete battery passport payload" in text
    assert "uid alone is metadata, never authenticity proof" in text

def test_protocol_result_contract_is_fail_closed():
    text = read("docs/DPP_CRYPTO_CR11_CR23_PROTOCOL.md")
    found = set(re.findall(r"`(authentic|invalid|replay|expired|revoked|unregistered|tampered|backend_error)`", text))
    assert found == ALLOWED_RESULTS
    assert "never authentic" in text.lower()

def test_protocol_has_required_negative_cases():
    text = read("docs/DPP_CRYPTO_CR11_CR23_PROTOCOL.md").lower()
    for term in ("copied static", "replayed consumed challenge", "expired challenge",
                 "wrong certificate", "wrong symmetric", "revoked identity",
                 "counter rollback", "tamper asserted", "cross-tenant",
                 "unsupported algorithm", "malformed/oversized", "key service unavailable"):
        assert term in text

def test_progress_tracker_is_conservative():
    status = json.loads(read("data/dpp-crypto-status.json"))
    assert status["total"] == 25
    assert status["counts"]["green"] + status["counts"]["yellow"] + status["counts"]["red"] + status["counts"]["blocked"] == 25
    assert status["percent_green"] == status["counts"]["green"] * 4
    points = {p["id"]: p for p in status["points"]}
    assert points["CR24"]["status"] == "BLOCKED"
    assert points["CR25"]["status"] != "GREEN"

def test_docs_do_not_contain_pem_private_keys():
    paths = [
        "docs/DPP_CRYPTO_CR01_THREAT_MODEL.md",
        "docs/DPP_CRYPTO_CR02_HARDWARE_DECISION.md",
        "docs/DPP_CRYPTO_CR03_CR10_IDENTITY_PROVISIONING.md",
        "docs/DPP_CRYPTO_CR11_CR23_PROTOCOL.md",
    ]
    for path in paths:
        assert "BEGIN PRIVATE KEY" not in read(path)
        assert "BEGIN EC PRIVATE KEY" not in read(path)
