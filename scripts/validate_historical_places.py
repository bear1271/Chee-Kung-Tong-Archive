"""Validate historical place drafts against the current archive, without writing data."""
import argparse
import hashlib
import json
from pathlib import Path

from historical_places_schema import Asset, Registry

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = ROOT / "data/curated/historical_places/registry.json"

GEOMETRY_TYPES = {
    "neighborhood": {"Polygon"},
    "street": {"LineString"},
    "street_segment": {"LineString"},
    "intersection": {"Point"},
    "address": {"Point"},
    "parcel": {"Polygon"},
    "building": {"Point", "Polygon"},
    "site": {"Point", "Polygon"},
}


def read_json(path):
    return json.loads(path.read_bytes())


def unique_index(items, label):
    index = {item.id: item for item in items}
    if len(index) != len(items):
        raise ValueError(f"duplicate {label} ID")
    return index


def require(index, identifier, context):
    if identifier not in index:
        raise ValueError(f"{context}: unknown reference {identifier}")
    return index[identifier] if isinstance(index, dict) else None


def check_asset(asset, root):
    relative = Path(asset.path)
    path = (root / relative).resolve()
    if relative.anchor or not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"asset must be an existing repository-relative file: {asset.path}")
    with path.open("rb") as source:
        checksum = hashlib.file_digest(source, "sha256").hexdigest()
    if checksum != asset.sha256:
        raise ValueError(f"asset checksum mismatch: {asset.path}")


def validate_registry(registry, city_ids, record_ids, root):
    indexes = {group: unique_index(getattr(registry, group), group)
               for group in Registry.model_fields if group != "schema_version"}
    sources, places = indexes["sources"], indexes["places"]
    sheets, georeferences = indexes["map_sheets"], indexes["georeferences"]

    def check_citation(citation, context):
        return require(sources, citation.source_id, context)

    for source in registry.sources:
        if source.asset:
            check_asset(source.asset, root)

    for place in registry.places:
        require(city_ids, place.city_id, place.id)

    for item in [*registry.names, *registry.occupancies]:
        require(places, item.place_id, item.id)
        check_citation(item.citation, item.id)

    for mention in registry.mentions:
        source = check_citation(mention.citation, mention.id)
        if mention.record_id:
            require(record_ids, mention.record_id, mention.id)
            if source.kind != "archive":
                raise ValueError(f"{mention.id}: external evidence cannot directly own an archive record")

    for finding in registry.findings:
        require(indexes["mentions"], finding.mention_id, finding.id)
        require(places, finding.place_id, finding.id)
        for citation in finding.evidence:
            check_citation(citation, finding.id)

    for sheet in registry.map_sheets:
        if require(sources, sheet.source_id, sheet.id).kind != "map":
            raise ValueError(f"{sheet.id}: sheet requires a map source")
        for city_id in sheet.city_ids:
            require(city_ids, city_id, sheet.id)
        if sheet.original:
            check_asset(sheet.original, root)

    for georeference in registry.georeferences:
        sheet = require(sheets, georeference.sheet_id, georeference.id)
        if georeference.raster:
            check_asset(georeference.raster, root)
        if georeference.status == "reviewed" and not (sheet.original or sheet.iiif_canvas_url):
            raise ValueError(f"{georeference.id}: reviewed transform requires a sheet image or IIIF canvas")

    for geometry in registry.geometries:
        place = require(places, geometry.place_id, geometry.id)
        if geometry.precision != place.kind or geometry.shape.type not in GEOMETRY_TYPES[geometry.precision]:
            raise ValueError(f"{geometry.id}: shape or precision does not match the asserted place")
        for citation in geometry.evidence:
            check_citation(citation, geometry.id)
        if geometry.georeference_id:
            reference = require(georeferences, geometry.georeference_id, geometry.id)
            coverage = sheets[reference.sheet_id].city_ids
            if coverage and place.city_id not in coverage:
                raise ValueError(f"{geometry.id}: source sheet does not cover the place's city")
            if geometry.status == "reviewed" and reference.status != "reviewed":
                raise ValueError(f"{geometry.id}: reviewed geometry requires reviewed georeferencing")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--schema", action="store_true", help="print the machine-readable JSON Schema")
    args = parser.parse_args()
    if args.schema:
        print(json.dumps(Registry.model_json_schema(), ensure_ascii=False, indent=2))
        return

    bundle = (ROOT / "site/dist/gazetteer.js").read_text(encoding="utf-8")
    prefix = "window.CKT_GAZETTEER="
    if not bundle.startswith(prefix) or ";window.CKT_COMPAT=" not in bundle:
        raise ValueError("invalid public gazetteer payload")
    catalogue = json.loads(bundle.removeprefix(prefix).split(";window.CKT_COMPAT=", 1)[0])
    city_ids = {city["id"] for city in catalogue["cities"]}
    record_ids = {record["id"] for record in catalogue["records"]}
    current_maps = read_json(ROOT / "data/historical_maps/manifest.json")
    for entry in current_maps:
        check_asset(Asset(path="site/dist/"+entry["image"], sha256=entry["sha256"]), ROOT)

    registry = Registry.model_validate_json(args.registry.read_bytes())
    validate_registry(registry, city_ids, record_ids, ROOT)
    print(f"VALID historical places {registry.schema_version}: "
          f"{len(registry.places)} new places, {len(registry.map_sheets)} new map sheets")
    print(f"Archive references: {len(city_ids)} cities, {len(record_ids)} records, "
          f"{len(current_maps)} original map checksums verified")


if __name__ == "__main__":
    main()
