from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]

ALLOWED_RESULTS = {
    "authentic", "invalid", "replay", "expired",
    "revoked", "unregistered", "tampered", "backend_error",
}


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


class DppCryptoContractTests(unittest.TestCase):
    def test_cr01_covers_required_threats(self):
        text = read("docs/DPP_CRYPTO_CR01_THREAT_MODEL.md").lower()
        for term in ("clone", "copied static qr", "replay", "forged", "backend key",
                     "nfc tag swapped", "bms swapped", "tamper", "offline", "privacy"):
            with self.subTest(term=term):
                self.assertIn(term, text)

    def test_no_passport_on_chip_and_no_uid_auth(self):
        text = read("docs/DPP_CRYPTO_CR03_CR10_IDENTITY_PROVISIONING.md").lower()
        self.assertIn("nfc must not contain", text)
        self.assertIn("complete battery passport payload", text)
        self.assertIn("uid alone is metadata, never authenticity proof", text)

    def test_protocol_result_contract_is_fail_closed(self):
        text = read("docs/DPP_CRYPTO_CR11_CR23_PROTOCOL.md")
        found = set(re.findall(
            r"`(authentic|invalid|replay|expired|revoked|unregistered|tampered|backend_error)`",
            text,
        ))
        self.assertEqual(found, ALLOWED_RESULTS)
        self.assertIn("never authentic", text.lower())

    def test_protocol_has_required_negative_cases(self):
        text = read("docs/DPP_CRYPTO_CR11_CR23_PROTOCOL.md").lower()
        for term in ("copied static", "replayed consumed challenge", "expired challenge",
                     "wrong certificate", "wrong symmetric", "revoked identity",
                     "counter rollback", "tamper asserted", "cross-tenant",
                     "unsupported algorithm", "malformed/oversized", "key service unavailable"):
            with self.subTest(term=term):
                self.assertIn(term, text)

    def test_progress_tracker_is_conservative(self):
        status = json.loads(read("data/dpp-crypto-status.json"))
        self.assertEqual(status["total"], 25)
        self.assertEqual(
            status["counts"]["green"] + status["counts"]["yellow"]
            + status["counts"]["red"] + status["counts"]["blocked"],
            25,
        )
        self.assertEqual(status["percent_green"], status["counts"]["green"] * 4)
        points = {p["id"]: p for p in status["points"]}
        self.assertEqual(points["CR24"]["status"], "BLOCKED")
        self.assertNotEqual(points["CR25"]["status"], "GREEN")

    def test_docs_do_not_contain_pem_private_keys(self):
        paths = [
            "docs/DPP_CRYPTO_CR01_THREAT_MODEL.md",
            "docs/DPP_CRYPTO_CR02_HARDWARE_DECISION.md",
            "docs/DPP_CRYPTO_CR03_CR10_IDENTITY_PROVISIONING.md",
            "docs/DPP_CRYPTO_CR11_CR23_PROTOCOL.md",
        ]
        for path in paths:
            with self.subTest(path=path):
                body = read(path)
                self.assertNotIn("BEGIN PRIVATE KEY", body)
                self.assertNotIn("BEGIN EC PRIVATE KEY", body)


if __name__ == "__main__":
    unittest.main()
