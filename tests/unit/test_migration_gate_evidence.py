from __future__ import annotations
import hashlib,importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
GS=importlib.util.spec_from_file_location('gen',ROOT/'scripts/generate_migration_release_manifest.py')
GEN=importlib.util.module_from_spec(GS); assert GS and GS.loader; GS.loader.exec_module(GEN)
VS=importlib.util.spec_from_file_location('verify',ROOT/'scripts/verify_migration_gate_evidence.py')
VER=importlib.util.module_from_spec(VS); assert VS and VS.loader; VS.loader.exec_module(VER)
POLICY=json.loads((ROOT/'data/migration-deployment-gate-policy.json').read_text(encoding='utf-8'))

def good():
    sha='abcdef1234567890abcdef1234567890abcdef12'
    manifest=GEN.build_manifest(sha)
    names=[m['name'] for m in manifest['migrations']]
    return {
      'candidate_commit_sha':sha,
      'manifest':manifest,
      'database':{'project_id':'frhletkiuupgksmgxoxc','applied_migration_names':names},
      'schema_verification':{'status':'passed','commit_sha':sha},
    }

class MigrationGateTests(unittest.TestCase):
    def test_accepts_exact_manifest_database_and_schema_evidence(self):
        VER.verify(good(),POLICY)

    def test_rejects_abbreviated_or_non_hex_candidate_sha(self):
        for invalid in ('abcdef123', 'z'*40, 'ABCDEF'*6+'ABCD', ''):
            e=good();e['candidate_commit_sha']=invalid
            with self.assertRaisesRegex(VER.MigrationGateDenied,'exact 40-character'):
                VER.verify(e,POLICY)

    def test_rejects_manifest_commit_drift(self):
        e=good();e['manifest']['commit_sha']='deadbeef'
        with self.assertRaisesRegex(VER.MigrationGateDenied,'manifest commit'): VER.verify(e,POLICY)

    def test_rejects_manifest_checksum_drift(self):
        e=good();e['manifest']['manifest_sha256']='0'*64
        with self.assertRaisesRegex(VER.MigrationGateDenied,'checksum mismatch'): VER.verify(e,POLICY)

    def test_rejects_missing_applied_migration(self):
        e=good();e['database']['applied_migration_names'].pop()
        with self.assertRaisesRegex(VER.MigrationGateDenied,'database missing migrations'): VER.verify(e,POLICY)

    def test_rejects_wrong_database_or_schema_verification(self):
        e=good();e['database']['project_id']='wrong'
        with self.assertRaisesRegex(VER.MigrationGateDenied,'project mismatch'): VER.verify(e,POLICY)
        e=good();e['schema_verification']['status']='failed'
        with self.assertRaisesRegex(VER.MigrationGateDenied,'not passed'): VER.verify(e,POLICY)
        e=good();e['schema_verification']['commit_sha']='deadbeef'
        with self.assertRaisesRegex(VER.MigrationGateDenied,'schema verification commit'): VER.verify(e,POLICY)


    @staticmethod
    def rehash_manifest(e):
        manifest=e['manifest']
        core={'schema_version':manifest['schema_version'],
              'commit_sha':manifest['commit_sha'],
              'migrations':manifest['migrations']}
        manifest['manifest_sha256']=hashlib.sha256(
            json.dumps(core,sort_keys=True,separators=(',',':')).encode()
        ).hexdigest()

    def test_rejects_forged_self_consistent_migration_contents(self):
        e=good()
        e['manifest']['migrations'][0]['sha256']='a'*64
        self.rehash_manifest(e)
        with self.assertRaisesRegex(VER.MigrationGateDenied,'does not match checked-out source'):
            VER.verify(e,POLICY)

    def test_rejects_relabelled_migration_even_if_checksum_recomputed(self):
        e=good()
        e['manifest']['migrations'][0]['name']='invented_dpp_migration_name'
        self.rehash_manifest(e)
        with self.assertRaisesRegex(VER.MigrationGateDenied,'do not match source filename'):
            VER.verify(e,POLICY)

    def test_rejects_manifest_omitting_a_repo_migration(self):
        e=good()
        e['manifest']['migrations'].pop()
        self.rehash_manifest(e)
        with self.assertRaisesRegex(VER.MigrationGateDenied,'every repository migration'):
            VER.verify(e,POLICY)

    def test_rejects_relabelled_filename_version(self):
        e=good()
        e['manifest']['migrations'][0]['filename_version']='19000101000000'
        self.rehash_manifest(e)
        with self.assertRaisesRegex(VER.MigrationGateDenied,'do not match source filename'):
            VER.verify(e,POLICY)

if __name__=='__main__': unittest.main()
