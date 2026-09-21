# Marine Fleet Control Center — Lightweight UI Design

## Design Goal

The first design pass should make the application:

```text
clear
functional
readable
professional
```

Do not spend significant implementation time on decorative styling before the dashboard works correctly.

The visual direction should resemble a technical operations dashboard rather than a marketing website.

---

## Primary Design Principles

### 1. Map First

The vessel map is the main visual element.

Everything else supports:

```text
Where is the vessel?
What was it doing?
How did the selected metric change?
```

The map should occupy most of the initial viewport.

### 2. Information Before Decoration

Prefer:

- simple cards
- clean labels
- obvious controls
- strong spacing
- readable charts

Avoid initially:

- gradients used purely for decoration
- glassmorphism
- animated backgrounds
- heavy shadows
- excessive rounded cards
- decorative transitions

### 3. Desktop First

Optimize first for:

```text
1366 × 768
1440 × 900
1920 × 1080
```

A mobile cleanup pass happens near `v0.16.0`.

### 4. Single Theme

Use one theme only.

No light/dark toggle during the prototype.

---

## Visual Direction

Recommended appearance:

```text
technical
maritime
neutral
clean
```

Base palette:

```text
Background:       near-white / light neutral
Panels:           white
Borders:          light gray
Primary text:     dark neutral
Secondary text:   medium gray
Primary accent:   maritime blue
Warning:          amber
Error:            red
Success:          green
```

Exact colors should be chosen from Tailwind defaults initially.

Do not introduce a custom design-token system until needed.

---

## Header

Desktop header:

```text
┌─────────────────────────────────────────────────────────────┐
│ Fleet Control Center                       🇬🇧  🇫🇷  Import │
└─────────────────────────────────────────────────────────────┘
```

Left:

```text
application title
```

Right:

```text
language switch
import action
```

Flag controls should be compact.

Example:

```text
[🇬🇧] [🇫🇷]
```

Active language:

- subtle background
- border
- accessible label

Flags should not be the only accessible signal.

Use labels such as:

```text
aria-label="English"
aria-label="Français"
```

---

## Main Dashboard Layout

Recommended:

```text
┌───────────────────────────────────────────────────────────────┐
│ HEADER                                                        │
├───────────────────────────────────────────────────────────────┤
│ Vessel     Date range       Metric              Replay        │
├───────────────────────────────────────────┬───────────────────┤
│                                           │                   │
│                                           │ Vessel            │
│                   MAP                     │                   │
│                                           │ Current metric    │
│                                           │                   │
│                                           │ Metric details    │
│                                           │                   │
├───────────────────────────────────────────┴───────────────────┤
│                                                               │
│                       TELEMETRY CHART                          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

The control row should not consume excessive height.

The user should be able to see:

```text
controls
map
some chart
```

without excessive scrolling on a typical laptop.

---

## Control Row

Components:

```text
Vessel selector
Start date
End date
Metric selector
Play/Pause
Playback speed
```

Use shadcn/ui components where practical.

Controls should use visible labels, not placeholder-only forms.

Example:

```text
Vessel
[ IMO1 ▼ ]

Metric
[ Speed Over Ground ▼ ]
```

---

## Vessel Information Panel

Keep the panel compact.

Example:

```text
IMO1

Current position
43.20°, 5.30°

Speed Over Ground
15.2 kn

RPM
60.8 rpm
ESTIMATED

Course
242°
```

Estimated values should use a small badge:

```text
Estimated
```

and optional tooltip:

```text
Calculated from Speed Over Ground using RPM = 4 × SOG.
```

Avoid alarming warning styling for estimates.

They are expected derived values, not errors.

---

## Map Design

Use lightweight OpenStreetMap raster tiles for the base map.

Keep map controls minimal:

```text
zoom
reset / fit bounds
```

Possible later addition:

```text
fullscreen
```

Avoid cluttering the map with many permanent labels.

Use hover/click tooltips for vessel details.

---

## Vessel Rendering

Use simple top-down SVG vessel shapes.

Requirements:

```text
clear bow direction
transparent background
works at 20–40 px
can rotate
can recolor
```

Use heading when available.

Otherwise use course.

If neither exists, show the vessel without assuming direction.

---

## Multi-Vessel Colors

Use a small fixed palette.

Example:

```text
IMO1 → blue
IMO2 → orange
IMO3 → green
```

Do not rely solely on color.

Tooltip and label should always include the IMO identifier.

Imported vessels beyond the first three can reuse an extended categorical palette.

---

## Trajectory Design

Default trajectory:

```text
thin but clearly visible
```

Selected metric:

```text
low → high gradient
```

Example:

```text
low       medium       high
blue  →   yellow   →   red
```

The exact scale should be derived from the currently visible metric range.

Include a small map legend.

Example:

```text
SOG
10 kn ───────────── 18 kn
```

---

## Telemetry Chart

Use ECharts.

Default chart layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Speed Over Ground                              knots        │
│                                                             │
│       ╭──╮       ╭────╮                                     │
│  ─────╯  ╰───────╯    ╰────                                │
│                                                             │
│ Mar 1             Mar 2             Mar 3                  │
└─────────────────────────────────────────────────────────────┘
```

