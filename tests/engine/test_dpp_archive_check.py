import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

PATH = Path(__file__).resolve().parents[2] / 'tools/engine/dpp_archive_check.py'
spec = importlib.util.spec_from_file_location('dpp_archive_check', PATH)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


def fixture(include_auth=True):
    items = [('public', t) for t in check.REQUIRED_DPP]
    if include_auth:
        items += [('auth','users')]
    return '\n'.join(f'{i+1}; 0 1 TABLE DATA {schema} {table} postgres' for i,(schema,table) in enumerate(items))


class ArchiveChecks(unittest.TestCase):
    def test_complete_logical_archive_toc_is_only_structural_pass(self):
        output=check.assess_toc(fixture())
        self.assertTrue(output['structural_toc_pass'])
        self.assertFalse(output['recovery_gate_green'])
        self.assertFalse(output['database_restore_verified'])
        self.assertFalse(output['storage_objects_restored_verified'])

    def test_missing_auth_cannot_be_independent_restore(self):
        output=check.assess_toc(fixture(False))
        self.assertFalse(output['structural_toc_pass'])
        self.assertIn('auth.users',output['missing_required_table_data'])

    def test_missing_passport_history_is_rejected(self):
        toc=fixture().replace('TABLE DATA public dpp_passport_versions', 'TABLE DATA public unrelated')
        output=check.assess_toc(toc)
        self.assertFalse(output['structural_toc_pass'])
        self.assertIn('public.dpp_passport_versions',output['missing_required_table_data'])

    def test_toc_does_not_accept_schema_only_table_entry(self):
        toc=fixture().replace('TABLE DATA public dpp_passports','TABLE public dpp_passports')
        self.assertFalse(check.assess_toc(toc)['structural_toc_pass'])

    def test_partial_mode_still_never_marks_green(self):
        output=check.assess_toc(fixture(False),require_auth=False)
        self.assertTrue(output['structural_toc_pass'])
        self.assertFalse(output['recovery_gate_green'])
        self.assertFalse(output['includes_auth_users_data'])

    def test_malformed_lines_are_ignored(self):
        r=check.find_table_data('; comments\nTABLE DATA public dpp_passports\n1; 0 1 TABLE DATA public dpp_passports postgres')
        self.assertEqual(r, {('public','dpp_passports')})

    def test_invalid_input_does_not_report_success(self):
        with tempfile.TemporaryDirectory() as d:
            with patch('sys.stderr'):
                self.assertEqual(check.main(['--toc',str(Path(d)/'absent')]),2)

    def test_entrypoint_toc_on_disk(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'toc.txt'
            p.write_text(fixture())
            with patch('sys.stdout'):
                exit_code=check.main(['--toc',str(p)])
            self.assertEqual(exit_code,0)

    def test_symlink_cannot_be_ingested(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'toc.txt'; p.write_text(fixture())
            link=Path(d)/'link.txt'; link.symlink_to(p)
            with patch('sys.stderr'):
                self.assertEqual(check.main(['--toc',str(link)]),2)

    def test_archive_invokes_pg_restore_read_only(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fake.dump'; p.write_bytes(b'not-real')
            proc=MagicMock(returncode=0, stdout=fixture(),stderr='')
            with patch.object(check.subprocess,'run',return_value=proc) as mock, patch('sys.stdout'):
                self.assertEqual(check.main(['--archive',str(p)]),0)
            args=mock.call_args.args[0]
            self.assertEqual(args, ['pg_restore','--list',str(p)])

    def test_pg_restore_failure_is_fatal(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fake.dump'; p.write_bytes(b'not-real')
            proc=MagicMock(returncode=1, stdout='',stderr='corrupted')
            with patch.object(check.subprocess,'run',return_value=proc),patch('sys.stderr'):
                self.assertEqual(check.main(['--archive',str(p)]),2)

if __name__=='__main__': unittest.main()
