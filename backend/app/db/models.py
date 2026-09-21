from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Vessel(Base):
    __tablename__ = "vessels"

    id: Mapped[int] = mapped_column(primary_key=True)
    imo: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Sample(Base):
    __tablename__ = "samples"
    __table_args__ = (
        UniqueConstraint("vessel_id", "timestamp", name="uq_samples_vessel_timestamp"),
        Index("ix_samples_vessel_timestamp", "vessel_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    vessel_id: Mapped[int] = mapped_column(ForeignKey("vessels.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    latitude_deg: Mapped[float | None] = mapped_column(Float)
    longitude_deg: Mapped[float | None] = mapped_column(Float)
    sog_knots: Mapped[float | None] = mapped_column(Float)
    course_deg: Mapped[float | None] = mapped_column(Float)
    heading_deg: Mapped[float | None] = mapped_column(Float)
    estimated_rpm: Mapped[float | None] = mapped_column(Float)
    estimated_fuel_tpd: Mapped[float | None] = mapped_column(Float)
    metrics_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class EnvironmentalSample(Base):
    __tablename__ = "environmental_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    sample_id: Mapped[int] = mapped_column(
        ForeignKey("samples.id"), unique=True, index=True
    )

    wind_speed_knots: Mapped[float | None] = mapped_column(Float)
    wind_direction_deg: Mapped[float | None] = mapped_column(Float)

    wave_height_m: Mapped[float | None] = mapped_column(Float)
    wave_direction_deg: Mapped[float | None] = mapped_column(Float)
    wave_period_s: Mapped[float | None] = mapped_column(Float)

    current_speed_knots: Mapped[float | None] = mapped_column(Float)
    current_direction_deg: Mapped[float | None] = mapped_column(Float)

    weather_factor: Mapped[float | None] = mapped_column(Float)

    # Derived current projection and Speed Through Water.
    current_along_heading_knots: Mapped[float | None] = mapped_column(Float)
    stw_knots: Mapped[float | None] = mapped_column(Float)
    stw_source: Mapped[str | None] = mapped_column(String(32))

    provider: Mapped[str] = mapped_column(String(64), default="open-meteo")


class VesselMetric(Base):
    __tablename__ = "vessel_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    vessel_id: Mapped[int] = mapped_column(ForeignKey("vessels.id"), index=True)
    key: Mapped[str] = mapped_column(String(128))
    display_name: Mapped[str] = mapped_column(String(255))
    unit: Mapped[str] = mapped_column(String(64))
    origin: Mapped[str] = mapped_column(String(32))
    source_column: Mapped[str | None] = mapped_column(String(255))
    formula: Mapped[str | None] = mapped_column(Text)
    based_on: Mapped[list[str] | None] = mapped_column(JSON)
    warning: Mapped[str | None] = mapped_column(Text)


class ImportSession(Base):
    __tablename__ = "import_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    source_files: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    detected_mapping: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    validation_result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    import_imo: Mapped[str | None] = mapped_column(String(32))
    enrichment_days_completed: Mapped[int] = mapped_column(default=0)
    enrichment_days_total: Mapped[int] = mapped_column(default=0)