Chart should have:

- metric title
- unit
- tooltip
- replay cursor
- restrained grid lines

Avoid chart decorations unrelated to reading values.

---

## Playback Controls

Desktop layout:

```text
[▶]  2026-03-01 12:30     ─────●────────────     [1× ▼]
```

Controls:

```text
Play / Pause
Current timestamp
Timeline slider
Speed
```

Playback state should be obvious.

Avoid auto-playing when a vessel is first selected.

---

## Import Wizard

The import wizard should remove dashboard distractions and become the primary focus.

Example:

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back                           Import Vessel               │
├──────────────────────────────────────────────────────────────┤
│ Upload  →  Mapping  →  Validation  →  Review  →  Complete  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     Current step                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

This can initially be implemented without a separate route.

Future TODO:

```text
/import
```

---

## Import Upload Step

Use a large simple drop area:

```text
┌───────────────────────────────────────────────┐
│                                               │
│        Drop GPS / motion CSV files here       │
│                                               │
│              [ Select files ]                 │
│                                               │
└───────────────────────────────────────────────┘
```

Show selected files below.

---

## Import Mapping Step

Use a straightforward table:

```text
Source Column        Meaning             Unit
------------------------------------------------
Speed [kn]           SOG                 knots
GPS Latitude         Latitude            degrees
GPS Longitude        Longitude           degrees
...
```

Ambiguous items should be visually obvious.

Example:

```text
Speed                SOG                 [ Select unit ▼ ]
```

---

## Import Validation Step

Group results into:

```text
Errors
Warnings
Information
```

Visual hierarchy:

```text
Error        strong red
Warning      amber
Information neutral / blue
```

Example information item:

```text
RPM will be estimated from SOG.
```

---

## Import Review Step

Before commit, summarize:

```text
Vessel
IMO identifier
Date range
Rows to import
Rows rejected
Available metrics
Estimated metrics
Warnings
```

Commit action:

```text
[ Import vessel ]
```

should be visually clear but not oversized.

---

## Internationalization Design

Language control:

```text
🇬🇧
🇫🇷
```

Keep language names available through:

```text
tooltip
aria-label
```

The selected language should survive reload.

Avoid mixing languages inside one screen.

Translation should cover:

- controls
- errors
- import wizard
- metric labels where appropriate
- statuses
- navigation
- empty states

Technical units remain unchanged:

```text
kn
rpm
m/s
°
```

---

## Empty States

Examples:

No vessel:

```text
No vessels available.
Import a vessel to begin.
```

No range data:

```text
No telemetry is available for this time range.
```

No metric:

```text
Select a metric to display telemetry.
```

Keep empty states short.

---

## Error States

Example:

```text
Unable to load trajectory.

[ Retry ]
```

Do not display raw stack traces.

Import errors can expose backend-provided field details where they help correction.

---

## Loading States

Map:

```text
small centered loading overlay
```

Charts:

```text
skeleton / loading block
```

Controls:

```text
disabled while required data is loading
```

Do not replace the full application with a spinner during ordinary requests.

---

## Responsive Strategy

Responsive work is intentionally deferred.

At the final pass:

Desktop:

```text
map + side panel
```

Tablet/mobile:

```text
map
summary
chart
controls
```

stack vertically where necessary.

The mobile goal is:

```text
usable and presentable
```

not a separately optimized mobile product.

---

## Accessibility Minimums

Before release:

- visible form labels
- keyboard-accessible controls
- aria-labels for icon-only buttons
- flag buttons have text alternatives
- sufficient contrast
- visible focus states
- tooltips are supplementary, not the only source of critical information

---

## Explicitly Deferred Design Work

Do not implement during the functional frontend milestones:

- dark mode
- custom animated backgrounds
- elaborate branding
- 3D ships
- Cesium globe
- advanced route editing
- custom design system
- mobile-specific navigation
- locale-prefixed routes
- marketing landing page

These can be added after the prototype is complete.

---

## Final Visual Polish Pass

Only after core functionality works:

- tighten spacing
- align typography
- refine borders
- refine map legend
- improve vessel SVGs
- improve hover states
- normalize card heights
- clean chart labels
- check French text overflow
- check laptop viewport
- check mobile usability
