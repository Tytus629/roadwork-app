# Integration exports — GIS-Mo / VUEWorks / Esri

WayCrew **feeds** the county's systems of record (CRAB GIS-Mo, VUEWorks, Esri ArcGIS); it never replaces them.
Status: IMPLEMENTED + LOCALLY TESTED (unit tests). NOT TESTED on device or imported into any of those systems yet.

## Where
Tools → **Export to GIS**. Datasets: work orders, Drive Mode segments, bump events. Formats:
- **CSV** — RFC 4180, CRLF line endings, UTF-8, header row; cells starting with `= + - @` (non-numeric) are prefixed with `'` to block spreadsheet formula injection.
- **GeoJSON** — RFC 7946, **EPSG:4326 (WGS84)**, `[lon, lat]`, 6 decimals (~0.1 m). Segments = LineString, events = Point, work orders = Point or LineString. Missing geometry → `null`.
Files are written to the app cache and shared through the OS share sheet (email, Drive, Files, etc.).

## Location reference (route / road / milepost)
- Optional, user-editable: 📍 chip on the work order screen, on each inspection in Asset Detail, and "Set route for this drive" in Drive Mode (applies route + road to all of that drive's segments and events).
- Stored in a new side table `location_refs (entityType, entityId, routeId, roadName, beginMp, endMp, source, updatedAt)` — migration 14, additive. A side table is used because `work_orders` is saved with `INSERT OR REPLACE`, which would wipe new columns. Local only; not synced to Firestore yet.
- **Auto-milepost hook:** `setMilepostResolver(fn)` in `src/integration/locationRefs.ts`. `fn({ entityType, points })` returns `{ routeId, roadName, beginMp, endMp }` — e.g. snap to a county road-log centerline (CRAB road log / county GIS with MP calibration). Manual values always win; resolver errors are ignored. Not implemented yet — needs the county road log data.

## Field mapping
Legend: **C** = confident (direct from app data) · **A** = ASSUMPTION pending CRAB / county confirmation · **—** = app doesn't capture this yet (blank unless present in details).

### Work orders (`waycrew_work_orders_*.csv|geojson`)
| Export field | Concept (GIS-Mo / VUEWorks) | Source in WayCrew | Conf. |
|---|---|---|---|
| WORK_ORDER_ID | Work order / activity ID | `id` | C |
| ASSET_TYPE | Asset class/type | linked asset type, else derived from work type (ROADWAY, ROADSIDE, CULVERT, DITCH, GUARDRAIL, SIGN) | A |
| ASSET_ID | Asset ID | linked asset id (WayCrew id, not the county asset ID) | A |
| ACTIVITY_CODE | Maintenance activity code | placeholder map (PAV-POTHOLE, PAV-REPAIR, VEG-SPRAY, DRN-CULVERT, SAF-SIGN, …) | **A** — must be replaced with the county's activity code list |
| WORK_TYPE | Activity description | `type` | C |
| STATUS | WO status | Needs→OPEN, In Progress→IN_PROGRESS, Done→COMPLETED, Deferred→DEFERRED | A |
| PRIORITY | Priority | `priority` upper-cased | C |
| ROUTE_ID / ROAD_NAME | County road number / road name | location ref | C (user-entered) |
| BEGIN_MP / END_MP | Beginning / ending milepost | location ref | C (user-entered); A when auto-resolved |
| LOC_REF_SOURCE | — | manual / resolver | C |
| DATE_CREATED / DATE_MODIFIED | Request / last-modified date | `createdAt` / `updatedAt` (ISO 8601 UTC) | C |
| DATE_COMPLETED | Completion date | `updatedAt` when COMPLETED (app has no completedAt) | **A** |
| REQUESTED_BY / ASSIGNED_TO | Requestor / assigned crew | creator / assignee names | C |
| LABOR_HOURS | Labor hours | `details.laborHours` | — |
| EQUIPMENT_HOURS | Equipment hours | `details.equipmentHours` | — |
| MATERIAL_QTY / MATERIAL_UNIT | Material quantity / unit | `details.materialQty` or `details.tons` (unit TON) | A |
| MATERIAL_DESC | Material | `details.materialNote` / `details.material` | C |
| TOTAL_COST | Cost | `details.totalCost` / `details.cost` | — |
| DESCRIPTION | Comments | `note` | C |
| GEOM_TYPE, LAT, LON | Location | point, or middle vertex of a line | C |

### Drive Mode segments (`waycrew_drive_segments_*`)
| Export field | Concept | Source | Conf. |
|---|---|---|---|
| FEATURE_ID / SURVEY_ID / SEGMENT_SEQ | Survey section IDs | segment id / drive session id / seq | C |
| ROUTE_ID, ROAD_NAME, BEGIN_MP, END_MP | Linear reference | location ref | C (user) / A (resolver) |
| SURVEY_DATE, SURVEY_START, SURVEY_END | Rating date | segment timestamps | C |
| LENGTH_FT, AVG_SPEED_MPH | Section length, survey speed | computed | C |
| ROUGHNESS_INDEX, ROUGHNESS_CLASS | Ride / roughness | phone RMS index, normalized to 30 mph | **A — NOT IRI, not a VisRate/PCI rating; screening only** |
| RMS_VERT_MS2, SAMPLE_COUNT | QA | raw stats | C |
| BEGIN/END_LAT/LON | Endpoints | path | C |
| DATA_QUALITY = UNCALIBRATED_SCREENING, METHOD = PHONE_ACCEL_RMS | Data source flags | constant | C |

### Bump events (`waycrew_bump_events_*`)
| Export field | Concept | Source | Conf. |
|---|---|---|---|
| FEATURE_ID, SURVEY_ID, OBS_DATE, OBS_TIME | Observation | event | C |
| ROUTE_ID, ROAD_NAME, BEGIN_MP | Linear reference | location ref | C / A |
| DISTRESS_TYPE | Distress | BUMP or POTHOLE_SUSPECTED | **A** (not a verified distress) |
| SEVERITY | Severity | bump→LOW, pothole→MEDIUM, severe→HIGH | **A** (not CRAB severity levels) |
| PEAK_G, SPEED_MPH, LAT, LON, WORK_ORDER_ID | Evidence / location | event | C |

## Questions for CRAB / the county
1. Official activity code list and asset type names used in GIS-Mo / VUEWorks.
2. Required import format (CSV columns, shapefile/FGDB vs GeoJSON, coordinate system — State Plane WA South/North vs WGS84).
3. Road log source for auto-milepost (route IDs + MP calibration).
4. Whether labor/equipment/material hours and costs should be captured in WayCrew or stay in VUEWorks.
