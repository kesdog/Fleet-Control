import pytest

from app.importers.unit_converter import (
    UnitConversionError,
    convert_speed_to_knots,
    normalize_speed_unit,
)


@pytest.mark.parametrize(
    ("unit", "expected"),
    [
        ("kn", "knots"),
        ("kt", "knots"),
        ("kts", "knots"),
        ("knot", "knots"),
        ("knots", "knots"),
        ("kmph", "km/h"),
        ("kph", "km/h"),
    ],
)
def test_speed_aliases_normalize(unit: str, expected: str) -> None:
    assert normalize_speed_unit(unit) == expected


@pytest.mark.parametrize(
    ("value", "unit", "expected"),
    [
        (20, "knots", 20),
        (20, "km/h", 10.79913606),
        (20, "mph", 17.37952484),
        (20, "m/s", 38.87688984),
    ],
)
def test_speed_converts_to_knots(value: float, unit: str, expected: float) -> None:
    assert convert_speed_to_knots(value, unit) == pytest.approx(expected)


@pytest.mark.parametrize("unit", [None, "", "furlongs/day"])
def test_unknown_or_missing_speed_unit_fails(unit: str | None) -> None:
    with pytest.raises(UnitConversionError):
        normalize_speed_unit(unit)
