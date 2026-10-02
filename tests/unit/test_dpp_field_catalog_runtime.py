import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "data" / "dpp-field-catalog.json"
MIGRATION = ROOT / "supabase" / "migrations" / "20261002039000_dpp_field_catalog_access.sql"


class DppRuntimeAccessCatalogTests(unittest.TestCase):
    def test_runtime_access_map_matches_canonical_catalog_exactly(self):
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        sql = MIGRATION.read_text(encoding="utf-8")
        match = re.search(
            r"-- BAT05_RUNTIME_ACCESS_MAP_BEGIN.*?\$catalog\$\s*(\[.*?\])\s*\$catalog\$::jsonb.*?-- BAT05_RUNTIME_ACCESS_MAP_END",
            sql,
            re.S,
        )
        self.assertIsNotNone(match, "BAT05 runtime access map marker missing")
        runtime = json.loads(match.group(1))

        expected = sorted(
            (field["path"], field["access"])
            for field in catalog["fields"]
        )
        actual = sorted((row["path"], row["access"]) for row in runtime)

        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), len(set(path for path, _ in actual)))
        self.assertIn(
            f"select x.path,x.access,'{catalog['catalogVersion']}'",
            sql,
        )


if __name__ == "__main__":
    unittest.main()
