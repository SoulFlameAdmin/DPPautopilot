import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('intake', ROOT / 'scripts/check_qr_pilot_intake.py')
intake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(intake)


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.csv = Path(self.folder.name) / 'input.csv'
        self.approval = Path(self.folder.name) / 'approval.json'
        self.rows = [dict(zip(intake.FIELDS, ['Synthetic Maker', 'MODEL-1', 'portable', f'SAMPLE-{i}'])) for i in range(10)]
        self.permission = dict(company_name='Synthetic Maker', reviewer_name='Reviewer', uat_contact='Contact',
                               approval_reference='SAMPLE-APPROVAL', category_review_reference='SAMPLE-CATEGORY',
                               source_data_use_authorized=True, model_id='MODEL-1', category='portable',
                               authorized_identifiers=[r['unique_identifier'] for r in self.rows],
                               public_fields=['unique_identifier'])

    def run_check(self):
        with self.csv.open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=intake.FIELDS)
            writer.writeheader()
            writer.writerows(self.rows)
        self.approval.write_text(json.dumps(self.permission))
        return intake.check(self.csv, self.approval)

    def test_valid_and_unicode_identifiers_pass(self):
        self.assertEqual(self.run_check(), [])
        self.rows[0]['unique_identifier'] = 'БАТЕРИЯ-😀'
        self.permission['authorized_identifiers'][0] = 'БАТЕРИЯ-😀'
        self.assertEqual(self.run_check(), [])

    def test_invalid_identifiers_fail_even_when_authorized(self):
        for identifier in ['x' * 301, '😀' * 151, 'SAMPLE\nINJECTED', 'SAMPLE\x7f']:
            with self.subTest(identifier=repr(identifier[:20])):
                self.rows[0]['unique_identifier'] = identifier
                self.permission['authorized_identifiers'][0] = identifier
                self.assertTrue(any('printable' in e for e in self.run_check()))

    def test_unknown_category_fails_even_when_approval_matches(self):
        for row in self.rows:
            row['category'] = 'scooter'
        self.permission['category'] = 'scooter'
        self.assertTrue(any('unsupported' in e for e in self.run_check()))

    def test_permission_duplicate_and_row_count_guards(self):
        self.permission['source_data_use_authorized'] = False
        self.assertTrue(self.run_check())
        self.permission['source_data_use_authorized'] = True
        self.rows[1]['unique_identifier'] = self.rows[0]['unique_identifier']
        self.assertTrue(self.run_check())
        self.rows.pop()
        self.assertTrue(self.run_check())

    def test_ambiguous_json_and_malformed_csv_fail(self):
        self.run_check()
        self.approval.write_text('{"source_data_use_authorized":false,"source_data_use_authorized":true}')
        with self.assertRaises(ValueError):
            intake.check(self.csv, self.approval)
        self.approval.write_text(json.dumps(self.permission))
        self.csv.write_text('manufacturer_name,model_id,category,unique_identifier\n"unterminated')
        with self.assertRaises(csv.Error):
            intake.check(self.csv, self.approval)


if __name__ == '__main__':
    unittest.main()
