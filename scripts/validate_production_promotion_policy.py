#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
policy=json.loads((ROOT/'data/production-promotion-policy.json').read_text(encoding='utf-8'))
env=(ROOT/'docs/ENVIRONMENT_POLICY.md').read_text(encoding='utf-8')
verifier=(ROOT/'scripts/verify_production_promotion_evidence.py').read_text(encoding='utf-8')

assert policy.get('version')==1
assert policy.get('task')=='C03'
assert policy.get('status')=='partial'

canonical=policy['canonical']
assert canonical=={
    'source_repo':'SoulFlameAdmin/DPPautopilot',
    'source_branch':'main',
    'vercel_team_id':'team_cKaIZfnCMzoiiq80J0MhV0A2',
    'vercel_project_id':'prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr',
    'vercel_project_name':'dpp-autopilot',
}

conditions=set(policy['promotion_conditions'])
for needed in [
    'source_branch_is_main',
    'candidate_commit_matches_preview_verified_commit',
    'pull_request_ci_passed',
    'preview_verification_passed',
    'migration_gate_passed_or_no_migrations',
    'security_and_browser_smoke_passed',
    'production_target_is_canonical_project',
    'production_deployment_state_READY',
]:
    assert needed in conditions

assert policy['decision']['default']=='deny'
assert policy['decision']['on_missing_or_mismatch']=='deny'
live=policy['live_state']
assert live['observed_deployments_for_canonical_project']>=1
observed=live['observed_ready_preview']
assert observed=={
    'deployment_id':'dpl_kMC7McYaaUaPVdmEXgW5TeUYxd2Q',
    'state':'READY',
    'environment':'preview',
    'target':None,
    'source':'git',
    'commit_sha':'77fe2a39a18fcb26887b9cee2cc9fd0df5a95da7',
    'commit_ref':'m21-export-shape-fresh-main-20260920',
    'url':'dpp-autopilot-95xeakbem-dimitar-lambovs-projects.vercel.app',
}
assert live['promotion_executed'] is False
assert live['deployment_lease_required'] is False

for token in [
    'Production deploys originate from `main`',
    'Preview deployment builds successfully.',
    'Database migrations apply successfully to the non-production target.',
    'Release evidence records the commit SHA',
    'Post-deploy smoke tests verify critical routes',
]:
    assert token in env, f'F10 environment policy missing promotion token: {token}'

for token in [
    'production source branch must be main',
    'CI commit does not match candidate',
    'preview verification is not proven',
    'preview commit does not match candidate',
    'migration gate not passed',
    'security/browser smoke not passed',
    'production project mismatch',
    'target environment is not production',
    'production deployment is not READY',
    'production deployment commit does not match candidate',
]:
    assert token in verifier, f'C03 verifier missing fail-closed check: {token}'

remaining=' '.join(policy['remaining'])
assert 'C02 must be GREEN' in remaining
assert 'DAVID Vercel deployment lease' in remaining
assert 'Post-promotion production smoke' in remaining

print('C03_PROMOTION_POLICY_PASS: READY preview is observed, but production promotion remains fail-closed to prerequisite/commit/lease/target gates; no live promotion is claimed')
