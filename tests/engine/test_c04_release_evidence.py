"""Run the actual C04 manifest security unit suite independently of blocked Main CI.

The tests are synthetic release-evidence fixtures, not proof that live Supabase
has applied pending migrations. Never treat PASS here as C04 production GREEN.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "tests/unit/test_migration_gate_evidence.py"
SPEC = importlib.util.spec_from_file_location("dpp_c04_release_unit", TARGET)
assert SPEC and SPEC.loader and TARGET.is_file()
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

# unittest discovery imports this class; keep one source of truth for test cases.
MigrationGateTests = MODULE.MigrationGateTests
