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


    def test_crypto_migration_uses_canonical_tenant_safe_battery_binding(self):
        text = read("supabase/migrations/20261002005500_dpp_nfc_crypto_persistence.sql").lower()
        self.assertIn("references public.dpp_battery_items(organization_id, id)", text)
        self.assertIn("foreign key (organization_id,battery_item_id)", text)
        self.assertNotIn("references public.dpp_battery_items(unique_identifier)", text)

    def test_crypto_migration_is_deny_by_default_and_rls_enabled(self):
        text = read("supabase/migrations/20261002005500_dpp_nfc_crypto_persistence.sql").lower()
        for table in ("dpp_nfc_identities", "dpp_nfc_provisioning_receipts",
                      "dpp_nfc_challenges", "dpp_nfc_verification_events"):
            with self.subTest(table=table):
                self.assertIn(f"alter table public.{table} enable row level security", text)
                self.assertIn(f"revoke all on table public.{table} from anon,authenticated", text)

    def test_crypto_migration_has_no_raw_secret_columns(self):
        text = read("supabase/migrations/20261002005500_dpp_nfc_crypto_persistence.sql").lower()
        forbidden = ("private_key ", "symmetric_key ", "master_key ", "raw_proof ", "raw_challenge ")
        for term in forbidden:
            with self.subTest(term=term):
                self.assertNotIn(term, text)

    def test_verification_history_and_receipts_have_no_write_policy(self):
        text = read("supabase/migrations/20261002005500_dpp_nfc_crypto_persistence.sql").lower()
        self.assertNotIn("on public.dpp_nfc_verification_events for insert to authenticated", text)
        self.assertNotIn("on public.dpp_nfc_verification_events for update to authenticated", text)
        self.assertNotIn("on public.dpp_nfc_verification_events for delete to authenticated", text)
        self.assertNotIn("on public.dpp_nfc_provisioning_receipts for update to authenticated", text)
        self.assertNotIn("on public.dpp_nfc_provisioning_receipts for delete to authenticated", text)


    def test_cr15_atomic_consume_is_row_locked_and_fail_closed(self):
        text = read("supabase/migrations/20261002153500_dpp_nfc_challenge_consume.sql").lower()
        self.assertIn("for update", text)
        self.assertIn("if v_challenge.consumed_at is not null", text)
        self.assertIn("select 'replay'::text", text)
        self.assertIn("v_challenge.expires_at <= now()", text)
        self.assertIn("select 'expired'::text", text)
        self.assertIn("context_hash is distinct from p_expected_context_hash", text)
        self.assertIn("set consumed_at=now()", text)

    def test_cr15_consume_rpc_is_not_directly_executable_by_clients(self):
        text = read("supabase/migrations/20261002153500_dpp_nfc_challenge_consume.sql").lower()
        self.assertIn(
            "revoke all on function public.dpp_nfc_consume_challenge(uuid,uuid,text,text)",
            text,
        )
        self.assertIn("from public,anon,authenticated", text)
        self.assertNotIn(
            "grant execute on function public.dpp_nfc_consume_challenge",
            text,
        )


if __name__ == "__main__":
    unittest.main()
