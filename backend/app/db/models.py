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
