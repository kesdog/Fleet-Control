from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    database_url: str = "sqlite:///./data/fleet.db"
    imports_directory: Path = Path("./data/imports")
    logs_directory: Path = Path("./data/logs")
    cors_origins: list[str] = ["http://localhost:5173"]

    # Historical environmental data provider endpoints.
    open_meteo_weather_url: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_marine_url: str = "https://marine-api.open-meteo.com/v1/marine"

    # Fuel assumptions from the technical assessment.
    fuel_reference_speed_knots: float = 15.0
    fuel_reference_rate_tpd: float = 150.0
    fuel_price_per_tonne: float = 1000.0
    fuel_currency: str = "EUR"

    # Enrichment can be disabled for offline imports and deterministic tests.
    environment_enrichment_enabled: bool = True
    environment_spatial_grid_degrees: float = Field(default=0.1, gt=0)

    # Ignore intervals wider than the nominal telemetry cadence. This prevents
    # estimates from treating an unobserved operational period as continuous sailing.
    fuel_integration_max_gap_minutes: float = Field(default=60.0, gt=0)

    # Wind/wave fuel-impact estimate. A headwind or head sea adds resistance and
    # increases fuel; a following wind or sea reduces it. These are crude linear
    # coefficients for a prototype estimate, not a validated resistance model.
    weather_impact_wind_per_knot: float = 0.005
    weather_impact_wave_per_metre: float = 0.04
    weather_impact_min_factor: float = 0.5
    weather_impact_max_factor: float = 1.5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def ensure_database_directory(self) -> None:
        """Create the local parent directory when using a file-backed SQLite URL."""
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix) or self.database_url == "sqlite:///:memory:":
            return

        database_path = Path(self.database_url.removeprefix(prefix))
        database_path.parent.mkdir(parents=True, exist_ok=True)

    def ensure_imports_directory(self) -> None:
        # Each import session gets a child directory beneath this configured root.
        self.imports_directory.mkdir(parents=True, exist_ok=True)

    def ensure_logs_directory(self) -> None:
        self.logs_directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
