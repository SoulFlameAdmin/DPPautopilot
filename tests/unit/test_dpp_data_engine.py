import unittest

from scripts.dpp_data_engine import (
    append_event,
    catalog_index,
    latest_projection,
    load_catalog,
    validate_catalog_contract,
    validate_field_event,
)


class DppDataEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()
        cls.index = catalog_index(cls.catalog)
        cls.path = "model.identification.manufacturer.name"
        cls.access = cls.index[cls.path]["access"]

    def event(self, event_id="00000000-0000-4000-8000-000000000001",
              value="Example Battery Co.", recorded_at="2026-10-02T00:00:00+00:00"):
        return {
            "event_id": event_id,
            "organization_id": "10000000-0000-4000-8000-000000000001",
            "subject_kind": "model",
            "subject_id": "20000000-0000-4000-8000-000000000001",
            "field_path": self.path,
            "value": value,
            "source_kind": "csv",
            "source_ref": "pilot-import.csv:row=2:manufacturer_name",
            "source_date": "2026-10-01T12:00:00+00:00",
            "access_level": self.access,
            "verification_status": "validated",
            "recorded_at": recorded_at,
        }

    def test_catalog_drives_access_and_accepts_complete_event(self):
        validated = validate_field_event(self.event(), self.catalog)
        self.assertEqual(validated["access_level"], self.index[self.path]["access"])

    def test_all_catalog_fields_are_indexed_and_contract_valid(self):
        validated_catalog = validate_catalog_contract(self.catalog)
        self.assertEqual(len(self.index), len(validated_catalog["fields"]))
        self.assertEqual(set(self.index), {field["path"] for field in validated_catalog["fields"]})

    def test_engine_accepts_new_catalog_field_without_engine_code_change(self):
        synthetic = {
            "catalogVersion": "contract-test",
            "fields": [{
                "path": "item.future.dynamic_test_field",
                "requirementIds": ["FUTURE-001"],
                "source": "Synthetic contract fixture",
                "access": "public_identifier",
                "type": "string",
                "required": False,
                "dbTarget": "dpp_battery_items.canonical_data.future.dynamic_test_field",
                "apiTarget": "BatteryItem.future.dynamicTestField",
                "uiTarget": "itemForm.futureDynamicTestField",
            }],
        }
        event = self.event()
        event["subject_kind"] = "item"
        event["field_path"] = "item.future.dynamic_test_field"
        event["access_level"] = "public_identifier"
        event["value"] = "DYNAMIC-VALUE"
        validated = validate_field_event(event, synthetic)
        self.assertEqual(validated["field_path"], "item.future.dynamic_test_field")
        self.assertEqual(validated["value"], "DYNAMIC-VALUE")

    def test_catalog_contract_rejects_duplicate_or_incomplete_fields(self):
        synthetic = {
            "fields": [{
                "path": "model.synthetic",
                "requirementIds": ["SYN-001"],
                "source": "Synthetic",
                "access": "public",
                "type": "string",
                "required": True,
                "dbTarget": "x",
                "apiTarget": "x",
                "uiTarget": "x",
            }]
        }
        duplicate = {"fields": synthetic["fields"] + [dict(synthetic["fields"][0])]}
        with self.assertRaises(ValueError):
            validate_catalog_contract(duplicate)

        incomplete = {"fields": [dict(synthetic["fields"][0])]}
        incomplete["fields"][0].pop("apiTarget")
        with self.assertRaises(ValueError):
            validate_catalog_contract(incomplete)

    def test_rejects_unknown_field_and_access_mismatch(self):
        bad = self.event()
        bad["field_path"] = "model.nonexistent"
        with self.assertRaises(ValueError):
            validate_field_event(bad, self.catalog)

        bad = self.event()
        bad["access_level"] = "authority_only" if self.access != "authority_only" else "public"
        with self.assertRaises(ValueError):
            validate_field_event(bad, self.catalog)

    def test_requires_source_date_and_source_reference(self):
        bad = self.event()
        bad.pop("source_date")
        with self.assertRaises(ValueError):
            validate_field_event(bad, self.catalog)

        bad = self.event()
        bad["source_ref"] = " "
        with self.assertRaises(ValueError):
            validate_field_event(bad, self.catalog)

    def test_rejects_invalid_source_kind_and_blank_reference(self):
        bad = self.event()
        bad["source_kind"] = "unknown"
        with self.assertRaises(ValueError):
            validate_field_event(bad, self.catalog)

        bad = self.event()
        bad["source_ref"] = ""
        with self.assertRaises(ValueError):
            validate_field_event(bad, self.catalog)

    def test_append_preserves_history_and_latest_projection_changes_only_projection(self):
        first = self.event()
        second = self.event(
            event_id="00000000-0000-4000-8000-000000000002",
            value="Example Battery Co. AD",
            recorded_at="2026-10-02T01:00:00+00:00",
        )
        second["supersedes_id"] = first["event_id"]
        history = append_event([], first, self.catalog)
        history = append_event(history, second, self.catalog)
        self.assertEqual(len(history), 2)
        key = f"model|{first['subject_id']}|{self.path}"
        self.assertEqual(latest_projection(history, self.catalog)[key], "Example Battery Co. AD")
        self.assertEqual(history[0]["value"], "Example Battery Co.")


if __name__ == "__main__":
    unittest.main()
