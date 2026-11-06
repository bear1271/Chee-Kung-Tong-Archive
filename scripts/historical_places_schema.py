"""Contracts for historical location research, independent of the live site."""
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, StringConstraints, field_validator, model_validator

from gazetteer_schemas import Strict

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ID = Annotated[str, StringConstraints(pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")]
URL = Annotated[str, StringConstraints(pattern=r"^https?://[^\s]+$")]
Year = Annotated[int, Field(ge=1, le=9999)]
Number = Annotated[float, Field(allow_inf_nan=False)]
Distance = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Position = Annotated[list[Number], Field(min_length=2, max_length=2)]
Review = Literal["candidate", "reviewed", "disputed"]
PlaceKind = Literal["neighborhood", "street", "street_segment", "intersection",
                    "address", "parcel", "building", "site"]


class Years(Strict):
    start: Year | None = None
    end: Year | None = None
    note: Text | None = None

    @model_validator(mode="after")
    def check_order(self):
        if self.start is None and self.end is None:
            raise ValueError("use null for an unknown interval")
        if self.start is not None and self.end is not None and self.start > self.end:
            raise ValueError("year bounds are reversed")
        return self


class Asset(Strict):
    path: Text
    sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]


class Source(Strict):
    id: ID
    kind: Literal["archive", "directory", "map", "other"]
    citation: Text
    rights_note: Text
    source_years: Years | None = None
    url: URL | None = None
    asset: Asset | None = None


class Citation(Strict):
    source_id: ID
    locator: Text


class Place(Strict):
    id: ID
    city_id: ID
    kind: PlaceKind
    label: Text


def preserve_nonblank_text(value):
    if not value.strip():
        raise ValueError("source text is blank")
    return value


RawText = Annotated[str, AfterValidator(preserve_nonblank_text)]


class Name(Strict):
    id: ID
    place_id: ID
    text_raw: RawText
    language: Text | None = None
    attested_years: Years | None = None
    use_years: Years | None = None
    citation: Citation
    status: Review


class Mention(Strict):
    id: ID
    citation: Citation
    text_raw: RawText
    record_id: ID | None = None
    role: Literal["sender", "recipient", "organization_address", "mentioned", "unknown"]
    attested_years: Years | None = None


class Finding(Strict):
    """A candidate or reviewed match between an occurrence and a place."""

    id: ID
    mention_id: ID
    place_id: ID
    evidence: Annotated[list[Citation], Field(min_length=1)]
    reasoning: Text
    status: Review


class Occupancy(Strict):
    id: ID
    place_id: ID
    occupant_raw: RawText
    citation: Citation
    attested_years: Years | None = None
    use_years: Years | None = None
    status: Review


class MapSheet(Strict):
    id: ID
    source_id: ID
    sheet_number: Text
    city_ids: list[ID]
    scale_denominator: Annotated[int, Field(gt=0)] | None = None
    sheet_year: Year | None = None
    publication_year: Year | None = None
    survey_years: Years | None = None
    revision_years: Years | None = None
    iiif_canvas_url: URL | None = None
    original: Asset | None = None


def check_lonlat(position):
    lon, lat = position
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError("expected longitude, latitude in WGS84")


class ControlPoint(Strict):
    pixel_xy: Annotated[list[Distance], Field(min_length=2, max_length=2)]
    lonlat: Position

    @field_validator("lonlat")
    @classmethod
    def valid_lonlat(cls, position):
        check_lonlat(position)
        return position


Line = Annotated[list[Position], Field(min_length=2)]
Ring = Annotated[list[Position], Field(min_length=4)]
Rings = Annotated[list[Ring], Field(min_length=1)]


class Point(Strict):
    type: Literal["Point"]
    coordinates: Position

    @field_validator("coordinates")
    @classmethod
    def valid_position(cls, position):
        check_lonlat(position)
        return position


class LineString(Strict):
    type: Literal["LineString"]
    coordinates: Line

    @field_validator("coordinates")
    @classmethod
    def valid_line(cls, line):
        for position in line:
            check_lonlat(position)
        if len({tuple(position) for position in line}) < 2:
            raise ValueError("line needs distinct positions")
        return line


class Polygon(Strict):
    type: Literal["Polygon"]
    coordinates: Rings

    @field_validator("coordinates")
    @classmethod
    def valid_rings(cls, rings):
        for ring in rings:
            for position in ring:
                check_lonlat(position)
            if ring[0] != ring[-1] or len({tuple(position) for position in ring}) < 3:
                raise ValueError("polygon rings need closure and three distinct vertices")
        return rings


class Georeference(Strict):
    id: ID
    sheet_id: ID
    method: Text
    target_crs: Text
    parameters: dict[Text, str | int | Number | bool] = Field(default_factory=dict)
    footprint: Polygon | None = None
    control_points: Annotated[list[ControlPoint], Field(min_length=3)]
    checkpoints: list[ControlPoint]
    checkpoint_rmse_m: Distance | None = None
    raster: Asset | None = None
    status: Review

    @model_validator(mode="after")
    def independent_checks(self):
        points = self.control_points + self.checkpoints
        if len({tuple(point.pixel_xy) for point in points}) != len(points):
            raise ValueError("control and check pixels must be distinct")
        x0, y0 = self.control_points[0].pixel_xy
        x1, y1 = self.control_points[1].pixel_xy
        if all((x - x0) * (y1 - y0) == (y - y0) * (x1 - x0)
               for x, y in (point.pixel_xy for point in self.control_points[2:])):
            raise ValueError("control pixels are collinear")
        if self.checkpoint_rmse_m is not None and not self.checkpoints:
            raise ValueError("checkpoint error requires independent checkpoints")
        if self.status == "reviewed" and self.checkpoint_rmse_m is None:
            raise ValueError("reviewed georeferencing requires checkpoint error")
        return self


class Geometry(Strict):
    id: ID
    place_id: ID
    shape: Annotated[Point | LineString | Polygon, Field(discriminator="type")]
    precision: PlaceKind
    method: Text
    valid_years: Years | None = None
    uncertainty_m: Distance | None = None
    evidence: Annotated[list[Citation], Field(min_length=1)]
    georeference_id: ID | None = None
    status: Review


class Registry(Strict):
    schema_version: Literal["1.0.0"]
    sources: list[Source]
    places: list[Place]
    names: list[Name]
    mentions: list[Mention]
    findings: list[Finding]
    occupancies: list[Occupancy]
    map_sheets: list[MapSheet]
    georeferences: list[Georeference]
    geometries: list[Geometry]
