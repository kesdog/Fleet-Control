# Assumptions

## Time

The supplied CSV timestamps do not include an offset. They are interpreted as UTC-compatible, timezone-naive timestamps. API query timestamps with an offset are converted to UTC before cache range lookup.

## Units

Canonical values are persisted as degrees, knots, rpm, metres, m/s, m/s2, tonnes/day, and ISO 8601-compatible timestamps. Supported speed source units are knots, km/h, mph, and m/s. Missing or ambiguous speed units require an explicit mapping and never default to knots.

## Estimates

The prototype uses measured SOG because Speed Through Water is not supplied:

```text
estimated_rpm = 4 * SOG_knots
estimated_fuel_tpd = 150 * (SOG_knots / 15)^3
```

These values are estimates, not sensor readings, and API metadata identifies their formula and dependency.

## Missing Data

Rows lacking timestamp, latitude, longitude, or SOG cannot form a valid navigation sample and are rejected during validation. Optional navigation fields and motion metrics remain absent when not supplied; the cache records them in `missing_fields`. No interpolation, forward fill, or synthetic position/speed generation occurs.

## Duplicate And Merge Policy

GPS and motion inputs merge only when timestamps are equal. Duplicate timestamps inside either dataset are validation errors. Unmatched GPS/motion timestamps produce warnings; a valid GPS sample is retained without its missing motion values.

## Dateline Policy

The trajectory API starts a new segment whenever adjacent longitude values differ by more than 180 degrees. This prevents map clients from rendering a line across the world at the International Date Line.

## Import Replacement

Existing vessels are never overwritten implicitly. A commit must specify `CREATE` for a new IMO or `REPLACE` for an existing IMO. Replacement deletes and recreates that vessel's samples and metric definitions atomically.
