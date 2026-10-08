#!/usr/bin/env python3
"""Verify staged manufacturer onboarding migration cannot report fake 100%."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261008131800_dpp_onboarding_truthful_progress.sql"
API = ROOT / "api/manufacturer-onboarding.js"


class ManufacturerProgressContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()
        cls.api = API.read_text(encoding="utf-8")

    def test_only_company_done_after_8_answers(self):
        self.assertIn("jsonb_build_object('key','company','status','done')", self.sql)
        for key in ("workflow", "product", "batch", "dpp", "qr", "ready"):
            self.assertIn(f"jsonb_build_object('key','{key}','status','pending')", self.sql)
            self.assertNotIn(f"jsonb_build_object('key','{key}','status','done')", self.sql)

    def test_existing_authenticated_role_check_kept(self):
        self.assertIn("public.dpp_require_active_role(array['owner','admin','editor'])", self.sql)
        self.assertIn("security definer", self.sql)
        self.assertIn("set search_path to 'public', 'pg_temp'", self.sql)

    def test_rpc_acl_is_not_open_to_anonymous_callers(self):
        self.assertRegex(self.sql, r"revoke all on function public\.dpp_api_manufacturer_onboarding_configure\(\) from public, anon;")
        self.assertRegex(self.sql, r"grant execute on function public\.dpp_api_manufacturer_onboarding_configure\(\) to authenticated;")

    def test_no_destructive_or_unrelated_schema_changes(self):
        self.assertIn("create or replace function public.dpp_api_manufacturer_onboarding_configure()", self.sql)
        for name in ("drop table", "truncate", "alter table", "drop function"):
            self.assertNotIn(name, self.sql)
        self.assertNotRegex(self.sql, r"\bdelete from\b")
        self.assertNotIn("auth.users", self.sql)

    def test_api_rejects_unearned_completion(self):
        self.assertIn("index===0?'done':'pending'", self.api)
        self.assertNotIn("step.status==='done'", self.api)


if __name__ == "__main__":
    unittest.main()
