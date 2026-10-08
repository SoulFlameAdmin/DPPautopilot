"""Static fail-closed review of the read-only DPP restore consistency SQL."""
import re
import unittest
from pathlib import Path

SQL=(Path(__file__).resolve().parents[2]/"tools/engine/dpp_restored_database_readonly.sql").read_text()

REQUIRED=(
  "item_model_cross_tenant","passport_item_cross_tenant",
  "passport_version_cross_tenant","batch_model_cross_tenant",
  "provision_item_cross_tenant","provision_passport_cross_tenant",
  "batch_serial_mismatch","batch_passport_item_mismatch",
  "missing_serials","duplicate_serial_per_org",
  "duplicate_passport_version"
)

class RestoreIntegrityContract(unittest.TestCase):
  def test_read_only_snapshot_transaction(self):
    self.assertIn("BEGIN TRANSACTION READ ONLY;",SQL)
    self.assertIn("ROLLBACK;",SQL)
    self.assertNotRegex(SQL.lower(),r"\b(update|delete|insert|truncate|alter|drop|grant|revoke)\s+(?:from\s+|into\s+|table\s+|function\s+)?public\.")

  def test_cross_tenant_consistency_matrix(self):
    for key in REQUIRED:
      self.assertIn("'"+key+"'",SQL,key)
    self.assertEqual(len(REQUIRED),11)
    self.assertIn("IS DISTINCT FROM",SQL)

  def test_failed_restore_not_falsely_marked_green(self):
    self.assertIn("'storage_bytes_verified', FALSE",SQL)
    self.assertIn("Actual Storage bytes need separate restore",SQL)

  def test_report_contains_no_private_row_details(self):
    self.assertIn("jsonb_build_object",SQL)
    self.assertIn("'passports', (SELECT count(*)",SQL)
    self.assertNotIn("SELECT * FROM public.dpp_",SQL)

if __name__=="__main__":
  unittest.main()
