#!/usr/bin/env python3
"""No-DB, no-network guard for stage-1 DPP platform-security migration."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261008131700_dpp_capacity_update_anon_execute_revoke.sql"
PENDING_ENSURE = ROOT / "supabase/migrations/20261008024500_dpp_organization_ensure.sql"


class CapacityRpcPrivilegeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf8")
        cls.normalized = re.sub(r"\s+", " ", cls.sql.lower())

    def test_depends_on_present_and_reviewed_atomic_ensure_migration(self):
        self.assertTrue(PENDING_ENSURE.is_file())
        self.assertGreater(MIGRATION.name[:14], PENDING_ENSURE.name[:14])

    def test_revokes_anonymous_direct_grant_as_well_as_public(self):
        self.assertRegex(
            self.normalized,
            r"revoke all on function public\.dpp_api_technical_pilot_update_capacity"
            r"\(uuid,numeric,timestamptz\) from public, anon;",
        )

    def test_restores_only_authenticated_execution(self):
        self.assertRegex(
            self.normalized,
            r"grant execute on function public\.dpp_api_technical_pilot_update_capacity"
            r"\(uuid,numeric,timestamptz\) to authenticated;",
        )
        self.assertNotIn("grant execute on function public.dpp_api_technical_pilot_update_capacity(uuid,numeric,timestamptz) to anon", self.normalized)

    def test_asserts_live_anonymous_role_cannot_execute_after_revoke(self):
        self.assertIn("has_function_privilege('anon'", self.normalized)
        self.assertIn("has_function_privilege('authenticated'", self.normalized)
        self.assertIn("raise exception 'p0 security fail:", self.normalized)

    def test_is_non_destructive_and_transactional(self):
        self.assertRegex(self.normalized, r"\bbegin;")
        self.assertRegex(self.normalized, r"\bcommit;")
        for dangerous in (
            r"\bdrop table\b", r"\btruncate\b", r"\bdelete from\b",
            r"\bupdate public\.", r"\binsert into\b", r"\balter table\b",
        ):
            self.assertNotRegex(self.normalized, dangerous)


if __name__ == "__main__":
    unittest.main()
