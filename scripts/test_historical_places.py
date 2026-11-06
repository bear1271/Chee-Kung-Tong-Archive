"""Synthetic fixtures only. No site, archive, or registry writes."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from historical_places_schema import Registry
from validate_historical_places import ROOT, validate_registry

CITY = "CKT-CITY-000001"
RECORD = "CKT-R000002"
CITIES = {CITY, "CKT-CITY-000003"}
CITE = {"source_id": "SRC-ARCHIVE", "locator": "Synthetic folio 1"}
MAP_CITE = {"source_id": "SRC-MAP", "locator": "Synthetic sheet A"}
GEO = {"sheet_id": "SHEET-A", "id": "GEO-A", "method": "affine",
       "target_crs": "EPSG:26910", "parameters": {"order": 1},
       "control_points": [{"pixel_xy": [0, 0], "lonlat": [-122.4, 37.8]},
                          {"pixel_xy": [100, 0], "lonlat": [-122.3, 37.8]},
                          {"pixel_xy": [0, 100], "lonlat": [-122.4, 37.7]}],
       "checkpoints": [{"pixel_xy": [50, 50], "lonlat": [-122.35, 37.75]}],
       "checkpoint_rmse_m": 5, "status": "reviewed"}
FIXTURE = {
    "schema_version": "1.0.0",
    "sources": [{"id": f"SRC-{kind.upper()}", "kind": kind,
                 "citation": "Synthetic validation source", "rights_note": "Test only"}
                for kind in ("archive", "directory", "map")],
    "places": [{"id": "PLACE-A", "city_id": CITY,
                "kind": "street_segment", "label": "Synthetic street segment"}],
    "names": [{"id": "NAME-A", "place_id": "PLACE-A", "text_raw": " Test street ",
               "attested_years": {"start": 1913, "end": 1913}, "citation": MAP_CITE,
               "status": "reviewed"}],
    "mentions": [
        {"id": "MENTION-A", "record_id": RECORD, "text_raw": "  Test street ",
         "role": "recipient", "citation": CITE},
        {"id": "MENTION-B", "text_raw": "Test street", "role": "organization_address",
         "citation": {"source_id": "SRC-DIRECTORY", "locator": "Synthetic p. 1"}},
    ],
    "findings": [{"id": "MATCH-A", "mention_id": "MENTION-A", "place_id": "PLACE-A",
                  "status": "candidate", "reasoning": "Synthetic match", "evidence": [MAP_CITE]}],
    "occupancies": [{"id": "USE-A", "place_id": "PLACE-A", "occupant_raw": "Synthetic occupant",
                     "citation": CITE, "status": "candidate"}],
    "map_sheets": [{"id": "SHEET-A", "source_id": "SRC-MAP", "sheet_number": "A",
                    "city_ids": [CITY], "sheet_year": 1913,
                    "iiif_canvas_url": "https://example.invalid/canvas/A"}],
    "georeferences": [GEO],
    "geometries": [
        {"id": "SHAPE-A", "place_id": "PLACE-A", "precision": "street_segment",
         "shape": {"type": "LineString", "coordinates": [[-122.4, 37.8], [-122.39, 37.8]]},
         "method": "digitized", "evidence": [MAP_CITE], "georeference_id": "GEO-A",
         "status": "reviewed"},
    ],
}


class HistoricalPlacesTests(unittest.TestCase):
    def setUp(self):
        self.data = copy.deepcopy(FIXTURE)
        self.root = ROOT

    def check_registry(self):
        registry = Registry.model_validate(self.data)
        validate_registry(registry, CITIES, {RECORD}, self.root)
        return registry

    def test_connected_fixture_preserves_literal_text_and_unknown_validity(self):
        registry = self.check_registry()
        self.assertEqual(registry.mentions[0].text_raw, "  Test street ")
        self.assertIsNone(registry.names[0].use_years)

    def test_duplicate_identity_is_rejected(self):
        self.data["places"] *= 2
        with self.assertRaisesRegex(ValueError, "duplicate places ID"):
            self.check_registry()

    def test_unknown_archive_record_is_rejected(self):
        self.data["mentions"][0]["record_id"] = "CKT-R999999"
        with self.assertRaisesRegex(ValueError, "unknown reference CKT-R999999"):
            self.check_registry()

    def test_external_mention_cannot_become_archive_evidence_by_id(self):
        self.data["mentions"][1]["record_id"] = RECORD
        with self.assertRaisesRegex(ValueError, "external evidence"):
            self.check_registry()

    def test_unknown_city_and_sheet_coverage_are_checked(self):
        self.data["places"][0]["city_id"] = "CKT-CITY-999999"
        with self.assertRaisesRegex(ValueError, "unknown reference"):
            self.check_registry()
        self.data["places"][0]["city_id"] = "CKT-CITY-000003"
        with self.assertRaisesRegex(ValueError, "does not cover"):
            self.check_registry()

    def test_street_segment_cannot_be_a_point(self):
        self.data["geometries"][0]["shape"] = {"type": "Point", "coordinates": [-122.4, 37.8]}
        with self.assertRaisesRegex(ValueError, "shape or precision"):
            self.check_registry()

    def test_swapped_lonlat_and_reversed_dates_are_rejected(self):
        coordinates = self.data["geometries"][0]["shape"]["coordinates"]
        coordinates[0].reverse()
        with self.assertRaisesRegex(ValueError, "longitude, latitude"):
            self.check_registry()
        coordinates[0].reverse()
        self.data["names"][0]["attested_years"] = {"start": 1914, "end": 1913}
        with self.assertRaisesRegex(ValueError, "year bounds are reversed"):
            self.check_registry()

    def test_georeferencing_requires_independent_checks(self):
        geo = self.data["georeferences"][0]
        geo["checkpoints"] = [geo["control_points"][0]]
        with self.assertRaisesRegex(ValueError, "must be distinct"):
            self.check_registry()
        geo["checkpoints"] = []
        geo["checkpoint_rmse_m"] = None
        with self.assertRaisesRegex(ValueError, "requires checkpoint error"):
            self.check_registry()
        geo["status"] = "candidate"
        with self.assertRaisesRegex(ValueError, "requires reviewed georeferencing"):
            self.check_registry()

    def test_asset_integrity_and_repository_boundary(self):
        state = (ROOT / "state").resolve()
        state.mkdir(exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix="historical-places-test-", dir=state)).resolve()
        self.assertEqual(self.root.parent, state)
        self.addCleanup(self.root.rmdir)
        path = self.root / "fixture.txt"
        self.addCleanup(path.unlink, missing_ok=True)
        path.write_bytes(b"synthetic")
        asset = {"path": path.name, "sha256": hashlib.sha256(b"synthetic").hexdigest()}
        self.data["sources"][0]["asset"] = asset
        self.check_registry()
        path.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            self.check_registry()
        asset["path"] = "../outside.txt"
        with self.assertRaisesRegex(ValueError, "repository-relative"):
            self.check_registry()


if __name__ == "__main__":
    unittest.main()
