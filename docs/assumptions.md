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

## Missing Data

Rows lacking timestamp, latitude, longitude, or SOG cannot form a valid navigation sample and are rejected during validation. Optional navigation fields and motion metrics remain absent when not supplied; the cache records them in `missing_fields`. No interpolation, forward fill, or synthetic position/speed generation occurs.

## Duplicate And Merge Policy

GPS and motion inputs merge only when timestamps are equal. Duplicate timestamps inside either dataset are validation errors. Unmatched GPS/motion timestamps produce warnings; a valid GPS sample is retained without its missing motion values.

## Dateline Policy

The trajectory API starts a new segment whenever adjacent longitude values differ by more than 180 degrees. This prevents map clients from rendering a line across the world at the International Date Line.

## Import Replacement

Existing vessels are never overwritten implicitly. A commit must specify `CREATE` for a new IMO or `REPLACE` for an existing IMO. Replacement deletes and recreates that vessel's samples and metric definitions atomically.
