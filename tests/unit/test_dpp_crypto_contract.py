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
        self.assertNotEqual(points["CR24"]["status"], "GREEN")

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


    def test_nfc_api_rpcs_are_tenant_scoped_and_secret_free(self):
        text = read("supabase/migrations/20261002155000_dpp_nfc_api_rpcs.sql").lower()
        self.assertIn("m.user_id=auth.uid()", text)
        self.assertIn("organization_id=v_org", text)
        self.assertIn("lifecycle_state='active'", text)
        self.assertNotIn("protected_key_reference_fingerprint text", text)
        self.assertNotIn("public_key_or_certificate_fingerprint text", text)

    def test_challenge_api_does_not_persist_raw_challenge(self):
        text = read("api/nfc-challenge.js").lower()
        self.assertIn("p_challenge_hash:issued.challenge_hash", text)
        self.assertNotIn("p_challenge:issued.challenge", text)
        self.assertIn("challenge:issued.challenge", text)

    def test_nfc_status_projection_does_not_expose_key_references(self):
        text = read("api/nfc-status.js").lower()
        self.assertNotIn("protected_key_reference", text)
        self.assertNotIn("certificate_fingerprint", text)
        self.assertNotIn("organization_id:row", text)


    def test_verify_orchestration_cannot_claim_authentic_without_real_boundaries(self):
        text = read("api/nfc-verify.js").lower()
        self.assertIn("proof_provider_unconfigured", text)
        self.assertIn("persistence_boundary_unconfigured", text)
        self.assertIn("provider.result==='authentic'&&!deps.consumeandrecord", text)

    def test_verify_public_response_does_not_expose_proof_or_authorization(self):
        text = read("api/nfc-verify.js").lower()
        self.assertNotIn("proof:body.proof,", text.split("return send(res,200", 1)[1])
        self.assertNotIn("authorization,", text.split("return send(res,200", 1)[1])


    def test_finalize_verification_uses_atomic_consume_and_append_only_event(self):
        text = read("supabase/migrations/20261002161000_dpp_nfc_finalize_verification.sql").lower()
        self.assertIn("dpp_nfc_consume_challenge(", text)
        self.assertIn("insert into public.dpp_nfc_verification_events", text)
        self.assertIn("v_consumed.outcome='replay'", text)
        self.assertIn("v_final_result:='replay'", text)
        self.assertIn("v_consumed.outcome='expired'", text)
        self.assertIn("v_final_result:='expired'", text)

    def test_finalize_verification_is_service_only(self):
        text = read("supabase/migrations/20261002161000_dpp_nfc_finalize_verification.sql").lower()
        self.assertIn("from public,anon,authenticated", text)
        self.assertNotIn("grant execute on function public.dpp_nfc_finalize_verification", text)


    def test_lifecycle_security_requires_evidence_and_preserves_history(self):
        text = read("supabase/migrations/20261002164500_dpp_nfc_lifecycle_security.sql").lower()
        self.assertIn("not p_proof_of_possession_verified", text)
        self.assertIn("not p_configuration_locked", text)
        self.assertIn("lifecycle_state='revoked'", text)
        self.assertIn("lifecycle_state='replaced'", text)
        self.assertIn("replaces_identity_id=p_old_identity_id", text)
        self.assertIn("version_not_advanced", text)
        self.assertNotIn("delete from public.dpp_nfc_identities", text)

    def test_lifecycle_mutations_are_service_only(self):
        text = read("supabase/migrations/20261002164500_dpp_nfc_lifecycle_security.sql").lower()
        for fn in ("dpp_nfc_activate_identity", "dpp_nfc_revoke_identity",
                   "dpp_nfc_mark_replaced", "dpp_nfc_set_tamper_state"):
            with self.subTest(fn=fn):
                self.assertIn(f"revoke all on function public.{fn}", text)
        self.assertNotIn("grant execute on function public.dpp_nfc_", text)

    def test_provider_material_never_adds_symmetric_secret_column(self):
        text = read("supabase/migrations/20261002170500_dpp_nfc_provider_material.sql").lower()
        self.assertIn("public_key_pem text", text)
        self.assertIn("protected_key_reference_fingerprint", text)
        self.assertNotIn("symmetric_key text", text)
        self.assertNotIn("aes_key text", text)
        self.assertNotIn("private_key text", text)
        self.assertIn("from public,anon,authenticated", text)


    def test_cr21_bms_hook_never_weakens_nfc_trust(self):
        text = read("docs/DPP_CRYPTO_CR21_BMS_BINDING.md").lower()
        self.assertIn("nfc and bms proofs are verified independently", text)
        self.assertIn("revoked nfc identity cannot be rescued", text)
        self.assertIn("tampered nfc result remains failed/tampered", text)
        self.assertIn("raw bms private/symmetric keys are not stored", text)
        self.assertIn("bat51+ contracts are not changed", text)

    def test_hardware_gate_requires_attack_evidence_not_only_happy_path(self):
        text = read("docs/DPP_CRYPTO_HARDWARE_PRODUCTION_GATE.md").lower()
        for phrase in ("replay same proof", "expired challenge", "wrong nfc identity/key",
                       "cross-battery swap attempt", "cross-tenant substitution attempt",
                       "backend/kms unavailable fail-closed"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


    def test_cr24_hardware_evidence_template_is_complete_and_pending(self):
        payload = json.loads(read("data/dpp-crypto-hardware-evidence-template.json"))
        self.assertEqual(payload["schema"], "dpp.crypto.hardware-evidence.v1")
        self.assertEqual(len(payload["tests"]), 24)
        self.assertEqual([x["id"] for x in payload["tests"]], [f"HW{i:02d}" for i in range(1, 25)])
        self.assertTrue(all(x["status"] == "PENDING" for x in payload["tests"]))
        self.assertEqual(payload["result"], "PENDING")


    def test_cr25_progress_page_has_no_stale_hardcoded_counts(self):
        text = read("demo/dpp-crypto-progress.html")
        self.assertIn("fetch('../data/dpp-crypto-status.json')", text)
        self.assertIn('id="pct">Loading evidence', text)
        self.assertNotIn('id="pct">4% GREEN', text)
        self.assertNotIn('id="green">1</div>', text)


    def test_cr25_requires_real_reachability_before_green(self):
        text = read("docs/DPP_CRYPTO_CR25_DEPLOYMENT_GATE.md").lower()
        self.assertIn("deployed/reachable url", text)
        self.assertIn("fetching that url returns", text)
        self.assertIn("must not confuse repository ci with a reachable deployed surface", text)
        self.assertIn("cr25 remains yellow", text)


if __name__ == "__main__":
    unittest.main()
