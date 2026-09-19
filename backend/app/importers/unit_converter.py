from collections.abc import Iterable


class UnitConversionError(ValueError):
    """Raised when a source unit cannot be converted deterministically."""


_SPEED_UNIT_ALIASES = {
    "kn": "knots",
    "kt": "knots",
    "kts": "knots",
    "knot": "knots",
    "knots": "knots",
    "km/h": "km/h",
    "kmph": "km/h",
    "kph": "km/h",
    "mph": "mph",
    "m/s": "m/s",
}

_SPEED_TO_KNOTS = {
    "knots": 1.0,
    "km/h": 0.539956803,
    "mph": 0.868976242,
    "m/s": 1.943844492,
}


def normalize_speed_unit(unit: str | None) -> str:
    """Return the canonical source-unit label or fail instead of guessing."""
    if unit is None or not unit.strip():
        raise UnitConversionError("A speed unit must be explicitly mapped.")

    normalized = _SPEED_UNIT_ALIASES.get(unit.strip().lower())
    if normalized is None:
        raise UnitConversionError(f"Unsupported speed unit: {unit!r}.")
    return normalized


def convert_speed_to_knots(value: float, unit: str | None) -> float:
    """Convert a source speed measurement to the canonical knots unit."""
    return value * _SPEED_TO_KNOTS[normalize_speed_unit(unit)]


def supported_speed_units() -> tuple[str, ...]:
    return tuple(sorted(_SPEED_UNIT_ALIASES))


def normalize_speed_values(values: Iterable[float], unit: str | None) -> tuple[float, ...]:
    canonical_unit = normalize_speed_unit(unit)
    factor = _SPEED_TO_KNOTS[canonical_unit]
    return tuple(value * factor for value in values)
