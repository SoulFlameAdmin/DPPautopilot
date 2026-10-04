from __future__ import annotations
import copy
import json
import unittest
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"scripts"))
from scooter_schema_validation import validate_fixture

SCHEMA=json.loads((ROOT/"data/scooter-battery-schema-v1.json").read_text(encoding="utf-8"))
FIXTURE=json.loads((ROOT/"data/scooter-battery-sample-v1.json").read_text(encoding="utf-8"))

class ScooterSchemaValidationTests(unittest.TestCase):
    def test_complete_lmt_fixture_is_valid(self):
        self.assertEqual(validate_fixture(SCHEMA,FIXTURE),[])

    def test_wrong_category_fails(self):
        broken=copy.deepcopy(FIXTURE)
        broken["model"]["identification"]["category"]="electric_vehicle"
        self.assertTrue(any("category" in e for e in validate_fixture(SCHEMA,broken)))

    def test_missing_required_field_fails(self):
        broken=copy.deepcopy(FIXTURE)
        del broken["model"]["composition"]["chemistry"]
        self.assertTrue(any("model.composition.chemistry" in e for e in validate_fixture(SCHEMA,broken)))

    def test_duplicate_item_identifier_fails(self):
        broken=copy.deepcopy(FIXTURE)
        broken["items"][1]["unique_identifier"]=broken["items"][0]["unique_identifier"]
        self.assertTrue(any("must be unique" in e for e in validate_fixture(SCHEMA,broken)))

    def test_voltage_order_fails(self):
        broken=copy.deepcopy(FIXTURE)
        broken["model"]["voltage"]["minimum_v"]=60
        self.assertTrue(any("model.voltage" in e for e in validate_fixture(SCHEMA,broken)))

    def test_state_of_health_range_fails(self):
        broken=copy.deepcopy(FIXTURE)
        broken["items"][0]["state_of_health"]["percent"]=101
        self.assertTrue(any("state_of_health.percent" in e for e in validate_fixture(SCHEMA,broken)))

if __name__=="__main__":
    unittest.main()
