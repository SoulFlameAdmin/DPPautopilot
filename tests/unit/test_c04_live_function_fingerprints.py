"""Focused fail-closed tests for C04 repository-versus-live fingerprint logic."""
from __future__ import annotations

import hashlib
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from scripts import validate_c04_live_function_fingerprints as c04

NAME = "dpp_api_sample_test"
BODY = "\n  SELECT 1;\n"

def evidence(digest: str, observed: datetime | None = None):
    observed = observed or datetime.now(timezone.utc)
    return {
        "version": 1,
        "task": "C04_FUNCTION_DEF",
        "project_id": c04.BOUND_PROJECT,
        "source": "Supabase execute_sql read-only pg_get_functiondef",
        "observed_at": observed.isoformat(),
        "functions": [{"name": NAME, "normalized_body_md5": digest}],
    }

class C04FingerprintTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        path = self.root / "supabase" / "migrations"
        path.mkdir(parents=True)
        self.sql_path = path / "20261030000100_dpp_sample_test.sql"
        self.sql_path.write_text(
            "CREATE OR REPLACE FUNCTION public." + NAME
            + "() RETURNS integer LANGUAGE sql AS $function$"
            + BODY + "$function$;\n", encoding="utf-8"
        )
        self.patch = patch.object(c04, "REQUIRED", {NAME})
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_normalization_preserves_postgres_trim_semantics(self):
        self.assertEqual(c04.normalize_pg_body(BODY), " select 1; ")

    def test_exact_match_is_only_accepted_state(self):
        digest = hashlib.md5(c04.normalize_pg_body(BODY).encode()).hexdigest()
        self.assertEqual(c04.compare(self.root, evidence(digest)), [])

    def test_unauthorized_function_body_change_is_detected(self):
        digest = hashlib.md5(c04.normalize_pg_body(BODY).encode()).hexdigest()
        self.sql_path.write_text(
            "CREATE OR REPLACE FUNCTION public." + NAME
            + "() RETURNS integer LANGUAGE sql AS $function$"
            + "\n  SELECT 2;\n" + "$function$;\n", encoding="utf-8"
        )
        self.assertEqual(c04.compare(self.root, evidence(digest)), [NAME])

    def test_foreign_project_and_stale_evidence_fail_closed(self):
        digest = hashlib.md5(c04.normalize_pg_body(BODY).encode()).hexdigest()
        bad = evidence(digest)
        bad["project_id"] = "another-supabase-project"
        with self.assertRaisesRegex(AssertionError, "project mismatch"):
            c04.compare(self.root, bad)
        with self.assertRaisesRegex(AssertionError, "stale"):
            c04.compare(self.root, evidence(digest, datetime.now(timezone.utc) - timedelta(days=40)))

    def test_duplicate_function_names_fail_closed(self):
        digest = hashlib.md5(c04.normalize_pg_body(BODY).encode()).hexdigest()
        bad = evidence(digest)
        bad["functions"].append(dict(bad["functions"][0]))
        with self.assertRaisesRegex(AssertionError, "exactly five|names/duplicates"):
            c04.compare(self.root, bad)

if __name__ == "__main__":
    unittest.main()
