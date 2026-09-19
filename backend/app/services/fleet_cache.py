from bisect import bisect_left, bisect_right
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from types import MappingProxyType

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Sample, Vessel, VesselMetric


@dataclass(frozen=True)
class MetricCacheEntry:
    key: str
    display_name: str
    unit: str
    origin: str
    source_column: str | None
    formula: str | None
    based_on: tuple[str, ...]
    warning: str | None


@dataclass(frozen=True)
class SampleCacheEntry:
    timestamp: datetime
    latitude_deg: float
    longitude_deg: float
    sog_knots: float
    course_deg: float | None
    heading_deg: float | None
    estimated_rpm: float
    estimated_fuel_tpd: float
    metrics: Mapping[str, float]
    missing_fields: frozenset[str]


@dataclass(frozen=True)
class TelemetryRangeIndex:
    timestamps: tuple[datetime, ...]

    def bounds(self, start: datetime | None, end: datetime | None) -> tuple[int, int]:
        """Return a slice interval by binary-searching the sorted timestamps."""
        left = bisect_left(self.timestamps, start) if start is not None else 0
        right = bisect_right(self.timestamps, end) if end is not None else len(self.timestamps)
        return left, right


@dataclass(frozen=True)
class VesselCacheEntry:
    imo: str
    name: str | None
    samples: tuple[SampleCacheEntry, ...]
    metric_definitions: tuple[MetricCacheEntry, ...]
    range_index: TelemetryRangeIndex

    @property
    def min_timestamp(self) -> datetime | None:
        return self.range_index.timestamps[0] if self.range_index.timestamps else None

    @property
    def max_timestamp(self) -> datetime | None:
        return self.range_index.timestamps[-1] if self.range_index.timestamps else None

    def samples_in_range(
        self, start: datetime | None = None, end: datetime | None = None
    ) -> tuple[SampleCacheEntry, ...]:
        left, right = self.range_index.bounds(start, end)
        return self.samples[left:right]


@dataclass(frozen=True)
class FleetCache:
    """Immutable fleet read model returned to request handlers."""

    entries: Mapping[str, VesselCacheEntry]

    def get(self, imo: str) -> VesselCacheEntry | None:
        return self.entries.get(imo)


class FleetCacheManager:
    """Owns atomic replacement of immutable FleetCache snapshots."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._snapshot = FleetCache(entries=MappingProxyType({}))

    @property
    def snapshot(self) -> FleetCache:
        with self._lock:
            return self._snapshot

    def hydrate(self, session_factory: sessionmaker[Session]) -> None:
        with session_factory() as session:
            vessels = tuple(session.scalars(select(Vessel).order_by(Vessel.imo)))
            entries = {vessel.imo: _build_vessel_entry(session, vessel) for vessel in vessels}
        with self._lock:
            self._snapshot = FleetCache(entries=MappingProxyType(entries))

    def refresh_vessel(self, session: Session, imo: str) -> None:
        """Build one replacement entry only after its database transaction has committed."""
        vessel = session.scalar(select(Vessel).where(Vessel.imo == imo))
        if vessel is None:
            return
        replacement = _build_vessel_entry(session, vessel)
        with self._lock:
            entries = dict(self._snapshot.entries)
            entries[imo] = replacement
            self._snapshot = FleetCache(entries=MappingProxyType(entries))


def _build_vessel_entry(session: Session, vessel: Vessel) -> VesselCacheEntry:
    metrics = tuple(
        MetricCacheEntry(
            key=metric.key,
            display_name=metric.display_name,
            unit=metric.unit,
            origin=metric.origin,
            source_column=metric.source_column,
            formula=metric.formula,
            based_on=tuple(metric.based_on or ()),
            warning=metric.warning,
        )
        for metric in session.scalars(
            select(VesselMetric)
            .where(VesselMetric.vessel_id == vessel.id)
            .order_by(VesselMetric.key)
        )
    )
    source_metric_keys = {metric.key for metric in metrics if metric.origin == "measured"}
    samples = tuple(
        _build_sample_entry(sample, source_metric_keys)
        for sample in session.scalars(
            select(Sample).where(Sample.vessel_id == vessel.id).order_by(Sample.timestamp)
        )
    )
    timestamps = tuple(sample.timestamp for sample in samples)
    return VesselCacheEntry(
        imo=vessel.imo,
        name=vessel.name,
        samples=samples,
        metric_definitions=metrics,
        range_index=TelemetryRangeIndex(timestamps=timestamps),
    )


def _build_sample_entry(sample: Sample, source_metric_keys: set[str]) -> SampleCacheEntry:
    metrics = {key: float(value) for key, value in (sample.metrics_json or {}).items()}
    missing_fields = {
        key
        for key, value in {
            "latitude_deg": sample.latitude_deg,
            "longitude_deg": sample.longitude_deg,
            "sog": sample.sog_knots,
            "course": sample.course_deg,
            "heading": sample.heading_deg,
        }.items()
        if value is None
    }
    # Measured metric definitions describe fields expected from the source telemetry.
    primary_metric_keys = {"latitude_deg", "longitude_deg", "sog", "course", "heading"}
    missing_metric_keys = source_metric_keys - primary_metric_keys - metrics.keys()
    missing_fields.update(missing_metric_keys)
    return SampleCacheEntry(
        timestamp=sample.timestamp,
        latitude_deg=_required_float(sample.latitude_deg, "latitude_deg"),
        longitude_deg=_required_float(sample.longitude_deg, "longitude_deg"),
        sog_knots=_required_float(sample.sog_knots, "sog"),
        course_deg=sample.course_deg,
        heading_deg=sample.heading_deg,
        estimated_rpm=_required_float(sample.estimated_rpm, "rpm"),
        estimated_fuel_tpd=_required_float(sample.estimated_fuel_tpd, "fuel_tpd"),
        metrics=MappingProxyType(metrics),
        missing_fields=frozenset(missing_fields),
    )


def _required_float(value: float | None, field: str) -> float:
    if value is None:
        raise ValueError(f"Persisted sample is missing required field {field!r}.")
    return value
