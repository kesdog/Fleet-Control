# Assumptions

## Time

The supplied CSV timestamps do not include an offset. They are interpreted as UTC-compatible, timezone-naive timestamps. API query timestamps with an offset are converted to UTC before cache range lookup.

## Units

Canonical values are persisted as degrees, knots, rpm, metres, m/s, m/s2, tonnes/day, and ISO 8601-compatible timestamps. Supported speed source units are knots, km/h, mph, and m/s. Missing or ambiguous speed units require an explicit mapping and never default to knots.

## Estimates

The prototype estimates Speed Through Water because it is not supplied:

```text
stw = SOG − (current_speed × cos(current_direction − heading))
estimated_rpm = 4 × stw
estimated_fuel_tpd = 150 × (stw / 15)^3
```

These values are estimates, not sensor readings, and API metadata identifies their formula and dependency.

## Environmental Data

1. Wind, wave, and ocean-current values come from Open-Meteo historical model data, not onboard sensors. They carry an `environmental` origin and are stored in a separate `environmental_samples` table.

2. Speed Through Water is estimated from SOG using the ocean-current projection when both current and heading are available. When current data is unavailable, STW falls back to SOG and the calculation provenance reports `sog_fallback`.

3. Fuel uses the assessment's cubic STW model: `150 × (STW / 15)³` tonnes/day.

4. Fuel price is configurable (`FUEL_PRICE_PER_TONNE`, default `1000`) because the supplied assessment references both EUR 1,000/t and USD 1,000/t. Currency is configurable (`FUEL_CURRENCY`, default `EUR`).

5. Weather Factor is stored as `WxF = ∛(Hs / 2)` but is not used as a fuel multiplier because the assessment does not define that relationship.

6. Enrichment runs at import commit time and never fails the import. When the provider is unavailable, environmental fields remain null and fuel falls back to the SOG-based estimate.

7. The optional wind/wave fuel-impact estimate (toggled in the Voyage Performance panel) adds a linear penalty to the fuel rate: a headwind or head sea increases fuel, a following wind or sea reduces it. The along-heading component is computed from the provider direction (reported as the direction the field comes FROM) and scaled by `WEATHER_IMPACT_WIND_PER_KNOT` (default `0.005`/kn) and `WEATHER_IMPACT_WAVE_PER_METRE` (default `0.04`/m), clamped to a factor between `0.5` and `1.5`. These coefficients are project assumptions, not supplied by AI Universal, and the response marks this as an experimental heuristic rather than a validated resistance model.

8. Environmental lookups use a 0.1-degree coordinate grid. Open-Meteo marine currents are modelled at approximately 0.08 degrees and have limited coastal accuracy, so 0.1 degrees retains useful resolution without creating one provider request per telemetry point.

## Missing Data

Rows lacking timestamp, latitude, longitude, or SOG cannot form a valid navigation sample and are rejected during validation. Optional navigation fields and motion metrics remain absent when not supplied; the cache records them in `missing_fields`. No interpolation, forward fill, or synthetic position/speed generation occurs.

Fuel and distance integration accepts only consecutive observations separated by no more than `FUEL_INTEGRATION_MAX_GAP_MINUTES` (default 60). Wider intervals contribute to `unobserved_duration_seconds`, are excluded from fuel and distance totals, and lower `coverage_percent`, defined as integrated duration divided by the selected range's observed plus unobserved intervals.

## Duplicate And Merge Policy

GPS and motion inputs merge only when timestamps are equal. Duplicate timestamps inside either dataset are validation errors. Unmatched GPS/motion timestamps produce warnings; a valid GPS sample is retained without its missing motion values.

## Dateline Policy

The trajectory API starts a new segment whenever adjacent longitude values differ by more than 180 degrees. This prevents map clients from rendering a line across the world at the International Date Line.

## Import Replacement

Existing vessels are never overwritten implicitly. A commit must specify `CREATE` for a new IMO or `REPLACE` for an existing IMO. Replacement deletes and recreates that vessel's samples and metric definitions atomically.

Each committed vessel stores the import-session UUID that generated it. Background enrichment updates require both that generation and the committed vessel ID, so an earlier worker cannot enrich telemetry created by a later replacement of the same IMO.
