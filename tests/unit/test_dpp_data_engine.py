import unittest

from scripts.dpp_data_engine import (
    append_event,
    catalog_index,
    latest_projection,
    load_catalog,
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
